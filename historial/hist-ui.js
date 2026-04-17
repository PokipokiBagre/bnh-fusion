// ============================================================
// hist-ui.js — Renderizado de Vistas
// ============================================================
import {
    hilosState, postsState, rankingState,
    ptTagState, estadoUI
} from './hist-state.js';
import { formatearMinutos, fmtFecha, limpiarHTML } from './hist-logic.js';

const $ = (id) => document.getElementById(id);

function medalla(pos) {
    if (pos === 1) return '🥇';
    if (pos === 2) return '🥈';
    if (pos === 3) return '🥉';
    return `#${pos}`;
}

function tiempoRelativo(isoString) {
    if (!isoString) return '';
    const diff = (Date.now() - new Date(isoString)) / 60000;
    if (diff < 1)    return 'hace menos de 1m';
    if (diff < 60)   return `hace ${Math.round(diff)}m`;
    if (diff < 1440) return `hace ${Math.round(diff / 60)}h`;
    return `hace ${Math.round(diff / 1440)}d`;
}

// Renderiza los tags con sus PT como pequeñas píldoras
function renderTagsPT(pjNombre) {
    const tags = ptTagState[pjNombre];
    if (!tags || Object.keys(tags).length === 0) return '<span style="color:#666; font-size:0.8em;">Sin PT en este hilo</span>';

    return Object.entries(tags)
        .sort((a, b) => b[1] - a[1])
        .map(([tag, pts]) => {
            const color = pts >= 5 ? '#00b4d8' : pts >= 3 ? '#7ecfb3' : '#888';
            return `<span style="
                display:inline-block; background:rgba(0,180,216,0.1);
                border:1px solid ${color}; color:${color};
                padding:2px 7px; border-radius:12px; font-size:0.72em;
                font-weight:600; margin:2px 2px 0 0; white-space:nowrap;">
                ${tag} <b>${pts}</b>
            </span>`;
        }).join('');
}

// ============================================================
// VISTA: RANKING
// ============================================================
export function renderRanking() {
    const cont = $('contenido-principal');
    if (!cont) return;

    if (!estadoUI.hiloActivo) {
        cont.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">📋</div>
            <h3>No hay hilo seleccionado</h3>
            <p>Selecciona un hilo desde la pestaña <b>Hilos</b>.</p>
            <button class="btn btn-green" onclick="window.irAHilos()">Ver Hilos</button>
        </div>`;
        return;
    }

    if (!rankingState.length) {
        cont.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">🏅</div>
            <h3>Ranking vacío</h3>
            <p>Haz clic en <b>Actualizar</b> para scrapear el hilo.</p>
            <button class="btn btn-green" onclick="window.actualizarHiloActivo()">🔄 Actualizar ahora</button>
        </div>`;
        return;
    }

    const totalPosts = rankingState.reduce((s, r) => s + r.total_posts, 0);

    // PT totales ganados en este hilo (suma de todos los tags de todos los personajes)
    let totalPT = 0;
    Object.values(ptTagState).forEach(tags => {
        Object.values(tags).forEach(n => { totalPT += n; });
    });

    let html = `
    <div class="stats-banner">
        <div class="stat-item"><span class="stat-num">${rankingState.length}</span><span class="stat-lbl">Participantes</span></div>
        <div class="stat-item"><span class="stat-num">${totalPosts}</span><span class="stat-lbl">Posts Totales</span></div>
        <div class="stat-item"><span class="stat-num" style="color:#00b4d8">${totalPT}</span><span class="stat-lbl">PT Generados</span></div>
        <div class="stat-item"><span class="stat-num" style="color:#7ecfb3">${Object.keys(ptTagState).length}</span><span class="stat-lbl">Personajes con PT</span></div>
    </div>

    <div class="ranking-podio">`;

    const top3       = rankingState.slice(0, 3);
    const podioOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;

    podioOrder.forEach(r => {
        if (!r) return;
        const realPos = rankingState.indexOf(r) + 1;
        const height  = realPos === 1 ? '120px' : realPos === 2 ? '90px' : '70px';
        html += `
        <div class="podio-slot podio-${realPos}">
            <div class="podio-name">${r.poster_name}</div>
            <div class="podio-pts">${r.total_posts} posts</div>
            <div class="podio-base" style="height:${height}">${medalla(realPos)}</div>
        </div>`;
    });

    html += `</div>
    <table class="tabla-ranking">
        <thead>
            <tr>
                <th>#</th>
                <th>Poster / Personaje</th>
                <th>Posts</th>
                <th>PT Ganados en este hilo</th>
                <th class="hide-sm">Último Post</th>
            </tr>
        </thead>
        <tbody>`;

    rankingState.forEach((r, i) => {
        const pos = i + 1;
        html += `
        <tr class="${pos <= 3 ? 'top-row top-' + pos : ''}">
            <td class="col-pos">${medalla(pos)}</td>
            <td class="col-nombre">
                <div class="poster-nombre">${r.poster_name}</div>
            </td>
            <td class="col-puntos">${r.total_posts}</td>
            <td style="min-width:200px">${renderTagsPT(r.poster_name)}</td>
            <td class="hide-sm" style="font-size:0.8em; color:#666">
                ${r.ultimo_post ? tiempoRelativo(r.ultimo_post) : '-'}
            </td>
        </tr>`;
    });

    html += `</tbody></table>`;
    cont.innerHTML = html;
}

