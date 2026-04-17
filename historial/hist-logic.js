// ============================================================
// hist-logic.js — Lógica de Parsing y PT por Tags
// ============================================================
import { OPCIONES } from '../bnh-opciones-tags.js';

// ── Parser de JSON de LynxChan (8chan.moe) ────────────────────
export function parsearPostsLynxChan(json, threadId, board) {
    const posts = [];
    if (!json) return posts;
    const rawPosts = json.posts || [];
    rawPosts.forEach(p => {
        const postId   = p.postId ?? p.no;
        const creation = p.creation ?? p.dateTime ?? p.time;
        const name     = (p.name?.trim() || 'Anónimo');
        const posterId = p.id || '';
        const message  = p.message ?? p.markdown ?? ''; // message=texto plano con >>NNN
        const files    = Array.isArray(p.files) ? p.files : (p.files ? [p.files] : []);
        if (!postId || !creation) return;
        const replyNums = [];
        let m; const reR = />>(\d+)/g;
        while ((m = reR.exec(message)) !== null) replyNums.push(Number(m[1]));
        posts.push({
            board, thread_id: threadId, post_no: Number(postId),
            poster_name: name, poster_id: posterId,
            post_time: typeof creation === 'number'
                ? new Date(creation * 1000).toISOString()
                : new Date(creation).toISOString(),
            contenido:    limpiarHTML(message).substring(0, 600),
            tiene_imagen: files.length > 0,
            num_imagenes: files.length,
            reply_to:     replyNums.length > 0 ? [...new Set(replyNums)] : null
        });
    });
    return posts.sort((a, b) => a.post_no - b.post_no);
}

