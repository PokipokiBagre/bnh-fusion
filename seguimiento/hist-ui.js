// ============================================================
// hist-ui.js — Renderizado de Vistas
// ============================================================
import {
    hilosState, postsState, puntosState, rankingState,
    estadoUI, CONFIG_PUNTOS
} from './hist-state.js';
import { formatearMinutos, limpiarHTML } from './hist-logic.js';

const $ = (id) => document.getElementById(id);

// ── Medalla por posición ──────────────────────────────────────
function medalla(pos) {
    if (pos === 1) return '🥇';
    if (pos === 2) return '🥈';
    if (pos === 3) return '🥉';
    return `#${pos}`;
}

// ── Badge de tipo de bonus ────────────────────────────────────
function badgeBonus(tipo, puntos) {
    const conf = {
        rapido: { cls: 'badge-rapido', icon: '⚡', label: 'Rápido' },
        medio:  { cls: 'badge-medio',  icon: '🕐', label: 'Medio' },
        base:   { cls: 'badge-base',   icon: '💤', label: 'Base' }
    };
    const b = conf[tipo] || conf.base;
    return `<span class="badge ${b.cls}">${b.icon} ${puntos}pts</span>`;
}

// ── Tiempo relativo ───────────────────────────────────────────
function tiempoRelativo(isoString) {
    if (!isoString) return '';
    const diff = (Date.now() - new Date(isoString)) / 60000;
    if (diff < 1)    return 'hace menos de 1m';
    if (diff < 60)   return `hace ${Math.round(diff)}m`;
    if (diff < 1440) return `hace ${Math.round(diff/60)}h`;
    return `hace ${Math.round(diff/1440)}d`;
}