// ============================================================
// VISTA: TIMELINE
// ============================================================
export function renderTimeline() {
    const cont = $('contenido-principal');
    if (!cont) return;

    if (!estadoUI.hiloActivo) {
        cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📜</div><h3>Selecciona un hilo primero</h3></div>`;
        return;
    }
    if (!postsState.length) {
        cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📜</div><h3>Sin posts registrados</h3><button class="btn btn-green" onclick="window.actualizarHiloActivo()">🔄 Actualizar</button></div>`;
        return;
    }

    let html = `
    <div class="timeline-controles">
        <span style="font-size:0.85em; color:#666;">${postsState.length} posts · ${estadoUI.hiloActivo.titulo}</span>
        <a href="${estadoUI.hiloActivo.thread_url}" target="_blank" class="btn btn-outline" style="font-size:0.8em; padding:4px 12px;">↗ Ver en 8chan</a>
    </div>
    <div class="timeline">`;

    // Índice post_no → poster_name para resolver replies visualmente
    const postAutor = {};
    postsState.forEach(p => { postAutor[p.post_no] = p.poster_name; });

    // Índice post_no → [{pj, tag}] — PT generados por cada post
    // Reconstruir desde ptTagState no es posible sin el origen_post_no en memoria,
    // así que usamos los reply_to: si post A replies a B y A es un PJ,
    // sabemos que ese post generó PT. Lo marcamos con los tags visibles del ranking.
    _ptPorPost = {};
    postsState.forEach(post => {
        if (!post.pt_procesado) return;
        if (!post.reply_to || !post.reply_to.length) return;
        // Buscar si este poster tiene PT registrados en ptTagState
        const ptPoster = ptTagState[post.poster_name];
        if (!ptPoster || !Object.keys(ptPoster).length) return;
        // Marcar este post como generador de PT (sin saber el tag exacto en memoria)
        if (!_ptPorPost[post.post_no]) _ptPorPost[post.post_no] = [];
        // Mostrar los top tags del personaje como indicador
        const topTags = Object.entries(ptPoster).sort((a,b)=>b[1]-a[1]).slice(0,2);
        topTags.forEach(([tag]) => {
            _ptPorPost[post.post_no].push({ pj: post.poster_name, tag });
        });
    });

    [...postsState].reverse().forEach(post => {
        // ¿Generó PT este post? Buscar en ptTagState por origen_post_no
        const ptDeEstePost = obtenerTagsPTDePost(post.post_no);
        const ptBadge = ptDeEstePost.length
            ? ptDeEstePost.map(({pj, tag}) =>
                `<span style="background:rgba(0,180,216,0.15); border:1px solid #00b4d8; color:#00b4d8; padding:2px 8px; border-radius:10px; font-size:0.75em; font-weight:700; margin-left:4px;" title="${pj}">+PT ${tag}</span>`
              ).join('')
            : '';

        // Replies visuales
        const repliesHtml = (post.reply_to || []).map(rno => {
            const autor = postAutor[rno] || `#${rno}`;
            return `<span style="color:#00b4d8; font-size:0.8em; margin-right:4px;">&gt;&gt;${rno} (${autor})</span>`;
        }).join('');

        html += `
        <div class="timeline-item">
            <div class="tl-header">
                <div class="tl-meta">
                    <span class="tl-name">${post.poster_name}</span>
                    ${post.poster_id ? `<span class="tl-id">${post.poster_id}</span>` : ''}
                    <span class="tl-num">No.${post.post_no}</span>
                    ${ptBadge}
                </div>
                <div class="tl-right">
                    <span class="tl-time">${fmtFecha(post.post_time)}</span>
                </div>
            </div>
            ${repliesHtml ? `<div style="padding:4px 0 2px 0;">${repliesHtml}</div>` : ''}
            <div class="tl-body">
                ${post.contenido ? `<p class="tl-texto">${escHTML(post.contenido)}</p>` : ''}
                ${post.tiene_imagen ? `<span class="tl-img-badge">🖼 ${post.num_imagenes} imagen${post.num_imagenes > 1 ? 'es' : ''}</span>` : ''}
            </div>
        </div>`;
    });

    html += `</div>`;
    cont.innerHTML = html;
}

// Busca en ptTagState los PT que se generaron por este post_no específico.
// ptTagState está cargado desde log_puntos_tag filtrado por origen_thread_id,
// pero no tiene origen_post_no en memoria — necesitamos el índice por post.
// Lo resolvemos con _ptPorPost que se construye en renderTimeline.
let _ptPorPost = {}; // { post_no: [{pj, tag}] }

function obtenerTagsPTDePost(postNo) {
    return _ptPorPost[postNo] || [];
}