export function normPosterName(name) {
    return (name || '').replace(/##?\S+/, '').trim();
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function extraerTagsDeLectura(contenido) {
    if (!contenido) return [];
    const found = []; let m;
    const re = /#([A-Za-zÀ-ɏ][A-Za-zÀ-ɏ0-9_.]*)/g;
    while ((m = re.exec(contenido)) !== null) found.push('#' + m[1]);
    return [...new Set(found)];
}

// ── Resuelve los personajes de un poster_name ─────────────────
// Si el nombre tiene comas → post multipersonaje → devuelve array de PJs
// Si no → array de 1 PJ (o vacío si no está en el mapa)
function resolverPersonajes(posterName, mapaNombres) {
    const partes = posterName.split(',').map(s => s.trim()).filter(Boolean);
    const resultado = [];
    for (const parte of partes) {
        const pj = mapaNombres[parte] ?? mapaNombres[normPosterName(parte)];
        if (pj) resultado.push(pj);
    }
    return resultado;
}

// ── Calcula transacciones de PT ───────────────────────────────
// 3 fuentes: NO_COMPARTIDOS, COMPARTIDOS, LECTURA
// Post multipersonaje (nombre con comas): cada personaje actúa de forma
// independiente, tanto al DAR como al RECIBIR PT (hasta 15 PT × N personajes).
// yaProcessados = Set<post_no> ya en log para este thread (idempotencia)
export function calcularTransaccionesPT(
    posts, mapaNombres, threadId,
    indiceCompleto = [], fusionados = new Set(), yaProcessados = new Set()
) {
    const transacciones = [];
    const postAutor = {};
    indiceCompleto.forEach(p => { postAutor[p.post_no] = p.poster_name; });
    posts.forEach(p => { postAutor[p.post_no] = p.poster_name; });

    posts.forEach(post => {
        if (yaProcessados.has(post.post_no)) return; // idempotencia

        const texto = post.contenido || '';

        // Extraer replies del contenido
        const replyNums = [];
        let m; const reR = />>(\d+)/g;
        while ((m = reR.exec(texto)) !== null) replyNums.push(Number(m[1]));
        const misReplies = [...new Set(replyNums)];

        // Personajes del EMISOR (1 en posts normales, N en multipersonaje)
        const pjsEmisor = resolverPersonajes(post.poster_name, mapaNombres);
        if (!pjsEmisor.length) return;

        // Tags de todos los personajes citados (para fuentes 1 y 2)
        // Se calcula una sola vez y se comparte entre todos los emisores
        const tagsReplyados = new Set();
        let hayPJ = false;
        misReplies.forEach(rno => {
            const autor = postAutor[rno];
            if (!autor) return;
            // El citado puede ser multipersonaje también → resolver sus PJs
            const pjsCitados = resolverPersonajes(autor, mapaNombres);
            pjsCitados.forEach(pjC => {
                // No contarse a uno mismo
                if (pjsEmisor.some(e => e.nombre === pjC.nombre)) return;
                hayPJ = true;
                (pjC.tags || []).forEach(t => tagsReplyados.add(t.toLowerCase()));
            });
        });

        // Procesar cada personaje emisor de forma independiente
        pjsEmisor.forEach(pjReplier => {
            const tagsReplierLow = new Set((pjReplier.tags || []).map(t => t.toLowerCase()));
            const tagOrig = {};
            (pjReplier.tags || []).forEach(t => {
                const norm = t.toLowerCase();
                tagOrig[norm] = t.startsWith('#') ? t : '#' + t;
            });

            const enFusion = fusionados.has(pjReplier.nombre);
            const divFusion = enFusion ? Math.max(1, OPCIONES.multiplicador_fusion) : 1;

            const empujar = (tagLow, delta, motivo) => {
                transacciones.push({
                    personaje_nombre: pjReplier.nombre,
                    tag:              tagOrig[tagLow] || ('#' + tagLow),
                    delta:            Math.max(1, Math.round(delta / divFusion)),
                    motivo,
                    origen_post_no:   post.post_no,
                    origen_thread_id: threadId
                });
            };

            // ── FUENTE 3: LECTURA ─────────────────────────────
            const leidos = extraerTagsDeLectura(texto)
                .map(t => t.toLowerCase())
                .filter(t => tagsReplierLow.has(t));
            shuffle(leidos).slice(0, OPCIONES.max_lectura).forEach(t =>
                empujar(t, OPCIONES.delta_lectura, 'lectura')
            );

            // Fuentes 1 y 2 solo si hay replies a personajes
            if (!hayPJ) return;

            // ── FUENTE 1: NO COMPARTIDOS ──────────────────────
            const noComp = [...tagsReplierLow].filter(t => !tagsReplyados.has(t));
            shuffle(noComp).slice(0, OPCIONES.max_no_compartidos).forEach(t =>
                empujar(t, OPCIONES.delta_no_compartido, 'interaccion')
            );

            // ── FUENTE 2: COMPARTIDOS ─────────────────────────
            const comp = [...tagsReplierLow].filter(t => tagsReplyados.has(t));
            shuffle(comp).slice(0, OPCIONES.max_compartidos).forEach(t =>
                empujar(t, OPCIONES.delta_compartido, 'compartido')
            );
        });
    });

    return transacciones;
}

export function construirRankingPosts(posts, threadId, board) {
    const map = {};
    posts.forEach(p => {
        if (!map[p.poster_name]) map[p.poster_name] = {
            board, thread_id: threadId, poster_name: p.poster_name,
            total_posts: 0, ultimo_post: null
        };
        map[p.poster_name].total_posts++;
        if (!map[p.poster_name].ultimo_post || p.post_time > map[p.poster_name].ultimo_post)
            map[p.poster_name].ultimo_post = p.post_time;
    });
    return Object.values(map).sort((a, b) => b.total_posts - a.total_posts);
}

export function limpiarHTML(html) {
    if (!html) return '';
    return html
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<a[^>]*>(.*?)<\/a>/gi, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/&gt;/g, '>').replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"'  )
        .replace(/&#039;/g, "'").replace(/\s+/g, ' ')
        .trim();
}

export function formatearMinutos(minutos) {
    if (minutos === null || minutos === undefined) return 'primer post';
    if (minutos < 1)   return `${Math.round(minutos * 60)}s`;
    if (minutos < 60)  return `${Math.round(minutos)}m`;
    const h = Math.floor(minutos / 60);
    const m = Math.round(minutos % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function fmtFecha(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

export function parsearURL(url) {
    try {
        const u     = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        const board    = parts[0] || 'hisrol';
        const threadId = parseInt((parts[2] || '').replace(/\D/g, ''));
        if (!threadId) return null;
        return { board, thread_id: threadId, host: u.host };
    } catch { return null; }
}
