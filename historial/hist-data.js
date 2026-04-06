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
    if (!texto || texto.trimStart().startsWith('<')) return null;
    try {
        const json = JSON.parse(texto);
        return (json && json.posts && json.posts.length > 0) ? json : null;
    } catch { return null; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Capa 1: fetch directo (si el browser ya tiene cookie de bypass) ──
async function fetchDirecto(jsonUrl) {
    try {
        const r = await fetch(jsonUrl, {
            signal: AbortSignal.timeout(8000),
            credentials: 'include',
            headers: { 'Accept': 'application/json, text/plain, */*' }
        });
        if (!r.ok) return null;
        return tryParseJSON(await r.text());
    } catch { return null; }
}

// ── Capa 2: Proxies públicos en paralelo ──────────────────────
async function fetchViaProxies(jsonUrl) {
    const encoded = encodeURIComponent(jsonUrl);
    const proxies = [
        { url: `https://corsproxy.io/?${encoded}`,              nombre: 'corsproxy.io' },
        { url: `https://api.allorigins.win/raw?url=${encoded}`,  nombre: 'allorigins/raw' },
        { url: `https://api.allorigins.win/get?url=${encoded}`,  nombre: 'allorigins/get', esWrapper: true },
    ];
    const results = await Promise.allSettled(proxies.map(async proxy => {
        const r = await fetch(proxy.url, { signal: AbortSignal.timeout(8000), headers: { 'Accept': 'application/json, */*' } });
        if (!r.ok) return null;
        let texto = await r.text();
        if (proxy.esWrapper) { try { texto = JSON.parse(texto).contents || ''; } catch { return null; } }
        return tryParseJSON(texto);
    }));
    for (const r of results) if (r.status === 'fulfilled' && r.value) return r.value;
    return null;
}

// ── Capa 3: Iframe resuelve PoW → reintenta Fetch Directo ────
async function fetchViaIframePow(board, threadId, jsonUrl) {
    const hiloHtml = `https://8chan.moe/${board}/res/${threadId}.html`;

    return new Promise(resolve => {
        let resuelto = false;
        const TIMEOUT_TOTAL = 35000;
        let pollInterval;

        function cleanup() {
            clearInterval(pollInterval);
            if (iframe?.parentNode) iframe.parentNode.removeChild(iframe);
        }

        const timeout = setTimeout(() => { cleanup(); resolve(null); }, TIMEOUT_TOTAL);

        async function intentarFetch(label) {
            if (resuelto) return;
            console.log(`[8chan-fetch] ${label}`);

            // Solo usamos fetch directo aquí. Si el Iframe ya limpió la IP, esto funcionará.
            const directo = await fetchDirecto(jsonUrl);
            if (directo && !resuelto) {
                resuelto = true; clearTimeout(timeout); cleanup(); resolve(directo); return;
            }
            
            // Si el directo falla por CORS, intentamos proxy público como respaldo
            if (!resuelto) {
                const proxy = await fetchViaProxies(jsonUrl);
                if (proxy && !resuelto) {
                    resuelto = true; clearTimeout(timeout); cleanup(); resolve(proxy); return;
                }
            }
        }

        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'display:none;width:1px;height:1px;position:fixed;top:-9999px;left:-9999px';
        iframe.src = hiloHtml;

        let loadCount = 0;
        iframe.onload = async () => {
            loadCount++;
            if (loadCount === 1) {
                console.log('[8chan-fetch] Iframe cargó (carga #1). Esperando resolución PoW...');
                await sleep(2000); // Darle tiempo extra al script de 8chan para minar el PoW
                await intentarFetch('Intento tras carga #1');
            } else {
                console.log(`[8chan-fetch] Iframe cargó (carga #${loadCount}). PoW completado y redirigido.`);
                await sleep(1500); // Esperar que la cookie se asiente en el navegador
                await intentarFetch(`Intento tras carga #${loadCount}`);
            }
        };

        document.body.appendChild(iframe);

        // Aumentamos el intervalo a 5s para no causar error 429 (Too Many Submissions)
        pollInterval = setInterval(async () => {
            if (resuelto) { clearInterval(pollInterval); return; }
            await intentarFetch('Poll periódico');
        }, 5000);
    });
}

// ── ORQUESTADOR PRINCIPAL ─────────────────────────────────────
export async function fetchHiloJSON(board, threadId) {
    const jsonUrl = `https://8chan.moe/${board}/res/${threadId}.json`;
    console.log(`[8chan-fetch] Iniciando: ${jsonUrl}`);

    // Capa 1: fetch directo
    console.log('[8chan-fetch] Capa 1: Fetch directo...');
    const directo = await fetchDirecto(jsonUrl);
    if (directo) { console.log('[8chan-fetch] ✅ Directo'); return directo; }

    // Capa 2: Proxies públicos
    console.log('[8chan-fetch] Capa 2: Proxies...');
    const proxy = await fetchViaProxies(jsonUrl);
    if (proxy) { console.log('[8chan-fetch] ✅ Proxy'); return proxy; }

    // Capa 3: Iframe PoW + reintento
    console.log('[8chan-fetch] Capa 3: Iframe PoW + reintento (~15-30s)...');
    const powResult = await fetchViaIframePow(board, threadId, jsonUrl);
    if (powResult) { console.log('[8chan-fetch] ✅ Iframe PoW'); return powResult; }

    console.warn('[8chan-fetch] ❌ Todos los métodos fallaron.');
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

    const json = manualJson ? manualJson : await fetchHiloJSON(board, threadId);
    if (!json) {
        estadoUI.cargando = false;
        return { ok: false, error: 'Todos los métodos fallaron. Usa "📥 Pega JSON" manualmente.' };
    }

    const postsNuevos = parsearPostsLynxChan(json, threadId, board);
    if (!postsNuevos.length) {
        estadoUI.cargando = false;
        return { ok: false, error: 'No se encontraron posts en el JSON' };
    }

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

    const { error: errPosts } = await supabase
        .from('historial_posts')
        .upsert(soloNuevos, { onConflict: 'board,post_no' });

    if (errPosts) {
        estadoUI.cargando = false;
        return { ok: false, error: 'Error guardando posts: ' + errPosts.message };
    }

    const todosOrdenados = postsNuevos;
    const puntos = calcularPuntosLista(todosOrdenados, threadId, board);
    const { error: errPuntos } = await supabase
        .from('historial_puntos')
        .upsert(puntos, { onConflict: 'board,post_no' });

    if (errPuntos) console.warn('Error actualizando puntos:', errPuntos.message);

    const ranking = construirRanking(puntos, threadId, board);
    const { error: errRanking } = await supabase
        .from('historial_ranking')
        .upsert(ranking, { onConflict: 'board,thread_id,poster_name' });

    if (errRanking) console.warn('Error actualizando ranking:', errRanking.message);

    await supabase.from('historial_hilos').update({
        ultimo_check: new Date().toISOString(),
        total_posts:  todosOrdenados.length
    }).eq('board', board).eq('thread_id', threadId);

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
