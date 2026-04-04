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

// ── Fetch JSON del hilo con proxy CORS (VERSIÓN OP BYPASS) ────
export async function fetchHiloJSON(board, threadId) {
    const jsonUrl = `https://8chan.moe/${board}/res/${threadId}.json`;
    console.log('Buscando JSON en:', jsonUrl);
    
    // INTENTO 1: Directo enviando tu "Pase Humano" de Cloudflare (Cookies)
    try {
        console.log("Intento 1 (Directo con credenciales)...");
        const r = await fetch(jsonUrl, { 
            signal: AbortSignal.timeout(8000),
            credentials: 'include', // <-- ESTO ENVÍA TUS COOKIES DE 8CHAN
            headers: { 'Accept': 'application/json' }
        });
        
        if (r.ok) {
            const texto = await r.text(); 
            try {
                const json = JSON.parse(texto);
                if (json && json.posts) {
                    console.log("¡Éxito en el Intento 1!");
                    return json;
                }
            } catch (e) {
                console.warn("El intento 1 devolvió HTML.");
            }
        }
    } catch (e) {
        console.warn("Intento 1 falló por red.");
    }

    // Intentos de respaldo con proxies (por si fallan las cookies)
    const proxies = [
        `https://corsproxy.io/?${encodeURIComponent(jsonUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(jsonUrl)}`,
        `https://api.codetabs.com/v1/proxy/?quest=${jsonUrl}`
    ];

    for (let i = 0; i < proxies.length; i++) {
        try {
            console.log(`Intento proxy ${i + 1}...`);
            const r = await fetch(proxies[i], { signal: AbortSignal.timeout(8000) });
            if (r.ok) {
                const texto = await r.text(); 
                try {
                    const json = JSON.parse(texto);
                    if (json && json.posts) {
                        console.log(`¡Éxito en proxy ${i + 1}!`);
                        return json;
                    }
                } catch (e) {}
            }
        } catch (e) {}
    }

    console.error("Cloudflare bloqueó todas las peticiones.");
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
export async function scrapearHilo(board, threadId, threadUrl) {
    estadoUI.cargando = true;

    // 1. Obtener JSON de 8chan
    const json = await fetchHiloJSON(board, threadId);
    if (!json) {
        estadoUI.cargando = false;
        return { ok: false, error: 'No se pudo obtener el JSON del hilo (CORS o hilo no existe)' };
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
        // Actualizar timestamp del último check
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

    // 5. Recalcular puntos para TODO el hilo (para que los posts nuevos
    //    hereden el contexto temporal correcto)
    const todosOrdenados = postsNuevos; // ya ordenados por post_no
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

    // Verificar si ya existe (Corregido con maybeSingle)
    const { data: existe } = await supabase
        .from('historial_hilos')
        .select('id')
        .eq('board', board)
        .eq('thread_id', thread_id)
        .maybeSingle();

    if (existe) return { ok: false, error: 'Este hilo ya está siendo rastreado.' };

    // Insertar hilo
    const { error } = await supabase.from('historial_hilos').insert([{
        board,
        thread_id,
        thread_url: url,
        titulo:     titulo || `Hilo #${thread_id}`
    }]);

    if (error) return { ok: false, error: error.message };

    // Hacer el primer scrape
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

// ── Recalcular puntos de un hilo (si se cambian parámetros) ──
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
