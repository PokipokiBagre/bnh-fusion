// ============================================================
// hist-ui.js — Renderizado de Vistas
// ============================================================
import {
    hilosState, postsState, rankingState,
    ptTagState, ptPorPost, mapaAliasAGrupo, estadoUI,
    selPostsState
} from './hist-state.js';
import { formatearMinutos, fmtFecha, limpiarHTML } from './hist-logic.js';
import { renderOpcionesPanel, guardarOpcion } from '../bnh-opciones-tags.js';
import { currentConfig } from '../bnh-auth.js';

const _norm = s => String(s||'').trim().toLowerCase()
    .replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e')
    .replace(/[íìïî]/g,'i').replace(/[óòöô]/g,'o')
    .replace(/[úùüû]/g,'u').replace(/[ñ]/g,'n')
    .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');

function imgPJ(nombreRefinado) {
    if (!currentConfig?.storageUrl || !nombreRefinado) return '';
    return `${currentConfig.storageUrl}/imgpersonajes/${_norm(nombreRefinado)}icon.png`;
}

const _fallbackImg = currentConfig?.storageUrl
    ? `${currentConfig.storageUrl}/imginterfaz/no_encontrado.png` : '';
const _onErr = `this.onerror=null;this.src='${_fallbackImg}';this.style.opacity='0.3';`;

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

// ── Selector de hilo integrado (compacto) ─────────────────────
export function renderSelectorHiloInline() {
    if (!hilosState.length) return '';
    const activo = estadoUI.hiloActivo;
    const opts = hilosState.map(h => {
        const sel = activo?.thread_id == h.thread_id && activo?.board == h.board;
        return `<option value="${h.board}|${h.thread_id}" ${sel?'selected':''}>${h.titulo} (${h.total_posts||0} posts)</option>`;
    }).join('');
    return `
    <div style="margin-bottom:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="font-size:0.78em;color:#888;white-space:nowrap;">📋 Hilo:</span>
        <select id="sel-hilo-inline" onchange="window._histSelHiloInline(this.value)"
            style="font-size:0.82em;padding:5px 10px;border:1.5px solid #dee2e6;border-radius:8px;
                   background:white;cursor:pointer;max-width:340px;min-width:200px;">
            <option value="">— Seleccionar hilo —</option>
            ${opts}
        </select>
        ${activo ? `<a href="${activo.thread_url}" target="_blank"
            style="font-size:0.78em;color:var(--green);text-decoration:none;white-space:nowrap;">↗ Ver en 8chan</a>` : ''}
    </div>`;
}

// ── Imágenes superpuestas de múltiples PJs ────────────────────
function renderAvatarStack(nombres, size = 36) {
    if (!nombres.length) return '';
    const max    = 8;   // máximo visible
    const shown  = nombres.slice(0, max);
    const overlap = Math.min(size * 0.45, 16);  // cuánto se superponen
    const totalW = size + (shown.length - 1) * (size - overlap);
    const imgs = shown.map((n, i) => {
        const left = i * (size - overlap);
        const zIndex = shown.length - i;
        return `<img src="${imgPJ(n)}" onerror="${_onErr}"
            title="${n}"
            style="position:absolute;left:${left}px;top:0;
                   width:${size}px;height:${size}px;border-radius:50%;
                   object-fit:cover;object-position:top;
                   border:2px solid white;z-index:${zIndex};
                   box-shadow:0 1px 3px rgba(0,0,0,0.2);">`;
    }).join('');
    const extra = nombres.length > max
        ? `<span style="position:absolute;left:${shown.length*(size-overlap)}px;top:0;
                width:${size}px;height:${size}px;border-radius:50%;
                background:#555;color:white;font-size:${size*0.35}px;
                display:flex;align-items:center;justify-content:center;
                font-weight:700;z-index:0;border:2px solid white;">+${nombres.length-max}</span>` : '';
    return `<div style="position:relative;height:${size}px;width:${Math.min(totalW+size*0.1, totalW+20)}px;flex-shrink:0;">${imgs}${extra}</div>`;
}

// ── PT por origen con colores y contadores n/max ──────────────
// motivo: 'interaccion'=gris, 'compartido'=verde, 'lectura'=celeste
const MOTI_COLOR = {
    interaccion: { bg:'rgba(150,150,150,0.12)', border:'#aaa',    text:'#666',    label:'excl' },
    compartido:  { bg:'rgba(39,174,96,0.12)',   border:'#27ae60', text:'#1e8449', label:'comp' },
    lectura:     { bg:'rgba(0,180,216,0.12)',    border:'#00b4d8', text:'#0097b2', label:'lect' },
};

