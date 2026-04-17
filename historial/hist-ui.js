// ============================================================
// hist-ui.js — Renderizado de Vistas
// ============================================================
import {
    hilosState, postsState, rankingState,
    ptTagState, ptPorPost, mapaAliasAGrupo, estadoUI
} from './hist-state.js';
import { formatearMinutos, fmtFecha, limpiarHTML } from './hist-logic.js';
import { renderOpcionesPanel, guardarOpcion } from '../bnh-opciones-tags.js';

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
        cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div>
            <h3>No hay hilo seleccionado</h3>
            <button class="btn btn-green" onclick="window.irAHilos()">Ver Hilos</button></div>`;
        return;
    }
    if (!rankingState.length) {
        cont.innerHTML = `<div class="empty-state"><div class="empty-icon">🏅</div>
            <h3>Ranking vacío</h3>
            <button class="btn btn-green" onclick="window.actualizarHiloActivo()">🔄 Actualizar ahora</button></div>`;
        return;
    }

    const totalPosts = rankingState.reduce((s, r) => s + r.total_posts, 0);
    let totalPT = 0;
    Object.values(ptTagState).forEach(tags => Object.values(tags).forEach(n => { totalPT += n; }));

    // Construir ranking de GRUPOS (agrupando aliases)
    // poster_name puede ser "LinOP, Test, Test el Personaje" → dividir por coma
    // Solo las partes que existen en mapaAliasAGrupo (alias registrados con grupo real) cuentan.
    const grupoData = {}; // nombre_refinado → { total_posts, aliasesRegistrados: Set, ultimo_post }

    // Índice inverso: grupo → Set de aliases registrados que pertenecen a él
    // (para la columna Aliases en la tabla, mostramos solo aliases registrados)
    const aliasesPorGrupo = {};
    Object.entries(mapaAliasAGrupo).forEach(([alias, grupo]) => {
        if (!aliasesPorGrupo[grupo]) aliasesPorGrupo[grupo] = new Set();
        aliasesPorGrupo[grupo].add(alias);
    });

    function resolverGrupos(posterName) {
        const partes = posterName.split(',').map(s => s.trim()).filter(Boolean);
        const grupos = new Set();
        partes.forEach(p => {
            const g = mapaAliasAGrupo[p]
                   || mapaAliasAGrupo[p.replace(/##?\S+/, '').trim()]
                   || null;
            if (g) grupos.add(g);
        });
        return [...grupos];
    }

    rankingState.forEach(r => {
        const grupos = resolverGrupos(r.poster_name);
        grupos.forEach(grupo => {
            if (!grupoData[grupo]) grupoData[grupo] = { total_posts: 0, ultimo_post: null };
            grupoData[grupo].total_posts += r.total_posts;
            if (!grupoData[grupo].ultimo_post || r.ultimo_post > grupoData[grupo].ultimo_post)
                grupoData[grupo].ultimo_post = r.ultimo_post;
        });
    });

    const rankingGrupos = Object.entries(grupoData)
        .map(([nombre, d]) => ({ nombre, ...d }))
        .sort((a, b) => b.total_posts - a.total_posts);

    const modoActual = window._rankingModo || 'grupos';

    let html = `
    <div class="stats-banner">
        <div class="stat-item"><span class="stat-num">${rankingState.length}</span><span class="stat-lbl">Aliases activos</span></div>
        <div class="stat-item"><span class="stat-num">${totalPosts}</span><span class="stat-lbl">Posts Totales</span></div>
        <div class="stat-item"><span class="stat-num" style="color:#00b4d8">${totalPT}</span><span class="stat-lbl">PT Generados</span></div>
        <div class="stat-item"><span class="stat-num" style="color:#7ecfb3">${Object.keys(ptTagState).length}</span><span class="stat-lbl">Personajes con PT</span></div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;">
        <button onclick="window._rankingModo='grupos'; window.mostrarVista('ranking')"
            class="btn btn-sm ${modoActual==='grupos'?'btn-green':'btn-outline'}"
            style="font-size:0.8em;">👥 Por Grupo</button>
        ${estadoUI.esAdmin ? `<button onclick="window._rankingModo='aliases'; window.mostrarVista('ranking')"
            class="btn btn-sm ${modoActual==='aliases'?'btn-green':'btn-outline'}"
            style="font-size:0.8em;">🎭 Por Alias (OP)</button>` : ''}
    </div>`;

    if (modoActual === 'grupos') {
        // ── VISTA GRUPOS ──
        const top3g = rankingGrupos.slice(0, 3);
        const podioG = top3g.length >= 3 ? [top3g[1], top3g[0], top3g[2]] : top3g;
        html += `<div class="ranking-podio">`;
        podioG.forEach(r => {
            if (!r) return;
            const pos = rankingGrupos.indexOf(r) + 1;
            const h = pos===1?'120px':pos===2?'90px':'70px';
            html += `<div class="podio-slot podio-${pos}">
                <div class="podio-name">${r.nombre}</div>
                <div class="podio-pts">${r.total_posts} posts</div>
                <div class="podio-base" style="height:${h}">${medalla(pos)}</div>
            </div>`;
        });
        html += `</div>
        <table class="tabla-ranking"><thead><tr>
            <th>#</th><th>Personaje</th><th>Posts</th><th>PT Ganados en este hilo</th><th class="hide-sm">Aliases</th>
        </tr></thead><tbody>`;
        rankingGrupos.forEach((r, i) => {
            const ptHtml = ptTagState[r.nombre]
                ? Object.entries(ptTagState[r.nombre]).sort((a,b)=>b[1]-a[1])
                    .map(([tag,pts])=>`<span style="background:rgba(0,180,216,0.1);border:1px solid #00b4d8;
                        color:#00b4d8;padding:2px 7px;border-radius:12px;font-size:0.72em;
                        font-weight:600;margin:2px;">${tag} <b>${pts}</b></span>`).join('')
                : '<span style="color:#666;font-size:0.8em;">Sin PT en este hilo</span>';
            html += `<tr class="${i<3?'top-row top-'+(i+1):''}">
                <td class="col-pos">${medalla(i+1)}</td>
                <td class="col-nombre"><div class="poster-nombre">${r.nombre}</div></td>
                <td class="col-puntos">${r.total_posts}</td>
                <td style="min-width:200px">${ptHtml}</td>
                <td class="hide-sm" style="font-size:0.78em;color:#888;">${[...(aliasesPorGrupo[r.nombre] || [])].join(', ')}</td>
            </tr>`;
        });
        html += `</tbody></table>`;
    } else {
        // ── VISTA ALIASES (solo OP) ──
        html += `<table class="tabla-ranking"><thead><tr>
            <th>#</th><th>Alias / Poster</th><th>Grupo</th><th>Posts</th><th>PT en este hilo</th>
        </tr></thead><tbody>`;
        rankingState.forEach((r, i) => {
            const grupo = resolverGrupos(r.poster_name)[0] || '—';
            const ptHtml = ptTagState[grupo] && grupo !== '—'
                ? Object.entries(ptTagState[grupo]).sort((a,b)=>b[1]-a[1]).slice(0,4)
                    .map(([tag,pts])=>`<span style="border:1px solid #00b4d8;color:#00b4d8;
                        padding:1px 5px;border-radius:8px;font-size:0.7em;margin-right:3px;">
                        ${tag} ${pts}</span>`).join('')
                : '<span style="color:#aaa;font-size:0.78em;">Sin PT</span>';
            html += `<tr class="${i<3?'top-row top-'+(i+1):''}">
                <td class="col-pos">${medalla(i+1)}</td>
                <td class="col-nombre">${r.poster_name}</td>
                <td style="font-size:0.82em;color:var(--green-dark);font-weight:600;">${grupo}</td>
                <td class="col-puntos">${r.total_posts}</td>
                <td>${ptHtml}</td>
            </tr>`;
        });
        html += `</tbody></table>`;
    }

    cont.innerHTML = html;
}


