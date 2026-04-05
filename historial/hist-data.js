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

// ── Esperar N milisegundos ────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Capa 1: fetch directo (funciona si el browser ya tiene cookie bypass) ──
async function fetchDirecto(jsonUrl) {
    try {
        const r = await fetch(jsonUrl, {
            signal: AbortSignal.timeout(10000),
            credentials: 'include',
            headers: { 'Accept': 'application/json, text/plain, */*' }
        });
        if (!r.ok) return null;
        return tryParseJSON(await r.text());
    } catch { return null; }
}

// ── Capa 2: Iframe PoW → esperar cookie → fetch directo ──────
// 8chan corre un script de Proof-of-Work en el browser para dar la cookie
// "bypass". El iframe resuelve ese PoW por nosotros; después hacemos fetch.
async function fetchViaIframePow(board, threadId, jsonUrl) {
    // URL del hilo HTML (no .json) — aquí corre el PoW
    const hiloHtml = `https://8chan.moe/${board}/res/${threadId}.html`;

    return new Promise(resolve => {
        let resuelto = false;
        // Tiempo total: hasta 25 segundos (el PoW puede tardar)
        const timeout = setTimeout(() => { cleanup(); resolve(null); }, 25000);

        function cleanup() {
            if (iframe?.parentNode) iframe.parentNode.removeChild(iframe);
        }

        async function intentarFetchTrasPoW() {
            // Esperar que la cookie esté disponible
            // El PoW de 8chan suele tardar 1-3 s en resolverse
            for (let intento = 0; intento < 6; intento++) {
                await sleep(2000 + intento * 1000); // 2s, 3s, 4s, 5s, 6s, 7s
                if (resuelto) return;
                console.log(`[8chan-fetch] Iframe PoW: intento fetch #${intento + 1} tras espera...`);
                const json = await fetchDirecto(jsonUrl);
                if (json) {
                    resuelto = true;
                    clearTimeout(timeout);
                    cleanup();
                    resolve(json);
                    return;
                }
            }
            if (!resuelto) { cleanup(); resolve(null); }
        }

        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'display:none;width:1px;height:1px;position:fixed;top:-9999px;left:-9999px';
        // Apuntamos al HTML del hilo para que el PoW corra en contexto 8chan
        iframe.src = hiloHtml;
        iframe.onload = () => {
            console.log('[8chan-fetch] Iframe cargó (PoW completado o TOS), iniciando fetch con espera...');
            intentarFetchTrasPoW();
        };
        document.body.appendChild(iframe);
    });
}

// ── Capa 3: Proxies — solo los que realmente funcionan con APIs JSON ──
// Nota: la mayoría falla con 8chan porque devuelven la página TOS/PoW.
// Los dejamos como último recurso con timeout corto para no bloquear.
async function fetchViaProxies(jsonUrl) {
    const encoded = encodeURIComponent(jsonUrl);
    const proxies = [
        { url: `https://corsproxy.io/?${encoded}`,             nombre: 'corsproxy.io' },
        { url: `https://api.allorigins.win/raw?url=${encoded}`, nombre: 'allorigins/raw' },
        { url: `https://api.allorigins.win/get?url=${encoded}`, nombre: 'allorigins/get', esWrapper: true },
    ];

    // Lanzar todos en paralelo — el primero que devuelva JSON válido gana
    const carreras = proxies.map(async proxy => {
        try {
            const r = await fetch(proxy.url, {
                signal: AbortSignal.timeout(8000),
                headers: { 'Accept': 'application/json, text/plain, */*' }
            });
            if (!r.ok) return null;
            let texto = await r.text();
            if (proxy.esWrapper) {
                try { texto = JSON.parse(texto).contents || ''; } catch { return null; }
            }
            const json = tryParseJSON(texto);
            if (json) console.log(`[8chan-fetch] ✅ Proxy exitoso: ${proxy.nombre}`);
            return json;
        } catch { return null; }
    });

    // Promise.any devuelve el primero que resuelva con valor no-null
    try {
        const results = await Promise.allSettled(carreras);
        for (const r of results) {
            if (r.status === 'fulfilled' && r.value) return r.value;
        }
    } catch { /* nada */ }
    return null;
}

// ── ORQUESTADOR PRINCIPAL ─────────────────────────────────────
export async function fetchHiloJSON(board, threadId) {
    const jsonUrl = `https://8chan.moe/${board}/res/${threadId}.json`;
    console.log(`[8chan-fetch] Iniciando fetch: ${jsonUrl}`);

    // Capa 1: Fetch directo — funciona si el browser ya tiene la cookie bypass
    // (si el usuario visitó 8chan recientemente en esta sesión)
    console.log('[8chan-fetch] Capa 1: Fetch directo...');
    const directo = await fetchDirecto(jsonUrl);
    if (directo) { console.log('[8chan-fetch] ✅ Directo (cookie bypass activa)'); return directo; }

    // Capa 2: Proxies en paralelo (rápidos, poco probable que pasen el PoW)
    console.log('[8chan-fetch] Capa 2: Proxies en paralelo...');
    const proxy = await fetchViaProxies(jsonUrl);
    if (proxy) { console.log('[8chan-fetch] ✅ Proxy'); return proxy; }

    // Capa 3: Iframe resuelve el PoW de 8chan, luego fetch con cookie nueva
    // Este es el método más lento (~5-20s) pero el más robusto sin servidor.
    console.log('[8chan-fetch] Capa 3: Iframe PoW → fetch (puede tardar ~10-20s)...');
    const powResult = await fetchViaIframePow(board, threadId, jsonUrl);
    if (powResult) { console.log('[8chan-fetch] ✅ Iframe PoW + fetch'); return powResult; }

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

    // 1. Obtener JSON de 8chan (o usar el manual provisto)
    const json = manualJson ? manualJson : await fetchHiloJSON(board, threadId);
    if (!json) {
        estadoUI.cargando = false;
        return { ok: false, error: 'Los 3 métodos automáticos fallaron (directo, proxies, iframe PoW). El PoW de 8chan bloqueó todo. Usa "📥 Pega JSON" manualmente.' };
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

    // 5. lar puntos
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

    await Promise.all([
        supabase.from('historial_puntos').upsert(puntos, { onConflict: 'board,post_no' }),
        supabase.from('historial_ranking').upsert(ranking, { onConflict: 'board,thread_id,poster_name' }),
        // Actualiza el contador para que la UI no muestre 0 posts
        supabase.from('historial_hilos').update({ total_posts: posts.length }).eq('board', board).eq('thread_id', threadId)
    ]);

    await cargarPuntosDB(board, threadId);
    await cargarRankingDB(board, threadId);
    return true;
}
