// ============================================================
// hist-logic.js — Lógica de Puntos y Parsing
// ============================================================
import { CONFIG_PUNTOS } from './hist-state.js';

// ── Cálculo de puntos por post ──────────────────────────────
// Regla: el total de puntos depende de cuánto tardó el post
// respecto al post ANTERIOR en el hilo (de cualquier persona)
export function calcularPuntos(postTime, anteriorPostTime) {
    if (!anteriorPostTime) {
        return { puntos: CONFIG_PUNTOS.base, tipo: 'base', minutos: null };
    }

    const minutos = (new Date(postTime) - new Date(anteriorPostTime)) / 60000;

    if (minutos <= CONFIG_PUNTOS.umbral_rapido) {
        return { puntos: CONFIG_PUNTOS.rapido, tipo: 'rapido', minutos };
    } else if (minutos <= CONFIG_PUNTOS.umbral_medio) {
        return { puntos: CONFIG_PUNTOS.medio, tipo: 'medio', minutos };
    } else {
        return { puntos: CONFIG_PUNTOS.base, tipo: 'base', minutos };
    }
}

// ── Parser de JSON de LynxChan (8chan.moe) ───────────────────
export function parsearPostsLynxChan(json, threadId, board) {
    const posts = [];
    if (!json) return posts;

    // LynxChan retorna { posts: [...] }
    // Cada post: { postId, creation, name, id, message, markdown, files }
    const rawPosts = json.posts || [];

    rawPosts.forEach(p => {
        const postId   = p.postId ?? p.no;
        const creation = p.creation ?? p.dateTime ?? p.time;
        const name     = (p.name?.trim() || 'Anónimo');
        const posterId = p.id || '';
        const message  = p.markdown ?? p.message ?? '';
        const files    = Array.isArray(p.files) ? p.files : (p.files ? [p.files] : []);

        if (!postId || !creation) return;

        posts.push({
            board,
            thread_id:    threadId,
            post_no:      Number(postId),
            poster_name:  name,
            poster_id:    posterId,
            post_time:    typeof creation === 'number'
                            ? new Date(creation * 1000).toISOString()
                            : new Date(creation).toISOString(),
            contenido:    limpiarHTML(message).substring(0, 600),
            tiene_imagen: files.length > 0,
            num_imagenes: files.length
        });
    });

    // Ordenar por post_no ascendente (cronológico)
    return posts.sort((a, b) => a.post_no - b.post_no);
}

// ── Calcula puntos para una lista de posts ya ordenados ───────
export function calcularPuntosLista(posts, threadId, board) {
    const resultado = [];
    let anteriorTime = null;

    posts.forEach(post => {
        const { puntos, tipo, minutos } = calcularPuntos(post.post_time, anteriorTime);
        resultado.push({
            board,
            thread_id:               threadId,
            post_no:                 post.post_no,
            poster_name:             post.poster_name,
            puntos,
            bonus_tipo:              tipo,
            minutos_desde_anterior:  minutos !== null ? Math.round(minutos * 100) / 100 : null
        });
        anteriorTime = post.post_time;
    });

    return resultado;
}

// ── Construye el ranking desde la lista de puntos ─────────────
export function construirRanking(puntos, threadId, board) {
    const map = {};

    puntos.forEach(p => {
        const key = p.poster_name;
        if (!map[key]) {
            map[key] = {
                board,
                thread_id:     threadId,
                poster_name:   key,
                total_posts:   0,
                total_puntos:  0,
                posts_rapidos: 0,
                posts_medios:  0,
                posts_base:    0,
                ultimo_post:   null
            };
        }
        map[key].total_posts   += 1;
        map[key].total_puntos  += p.puntos;
        if (p.bonus_tipo === 'rapido') map[key].posts_rapidos++;
        else if (p.bonus_tipo === 'medio') map[key].posts_medios++;
        else map[key].posts_base++;
    });

    return Object.values(map).sort((a, b) => b.total_puntos - a.total_puntos);
}

// ── Limpiar HTML del mensaje ──────────────────────────────────
export function limpiarHTML(html) {
    if (!html) return '';
    return html
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<a[^>]*>(.*?)<\/a>/gi, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/&gt;/g, '>').replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'").replace(/\s+/g, ' ')
        .trim();
}

// ── Formatea duración en texto legible ────────────────────────
export function formatearMinutos(minutos) {
    if (minutos === null || minutos === undefined) return 'primer post';
    if (minutos < 1)   return `${Math.round(minutos * 60)}s`;
    if (minutos < 60)  return `${Math.round(minutos)}m`;
    const h = Math.floor(minutos / 60);
    const m = Math.round(minutos % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Obtiene thread_id y board de una URL de 8chan ─────────────
export function parsearURL(url) {
    // Ej: https://8chan.moe/hisrol/res/125542.html
    try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        // parts = ['hisrol', 'res', '125542.html']
        const board    = parts[0] || 'hisrol';
        const threadId = parseInt((parts[2] || '').replace(/\D/g, ''));
        if (!threadId) return null;
        return { board, thread_id: threadId, host: u.host };
    } catch {
        return null;
    }
}
