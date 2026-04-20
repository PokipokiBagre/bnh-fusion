// ============================================================
// hist-data.js — Fetch de 8chan + CRUD Supabase + PT por Tags
// ============================================================
import { supabase }   from '../bnh-auth.js';
import { db }         from '../bnh-db.js';
import { initOpciones } from '../bnh-opciones-tags.js';
import {
    hilosState, postsState, rankingState,
    ptTagState, ptPorPost, mapaAliasAGrupo, estadoUI, CORS_PROXY
} from './hist-state.js';
import {
    parsearPostsLynxChan, calcularTransaccionesPT,
    construirRankingPosts, parsearURL
} from './hist-logic.js';

// ── Puente Tampermonkey ───────────────────────────────────────
async function fetchViaTampermonkey(jsonUrl) {
    return new Promise((resolve) => {
        const listener = (e) => {
            if (e.detail.url !== jsonUrl) return;
            window.removeEventListener('RespuestaFetch8chan', listener);
            if (e.detail.htmlStatus) {
                console.warn('[8chan] Tampermonkey recibió HTML (PoW activo).');
                resolve(null);
            } else {
                resolve(e.detail.data);
            }
        };
        window.addEventListener('RespuestaFetch8chan', listener);
        window.dispatchEvent(new CustomEvent('PeticionFetch8chan', { detail: { url: jsonUrl } }));
        setTimeout(() => {
            window.removeEventListener('RespuestaFetch8chan', listener);
            resolve(null);
        }, 10000);
    });
}

export async function fetchHiloJSON(board, threadId) {
    const jsonUrl = `https://8chan.moe/${board}/res/${threadId}.json`;
    console.log(`[8chan-fetch] Iniciando: ${jsonUrl}`);
    const tmData = await fetchViaTampermonkey(jsonUrl);
    if (tmData?.posts) {
        console.log('[8chan-fetch] ✅ Éxito vía Tampermonkey');
        return tmData;
    }
    console.warn('[8chan-fetch] ❌ Falló. Usa "Pega JSON" manualmente.');
    return null;
}

// ── Cargar hilos ──────────────────────────────────────────────
export async function cargarHilos() {
    const { data } = await supabase
        .from('historial_hilos')
        .select('*')
        .order('creado_en', { ascending: false });
    hilosState.length = 0;
    hilosState.push(...(data || []));
}

// ── Cargar posts del hilo activo ──────────────────────────────
export async function cargarPostsDB(board, threadId) {
    const { data } = await supabase
        .from('historial_posts')
        .select('*')
        .eq('board', board)
        .eq('thread_id', threadId)
        .order('post_no');
    postsState.length = 0;
    postsState.push(...(data || []));
    return data || [];
}

// ── Cargar ranking del hilo activo ────────────────────────────
export async function cargarRankingDB(board, threadId) {
    const { data } = await supabase
        .from('historial_ranking')
        .select('*')
        .eq('board', board)
        .eq('thread_id', threadId)
        .order('total_posts', { ascending: false });
    rankingState.length = 0;
    rankingState.push(...(data || []));
    return data || [];
}