export function renderTimeline() {
    const cont = $('contenido-principal');
    if (!cont) return;
    if (!estadoUI.hiloActivo) {
        cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📜</div><h3>Selecciona un hilo primero</h3></div>`;
        return;
    }
    if (!postsState.length) {
        cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📜</div><h3>Sin posts registrados</h3>
            <button class="btn btn-green" onclick="window.actualizarHiloActivo()">🔄 Actualizar</button></div>`;
        return;
    }

    const postAutor = {};
    postsState.forEach(p => { postAutor[p.post_no] = p.poster_name; });

    // Backlinks
    const backlinks = {};
    postsState.forEach(post => {
        let m; const re = />>(\d+)/g; const txt = post.contenido || '';
        while ((m = re.exec(txt)) !== null) {
            const n = Number(m[1]);
            if (!backlinks[n]) backlinks[n] = [];
            backlinks[n].push(post.post_no);
        }
    });

    const motiColor = { interaccion:'#00b4d8', compartido:'#7ecfb3', lectura:'#f39c12' };
    const motiLabel = { interaccion:'exclusivo', compartido:'compartido', lectura:'lectura' };

    let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;
        padding:6px 0 10px;flex-wrap:wrap;gap:8px;">
        <span style="font-size:0.85em;color:#666;">${postsState.length} posts · ${estadoUI.hiloActivo.titulo}</span>
        <a href="${estadoUI.hiloActivo.thread_url}" target="_blank" class="btn btn-outline"
            style="font-size:0.8em;padding:4px 12px;">↗ Ver en 8chan</a>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;">`;

    [...postsState].reverse().forEach(post => {
        // Replies salientes del contenido
        const nums = []; let m; const re = />>(\d+)/g; const txt = post.contenido || '';
        while ((m = re.exec(txt)) !== null) nums.push(Number(m[1]));
        const misReplies = [...new Set(nums)];

        const repliesHtml = misReplies.map(rno => {
            const autor = postAutor[rno] || '';
            return `<a href="#post-${rno}" onclick="tlScrollTo(${rno},${post.post_no});return false;"
                style="color:#00b4d8;font-size:0.75em;margin-right:6px;text-decoration:none;cursor:pointer;"
                >&gt;&gt;${rno}${autor?` <span style="color:#7ecfb3">(${autor})</span>`:''} ↑</a>`;
        }).join('');

        const backHtml = (backlinks[post.post_no]||[]).map(bno => {
            const autor = postAutor[bno]||'';
            return `<a href="#post-${bno}" onclick="tlScrollTo(${bno},${post.post_no});return false;"
                style="color:#7ecfb3;font-size:0.75em;margin-right:6px;text-decoration:none;cursor:pointer;"
                >&gt;&gt;${bno}${autor?` (${autor})`:''} ↓</a>`;
        }).join('');

        // PT ganados EN ESTE POST (no acumulados)
        const ptEstePost = ptPorPost[post.post_no] || [];
        const ptAgrupado = {};
        ptEstePost.forEach(e => {
            if (!ptAgrupado[e.tag]) ptAgrupado[e.tag] = { delta:0, motivo:e.motivo };
            ptAgrupado[e.tag].delta += e.delta;
        });
        const ptBadges = Object.entries(ptAgrupado).map(([tag, {delta, motivo}]) => {
            const col = motiColor[motivo] || '#00b4d8';
            const lbl = motiLabel[motivo] || motivo;
            return `<span style="border:1px solid ${col};color:${col};background:rgba(0,180,216,0.06);
                padding:2px 7px;border-radius:8px;font-size:0.72em;font-weight:700;margin-right:3px;"
                title="${lbl}">+${delta} ${tag}</span>`;
        }).join('');

        // Nombre del personaje (grupos si existe, soporta multipersonaje)
        const gruposPost = post.poster_name.split(',').map(s => s.trim()).filter(Boolean)
            .map(p => mapaAliasAGrupo[p] || mapaAliasAGrupo[p.replace(/##?\S+/, '').trim()] || null)
            .filter(Boolean);
        const nombreDisplay = gruposPost.length
            ? `${gruposPost.join(', ')} <span style="font-size:0.72em;color:#aaa;font-weight:400;">(${post.poster_name})</span>`
            : post.poster_name;

        html += `
        <div id="post-${post.post_no}" style="background:white;border:1px solid #e9ecef;
            border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;
            font-size:0.87em;box-shadow:0 1px 4px rgba(0,0,0,0.05);">

            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:4px;">
                <div>
                    <span style="font-weight:700;color:#1e8449;">${nombreDisplay}</span>
                    ${post.poster_id?`<span style="background:#f1f3f4;color:#888;font-size:0.72em;
                        padding:1px 5px;border-radius:4px;margin-left:4px;">${post.poster_id}</span>`:''}
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                    <span style="color:#aaa;font-size:0.72em;cursor:pointer;"
                        onclick="tlCopyLink(${post.post_no})" title="Copiar">No.${post.post_no}</span>
                    <span style="color:#999;font-size:0.72em;">${fmtFecha(post.post_time)}</span>
                </div>
            </div>

            ${repliesHtml?`<div style="padding-bottom:5px;border-bottom:1px solid rgba(0,180,216,0.15);">
                <span style="font-size:0.68em;color:#ccc;margin-right:3px;">cita→</span>${repliesHtml}</div>`:''}

            <div style="color:#333;line-height:1.5;word-break:break-word;">
                ${renderContenido(post.contenido||'', postAutor, post.post_no)}
                ${post.tiene_imagen?`<div style="margin-top:4px;"><span style="background:#f8f9fa;
                    border:1px solid #e9ecef;border-radius:4px;padding:2px 7px;font-size:0.75em;
                    color:#666;">🖼 ${post.num_imagenes} imagen${post.num_imagenes>1?'es':''}</span></div>`:''}
            </div>

            ${ptBadges?`<div style="padding-top:5px;border-top:1px solid rgba(0,180,216,0.15);">
                <span style="font-size:0.68em;color:#ccc;margin-right:3px;">PT este post→</span>${ptBadges}</div>`:''}

            ${backHtml?`<div style="padding-top:4px;border-top:1px solid rgba(126,207,179,0.2);">
                <span style="font-size:0.68em;color:#ccc;margin-right:3px;">citado→</span>${backHtml}</div>`:''}
        </div>`;
    });

    html += `</div>`;
    cont.innerHTML = html;
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

window.tlScrollTo = function(postNo, from) {
    const el = document.getElementById('post-' + postNo);
    if (!el) return;
    el.scrollIntoView({behavior:'smooth',block:'center'});
    el.style.transition='background 0.3s';
    el.style.background='rgba(0,180,216,0.1)';
    setTimeout(()=>{el.style.background='';},1500);
};
window.tlCopyLink = function(n){ navigator.clipboard?.writeText('No.'+n); };
function renderContenido(texto, postAutor, thisPostNo) {
    let s = String(texto).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    s = s.replace(/&gt;&gt;(\d+)/g, (_,rno) => {
        const n=Number(rno); const a=postAutor[n]||'';
        return `<a href="#post-${n}" onclick="tlScrollTo(${n},${thisPostNo});return false;"
            style="color:#00b4d8;font-weight:600;text-decoration:none;cursor:pointer;"
            >&gt;&gt;${rno}${a?` <span style="color:#7ecfb3;font-size:0.85em;">(${a})</span>`:''}</a>`;
    });
    s = s.replace(/(^|\n)(&gt;(?!&gt;)[^\n]*)/g,'$1<span style="color:#789922;">$2</span>');
    return s;
}
function escHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Panel de Opciones Tags ────────────────────────────────────
export function renderOpcionesModal(esAdmin) {
    return renderOpcionesPanel(esAdmin);
}

window._opcionTagChange = async function(clave, valor) {
    const { ok, msg } = await guardarOpcion(clave, valor);
    if (!ok) alert('Error: ' + msg);
};