function renderPTBadgesConOrigen(ptEstePost, opciones) {
    // Agrupar: { personaje_nombre → { motivo → [{ tag, delta }] } }
    // Orden fijo: interaccion (gris) → compartido (verde) → lectura (celeste)
    const porPJ = {};
    ptEstePost.forEach(e => {
        if (!porPJ[e.personaje_nombre]) porPJ[e.personaje_nombre] = { interaccion: [], compartido: [], lectura: [] };
        const bucket = porPJ[e.personaje_nombre][e.motivo];
        if (bucket) {
            // Agrupar por tag dentro del mismo motivo
            const existing = bucket.find(x => x.tag === e.tag);
            if (existing) existing.delta += e.delta;
            else bucket.push({ tag: e.tag, delta: e.delta });
        }
    });

    if (!Object.keys(porPJ).length) return '';

    const limites = {
        interaccion: opciones?.max_no_compartidos ?? 5,
        compartido:  opciones?.max_compartidos    ?? 5,
        lectura:     opciones?.max_lectura        ?? 5,
    };

    const lineas = Object.entries(porPJ).map(([pj, porMotivo]) => {
        // Cada motivo en su propia línea, orden Gris → Verde → Azul
        const filas = ['interaccion','compartido','lectura'].map(motivo => {
            const items = porMotivo[motivo];
            if (!items.length) return '';
            const c = MOTI_COLOR[motivo];
            // n/max: cantidad de TAGS DISTINTOS obtenidos (slots usados), no suma de PT
            const slotsUsados = items.length;
            const limite = limites[motivo];
            const badges = items.map(({ tag, delta }) => {
                const tagCorto = tag.length > 16 ? tag.substring(0, 14) + '…' : tag;
                return `<span style="background:${c.bg};border:1px solid ${c.border};color:${c.text};
                    padding:2px 6px;border-radius:8px;font-size:0.7em;font-weight:700;
                    white-space:nowrap;display:inline-flex;align-items:center;gap:2px;"
                    title="${tag}">+${delta} ${tagCorto}</span>`;
            }).join(' ');
            return `<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                ${badges}
                <span style="font-size:0.65em;color:${c.text};opacity:0.85;white-space:nowrap;font-weight:700;">${slotsUsados}/${limite}</span>
            </div>`;
        }).filter(Boolean).join('');

        return `<div style="margin-bottom:3px;">
            <span style="font-size:0.7em;color:#555;font-weight:700;">${pj}:</span>
            <div style="display:flex;flex-direction:column;gap:2px;margin-top:2px;padding-left:4px;">${filas}</div>
        </div>`;
    }).join('');

    return lineas;
}