// ── Cargar PT acumulados en el hilo (del log) ─────────────────
// Construye ptTagState, ptPorPost y mapaAliasAGrupo
export async function cargarPTTagDelHilo(threadId) {
    // Leer TODOS los motivos para tener el total real de PT por personaje
    const { data } = await supabase
        .from('log_puntos_tag')
        .select('personaje_nombre, tag, delta, motivo, origen_post_no')
        .eq('origen_thread_id', threadId);

    // Vaciar y reconstruir ptTagState
    Object.keys(ptTagState).forEach(k => delete ptTagState[k]);
    // Vaciar ptPorPost
    Object.keys(ptPorPost).forEach(k => delete ptPorPost[k]);

    if (data) {
        data.forEach(row => {
            // ptTagState: acumulado por personaje/tag
            if (!ptTagState[row.personaje_nombre]) ptTagState[row.personaje_nombre] = {};
            ptTagState[row.personaje_nombre][row.tag] =
                (ptTagState[row.personaje_nombre][row.tag] || 0) + row.delta;

            // ptPorPost: detalle por post_no
            if (row.origen_post_no != null) {
                if (!ptPorPost[row.origen_post_no]) ptPorPost[row.origen_post_no] = [];
                ptPorPost[row.origen_post_no].push({
                    personaje_nombre: row.personaje_nombre,
                    tag:    row.tag,
                    delta:  row.delta,
                    motivo: row.motivo
                });
            }
        });
    }

    // Reconstruir mapaAliasAGrupo: alias (poster_name) → nombre_refinado
    Object.keys(mapaAliasAGrupo).forEach(k => delete mapaAliasAGrupo[k]);
    try {
        const mapaNombres = await db.historial.getMapaNombres();
        Object.entries(mapaNombres).forEach(([alias, pj]) => {
            // Solo incluir aliases con grupo real (refinado_id)
            // Los aliases sueltos NO deben aparecer en el ranking de grupos
            if (pj.tieneGrupo) mapaAliasAGrupo[alias] = pj.nombre;
        });
    } catch (e) {
        console.warn('[PT] No se pudo construir mapaAliasAGrupo:', e);
    }
}

// ── Scrape completo ───────────────────────────────────────────
export async function scrapearHilo(board, threadId, threadUrl, manualJson = null, calcPT = false) {
    estadoUI.cargando = true;

    const json = manualJson ?? await fetchHiloJSON(board, threadId);
    if (!json) {
        estadoUI.cargando = false;
        return { ok: false, error: 'Todos los métodos fallaron. Usa "Pega JSON" manualmente.' };
    }

    // 1. Parsear posts (ahora incluye reply_to)
    const todosLosPosts = parsearPostsLynxChan(json, threadId, board);
    if (!todosLosPosts.length) {
        estadoUI.cargando = false;
        return { ok: false, error: 'No se encontraron posts en el JSON.' };
    }

    // 2. Detectar solo posts nuevos
    const { data: existentes } = await supabase
        .from('historial_posts')
        .select('post_no')
        .eq('board', board)
        .eq('thread_id', threadId);

    const yaKnown    = new Set((existentes || []).map(p => p.post_no));
    const soloNuevos = todosLosPosts.filter(p => !yaKnown.has(p.post_no));
    estadoUI.nuevosPosts = soloNuevos.length;

    if (soloNuevos.length === 0) {
        await supabase.from('historial_hilos')
            .update({ ultimo_check: new Date().toISOString() })
            .eq('board', board).eq('thread_id', threadId);
        estadoUI.cargando = false;
        estadoUI.ultimaActualizacion = new Date();
        return { ok: true, nuevos: 0 };
    }

    // 3. Guardar posts nuevos (con reply_to)
    const { error: errPosts } = await supabase
        .from('historial_posts')
        .upsert(soloNuevos, { onConflict: 'board,post_no' });
    if (errPosts) {
        estadoUI.cargando = false;
        return { ok: false, error: 'Error guardando posts: ' + errPosts.message };
    }

    // 4. Actualizar ranking de posts (solo conteo)
    const ranking = construirRankingPosts(todosLosPosts, threadId, board);
    await supabase
        .from('historial_ranking')
        .upsert(ranking, { onConflict: 'board,thread_id,poster_name' });

    // 5. Calcular PT — solo si calcPT=true (por defecto false para separar flujos)
    if (calcPT) await procesarPTDePostsNuevos(soloNuevos, threadId, board);

    // 6. Actualizar meta del hilo
    await supabase.from('historial_hilos').update({
        ultimo_check: new Date().toISOString(),
        total_posts:  todosLosPosts.length
    }).eq('board', board).eq('thread_id', threadId);

    // 7. Refrescar estado en memoria
    await cargarPostsDB(board, threadId);
    await cargarRankingDB(board, threadId);
    await cargarPTTagDelHilo(threadId);

    estadoUI.cargando = false;
    estadoUI.ultimaActualizacion = new Date();
    return { ok: true, nuevos: soloNuevos.length, total: todosLosPosts.length };
}

