// ============================================================
// hist-data.js — Fetch de 8chan + CRUD Supabase
// ============================================================
import { supabase }  from '../bnh-auth.js';
import {
    hilosState, postsState, puntosState, rankingState,
    estadoUI, CORS_PROXY
} from './hist-state.js';
import {
    parsearPostsLynxChan, calcularPuntosLista,
    construirRanking, parsearURL
} from './hist-logic.js';

// ── Utilidad: intentar parsear texto como JSON de 8chan ───────
function tryParseJSON(texto) {
    if (!texto || texto.trimStart().startsWith('<')) return null; // Es HTML
    try {
        const json = JSON.parse(texto);
        return (json && json.posts && json.posts.length > 0) ? json : null;
    } catch { return null; }
}

// ── Intentar aceptar TOS de 8chan via fetch (para sesión actual) ──
async function intentarAceptarTOS(board, threadId) {
    try {
        // 8chan usa un formulario POST para aceptar los TOS y setear la cookie
        const tosUrl = `https://8chan.moe/disclaimer.js`;
        await fetch(tosUrl, {
            method: 'GET',
            credentials: 'include',
            signal: AbortSignal.timeout(5000)
        });
    } catch { /* silencioso */ }
}

// ── Método: extensión de Chrome BNH (si está instalada) ──────
async function fetchViaExtension(jsonUrl) {
    return new Promise(resolve => {
        if (!window.__BNH_EXT_FETCH__) { resolve(null); return; }
        const tid = setTimeout(() => resolve(null), 10000);
        window.__BNH_EXT_FETCH__(jsonUrl, (result) => {
            clearTimeout(tid);
            resolve(tryParseJSON(result));
        });
    });
}

// ── Método: fetch directo con credenciales ────────────────────
async function fetchDirecto(jsonUrl) {
    try {
        const r = await fetch(jsonUrl, {
            signal: AbortSignal.timeout(10000),
            credentials: 'include',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Cache-Control': 'no-cache'
            }
        });
        if (!r.ok) return null;
        return tryParseJSON(await r.text());
    } catch { return null; }
}

// ── Método: iframe silencioso (acepta TOS y extrae JSON) ──────
async function fetchViaIframe(jsonUrl) {
    return new Promise(resolve => {
        let resuelto = false;
        const timeout = setTimeout(() => { cleanup(); resolve(null); }, 15000);

        function cleanup() {
            window.removeEventListener('message', onMessage);
            if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
        }

        // Escuchar postMessage del iframe con el JSON
        function onMessage(e) {
            if (e.origin !== 'https://8chan.moe') return;
            if (resuelto) return;
            const parsed = tryParseJSON(
                typeof e.data === 'string' ? e.data : JSON.stringify(e.data)
            );
            if (parsed) {
                resuelto = true;
                clearTimeout(timeout);
                cleanup();
                resolve(parsed);
            }
        }
        window.addEventListener('message', onMessage);

        // Crear iframe apuntando al hilo (no al .json, para manejar TOS)
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'display:none;width:0;height:0;position:fixed;top:-9999px';
        iframe.src = jsonUrl;
        iframe.onload = () => {
            // Intentar leer el contenido si mismo origen (fallará cross-origin, pero vale el intento)
            try {
                const text = iframe.contentDocument?.body?.innerText;
                const parsed = tryParseJSON(text);
                if (parsed && !resuelto) {
                    resuelto = true;
                    clearTimeout(timeout);
                    cleanup();
                    resolve(parsed);
                }
            } catch { /* cross-origin bloqueado, esperamos postMessage */ }
        };
        document.body.appendChild(iframe);
    });
}