// ── Fecha formateada ──────────────────────────────────────────
function fmtFecha(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('es-ES', {
        day:'2-digit', month:'2-digit', year:'numeric',
        hour:'2-digit', minute:'2-digit', second:'2-digit'
    });
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
            <p>Selecciona un hilo desde la pestaña <b>Hilos</b> para ver el ranking.</p>
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

    const totalPosts  = rankingState.reduce((s, r) => s + r.total_posts,  0);
    const totalPuntos = rankingState.reduce((s, r) => s + r.total_puntos, 0);

    let html = `
    <div class="stats-banner">
        <div class="stat-item"><span class="stat-num">${rankingState.length}</span><span class="stat-lbl">Participantes</span></div>
        <div class="stat-item"><span class="stat-num">${totalPosts}</span><span class="stat-lbl">Posts Totales</span></div>
        <div class="stat-item"><span class="stat-num">${totalPuntos}</span><span class="stat-lbl">Puntos en Juego</span></div>
        <div class="stat-item"><span class="stat-num" style="color:var(--green)">${CONFIG_PUNTOS.rapido}</span><span class="stat-lbl">Max pts/post</span></div>
    </div>

    <div class="ranking-podio">`;

    // Podio top 3
    const top3 = rankingState.slice(0, 3);
    const podioOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;

    podioOrder.forEach((r, i) => {
        if (!r) return;
        const realPos = rankingState.indexOf(r) + 1;
        const height  = realPos === 1 ? '120px' : realPos === 2 ? '90px' : '70px';
        html += `
        <div class="podio-slot podio-${realPos}">
            <div class="podio-name">${r.poster_name}</div>
            <div class="podio-pts">${r.total_puntos} pts</div>
            <div class="podio-base" style="height:${height}">${medalla(realPos)}</div>
            <div class="podio-detail">${r.total_posts} posts</div>
        </div>`;
    });

    html += `</div>

    <table class="tabla-ranking">
        <thead>
            <tr>
                <th>#</th>
                <th>Poster</th>
                <th>Puntos</th>
                <th>Posts</th>
                <th class="hide-sm">⚡ Rápidos</th>
                <th class="hide-sm">🕐 Medios</th>
                <th class="hide-sm">💤 Base</th>
                <th class="hide-sm">Último Post</th>
            </tr>
        </thead>
        <tbody>`;

    rankingState.forEach((r, i) => {
        const pos = i + 1;
        const pct = rankingState[0]?.total_puntos > 0
            ? Math.round((r.total_puntos / rankingState[0].total_puntos) * 100)
            : 0;

        html += `
        <tr class="${pos <= 3 ? 'top-row top-' + pos : ''}">
            <td class="col-pos">${medalla(pos)}</td>
            <td class="col-nombre">
                <div class="poster-nombre">${r.poster_name}</div>
                <div class="pts-bar"><div class="pts-fill" style="width:${pct}%"></div></div>
            </td>
            <td class="col-puntos">${r.total_puntos}</td>
            <td>${r.total_posts}</td>
            <td class="hide-sm" style="color:var(--green)">${r.posts_rapidos || 0}</td>
            <td class="hide-sm" style="color:var(--orange)">${r.posts_medios || 0}</td>
            <td class="hide-sm" style="color:#888">${r.posts_base || 0}</td>
            <td class="hide-sm" style="font-size:0.8em; color:#666">${r.ultimo_post ? tiempoRelativo(r.ultimo_post) : '-'}</td>
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

    // Unir posts con sus puntos
    const puntosMap = {};
    puntosState.forEach(p => { puntosMap[p.post_no] = p; });

    let html = `
    <div class="timeline-controles">
        <span style="font-size:0.85em; color:#666;">${postsState.length} posts • ${estadoUI.hiloActivo.titulo}</span>
        <a href="${estadoUI.hiloActivo.thread_url}" target="_blank" class="btn btn-outline" style="font-size:0.8em; padding:4px 12px;">↗ Ver en 8chan</a>
    </div>
    <div class="timeline">`;

    [...postsState].reverse().forEach(post => {
        const pts = puntosMap[post.post_no];
        const tipo = pts?.bonus_tipo || 'base';
        const puntos = pts?.puntos ?? '-';
        const minutos = pts?.minutos_desde_anterior;

        html += `
        <div class="timeline-item tl-${tipo}">
            <div class="tl-header">
                <div class="tl-meta">
                    <span class="tl-name">${post.poster_name}</span>
                    ${post.poster_id ? `<span class="tl-id">${post.poster_id}</span>` : ''}
                    <span class="tl-num">No.${post.post_no}</span>
                </div>
                <div class="tl-right">
                    ${badgeBonus(tipo, puntos)}
                    <span class="tl-time" title="${fmtFecha(post.post_time)}">${fmtFecha(post.post_time)}</span>
                </div>
            </div>
            <div class="tl-body">
                ${post.contenido ? `<p class="tl-texto">${escHTML(post.contenido)}</p>` : ''}
                ${post.tiene_imagen ? `<span class="tl-img-badge">🖼 ${post.num_imagenes} imagen${post.num_imagenes > 1 ? 'es' : ''}</span>` : ''}
            </div>
            ${minutos !== null && minutos !== undefined
                ? `<div class="tl-footer">⏱ ${formatearMinutos(minutos)} después del post anterior</div>`
                : '<div class="tl-footer">Primer post del hilo</div>'}
        </div>`;
    });

    html += `</div>`;
    cont.innerHTML = html;
}

// ============================================================
// VISTA: HILOS
// ============================================================
export function renderHilos() {
    const cont = $('contenido-principal');
    if (!cont) return;

    const esAdmin = estadoUI.esAdmin;

    let html = ``;

    // Formulario para agregar hilo (solo admin)
    if (esAdmin) {
        html += `
        <div class="card-form">
            <h3 class="form-title">➕ Rastrear Nuevo Hilo</h3>
            <div class="form-row">
                <input type="text" id="inp-url" placeholder="https://8chan.moe/hisrol/res/125542.html"
                    class="inp" style="flex:3;">
                <input type="text" id="inp-titulo" placeholder="Título del hilo (opcional)"
                    class="inp" style="flex:2;">
                <button class="btn btn-green" onclick="window.agregarNuevoHilo()">Agregar</button>
            </div>
            <p style="font-size:0.8em; color:#888; margin:6px 0 0 0;">El primer scrape puede tardar unos segundos.</p>
        </div>`;
    }

    if (!hilosState.length) {
        html += `<div class="empty-state"><div class="empty-icon">🧵</div><h3>No hay hilos rastreados</h3>${esAdmin ? '<p>Agrega un hilo con el formulario de arriba.</p>' : '<p>El administrador aún no ha añadido hilos.</p>'}</div>`;
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

// ============================================================
// VISTA: CONFIG (solo admin)
// ============================================================
export function renderConfig() {
    const cont = $('contenido-principal');
    if (!cont) return;

    if (!estadoUI.esAdmin) {
        cont.innerHTML = `<div class="empty-state"><div class="empty-icon">🔒</div><h3>Acceso restringido</h3><p>Solo el administrador puede modificar la configuración.</p></div>`;
        return;
    }

    cont.innerHTML = `
    <div class="config-grid">
        <div class="config-card">
            <h3 class="config-title">⚡ Sistema de Puntos</h3>
            <p class="config-desc">Define cuántos puntos otorga cada post según la velocidad de respuesta respecto al post anterior en el hilo.</p>

            <div class="config-row">
                <label>⚡ Puntos Rápido (< <span id="lbl-umbral-rapido">${CONFIG_PUNTOS.umbral_rapido}</span>min)</label>
                <input type="number" id="cfg-rapido" value="${CONFIG_PUNTOS.rapido}" min="1" max="999" class="inp inp-sm">
            </div>
            <div class="config-row">
                <label>🕐 Umbral Rápido (minutos)</label>
                <input type="number" id="cfg-umbral-rapido" value="${CONFIG_PUNTOS.umbral_rapido}" min="1" max="1440" class="inp inp-sm"
                    oninput="document.getElementById('lbl-umbral-rapido').textContent=this.value">
            </div>
            <hr class="config-sep">
            <div class="config-row">
                <label>🕐 Puntos Medio (< <span id="lbl-umbral-medio">${CONFIG_PUNTOS.umbral_medio}</span>min)</label>
                <input type="number" id="cfg-medio" value="${CONFIG_PUNTOS.medio}" min="1" max="999" class="inp inp-sm">
            </div>
            <div class="config-row">
                <label>⏱ Umbral Medio (minutos)</label>
                <input type="number" id="cfg-umbral-medio" value="${CONFIG_PUNTOS.umbral_medio}" min="1" max="43200" class="inp inp-sm"
                    oninput="document.getElementById('lbl-umbral-medio').textContent=this.value">
            </div>
            <hr class="config-sep">
            <div class="config-row">
                <label>💤 Puntos Base (> umbral medio)</label>
                <input type="number" id="cfg-base" value="${CONFIG_PUNTOS.base}" min="0" max="999" class="inp inp-sm">
            </div>

            <button class="btn btn-green" style="margin-top:16px; width:100%;" onclick="window.guardarConfig()">
                💾 Guardar y Recalcular
            </button>
            <p style="font-size:0.75em; color:#888; margin-top:8px;">* Recalcular actualizará todos los puntos del hilo seleccionado con las nuevas reglas.</p>
        </div>

        <div class="config-card">
            <h3 class="config-title">🔄 Auto-Refresh</h3>
            <p class="config-desc">El sistema puede refrescar automáticamente el hilo activo (igual que Live Updates de 8chan).</p>
            <div class="config-row">
                <label>Intervalo (segundos)</label>
                <input type="number" id="cfg-refresh-rate" value="${estadoUI.refreshRate / 1000}" min="5" max="600" class="inp inp-sm">
            </div>
            <button class="btn ${estadoUI.autoRefresh ? 'btn-red' : 'btn-green'}" style="margin-top:16px; width:100%;"
                onclick="window.toggleAutoRefresh()">
                ${estadoUI.autoRefresh ? '⏹ Detener Auto-Refresh' : '▶ Iniciar Auto-Refresh'}
            </button>

            <h3 class="config-title" style="margin-top:24px;">🗑 Datos</h3>
            <p class="config-desc">Herramientas de administración del hilo activo.</p>
            ${estadoUI.hiloActivo ? `
            <button class="btn btn-outline" style="width:100%;" onclick="window.recalcularActual()">
                🔁 Recalcular Puntos del Hilo Activo
            </button>` : '<p style="color:#aaa; font-size:0.85em;">Selecciona un hilo primero.</p>'}
        </div>
    </div>`;
}

// ── Actualiza el header con info del hilo activo ─────────────
export function renderHeaderInfo() {
    const el = $('hilo-activo-info');
    if (!el) return;

    if (!estadoUI.hiloActivo) {
        el.innerHTML = `<span style="color:#aaa; font-size:0.85em;">Sin hilo seleccionado</span>`;
        return;
    }

    const h = estadoUI.hiloActivo;
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

// ── Muestra notificación toast ────────────────────────────────
export function toast(msg, tipo = 'ok') {
    let el = $('toast-msg');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast-msg';
        document.body.appendChild(el);
    }
    el.className = `toast toast-${tipo}`;
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.display = 'none'; }, 3500);
}

// ── Escape HTML ───────────────────────────────────────────────
function escHTML(str) {
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