// ── Procesar PT para un array de posts nuevos ─────────────────
// Solo procesa posts que aún no tienen pt_procesado = true
async function procesarPTDePostsNuevos(postsNuevos, threadId, board) {
    const mapaNombres = await db.historial.getMapaNombres();
    if (!Object.keys(mapaNombres).length) { console.warn('[PT] mapa vacío'); return; }

    // Índice cross-board: todos los hilos para resolver replies entre hilos
    const { data: indiceDB } = await supabase
        .from('historial_posts')
        .select('post_no, poster_name')
        .eq('board', board);
    const postsParaIndice = indiceDB || [];

    // Leer contenido desde DB (más confiable que el JSON parseado)
    const postNos = postsNuevos.map(p => p.post_no);
    const { data: contenidosDB } = await supabase
        .from('historial_posts')
        .select('post_no, contenido')
        .eq('board', board)
        .eq('thread_id', threadId)
        .in('post_no', postNos);
    const contenidoMap = {};
    (contenidosDB || []).forEach(p => { contenidoMap[p.post_no] = p.contenido; });

    // Posts con contenido enriquecido desde DB
    const postsEnriquecidos = postsNuevos.map(p => ({
        ...p,
        contenido: contenidoMap[p.post_no] ?? p.contenido ?? ''
    }));

    // Idempotencia: posts que ya tienen PT en el log para este thread
    const { data: yaEnLog } = await supabase
        .from('log_puntos_tag')
        .select('origen_post_no')
        .eq('origen_thread_id', threadId)
        .in('motivo', ['interaccion', 'compartido', 'lectura']);
    const yaProcessados = new Set((yaEnLog || []).map(r => r.origen_post_no));

    // Calculamos las transacciones (sin variables de fusión)
    const transacciones = calcularTransaccionesPT(
        postsEnriquecidos, mapaNombres, threadId,
        postsParaIndice, yaProcessados
    );

    console.log('[PT] hilo:', threadId, '| posts:', postsEnriquecidos.length,
        '| ya procesados:', yaProcessados.size,
        '| transacciones:', transacciones.length);

    if (transacciones.length > 0) {
        await db.progresion.aplicarTransacciones(transacciones);
        // Registrar en tags_catalogo todos los tags que aparecieron
        const tagsNuevos = [...new Set(transacciones.map(t => t.tag))];
        await db.historial.registrarTagsNuevos(tagsNuevos);
    }

    await db.historial.marcarProcesados(board, threadId, postsNuevos.map(p => p.post_no));
}


// ── Calcular PT de un hilo, opcionalmente filtrando por fecha ─────────────────
// Si desdeFecha es null → procesa TODOS los posts sin procesar
// Si desdeFecha es un Date → solo procesa posts desde esa fecha en adelante
// Es idempotente: desmarca posts en el rango y los reprocesa limpiamente
export async function calcularPTHilo(board, threadId, desdeFecha = null) {
    estadoUI.cargando = true;

    // 1. Obtener posts del hilo en el rango pedido
    let query = supabase
        .from('historial_posts')
        .select('post_no, poster_name, reply_to, post_time, pt_procesado')
        .eq('board', board)
        .eq('thread_id', threadId)
        .order('post_no');

    if (desdeFecha) {
        query = query.gte('post_time', desdeFecha.toISOString());
    }

    const { data: postsEnRango } = await query;
    if (!postsEnRango || !postsEnRango.length) {
        estadoUI.cargando = false;
        return { ok: true, procesados: 0 };
    }

    const postNosEnRango = postsEnRango.map(p => p.post_no);

    // 2. Borrar PT ya calculados de estos posts (los 3 motivos)
    await supabase
        .from('log_puntos_tag')
        .delete()
        .eq('origen_thread_id', threadId)
        .in('motivo', ['interaccion', 'compartido', 'lectura'])
        .in('origen_post_no', postNosEnRango);

    // 3. Desmarcar estos posts para que se reprocesen
    await supabase
        .from('historial_posts')
        .update({ pt_procesado: false })
        .eq('board', board)
        .eq('thread_id', threadId)
        .in('post_no', postNosEnRango);

    // 4. Procesar PT de todos los posts en el rango
    // (el log ya está limpio de esos posts, no habrá duplicados)
    await procesarPTDePostsNuevos(postsEnRango, threadId, board);

    // 5. Reconstruir puntos_tag desde el log completo resultante
    // Hacerlo DESPUÉS de insertar las nuevas entradas, para que puntos_tag
    // refleje exactamente lo que está en el log (sin acumulación doble)
    await reconstruirPuntosTotales();

    // 6. Refrescar memoria
    await cargarPTTagDelHilo(threadId);

    estadoUI.cargando = false;
    estadoUI.ultimaActualizacion = new Date();
    return { ok: true, procesados: postNosEnRango.length };
}