// ── Método: proxies con headers de browser real ───────────────
async function fetchViaProxies(jsonUrl) {
    const encoded = encodeURIComponent(jsonUrl);

    // Ordenados por fiabilidad conocida con sitios con Cloudflare
    const proxies = [
        // Workers de Cloudflare (ironicamente los más rápidos)
        { url: `https://corsproxy.io/?${encoded}`,                    nombre: 'corsproxy.io' },
        // Heroku-style
        { url: `https://thingproxy.freeboard.io/fetch/${jsonUrl}`,    nombre: 'thingproxy' },
        // AllOrigins — puede devolver HTML de TOS
        { url: `https://api.allorigins.win/raw?url=${encoded}`,       nombre: 'allorigins/raw' },
        // AllOrigins con wrapper — a veces tiene más éxito
        { url: `https://api.allorigins.win/get?url=${encoded}`,       nombre: 'allorigins/get', esWrapper: true },
        // CodeTabs
        { url: `https://api.codetabs.com/v1/proxy/?quest=${jsonUrl}`, nombre: 'codetabs' },
        // htmldriven — especializado en JSON APIs
        { url: `https://cors-proxy.htmldriven.com/?url=${encoded}`,   nombre: 'htmldriven' },
        // workers.dev público
        { url: `https://worker-shy-hat-5ea9.workers.dev/?url=${encoded}`, nombre: 'worker-shy-hat' },
        // Crossorigin.me
        { url: `https://crossorigin.me/${jsonUrl}`,                   nombre: 'crossorigin.me' },
    ];

    for (const proxy of proxies) {
        try {
            console.log(`[8chan-fetch] Probando proxy: ${proxy.nombre}`);
            const r = await fetch(proxy.url, {
                signal: AbortSignal.timeout(9000),
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            if (!r.ok) { console.warn(`  → HTTP ${r.status}`); continue; }

            let texto = await r.text();

            // AllOrigins /get envuelve la respuesta en { contents: "..." }
            if (proxy.esWrapper) {
                try { texto = JSON.parse(texto).contents || ''; } catch { continue; }
            }

            const json = tryParseJSON(texto);
            if (json) {
                console.log(`  ✅ Éxito con: ${proxy.nombre}`);
                return json;
            } else {
                console.warn(`  → Devolvió HTML/TOS (bloqueado por CF)`);
            }
        } catch (e) {
            console.warn(`  → Error de red: ${e.message}`);
        }
    }
    return null;
}

// ── Método: Supabase Edge Function (si se despliega) ─────────
// Descomentar si tienes una Edge Function "fetch-8chan" en tu proyecto
// async function fetchViaEdgeFunction(board, threadId) {
//     const { data, error } = await supabase.functions.invoke('fetch-8chan', {
//         body: { board, threadId }
//     });
//     if (error || !data?.posts) return null;
//     return data;
// }

// ── ORQUESTADOR PRINCIPAL ─────────────────────────────────────
export async function fetchHiloJSON(board, threadId) {
    const jsonUrl = `https://8chan.moe/${board}/res/${threadId}.json`;
    console.log(`[8chan-fetch] Iniciando fetch: ${jsonUrl}`);

    // Capa 0: Extensión de Chrome BNH (acceso nativo con cookies del usuario)
    console.log('[8chan-fetch] Capa 0: Extensión BNH...');
    const ext = await fetchViaExtension(jsonUrl);
    if (ext) { console.log('[8chan-fetch] ✅ Extensión BNH'); return ext; }

    // Capa 1: Fetch directo (funciona si el usuario ya aceptó TOS en 8chan)
    console.log('[8chan-fetch] Capa 1: Fetch directo con credenciales...');
    const directo = await fetchDirecto(jsonUrl);
    if (directo) { console.log('[8chan-fetch] ✅ Directo'); return directo; }

    // Capa 2: Proxies externos (múltiples, con headers de browser real)
    console.log('[8chan-fetch] Capa 2: Proxies externos...');
    const proxy = await fetchViaProxies(jsonUrl);
    if (proxy) { console.log('[8chan-fetch] ✅ Proxy'); return proxy; }

    // Capa 3: Iframe silencioso (último recurso, puede capturar post-TOS)
    console.log('[8chan-fetch] Capa 3: Iframe silencioso...');
    const iframe = await fetchViaIframe(jsonUrl);
    if (iframe) { console.log('[8chan-fetch] ✅ Iframe'); return iframe; }

    console.warn('[8chan-fetch] ❌ Todos los métodos fallaron. Requiere JSON manual.');
    return null;
}

// ── Cargar hilos rastreados desde Supabase ───────────────────
export async function cargarHilos() {
    const { data, error } = await supabase
        .from('historial_hilos')
        .select('*')
        .order('creado_en', { ascending: false });
    if (error) { console.error('cargarHilos:', error); return; }
    hilosState.length = 0;
    hilosState.push(...(data || []));
}

// ── Cargar posts de un hilo desde Supabase ───────────────────
export async function cargarPostsDB(board, threadId) {
    const { data, error } = await supabase
        .from('historial_posts')
        .select('*')
        .eq('board', board)
        .eq('thread_id', threadId)
        .order('post_no');
    if (error) { console.error('cargarPostsDB:', error); return []; }
    postsState.length = 0;
    postsState.push(...(data || []));
    return data || [];
}

// ── Cargar puntos de un hilo desde Supabase ──────────────────
export async function cargarPuntosDB(board, threadId) {
    const { data, error } = await supabase
        .from('historial_puntos')
        .select('*')
        .eq('board', board)
        .eq('thread_id', threadId)
        .order('post_no');
    if (error) { console.error('cargarPuntosDB:', error); return []; }
    puntosState.length = 0;
    puntosState.push(...(data || []));
    return data || [];
}

// ── Cargar ranking de un hilo desde Supabase ─────────────────
export async function cargarRankingDB(board, threadId) {
    const { data, error } = await supabase
        .from('historial_ranking')
        .select('*')
        .eq('board', board)
        .eq('thread_id', threadId)
        .order('total_puntos', { ascending: false });
    if (error) { console.error('cargarRankingDB:', error); return []; }
    rankingState.length = 0;
    rankingState.push(...(data || []));
    return data || [];
}

// ── Scrape completo: fetch 8chan → calcular → guardar ────────
export async function scrapearHilo(board, threadId, threadUrl, manualJson = null) {
    estadoUI.cargando = true;

    // 1. Obtener JSON de 8chan (o usar el manual provisto)
    const json = manualJson ? manualJson : await fetchHiloJSON(board, threadId);
    if (!json) {
        estadoUI.cargando = false;
        return { ok: false, error: '4 métodos automáticos fallaron (extensión, directo, 8 proxies, iframe). 8chan requiere TOS manual. Usa "📥 Pega JSON".' };
    }

    // 2. Parsear posts
    const postsNuevos = parsearPostsLynxChan(json, threadId, board);
    if (!postsNuevos.length) {
        estadoUI.cargando = false;
        return { ok: false, error: 'No se encontraron posts en el JSON' };
    }

    // 3. Obtener posts ya conocidos en DB para detectar nuevos
    const { data: existentes } = await supabase
        .from('historial_posts')
        .select('post_no')
        .eq('board', board)
        .eq('thread_id', threadId);

    const yaKnown = new Set((existentes || []).map(p => p.post_no));
    const soloNuevos = postsNuevos.filter(p => !yaKnown.has(p.post_no));
    estadoUI.nuevosPosts = soloNuevos.length;

    if (soloNuevos.length === 0) {
        await supabase.from('historial_hilos').update({ ultimo_check: new Date().toISOString() }).eq('board', board).eq('thread_id', threadId);
        estadoUI.cargando = false;
        estadoUI.ultimaActualizacion = new Date();
        return { ok: true, nuevos: 0 };
    }

    // 4. Insertar posts nuevos en DB
    const { error: errPosts } = await supabase
        .from('historial_posts')
        .upsert(soloNuevos, { onConflict: 'board,post_no' });

    if (errPosts) {
        estadoUI.cargando = false;
        return { ok: false, error: 'Error guardando posts: ' + errPosts.message };
    }

    // 5. Recalcular puntos
    const todosOrdenados = postsNuevos;
    const puntos = calcularPuntosLista(todosOrdenados, threadId, board);
    const { error: errPuntos } = await supabase
        .from('historial_puntos')
        .upsert(puntos, { onConflict: 'board,post_no' });

    if (errPuntos) console.warn('Error actualizando puntos:', errPuntos.message);

    // 6. Recalcular ranking
    const ranking = construirRanking(puntos, threadId, board);
    const { error: errRanking } = await supabase
        .from('historial_ranking')
        .upsert(ranking, { onConflict: 'board,thread_id,poster_name' });

    if (errRanking) console.warn('Error actualizando ranking:', errRanking.message);

    // 7. Actualizar metadatos del hilo
    await supabase.from('historial_hilos').update({
        ultimo_check: new Date().toISOString(),
        total_posts:  todosOrdenados.length
    }).eq('board', board).eq('thread_id', threadId);

    // 8. Refrescar estado local
    await cargarPostsDB(board, threadId);
    await cargarPuntosDB(board, threadId);
    await cargarRankingDB(board, threadId);

    estadoUI.cargando = false;
    estadoUI.ultimaActualizacion = new Date();
    return { ok: true, nuevos: soloNuevos.length, total: todosOrdenados.length };
}

// ── Agregar un nuevo hilo para rastrear ──────────────────────
export async function agregarHilo(url, titulo) {
    const parsed = parsearURL(url);
    if (!parsed) return { ok: false, error: 'URL inválida. Formato esperado: https://8chan.moe/board/res/XXXXX.html' };

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

    // Primer scrape
    const resultado = await scrapearHilo(board, thread_id, url);
    await cargarHilos();

    return { ok: true, ...resultado };
}

// ── Eliminar hilo y todos sus datos ──────────────────────────
export async function eliminarHilo(board, threadId) {
    await Promise.all([
        supabase.from('historial_puntos').delete().eq('board', board).eq('thread_id', threadId),
        supabase.from('historial_ranking').delete().eq('board', board).eq('thread_id', threadId),
        supabase.from('historial_posts').delete().eq('board', board).eq('thread_id', threadId),
        supabase.from('historial_hilos').delete().eq('board', board).eq('thread_id', threadId)
    ]);
    await cargarHilos();
}

// ── Toggle activo/inactivo ────────────────────────────────────
export async function toggleHiloActivo(board, threadId, activo) {
    await supabase.from('historial_hilos').update({ activo }).eq('board', board).eq('thread_id', threadId);
    await cargarHilos();
}

// ── Recalcular puntos de un hilo ──────────────────────────────
export async function recalcularPuntos(board, threadId) {
    const posts = await cargarPostsDB(board, threadId);
    if (!posts.length) return false;

    const puntos  = calcularPuntosLista(posts, threadId, board);
    const ranking = construirRanking(puntos, threadId, board);

    await supabase.from('historial_puntos').upsert(puntos,  { onConflict: 'board,post_no' });
    await supabase.from('historial_ranking').upsert(ranking, { onConflict: 'board,thread_id,poster_name' });
    await cargarPuntosDB(board, threadId);
    await cargarRankingDB(board, threadId);
    return true;
}
