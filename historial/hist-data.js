// ============================================================
// hist-data.js — Fetch de 8chan + CRUD Supabase + PT por Tags
// ============================================================
import { supabase }   from '../bnh-auth.js';
import { db }         from '../bnh-db.js';
import {
    hilosState, postsState, rankingState,
    ptTagState, estadoUI, CORS_PROXY
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
// Construye ptTagState: { 'NombrePJ': { '#Tag': N, ... } }
export async function cargarPTTagDelHilo(threadId) {
    const { data } = await supabase
        .from('log_puntos_tag')
        .select('personaje_nombre, tag, delta')
        .eq('origen_thread_id', threadId)
        .eq('motivo', 'interaccion');

    // Vaciar y reconstruir
    Object.keys(ptTagState).forEach(k => delete ptTagState[k]);

    if (!data) return;
    data.forEach(row => {
        if (!ptTagState[row.personaje_nombre]) ptTagState[row.personaje_nombre] = {};
        ptTagState[row.personaje_nombre][row.tag] =
            (ptTagState[row.personaje_nombre][row.tag] || 0) + row.delta;
    });
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
    if (!Object.keys(mapaNombres).length) {
        console.warn('[PT] mapa vacío — no hay aliases en DB');
        return;
    }

    // Índice cross-hilo: todos los posts del board para resolver replies entre hilos
    const { data: todosLosPostsDB } = await supabase
        .from('historial_posts')
        .select('post_no, poster_name')
        .eq('board', board);
    const postsParaIndice = todosLosPostsDB || [];

    // FIX: reply_to en DB puede ser null (bug anterior del campo markdown vs message).
    // Reconstruir reply_to desde el contenido del post antes de calcular PT.
    const replyRegex = />>(\d+)/g;
    const postsConReplies = postsNuevos.map(post => {
        if (post.reply_to && post.reply_to.length > 0) return post;
        const matches = [...(post.contenido || '').matchAll(replyRegex)];
        const replyTo = [...new Set(matches.map(m => Number(m[1])))];
        return { ...post, reply_to: replyTo.length > 0 ? replyTo : null };
    });

    const conReplies = postsConReplies.filter(p => p.reply_to && p.reply_to.length > 0);
    console.log('[PT] posts:', postsConReplies.length, '| con replies:', conReplies.length, '| mapa:', Object.keys(mapaNombres).length, '| índice:', postsParaIndice.length);
    conReplies.slice(0, 3).forEach(p =>
        console.log(`  [PT] ${p.poster_name} No.${p.post_no} → [${p.reply_to}]`)
    );

    const transacciones = calcularTransaccionesPT(
        postsConReplies,
        mapaNombres,
        threadId,
        postsParaIndice
    );

    console.log('[PT] transacciones:', transacciones.length);
    transacciones.forEach(t =>
        console.log(`  [PT] ${t.personaje_nombre} +${t.delta} ${t.tag} (post ${t.origen_post_no})`)
    );

    if (transacciones.length > 0) {
        await db.progresion.aplicarTransacciones(transacciones);
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

    // 2. Borrar PT ya calculados de estos posts (para no duplicar)
    await supabase
        .from('log_puntos_tag')
        .delete()
        .eq('origen_thread_id', threadId)
        .eq('motivo', 'interaccion')
        .in('origen_post_no', postNosEnRango);

    // 3. Desmarcar estos posts para que se reprocesen
    await supabase
        .from('historial_posts')
        .update({ pt_procesado: false })
        .eq('board', board)
        .eq('thread_id', threadId)
        .in('post_no', postNosEnRango);

    // 4. Reconstruir puntos_tag desde log limpio
    await reconstruirPuntosTotales();

    // 5. Procesar PT de todos los posts en el rango
    await procesarPTDePostsNuevos(postsEnRango, threadId, board);

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

    // Borrar y reinsertar puntos_tag
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