// ── Reconstruir puntos_tag desde el log completo ──────────────
// Borra la tabla y la recalcula sumando todos los deltas del log
async function reconstruirPuntosTotales() {
    // Leer el log completo
    const { data: log } = await supabase
        .from('log_puntos_tag')
        .select('personaje_nombre, tag, delta');

    if (!log) return;

    // Agrupar sumas
    const sumas = {};
    log.forEach(r => {
        const k = `${r.personaje_nombre}||${r.tag}`;
        sumas[k] = (sumas[k] || 0) + r.delta;
    });

    // Borrar y reinsertar puntos_tag — solo si el total es positivo
    await supabase.from('puntos_tag').delete().neq('personaje_nombre', '');
    const rows = Object.entries(sumas)
        .filter(([, v]) => v > 0)
        .map(([k, cantidad]) => {
            const [personaje_nombre, tag] = k.split('||');
            return { personaje_nombre, tag, cantidad };
        });

    if (rows.length) {
        await supabase.from('puntos_tag').insert(rows);
    }
}

// ── Limpiar log de un personaje si ya no existe en personajes_refinados ──
// Previene duplicados cuando se elimina y recrea un personaje con el mismo nombre.
// Llamar antes de calcularPTHilo cuando se detecte un personaje "nuevo" sin pt_procesado.
export async function limpiarLogSiPersonajeNuevo(nombreGrupo) {
    // Verificar si tiene entradas en log pero puntos_tag ya tiene datos
    // (señal de que es un recreado con historial previo)
    const { data: ptExist } = await supabase
        .from('puntos_tag')
        .select('tag, cantidad')
        .eq('personaje_nombre', nombreGrupo)
        .limit(1);

    const { data: logExist } = await supabase
        .from('log_puntos_tag')
        .select('id')
        .eq('personaje_nombre', nombreGrupo)
        .limit(1);

    if (ptExist?.length && logExist?.length) {
        // Tiene ambos — podría ser legítimo o un recreado.
        // No hacer nada automáticamente; dejar que el usuario limpie si hay duplicados.
        return false;
    }
    return false;
}


// ── Eliminar PT de un hilo por rango de fecha ─────────────────
export async function eliminarPTHilo(board, threadId, desdeFecha = null) {
    estadoUI.cargando = true;

    // Posts en el rango
    let query = supabase
        .from('historial_posts')
        .select('post_no, post_time')
        .eq('board', board)
        .eq('thread_id', threadId);
    if (desdeFecha) query = query.gte('post_time', desdeFecha.toISOString());

    const { data: posts } = await query;
    if (!posts || !posts.length) { estadoUI.cargando = false; return { ok: true, eliminados: 0 }; }

    const postNos = posts.map(p => p.post_no);

    // Borrar del log en lotes
    const LOTE = 50;
    for (let i = 0; i < postNos.length; i += LOTE) {
        const lote = postNos.slice(i, i + LOTE);
        await supabase.from('log_puntos_tag')
            .delete()
            .eq('origen_thread_id', threadId)
            .in('motivo', ['interaccion', 'compartido', 'lectura'])
            .in('origen_post_no', lote);
    }

    // Desmarcar posts para que se puedan reprocesar
    await supabase.from('historial_posts')
        .update({ pt_procesado: false })
        .eq('board', board)
        .eq('thread_id', threadId)
        .in('post_no', postNos);

    // Reconstruir puntos_tag desde el log limpio
    const { data: log } = await supabase
        .from('log_puntos_tag').select('personaje_nombre, tag, delta');
    const sumas = {};
    (log || []).forEach(r => {
        const k = r.personaje_nombre + '||' + r.tag;
        sumas[k] = (sumas[k] || 0) + r.delta;
    });
    await supabase.from('puntos_tag').delete().neq('personaje_nombre', '');
    const rows = Object.entries(sumas)
        .filter(([,v]) => v > 0)
        .map(([k, cantidad]) => {
            const [personaje_nombre, tag] = k.split('||');
            return { personaje_nombre, tag, cantidad };
        });
    if (rows.length) await supabase.from('puntos_tag').insert(rows);

    estadoUI.cargando = false;
    return { ok: true, eliminados: postNos.length };
}

