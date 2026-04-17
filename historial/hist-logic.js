// ============================================================
// hist-logic.js — Lógica de Parsing y PT por Tags
// ============================================================

// ── Parser de JSON de LynxChan (8chan.moe) ───────────────────
// Ahora también extrae reply_to: los >>NNN que aparecen en el mensaje
export function parsearPostsLynxChan(json, threadId, board) {
    const posts = [];
    if (!json) return posts;

    const rawPosts = json.posts || [];

    rawPosts.forEach(p => {
        const postId   = p.postId ?? p.no;
        const creation = p.creation ?? p.dateTime ?? p.time;
        const name     = (p.name?.trim() || 'Anónimo');
        const posterId = p.id || '';
        const message  = p.message ?? p.markdown ?? '';  // message = texto plano con >>NNN
        const files    = Array.isArray(p.files) ? p.files : (p.files ? [p.files] : []);

        if (!postId || !creation) return;

        // Extraer todos los >>NNN del mensaje (replies)
        const replyMatches = message.matchAll(/>>(\d+)/g);
        const replyTo = [...replyMatches].map(m => Number(m[1]));

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
            num_imagenes: files.length,
            reply_to:     replyTo.length > 0 ? replyTo : null
        });
    });

    return posts.sort((a, b) => a.post_no - b.post_no);
}

// ── Calcula las transacciones de PT para una lista de posts ──
// Regla: cuando el post A hace reply al post B,
//   se busca el personaje dueño de B (el replyado)
//   se buscan los tags que tiene ese personaje y que NO tiene A
//   se asigna +1 PT en 1 tag aleatorio de esos (Contraste)
//
// mapaNombres     = { 'NombreEnHilo': { nombre, tags: ['#Eldritch',...] } }
// indiceCompleto  = [{ post_no, poster_name }] — todos los posts del hilo (incluye viejos)
//                   opcional; si se omite solo resuelve replies dentro del array posts
// Devuelve: [{personaje_nombre, tag, delta, motivo, origen_post_no, origen_thread_id}]
// Quita el tripcode (##xxx o #xxx) del poster_name para poder matchear con aliases
function normPosterName(name) {
    return (name || '').replace(/##?\S+/, '').trim();
}

export function calcularTransaccionesPT(posts, mapaNombres, threadId, indiceCompleto = []) {
    const transacciones = [];

    // Índice rápido: post_no → poster_name
    const postAutor = {};
    indiceCompleto.forEach(p => { postAutor[p.post_no] = p.poster_name; });
    posts.forEach(p => { postAutor[p.post_no] = p.poster_name; });

    posts.forEach(post => {
        if (!post.reply_to || post.reply_to.length === 0) return;

        // El REPLIER debe ser un personaje registrado
        const pjReplier = mapaNombres[post.poster_name]
                       ?? mapaNombres[normPosterName(post.poster_name)];
        if (!pjReplier) return;

        const tagsReplier = (pjReplier.tags || []).map(t => t.toLowerCase());
        if (tagsReplier.length === 0) return;

        // Acumular tags únicos de todos los replyados en este post
        const tagsReplyados = new Set();

        post.reply_to.forEach(replyPostNo => {
            const autorReplyado = postAutor[replyPostNo];
            if (!autorReplyado) return;
            if (autorReplyado === post.poster_name) return; // no se puntúa a sí mismo

            const pjReplyado = mapaNombres[autorReplyado]
                            ?? mapaNombres[normPosterName(autorReplyado)];
            if (!pjReplyado) return;

            (pjReplyado.tags || []).forEach(t => tagsReplyados.add(t.toLowerCase()));
        });

        if (tagsReplyados.size === 0) return;

        // LÓGICA CORRECTA:
        // Tags elegibles = tags PROPIOS del REPLIER que el/los REPLYADO/s NO tienen
        // (el REPLIER suma puntos en sus propios tags únicos)
        const tagsElegibles = tagsReplier.filter(t => !tagsReplyados.has(t));
        if (tagsElegibles.length === 0) return;

        // Máximo 5 PT por post, distribuidos aleatoriamente entre los tags elegibles
        const maxPT = Math.min(5, tagsElegibles.length);
        const ptTotal = Math.floor(Math.random() * maxPT) + 1; // entre 1 y maxPT

        // Mezclar los tags elegibles y tomar ptTotal de ellos
        const mezclados = [...tagsElegibles].sort(() => Math.random() - 0.5);
        const elegidos = mezclados.slice(0, ptTotal);

        // Buscar el nombre original del tag (con capitalización correcta)
        const tagsOriginales = pjReplier.tags || [];
        const tagMap = {};
        tagsOriginales.forEach(t => { tagMap[t.toLowerCase()] = t; });

        elegidos.forEach(tagLower => {
            const tagOriginal = tagMap[tagLower] || tagLower;
            transacciones.push({
                personaje_nombre:  pjReplier.nombre,
                tag:               tagOriginal.startsWith('#') ? tagOriginal : '#' + tagOriginal,
                delta:             1,
                motivo:            'interaccion',
                origen_post_no:    post.post_no,
                origen_thread_id:  threadId
            });
        });
    });

    return transacciones;
}


// ── Construye el ranking de posts (sin puntos de velocidad) ───
// Solo cuenta posts por persona para el historial
export function construirRankingPosts(posts, threadId, board) {
    const map = {};

    posts.forEach(p => {
        if (!map[p.poster_name]) {
            map[p.poster_name] = {
                board,
                thread_id:   threadId,
                poster_name: p.poster_name,
                total_posts: 0,
                ultimo_post: null
            };
        }
        map[p.poster_name].total_posts++;
        if (!map[p.poster_name].ultimo_post ||
            p.post_time > map[p.poster_name].ultimo_post) {
            map[p.poster_name].ultimo_post = p.post_time;
        }
    });

    return Object.values(map).sort((a, b) => b.total_posts - a.total_posts);
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

// ── Formatea fecha ISO a string legible ───────────────────────
export function fmtFecha(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

// ── Obtiene thread_id y board de una URL de 8chan ─────────────
export function parsearURL(url) {
    try {
        const u     = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        const board    = parts[0] || 'hisrol';
        const threadId = parseInt((parts[2] || '').replace(/\D/g, ''));
        if (!threadId) return null;
        return { board, thread_id: threadId, host: u.host };
    } catch {
        return null;
    }
}