// ============================================================
// VISTA: TIMELINE (ahora es la principal)
// ============================================================
export function renderTimeline() {
    const cont = $('contenido-principal');
    if (!cont) return;

    const selectorHilo = renderSelectorHiloInline();

    if (!estadoUI.hiloActivo) {
        cont.innerHTML = selectorHilo + `<div class="empty-state"><div class="empty-icon">📜</div>
            <h3>Selecciona un hilo para ver el timeline</h3></div>`;
        return;
    }
    if (!postsState.length) {
        cont.innerHTML = selectorHilo + `<div class="empty-state"><div class="empty-icon">📜</div>
            <h3>Sin posts registrados</h3>
            ${estadoUI.esAdmin?`<button class="btn btn-green" onclick="window.actualizarHiloActivo()">🔄 Actualizar</button>`:''}
        </div>`;
        return;
    }

    const postAutor = {};
    postsState.forEach(p => { postAutor[p.post_no] = p.poster_name; });

    const backlinks = {};
    postsState.forEach(post => {
        let m; const re = />>(\d+)/g; const txt = post.contenido || '';
        while ((m = re.exec(txt)) !== null) {
            const n = Number(m[1]);
            if (!backlinks[n]) backlinks[n] = [];
            backlinks[n].push(post.post_no);
        }
    });

    // ── Panel de selección de posts ───────────────────────────
    const panelSeleccion = _renderPanelSeleccion();

    let html = selectorHilo + `
    <div style="display:flex;gap:16px;align-items:flex-start;">

        ${estadoUI.esAdmin ? `<div id="panel-sel-posts" style="width:${selPostsState.activo?'280px':'0'};
            min-width:${selPostsState.activo?'280px':'0'};
            transition:width 0.25s,min-width 0.25s;flex-shrink:0;align-self:flex-start;
            position:sticky; top:70px; max-height:calc(100vh - 90px); overflow-y:auto; overflow-x:hidden;">
            ${panelSeleccion}
        </div>` : ''}

        <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;
                padding:12px 10px;flex-wrap:wrap;gap:8px;margin-bottom:12px;
                position:sticky; top:55px; z-index:20; 
                background:rgba(255,255,255,0.95); backdrop-filter:blur(6px);
                border-bottom:1px solid #e9ecef; border-radius:0 0 10px 10px; margin-top:-8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
                <span style="font-size:0.85em;color:#666;font-weight:600;">${postsState.length} posts · ${estadoUI.hiloActivo.titulo}</span>
                ${estadoUI.esAdmin ? `<button class="btn btn-sm ${selPostsState.activo?'btn-green':'btn-outline'}"
                    onclick="window._histToggleSelPosts()"
                    style="font-size:0.78em;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                    ${selPostsState.activo
                        ? '✓ Seleccionando (' + selPostsState.postsSel.size + ')'
                        : '☑ Seleccionar posts'}
                </button>` : ''}
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;">`;

    [...postsState].reverse().forEach(post => {
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

        // PT ganados EN ESTE POST con distinción de origen
        const ptEstePost = ptPorPost[post.post_no] || [];
        const ptBadges = renderPTBadgesConOrigen(ptEstePost, window._histOpciones);

        // Nombres de grupos del post (puede ser multipersonaje)
        const gruposPost = post.poster_name.split(',').map(s => s.trim()).filter(Boolean)
            .map(p => mapaAliasAGrupo[p] || mapaAliasAGrupo[p.replace(/##?\S+/, '').trim()] || null)
            .filter(Boolean);
        const nombreDisplay = gruposPost.length
            ? `${gruposPost.join(', ')} <span style="font-size:0.72em;color:#aaa;font-weight:400;">(${post.poster_name})</span>`
            : post.poster_name;

        // Avatar stack con TODOS los personajes del post
        const avatarStack = renderAvatarStack(gruposPost, 32);

        // Estado seleccionado
        const esSel = selPostsState.postsSel.has(post.post_no);
        const borderColor = esSel ? '#00b4d8' : '#e9ecef';
        const bgColor = esSel ? 'rgba(0,180,216,0.05)' : 'white';

        html += `
        <div id="post-${post.post_no}"
            onclick="${selPostsState.activo ? `window._histTogglePostSel(${post.post_no})` : ''}"
            style="background:${bgColor};border:${esSel?'2px':'1px'} solid ${borderColor};
                border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;
                font-size:0.87em;box-shadow:0 1px 4px rgba(0,0,0,0.05);
                ${selPostsState.activo?'cursor:pointer;':''};position:relative;transition:border-color 0.15s,background 0.15s;">

            ${esSel?`<div style="position:absolute;top:6px;right:8px;background:#00b4d8;color:white;
                border-radius:50%;width:18px;height:18px;display:flex;align-items:center;
                justify-content:center;font-size:0.7em;font-weight:800;">✓</div>`:''}

            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:4px;">
                <div style="display:flex;align-items:center;gap:7px;min-width:0;">
                    ${avatarStack}
                    <div style="min-width:0;">
                        <span style="font-weight:700;color:#1e8449;">${nombreDisplay}</span>
                        ${post.poster_id?`<span style="background:#f1f3f4;color:#888;font-size:0.72em;
                            padding:1px 5px;border-radius:4px;margin-left:4px;">${post.poster_id}</span>`:''}
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                    <span style="color:#aaa;font-size:0.72em;cursor:pointer;"
                        onclick="tlCopyLink(${post.post_no});event.stopPropagation();" title="Copiar">No.${post.post_no}</span>
                    <span style="color:#999;font-size:0.72em;">${fmtFecha(post.post_time)}</span>
                </div>
            </div>

            ${repliesHtml?`<div style="padding-bottom:5px;border-bottom:1px solid rgba(0,180,216,0.15);">
                <span style="font-size:0.68em;color:#aaa;margin-right:3px;">citas:</span>${repliesHtml}</div>`:''}

            <div style="color:#333;line-height:1.5;word-break:break-word;">
                ${renderContenido(post.contenido||'', postAutor, post.post_no)}
                ${post.tiene_imagen?`<div style="margin-top:4px;"><span style="background:#f8f9fa;
                    border:1px solid #e9ecef;border-radius:4px;padding:2px 7px;font-size:0.75em;
                    color:#666;">🖼 ${post.num_imagenes} imagen${post.num_imagenes>1?'es':''}</span></div>`:''}
            </div>

            ${ptBadges?`<div style="padding-top:5px;border-top:1px solid rgba(0,180,216,0.15);">
                <span style="font-size:0.68em;color:#aaa;margin-right:3px;display:block;margin-bottom:3px;">PT/post:</span>
                <div style="display:flex;flex-direction:column;gap:2px;">${ptBadges}</div>
            </div>`:''}

            ${backHtml?`<div style="padding-top:4px;border-top:1px solid rgba(126,207,179,0.2);">
                <span style="font-size:0.68em;color:#aaa;margin-right:3px;">citado por:</span>${backHtml}</div>`:''}
        </div>`;
    });

    html += `</div></div></div>`; // cierre grid, col principal, flex container
    cont.innerHTML = html;
}

// ── Panel lateral de selección de posts ───────────────────────
function _renderPanelSeleccion() {
    if (!selPostsState.activo || !estadoUI.esAdmin) return '';

    const { filtroRol, filtroEstado, todosPJs, personajesExtra, postsSel } = selPostsState;

    // Filtrar pool de personajes
    const pool = todosPJs.filter(g => {
        const tags = (g.tags||[]).map(t => (t.startsWith('#')?t:'#'+t).toLowerCase());
        const rolOk  = filtroRol  === 'todos' || tags.includes(filtroRol.toLowerCase());
        const estOk  = filtroEstado === 'todos' || tags.includes(filtroEstado.toLowerCase());
        return rolOk && estOk;
    });

    const btnRol = (val, lbl) => {
        const a = filtroRol === val;
        return `<button onclick="window._histFiltroRol('${val}')"
            style="padding:2px 8px;font-size:0.72em;border-radius:6px;border:1.5px solid ${a?'var(--green)':'#dee2e6'};
                   background:${a?'var(--green)':'white'};color:${a?'white':'#555'};cursor:pointer;font-weight:600;">${lbl}</button>`;
    };
    const btnEst = (val, lbl) => {
        const a = filtroEstado === val;
        return `<button onclick="window._histFiltroEst('${val}')"
            style="padding:2px 8px;font-size:0.72em;border-radius:6px;border:1.5px solid ${a?'var(--green)':'#dee2e6'};
                   background:${a?'var(--green)':'white'};color:${a?'white':'#555'};cursor:pointer;font-weight:600;">${lbl}</button>`;
    };

    // PJs nativos de los posts seleccionados (ya están en el poster_name)
    const pjsNativos = new Set();
    if (selPostsState.postsSel.size > 0) {
        const { postsState } = selPostsState._postsRef || {};
        const posts = window._histPostsRef || [];
        posts.forEach(p => {
            if (!selPostsState.postsSel.has(p.post_no)) return;
            p.poster_name.split(',').map(s => s.trim()).filter(Boolean).forEach(alias => {
                const grupo = (window._histMapaAlias || {})[alias]
                           || (window._histMapaAlias || {})[alias.replace(/##?\S+/, '').trim()];
                if (grupo) pjsNativos.add(grupo);
            });
        });
    }

    // Ordenar: nativos del post → extras añadidos → resto alfabético
    const poolOrdenado = [
        ...pool.filter(g => pjsNativos.has(g.nombre_refinado)),
        ...pool.filter(g => !pjsNativos.has(g.nombre_refinado) && personajesExtra.some(e => e.nombre_refinado === g.nombre_refinado)),
        ...pool.filter(g => !pjsNativos.has(g.nombre_refinado) && !personajesExtra.some(e => e.nombre_refinado === g.nombre_refinado)),
    ];

    // Separador visual entre grupos
    const nNativos = pool.filter(g => pjsNativos.has(g.nombre_refinado)).length;
    const nExtras  = pool.filter(g => !pjsNativos.has(g.nombre_refinado) && personajesExtra.some(e => e.nombre_refinado === g.nombre_refinado)).length;

    const pjCards = poolOrdenado.map((g, i) => {
        const esNativo  = pjsNativos.has(g.nombre_refinado);
        const esExtra   = personajesExtra.some(e => e.nombre_refinado === g.nombre_refinado);
        const marcado   = esNativo || esExtra;
        const img = imgPJ(g.nombre_refinado);
        const bg     = esNativo  ? 'rgba(0,180,216,0.08)' : esExtra ? 'rgba(39,174,96,0.1)' : 'white';
        const border = esNativo  ? '#00b4d8'              : esExtra ? 'var(--green)'         : '#dee2e6';
        const textC  = esNativo  ? '#0097b2'              : esExtra ? 'var(--green-dark)'    : '#333';
        const badge  = esNativo
            ? `<span style="margin-left:auto;font-size:0.65em;color:#00b4d8;font-weight:800;background:rgba(0,180,216,0.1);padding:1px 5px;border-radius:4px;">post</span>`
            : esExtra
            ? `<span style="margin-left:auto;font-size:0.7em;color:var(--green);font-weight:800;">✓</span>`
            : '';
        // Separador visual entre secciones
        const sep = (i === nNativos && nNativos > 0 && nExtras > 0)
            ? `<div data-sep="extra" style="font-size:0.65em;color:#aaa;text-transform:uppercase;letter-spacing:.5px;padding:4px 2px 2px;margin-top:2px;">Añadir extra</div>`
            : (i === nNativos + nExtras && (nNativos > 0 || nExtras > 0))
            ? `<div data-sep="otros" style="font-size:0.65em;color:#aaa;text-transform:uppercase;letter-spacing:.5px;padding:4px 2px 2px;margin-top:2px;">Otros</div>`
            : '';
        const safeNombre = g.nombre_refinado.replace(/'/g,"\\'");
        return sep + `<div data-pj-nombre="${g.nombre_refinado}" onclick="window._histTogglePJExtra('${safeNombre}')"
            style="display:flex;align-items:center;gap:6px;padding:5px 7px;border-radius:6px;cursor:pointer;
                   background:${bg};border:1.5px solid ${border};transition:background 0.12s,border 0.12s;">
            <img src="${img}" onerror="${_onErr}" style="width:26px;height:26px;border-radius:50%;object-fit:cover;object-position:top;flex-shrink:0;">
            <span style="font-size:0.78em;font-weight:${marcado?700:500};color:${textC};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${g.nombre_refinado}</span>
            ${badge}
        </div>`;
    }).join('');

    const extraNombres = personajesExtra.map(e => e.nombre_refinado).join(', ');
    const hayExtra = personajesExtra.length > 0;
    const hayPosts = postsSel.size > 0;

    return `
    <div style="background:white;border:1.5px solid #dee2e6;border-radius:12px;padding:12px;
        display:flex;flex-direction:column;gap:10px;">

        <div style="display:flex;justify-content:space-between;align-items:center;">
            <b style="font-size:0.85em;color:var(--green-dark);">☑ Selección de posts</b>
            <button onclick="window._histCancelarSel()"
                style="background:none;border:none;font-size:1.1em;cursor:pointer;color:#999;">×</button>
        </div>

        <!-- Posts seleccionados -->
        <div style="font-size:0.78em;color:#555;background:#f8f9fa;border-radius:6px;padding:6px 8px;">
            <b>${postsSel.size}</b> post${postsSel.size!==1?'s':''} seleccionado${postsSel.size!==1?'s':''}
            ${hayPosts?`<button onclick="window._histLimpiarPosts()"
                style="margin-left:8px;font-size:0.8em;color:#c0392b;background:none;border:none;cursor:pointer;">✕ Limpiar</button>`:''}
        </div>

        <!-- Personajes añadidos -->
        ${hayExtra ? `<div style="background:rgba(39,174,96,0.07);border:1px solid var(--green);border-radius:6px;padding:6px 8px;">
            <span style="font-size:0.72em;font-weight:700;color:var(--green-dark);">Seleccionado:</span>
            <div style="font-size:0.78em;margin-top:2px;color:var(--green-dark);">
                ${personajesExtra.map(e=>`<span style="display:inline-flex;align-items:center;gap:3px;margin-right:4px;">
                    ${e.nombre_refinado}
                    <span onclick="window._histTogglePJExtra('${e.nombre_refinado.replace(/'/g,"\\'")}',true)"
                        style="cursor:pointer;color:#c0392b;font-weight:800;font-size:0.9em;">×</span>
                </span>`).join('')}
            </div>
        </div>` : ''}

        <!-- Botones de acción -->
        ${hayExtra && hayPosts ? `
        <div style="display:flex;flex-direction:column;gap:6px;">
            <button onclick="window._histCalcPTExtra()"
                style="background:#1a4a80;color:white;border:2px solid #2980b9;border-radius:8px;
                       padding:8px 10px;font-size:0.8em;font-weight:700;cursor:pointer;width:100%;
                       box-shadow:0 2px 6px rgba(26,74,128,0.3);">
                ⚡ Calcular PT para posts seleccionados
            </button>
            <button onclick="window._histCalcPTCitas()"
                style="background:#6c3483;color:white;border:none;border-radius:8px;
                       padding:7px 10px;font-size:0.8em;font-weight:700;cursor:pointer;width:100%;">
                🔗 Calcular PT para posts que citan seleccionados
            </button>
        </div>` : `<div style="font-size:0.72em;color:#aaa;text-align:center;">
            Selecciona posts y al menos un personaje extra para calcular PT
        </div>`}

        <!-- Pool de personajes -->
        <div>
            <div style="font-size:0.72em;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Añadir personaje extra</div>
            <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px;">
                <div style="display:flex;gap:4px;">
                    ${btnRol('todos','Todos')} ${btnRol('#Jugador','Jugador')} ${btnRol('#NPC','NPC')}
                </div>
                <div style="display:flex;gap:4px;">
                    ${btnEst('todos','Todos')} ${btnEst('#Activo','Activo')} ${btnEst('#Inactivo','Inactivo')}
                </div>
            </div>
            <input id="hist-pj-buscar" type="text" placeholder="🔍 Buscar personaje…"
                oninput="window._histBuscarPJ(this.value)"
                style="width:100%;box-sizing:border-box;padding:5px 8px;font-size:0.78em;
                       border:1.5px solid #dee2e6;border-radius:6px;margin-bottom:6px;outline:none;"
                onfocus="this.style.borderColor='var(--green)'"
                onblur="this.style.borderColor='#dee2e6'">
            <div id="hist-pj-pool" style="display:flex;flex-direction:column;gap:4px;">
                ${pjCards || '<span style="font-size:0.78em;color:#aaa;">Sin personajes</span>'}
            </div>
        </div>

        <div style="font-size:0.68em;color:#aaa;line-height:1.4;border-top:1px solid #f1f3f4;padding-top:6px;">
            <b>Gris</b> = exclusivo · <b style="color:var(--green)">Verde</b> = compartido · <b style="color:#00b4d8">Celeste</b> = lectura
        </div>
    </div>`;
}

// ── Actualizar solo el panel lateral (sin re-render de posts) ──
export function actualizarPanelSel() {
    const el = document.getElementById('panel-sel-posts');
    if (!el) return;
    const html = _renderPanelSeleccion();
    el.innerHTML = html;
    // Actualizar el botón del header de selección
    const btn = document.querySelector('[onclick="window._histToggleSelPosts()"]');
    if (btn) {
        const { selPostsState } = window._selPostsStateRef || {};
        const state = window._selPostsStateRef;
        if (state) {
            btn.textContent = state.activo
                ? `✓ Seleccionando (${state.postsSel.size})`
                : '☑ Seleccionar posts';
            btn.className = `btn btn-sm ${state.activo ? 'btn-green' : 'btn-outline'}`;
        }
    }
}

// ============================================================
// VISTA: RANKING
// ============================================================
export function renderRanking() {
    const cont = $('contenido-principal');
    if (!cont) return;

    const selectorHilo = renderSelectorHiloInline();

    if (!estadoUI.hiloActivo) {
        cont.innerHTML = selectorHilo + `<div class="empty-state"><div class="empty-icon">📋</div>
            <h3>Selecciona un hilo para ver el ranking</h3></div>`;
        return;
    }
    if (!rankingState.length) {
        cont.innerHTML = selectorHilo + `<div class="empty-state"><div class="empty-icon">🏅</div>
            <h3>Ranking vacío</h3>
            ${estadoUI.esAdmin?`<button class="btn btn-green" onclick="window.actualizarHiloActivo()">🔄 Actualizar ahora</button>`:''}</div>`;
        return;
    }

    const totalPosts = rankingState.reduce((s, r) => s + r.total_posts, 0);
    let totalPT = 0;
    Object.values(ptTagState).forEach(tags => Object.values(tags).forEach(n => { totalPT += n; }));

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

    const grupoData = {};
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

    let html = selectorHilo + `
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
        html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:16px;">`;
        rankingGrupos.forEach((r, i) => {
            const img = imgPJ(r.nombre);
            const ptHtml = ptTagState[r.nombre]
                ? Object.entries(ptTagState[r.nombre]).sort((a,b)=>b[1]-a[1]).slice(0,4)
                    .map(([tag,pts])=>`<span style="background:rgba(0,180,216,0.12);border:1px solid #00b4d8;
                        color:#00b4d8;padding:1px 5px;border-radius:8px;font-size:0.66em;
                        font-weight:600;white-space:nowrap;">${tag} ${pts}</span>`).join('')
                : '<span style="color:#999;font-size:0.72em;">Sin PT</span>';
            const medallaHtml = i < 3
                ? `<div style="position:absolute;top:4px;left:4px;background:${i===0?'#f1c40f':i===1?'#bdc3c7':'#cd6133'};
                    color:${i===0?'#7d6608':'white'};font-size:0.7em;font-weight:800;padding:1px 6px;
                    border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.2);">${medalla(i+1)}</div>` : '';
            const posHtml = i >= 3
                ? `<div style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,0.45);
                    color:white;font-size:0.68em;font-weight:700;padding:1px 5px;border-radius:8px;">#${i+1}</div>` : '';
            html += `<div style="background:white;border:1px solid #e9ecef;border-radius:10px;
                overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);position:relative;">
                ${medallaHtml}${posHtml}
                ${img ? `<img src="${img}" onerror="${_onErr}" style="width:100%;height:90px;object-fit:cover;object-position:top;display:block;">` : `<div style="width:100%;height:90px;background:#f1f3f4;"></div>`}
                <div style="padding:6px 8px;">
                    <div style="font-weight:700;font-size:0.82em;color:#1e8449;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${r.nombre}">${r.nombre}</div>
                    <div style="font-size:0.72em;color:#888;margin-bottom:4px;">${r.total_posts} posts</div>
                    <div style="display:flex;flex-wrap:wrap;gap:2px;">${ptHtml}</div>
                </div>
            </div>`;
        });
        html += `</div>`;
        const sinGrupo = rankingState.filter(r => resolverGrupos(r.poster_name).length === 0);
        if (sinGrupo.length && estadoUI.esAdmin) {
            html += `<details style="margin-top:4px;"><summary style="font-size:0.78em;color:#aaa;cursor:pointer;">
                ${sinGrupo.length} alias(es) sin grupo (OP)</summary>
                <table class="tabla-ranking" style="margin-top:6px;font-size:0.8em;"><tbody>`;
            sinGrupo.forEach(r => {
                html += `<tr><td style="color:#999;">${r.poster_name}</td><td>${r.total_posts}</td></tr>`;
            });
            html += `</tbody></table></details>`;
        }
    } else {
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
                ${esAdmin ? `<button class="btn btn-outline btn-sm" onclick="window.scrapeManual('${h.board}', ${h.thread_id})">🔄 Actualizar</button>` : ''}
                ${esAdmin ? `<button class="btn btn-outline btn-sm" style="border-color:var(--orange); color:var(--orange);" onclick="window.actualizarManual('${h.board}', ${h.thread_id})">📥 Pega JSON</button>` : ''}
                ${esAdmin ? `<button class="btn btn-red btn-sm" onclick="window.pedirEliminarHilo('${h.board}', ${h.thread_id}, '${h.titulo}')">🗑</button>` : ''}
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

window.tlScrollTo = function(postNo) {
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
        return `<a href="#post-${n}" onclick="tlScrollTo(${n});return false;"
            style="color:#00b4d8;font-weight:600;text-decoration:none;cursor:pointer;"
            >&gt;&gt;${rno}${a?` <span style="color:#7ecfb3;font-size:0.85em;">(${a})</span>`:''}</a>`;
    });
    s = s.replace(/(^|\n)(&gt;(?!&gt;)[^\n]*)/g,'$1<span style="color:#789922;">$2</span>');
    return s;
}

// ── Panel de Opciones Tags ────────────────────────────────────
export function renderOpcionesModal(esAdmin) {
    return renderOpcionesPanel(esAdmin);
}

window._opcionTagChange = async function(clave, valor) {
    const { ok, msg } = await guardarOpcion(clave, valor);
    if (!ok) alert('Error: ' + msg);
};