// ── Agregar nuevo hilo ────────────────────────────────────────
export async function agregarHilo(url, titulo) {
    const parsed = parsearURL(url);
    if (!parsed) return { ok: false, error: 'URL inválida. Formato: https://8chan.moe/board/res/XXXXX.html' };

    const { board, thread_id } = parsed;

    const { data: existe } = await supabase
        .from('historial_hilos')
        .select('id')
        .eq('board', board)
        .eq('thread_id', thread_id)
        .maybeSingle();

    if (existe) return { ok: false, error: 'Este hilo ya está siendo rastreado.' };

    const { error } = await supabase.from('historial_hilos').insert([{
        board,
        thread_id,
        thread_url: url,
        titulo:     titulo || `Hilo #${thread_id}`
    }]);
    if (error) return { ok: false, error: error.message };

    const resultado = await scrapearHilo(board, thread_id, url);
    await cargarHilos();
    return { ok: true, ...resultado };
}

// ── Eliminar hilo y todos sus datos ──────────────────────────
export async function eliminarHilo(board, threadId) {
    await Promise.all([
        supabase.from('historial_ranking').delete().eq('board', board).eq('thread_id', threadId),
        supabase.from('historial_posts').delete().eq('board', board).eq('thread_id', threadId),
        supabase.from('historial_hilos').delete().eq('board', board).eq('thread_id', threadId)
        // Nota: los log_puntos_tag NO se borran al eliminar un hilo
        // porque son PT permanentes del personaje
    ]);
    await cargarHilos();
}

// ── Toggle activo/inactivo ────────────────────────────────────
export async function toggleHiloActivo(board, threadId, activo) {
    await supabase.from('historial_hilos')
        .update({ activo })
        .eq('board', board).eq('thread_id', threadId);
    await cargarHilos();
}

