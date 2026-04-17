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
        const message  = p.markdown ?? p.message ?? '';
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
    // Primero cargamos el índice completo (posts viejos de la DB) y luego sobreescribimos
    // con los nuevos por si hubiera duplicados (los nuevos tienen precedencia)
    const postAutor = {};
    indiceCompleto.forEach(p => { postAutor[p.post_no] = p.poster_name; });
    posts.forEach(p => { postAutor[p.post_no] = p.poster_name; });

    // Log diagnóstico: mostrar qué posts tienen reply_to
    const conReplies = posts.filter(p => p.reply_to && p.reply_to.length > 0);
    console.log(`[calcPT] ${posts.length} posts, ${conReplies.length} con replies`);
    conReplies.slice(0, 5).forEach(p => {
        const enMapa = !!(mapaNombres[p.poster_name] ?? mapaNombres[normPosterName(p.poster_name)]);
        const replyResueltas = (p.reply_to || []).map(rno => ({
            rno,
            autor: postAutor[rno] || '❌ NO EN ÍNDICE',
            enMapa: !!(mapaNombres[postAutor[rno]] ?? mapaNombres[normPosterName(postAutor[rno] || '')])
        }));
        console.log(`  Post ${p.post_no} de "${p.poster_name}" (enMapa:${enMapa}) → replies:`, JSON.stringify(replyResueltas));
    });

    posts.forEach(post => {
        if (!post.reply_to || post.reply_to.length === 0) return;

        const pjReplier = mapaNombres[post.poster_name]
                       ?? mapaNombres[normPosterName(post.poster_name)];
        if (!pjReplier) return; // poster no registrado como personaje

        const tagsReplier = pjReplier.tags || [];

        // Para cada post al que responde
        post.reply_to.forEach(replyPostNo => {
            const autorReplyado = postAutor[replyPostNo];
            if (!autorReplyado) return;
            if (autorReplyado === post.poster_name) return; // no se puntúa a sí mismo

            // Buscar el personaje del replyado (también con fallback sin tripcode)
            const pjReplyado = mapaNombres[autorReplyado]
                            ?? mapaNombres[normPosterName(autorReplyado)];
            if (!pjReplyado) return; // replyado no es personaje registrado

            const tagsReplyado = pjReplyado.tags || [];
            if (tagsReplyado.length === 0) return;

            // Tags de contraste: los del REPLYADO que el REPLIER no tiene
            const tagsReplierNorm = new Set(tagsReplier.map(t => t.toLowerCase()));
            const tagsContraste   = tagsReplyado.filter(t => !tagsReplierNorm.has(t.toLowerCase()));

            if (tagsContraste.length === 0) return;

            // Elige 1 tag aleatorio de los de contraste
            const tagElegido = tagsContraste[Math.floor(Math.random() * tagsContraste.length)];

            // El PT va al REPLIER (quien interactuó), no al replyado
            transacciones.push({
                personaje_nombre:  pjReplier.nombre,
                tag:               tagElegido,
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