// ============================================================
// VISTA: HILOS
// ============================================================
export function renderHilos() {
    const cont    = $('contenido-principal');
    if (!cont) return;
    const esAdmin = estadoUI.esAdmin;
    let html = '';

    if (esAdmin) {
        html += `
        <div class="card-form">
            <h3 class="form-title">➕ Rastrear Nuevo Hilo</h3>
            <div class="form-row">
                <input type="text" id="inp-url" placeholder="https://8chan.moe/hisrol/res/125542.html" class="inp" style="flex:3;">
                <input type="text" id="inp-titulo" placeholder="Título del hilo (opcional)" class="inp" style="flex:2;">
                <button class="btn btn-green" onclick="window.agregarNuevoHilo()">Agregar</button>
            </div>
            <p style="font-size:0.8em; color:#888; margin:6px 0 0 0;">Si el scrape automático falla, usa "📥 Pega JSON" luego de agregar.</p>
        </div>`;
    }

    if (!hilosState.length) {
        html += `<div class="empty-state"><div class="empty-icon">🧵</div><h3>No hay hilos rastreados</h3></div>`;
        cont.innerHTML = html;
        return;
    }

    html += `<div class="hilos-grid">`;

    hilosState.forEach(h => {
        const isActivo = estadoUI.hiloActivo?.thread_id == h.thread_id && estadoUI.hiloActivo?.board == h.board;
        html += `
        <div class="hilo-card ${isActivo ? 'hilo-selected' : ''} ${!h.activo ? 'hilo-inactivo' : ''}">
            <div class="hilo-top">
                <div>
                    <div class="hilo-titulo">${h.titulo}</div>
                    <div class="hilo-meta">
                        <span class="tag tag-board">/${h.board}/</span>
                        <span class="tag">Hilo #${h.thread_id}</span>
                        ${!h.activo ? '<span class="tag tag-inactivo">Inactivo</span>' : ''}
                    </div>
                </div>
                <div class="hilo-puntos-badge">${h.total_posts || 0} posts</div>
            </div>
            <div class="hilo-info">
                <span>🕐 ${h.ultimo_check ? tiempoRelativo(h.ultimo_check) : 'Nunca actualizado'}</span>
                <span><a href="${h.thread_url}" target="_blank" style="color:var(--green); text-decoration:none;">↗ Ver hilo</a></span>
            </div>
            <div class="hilo-actions">
                <button class="btn btn-green btn-sm" onclick="window.seleccionarHilo('${h.board}', ${h.thread_id})">
                    ${isActivo ? '✓ Seleccionado' : 'Seleccionar'}
                </button>
                <button class="btn btn-outline btn-sm" onclick="window.scrapeManual('${h.board}', ${h.thread_id})">🔄 Actualizar</button>
                ${esAdmin ? `<button class="btn btn-outline btn-sm" style="border-color:var(--orange); color:var(--orange);" onclick="window.actualizarManual('${h.board}', ${h.thread_id})">📥 Pega JSON</button>` : ''}
                ${esAdmin ? `
                <button class="btn btn-outline btn-sm" onclick="window.toggleActivo('${h.board}', ${h.thread_id}, ${!h.activo})">
                    ${h.activo ? '⏸ Pausar' : '▶ Activar'}
                </button>
                <button class="btn btn-red btn-sm" onclick="window.pedirEliminarHilo('${h.board}', ${h.thread_id}, '${h.titulo}')">🗑</button>` : ''}
            </div>
        </div>`;
    });

    html += `</div>`;
    cont.innerHTML = html;
}

// ── Header con info del hilo activo ──────────────────────────
export function renderHeaderInfo() {
    const el = $('hilo-activo-info');
    if (!el) return;

    if (!estadoUI.hiloActivo) {
        el.innerHTML = `<span style="color:#aaa; font-size:0.85em;">Sin hilo seleccionado</span>`;
        return;
    }

    const h      = estadoUI.hiloActivo;
    const ultima = estadoUI.ultimaActualizacion
        ? `Actualizado: ${tiempoRelativo(estadoUI.ultimaActualizacion.toISOString())}`
        : '';

    el.innerHTML = `
    <span class="hilo-badge">
        <span style="color:var(--green); font-weight:bold;">/${h.board}/ #${h.thread_id}</span>
        — ${h.titulo}
        ${ultima ? `<span style="color:#888; font-size:0.8em; margin-left:8px;">${ultima}</span>` : ''}
        ${estadoUI.cargando ? `<span class="spinner"></span>` : ''}
        ${estadoUI.autoRefresh ? `<span class="badge badge-rapido" style="margin-left:6px;">🔴 Live</span>` : ''}
    </span>`;
}

// ── Toast ─────────────────────────────────────────────────────
export function toast(msg, tipo = 'ok') {
    let el = $('toast-msg');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast-msg';
        document.body.appendChild(el);
    }
    el.className    = `toast toast-${tipo}`;
    el.textContent  = msg;
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.display = 'none'; }, 3500);
}

function escHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