// ── Calcular PT extra para un subconjunto de posts ────────────
export async function calcularPTExtraParaPosts(board, threadId, postNos, pjsExtra, soloEnCupoRestante = false) {
    try {
        await initOpciones();

        // Cargar los posts pedidos con su contenido
        const { data: postsDB } = await supabase
            .from('historial_posts')
            .select('post_no, poster_name, contenido, post_time')
            .eq('board', board)
            .eq('thread_id', threadId)
            .in('post_no', postNos);

        if (!postsDB?.length) return { ok: true, transacciones: 0 };

        // Índice de autores de todo el hilo
        const { data: indice } = await supabase
            .from('historial_posts')
            .select('post_no, poster_name')
            .eq('board', board)
            .eq('thread_id', threadId);
        const postAutor = {};
        (indice || []).forEach(p => { postAutor[p.post_no] = p.poster_name; });

        // Mapa nombre → { nombre, tags, tieneGrupo }
        const mapaNombres = await db.historial.getMapaNombres();

        // Si soloEnCupoRestante=true, cargamos los PT ya existentes
        let ptYaUsadosPorPost = {}; 
        if (soloEnCupoRestante) {
            const { data: logExist } = await supabase
                .from('log_puntos_tag')
                .select('origen_post_no, motivo, personaje_nombre')
                .eq('origen_thread_id', threadId)
                .in('origen_post_no', postNos);
            (logExist || []).forEach(r => {
                if (!ptYaUsadosPorPost[r.origen_post_no]) ptYaUsadosPorPost[r.origen_post_no] = {};
                const m = r.motivo;
                ptYaUsadosPorPost[r.origen_post_no][m] = (ptYaUsadosPorPost[r.origen_post_no][m] || 0) + 1;
            });
        }

        const { OPCIONES } = await import('../bnh-opciones-tags.js');
        const limites = {
            interaccion: OPCIONES.max_no_compartidos ?? 5,
            compartido:  OPCIONES.max_compartidos    ?? 5,
            lectura:     OPCIONES.max_lectura        ?? 5,
        };

        const mapaConExtra = { ...mapaNombres };
        pjsExtra.forEach(pj => {
            mapaConExtra[pj.nombre_refinado] = {
                nombre:     pj.nombre_refinado,
                tags:       pj.tags || [],
                tieneGrupo: true
            };
        });

        const todasTransacciones = [];

        for (const post of postsDB) {
            const cupoUsado = soloEnCupoRestante ? (ptYaUsadosPorPost[post.post_no] || {}) : {};

            for (const pjExtra of pjsExtra) {
                const tagsExtraLow = new Set((pjExtra.tags || []).map(t => t.toLowerCase()));
                const tagOrig = {};
                (pjExtra.tags || []).forEach(t => {
                    const norm = t.toLowerCase();
                    tagOrig[norm] = t.startsWith('#') ? t : '#' + t;
                });

                const texto = post.contenido || '';

                const replyNums = []; let m; const reR = />>(\d+)/g;
                while ((m = reR.exec(texto)) !== null) replyNums.push(Number(m[1]));
                const misReplies = [...new Set(replyNums)];

                const tagsReplyados = new Set();
                let hayPJ = false;
                misReplies.forEach(rno => {
                    const autor = postAutor[rno];
                    if (!autor) return;
                    const partes = autor.split(',').map(s => s.trim()).filter(Boolean);
                    partes.forEach(p => {
                        const pjCit = mapaConExtra[p] || mapaConExtra[p.replace(/##?\S+/, '').trim()];
                        if (!pjCit || pjCit.nombre === pjExtra.nombre_refinado) return;
                        hayPJ = true;
                        (pjCit.tags || []).forEach(t => tagsReplyados.add(t.toLowerCase()));
                    });
                });

                function shuffle(arr) {
                    const a = [...arr];
                    for (let i = a.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [a[i], a[j]] = [a[j], a[i]];
                    }
                    return a;
                }

                // Generamos los PT puros sin divisores de fusión
                const empujar = (tagLow, delta, motivo) => {
                    todasTransacciones.push({
                        personaje_nombre: pjExtra.nombre_refinado,
                        tag:              tagOrig[tagLow] || ('#' + tagLow),
                        delta:            delta, 
                        motivo,
                        origen_post_no:   post.post_no,
                        origen_thread_id: threadId
                    });
                };

                // LECTURA
                const cupoLectUsado  = cupoUsado['lectura'] || 0;
                const cupoLectQueda  = Math.max(0, limites.lectura - cupoLectUsado);
                if (cupoLectQueda > 0) {
                    const re2 = /#([A-Za-zÀ-ɏ][A-Za-zÀ-ɏ0-9_.]*)/g;
                    const leidos = [];
                    while ((m = re2.exec(texto)) !== null) {
                        const t = ('#' + m[1]).toLowerCase();
                        if (tagsExtraLow.has(t)) leidos.push(t);
                    }
                    shuffle([...new Set(leidos)]).slice(0, cupoLectQueda)
                        .forEach(t => empujar(t, OPCIONES.delta_lectura, 'lectura'));
                }

                if (!hayPJ) continue;

                // NO COMPARTIDOS
                const cupoNoCompUsado = cupoUsado['interaccion'] || 0;
                const cupoNoCompQueda  = Math.max(0, limites.interaccion - cupoNoCompUsado);
                if (cupoNoCompQueda > 0) {
                    const noComp = [...tagsExtraLow].filter(t => !tagsReplyados.has(t));
                    shuffle(noComp).slice(0, cupoNoCompQueda)
                        .forEach(t => empujar(t, OPCIONES.delta_no_compartido, 'interaccion'));
                }

                // COMPARTIDOS
                const cupoCompUsado = cupoUsado['compartido'] || 0;
                const cupoCompQueda  = Math.max(0, limites.compartido - cupoCompUsado);
                if (cupoCompQueda > 0) {
                    const comp = [...tagsExtraLow].filter(t => tagsReplyados.has(t));
                    shuffle(comp).slice(0, cupoCompQueda)
                        .forEach(t => empujar(t, OPCIONES.delta_compartido, 'compartido'));
                }
            }
        }

        if (!todasTransacciones.length) return { ok: true, transacciones: 0 };

        await db.progresion.aplicarTransacciones(todasTransacciones);
        return { ok: true, transacciones: todasTransacciones.length };
    } catch(e) {
        console.error('[calcularPTExtraParaPosts]', e);
        return { ok: false, msg: e.message };
    }
}

// ── Revertir PT de un personaje extra en posts específicos ────
// Borra del log_puntos_tag las entradas de ese personaje en esos posts,
// luego reconstruye puntos_tag desde el log limpio.
export async function revertirPTExtraParaPosts(threadId, nombrePJ, postNos) {
    if (!postNos.length) return { ok: true };
    try {
        // Borrar del log en lotes de 50
        const LOTE = 50;
        for (let i = 0; i < postNos.length; i += LOTE) {
            const lote = postNos.slice(i, i + LOTE);
            await supabase.from('log_puntos_tag')
                .delete()
                .eq('origen_thread_id', threadId)
                .eq('personaje_nombre', nombrePJ)
                .in('origen_post_no', lote);
        }

        // Reconstruir puntos_tag desde el log completo
        const { data: log } = await supabase
            .from('log_puntos_tag')
            .select('personaje_nombre, tag, delta')
            .eq('personaje_nombre', nombrePJ);

        // Borrar todas las entradas del PJ en puntos_tag
        await supabase.from('puntos_tag')
            .delete()
            .eq('personaje_nombre', nombrePJ);

        // Reinsertar sumando desde el log restante
        if (log && log.length) {
            const sumas = {};
            log.forEach(r => {
                sumas[r.tag] = (sumas[r.tag] || 0) + r.delta;
            });
            const rows = Object.entries(sumas)
                .filter(([, v]) => v > 0)
                .map(([tag, cantidad]) => ({ personaje_nombre: nombrePJ, tag, cantidad }));
            if (rows.length) {
                await supabase.from('puntos_tag').insert(rows);
            }
        }

        return { ok: true };
    } catch(e) {
        console.error('[revertirPTExtraParaPosts]', e);
        return { ok: false, msg: e.message };
    }


    // ── Verificador de seguridad para Tags Baneados ────────────────
async function _limpiarTransaccionesBaneadas(transacciones) {
    if (!transacciones.length) return [];

    // 1. Obtener tags baneados directamente del catálogo
    const { data: tagsBaneados } = await supabase
        .from('tags_catalogo')
        .select('nombre')
        .eq('baneado', true);

    if (!tagsBaneados || tagsBaneados.length === 0) return transacciones;

    // 2. Crear un Set de búsqueda rápida (normalizado a minúsculas y con #)
    const listaNegra = new Set(tagsBaneados.map(t => 
        (t.nombre.startsWith('#') ? t.nombre : '#' + t.nombre).toLowerCase()
    ));

    // 3. Filtrar: solo pasan las transacciones cuyo tag NO esté en la lista negra
    return transacciones.filter(t => {
        const tagNorm = (t.tag.startsWith('#') ? t.tag : '#' + t.tag).toLowerCase();
        const esBaneado = listaNegra.has(tagNorm);
        if (esBaneado) {
            console.warn(`[Seguridad-PT] Bloqueada adquisición de PT para tag baneado: ${t.tag} (${t.personaje_nombre})`);
        }
        return !esBaneado;
    });
}
