// medallas/medallas-ui.js
import { medallaState, medallas, grupos, puntosAll, STORAGE_URL, norm } from './medallas-state.js';
import { filtrarMedallas, estadoMedallaPJ, efectosActivosPJ, getPuntosPJ } from './medallas-logic.js';
import { buildGraph, initGrafo, resetGrafoView } from './medallas-grafo.js';
import { renderMarkup } from '../bnh-markup.js';
import { sugerirTags } from '../bnh-tags.js';

const _esc = s => String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const fb = () => `${STORAGE_URL}/imginterfaz/no_encontrado.png`;
let _grafoCargado = false;

// ── Tag autocomplete ──────────────────────────────────────────
// Monta autocompletado sobre un <input> ya existente en el DOM.
// Usa sugerirTags() de bnh-tags.js — el mismo motor que fichas-op.
// El dropdown vive en document.body con position:fixed para evitar
// problemas de overflow en modales.
function _attachTagAC(input, { multiComma = false } = {}) {
    if (!input || input._acMounted) return;
    input._acMounted = true;

    const dd = document.createElement('ul');
    dd.style.cssText = [
        'position:fixed', 'z-index:99999', 'background:#fff',
        'border:2px solid var(--green)', 'border-radius:8px',
        'box-shadow:0 6px 24px rgba(0,0,0,0.18)',
        'margin:0', 'padding:4px 0', 'list-style:none',
        'max-height:220px', 'overflow-y:auto', 'min-width:180px',
        'font-size:0.85em', 'display:none'
    ].join(';');
    document.body.appendChild(dd);

    let _items = [], _idx = -1;

    function _pos() {
        const r = input.getBoundingClientRect();
        dd.style.top   = (r.bottom + 4) + 'px';
        dd.style.left  = r.left + 'px';
        dd.style.width = Math.max(r.width, 200) + 'px';
    }

    function _render(items) {
        _items = items; _idx = -1;
        if (!items.length) { dd.style.display = 'none'; return; }
        dd.innerHTML = items.map((t, i) =>
            `<li data-i="${i}" style="padding:7px 14px;cursor:pointer;color:var(--blue);font-weight:600;white-space:nowrap;"
                 onmouseover="this.style.background='var(--blue-pale)'"
                 onmouseout="this.style.background=''">${t}</li>`
        ).join('');
        dd.querySelectorAll('li').forEach(li =>
            li.addEventListener('mousedown', e => { e.preventDefault(); _pick(_items[+li.dataset.i]); })
        );
        _pos();
        dd.style.display = 'block';
    }

    function _hide() { dd.style.display = 'none'; _items = []; _idx = -1; }

    function _pick(tag) {
        if (!tag) return;
        if (multiComma) {
            const parts = input.value.split(',');
            parts[parts.length - 1] = ' ' + tag;
            input.value = parts.join(',') + ', ';
        } else {
            input.value = tag;
        }
        _hide();
        input.focus();
    }

    function _setActive(i) {
        const lis = dd.querySelectorAll('li');
        lis.forEach(l => l.style.background = '');
        _idx = Math.max(0, Math.min(i, _items.length - 1));
        if (lis[_idx]) { lis[_idx].style.background = 'var(--blue-pale)'; lis[_idx].scrollIntoView({ block: 'nearest' }); }
    }

    input.addEventListener('input', () => {
        const raw = multiComma
            ? (input.value.split(',').pop() || '').trim()
            : input.value.trim();
        if (!raw) { _hide(); return; }
        _render(sugerirTags(raw, [], 20));
    });

    input.addEventListener('keydown', e => {
        if (dd.style.display === 'none') return;
        if      (e.key === 'ArrowDown')  { e.preventDefault(); _setActive(_idx + 1); }
        else if (e.key === 'ArrowUp')    { e.preventDefault(); _setActive(_idx - 1); }
        else if (e.key === 'Tab' || e.key === 'Enter') {
            if (_idx >= 0)                { e.preventDefault(); _pick(_items[_idx]); }
            else if (_items.length === 1) { e.preventDefault(); _pick(_items[0]); }
            else _hide();
        }
        else if (e.key === 'Escape') _hide();
    });

    input.addEventListener('blur', () => setTimeout(_hide, 150));

    // Reubicar si el modal o la ventana hacen scroll
    const _repos = () => { if (dd.style.display !== 'none') _pos(); };
    window.addEventListener('scroll', _repos, true);
    window.addEventListener('resize', _repos);

    // Limpiar dropdown cuando el input desaparece del DOM
    const obs = new MutationObserver(() => {
        if (!document.body.contains(input)) { dd.remove(); obs.disconnect(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
}

// Montar AC en todos los inputs de tag del form activo
function _mountFormAC() {
    const fmTags = document.getElementById('fm-tags');
    if (fmTags) _attachTagAC(fmTags, { multiComma: true });
    document.querySelectorAll('[id^="req-tag-"]').forEach(el => _attachTagAC(el));
    document.querySelectorAll('[id^="cond-tag-"]').forEach(el => _attachTagAC(el));
}

// Llamar tras insertar dinámicamente una nueva fila
export function mountNewTagAC(inputId) {
    const el = document.getElementById(inputId);
    if (el) _attachTagAC(el);
}

// ── Tab Catálogo ──────────────────────────────────────────────
export function renderCatalogo() {
    const wrap = document.getElementById('vista-catalogo');
    if (!wrap) return;

    const lista = filtrarMedallas({ busqueda: medallaState.busqueda, tag: medallaState.filtroTag });
    const allTags = [...new Set(medallas.flatMap(m => (m.tags||[]).map(t => '#'+(t.startsWith('#')?t.slice(1):t))))].sort();

    wrap.innerHTML = `
        <div style="display:flex;gap:12px;margin-bottom:16px;align-items:center;flex-wrap:wrap;">
            <input class="inp" id="med-search" placeholder="🔍 Buscar medalla, tag, efecto…"
                value="${_esc(medallaState.busqueda)}" oninput="window._medBuscar(this.value)"
                style="max-width:320px;">
            <select class="inp" id="med-filtro-tag" style="max-width:200px;" onchange="window._medFiltroTag(this.value)">
                <option value="">Todos los tags</option>
                ${allTags.map(t=>`<option value="${t}" ${medallaState.filtroTag===t?'selected':''}>${t}</option>`).join('')}
            </select>
            <span style="color:var(--gray-500);font-size:0.85em;">${lista.length} medalla${lista.length!==1?'s':''}</span>
            ${medallaState.esAdmin ? `<button class="btn btn-green btn-sm" onclick="window._medallasNueva()">✨ Nueva Medalla</button>` : ''}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;">
            ${lista.map(m => _renderCard(m)).join('') || `<div class="empty-state" style="grid-column:1/-1;"><h3>Sin resultados</h3></div>`}
        </div>`;

    setTimeout(() => {
        const el = document.getElementById('med-search');
        if (el && medallaState.busqueda) el.focus();
    }, 10);
}

function _renderCard(m) {
    const tagLabel = (m.tags||[]).map(t => `<span class="medalla-tag">${t.startsWith('#')?t:'#'+t}</span>`).join(' ');
    const tieneReqs  = (m.requisitos_base||[]).length > 0;
    const tieneConds = (m.efectos_condicionales||[]).length > 0;

    return `<div class="medalla-card" onclick="window._medallasAbrirDetalle(${JSON.stringify(m).replace(/"/g,'&quot;')})">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
            <div class="medalla-nombre">${m.nombre}</div>
            <div style="font-size:0.85em;font-weight:800;color:var(--purple);white-space:nowrap;">${m.costo_ctl} CTL</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">${tagLabel}</div>
        <div class="medalla-efecto">${m.efecto_desc||'Sin descripción.'}</div>
        <div style="display:flex;gap:5px;margin-top:4px;">
            ${tieneReqs  ? `<span style="font-size:0.7em;background:var(--blue-pale);color:var(--blue);border:1px solid var(--blue);padding:1px 6px;border-radius:6px;">📋 Req</span>` : ''}
            ${tieneConds ? `<span style="font-size:0.7em;background:var(--orange-pale);color:var(--orange);border:1px solid var(--orange);padding:1px 6px;border-radius:6px;">⚡ Cond</span>` : ''}
        </div>
    </div>`;
}

// ── Tab Grafo ─────────────────────────────────────────────────
export function renderGrafo() {
    const wrap = document.getElementById('vista-grafo');
    if (!wrap) return;

    if (!_grafoCargado) {
        wrap.innerHTML = `
            <div class="grafo-wrap" style="height:calc(100vh - 160px);">
                <canvas id="medallas-canvas"></canvas>
                <div class="grafo-controls">
                    <button onclick="window._medGrafoReset()">🎯 Centrar</button>
                    ${medallaState.esAdmin ? `<button onclick="window._medallasNueva()">✨ Nueva</button>` : ''}
                </div>
                <div class="grafo-legend">
                    <div><span class="legend-dot" style="background:#888;border:1px solid white;"></span> Medalla</div>
                    <div><span class="legend-dot" style="background:#fff3;border:2px solid #aaa;"></span> Tag cluster</div>
                    <div style="color:#aaa;margin-top:4px;">━━ Requisito</div>
                    <div style="color:#fc8;margin-top:2px;">╌╌ Efecto condicional</div>
                    ${medallaState.esAdmin ? '<div style="color:#aaa;margin-top:4px;">Arrastra nodos para reordenar</div>' : ''}
                    <div style="color:#aaa;">Doble click = detalle</div>
                </div>
            </div>`;
        _grafoCargado = true;
        setTimeout(() => {
            const c = document.getElementById('medallas-canvas');
            if (c) { initGrafo(c); buildGraph(); }
        }, 50);
    } else {
        buildGraph();
    }
}

// ── Tab Personaje ─────────────────────────────────────────────
export function renderPersonaje() {
    const wrap = document.getElementById('vista-personaje');
    if (!wrap) return;
    const pj = medallaState.pjSeleccionado;

    const charHtml = grupos.map(g => {
        const img = `${STORAGE_URL}/imgpersonajes/${norm(g.nombre_refinado)}icon.png`;
        const activo = pj === g.nombre_refinado;
        return `<div class="char-thumb ${activo?'active':''}" onclick="window._medSelPJ('${g.nombre_refinado.replace(/'/g,"\\'")}')">
            <img src="${img}" onerror="this.onerror=null;this.src='${fb()}';">
            <span>${g.nombre_refinado}</span>
        </div>`;
    }).join('');

    let content = '';
    if (!pj) {
        content = `<div class="empty-state"><h3>Selecciona un personaje</h3><p>Click en uno de arriba.</p></div>`;
    } else {
        const g = grupos.find(x => x.nombre_refinado === pj);
        const ptsMapa   = getPuntosPJ(pj);
        const tagsDelPJ = (g?.tags||[]).map(t => '#'+(t.startsWith('#')?t.slice(1):t));

        const secciones = tagsDelPJ.map(tag => {
            const medallasDeltag = medallas.filter(m =>
                (m.tags||[]).some(t => ('#'+(t.startsWith('#')?t.slice(1):t)).toLowerCase() === tag.toLowerCase())
            );
            if (!medallasDeltag.length) return '';
            const pts = ptsMapa[tag] || ptsMapa[tag.slice(1)] || 0;

            const cards = medallasDeltag.map(m => {
                const estado      = estadoMedallaPJ(m, pj);
                const condActivos = efectosActivosPJ(m, pj);
                const condHtml    = condActivos.map(ec => `
                    <div class="cond-badge ${ec.activo?'cond-activa':'cond-inactiva'}">
                        ${ec.activo?'⚡':'🔒'} ${ec.tag} ${ec.pts_minimos}pt
                    </div>`).join('');

                return `<div class="medalla-card ${estado}" onclick="window._medallasAbrirDetalle(${JSON.stringify(m).replace(/"/g,'&quot;')}, '${pj.replace(/'/g,"\\'")}')">
                    <div class="medalla-status">${estado==='activable'?'✅':estado==='parcial'?'⚠️':'🔒'}</div>
                    <div class="medalla-nombre">${m.nombre}</div>
                    <div style="font-size:0.78em;color:var(--purple);font-weight:700;">${m.costo_ctl} CTL</div>
                    <div class="medalla-efecto">${m.efecto_desc||''}</div>
                    ${condHtml ? `<div style="margin-top:4px;">${condHtml}</div>` : ''}
                </div>`;
            }).join('');

            return `<div style="margin-bottom:24px;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                    <span class="tag-pill" style="font-size:0.85em;">${tag}</span>
                    <span style="font-size:0.82em;color:var(--gray-500);">${pts} PT acumulados</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;">
                    ${cards}
                </div>
            </div>`;
        }).join('');

        content = secciones || `<div class="empty-state"><h3>Sin tags asignados</h3></div>`;
    }

    wrap.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:16px;">
            <div class="card"><div class="card-title">Personaje</div><div class="char-grid">${charHtml}</div></div>
            ${pj ? `<div>${content}</div>` : content}
        </div>`;
}

// ── Modal detalle ─────────────────────────────────────────────
export function renderDetalleMedalla(m, pjNombre = null) {
    const el = document.getElementById('medalla-modal');
    if (!el) return;

    const tagHtml = (m.tags||[]).map(t => `<span class="medalla-tag">${t.startsWith('#')?t:'#'+t}</span>`).join(' ');

    const reqsHtml = (m.requisitos_base||[]).map(r =>
        `<div style="font-size:0.82em;padding:5px 0;border-bottom:1px solid var(--gray-100);">
            <span class="tag-pill">${r.tag}</span>
            <span style="margin-left:6px;color:var(--gray-700);">mín. <b>${r.pts_minimos} PT</b></span>
        </div>`
    ).join('') || '<p style="color:var(--gray-400);font-size:0.82em;">Sin requisitos.</p>';

    const condsHtml = (m.efectos_condicionales||[]).map(ec => {
        let estadoStr = '';
        if (pjNombre) {
            const ptsMapa = getPuntosPJ(pjNombre);
            const pts = ptsMapa[ec.tag] || ptsMapa[ec.tag.replace('#','')] || 0;
            estadoStr = pts >= ec.pts_minimos
                ? `<span style="color:var(--green);font-weight:700;">⚡ ACTIVO (${pts}/${ec.pts_minimos} PT)</span>`
                : `<span style="color:var(--gray-500);">🔒 ${pts}/${ec.pts_minimos} PT</span>`;
        }
        return `<div style="background:var(--orange-pale);border:1px solid var(--orange);border-radius:var(--radius);padding:10px;margin-top:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
                <span class="tag-pill">${ec.tag}</span>
                <span style="font-size:0.75em;color:var(--orange);font-weight:700;">≥ ${ec.pts_minimos} PT</span>
                ${estadoStr}
            </div>
            <div style="font-size:0.85em;color:var(--gray-700);">${renderMarkup(ec.efecto)}</div>
        </div>`;
    }).join('');

    const adminBtns = medallaState.esAdmin ? `
        <div style="display:flex;gap:8px;margin-top:12px;border-top:1px solid var(--gray-200);padding-top:12px;">
            <button class="btn btn-green btn-sm" onclick="window._medallasEditar(${JSON.stringify(m).replace(/"/g,'&quot;')})">✏️ Editar</button>
            <button class="btn btn-red btn-sm" onclick="window._medallasEliminar('${m.id}')">🗑️ Eliminar</button>
        </div>` : '';

    el.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;">
            <div style="background:white;border-radius:var(--radius-lg);max-width:620px;width:100%;box-shadow:var(--shadow-lg);overflow:hidden;">
                <div style="background:var(--green-dark);color:white;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <div style="font-size:1.2em;font-weight:800;font-family:'Cinzel',serif;">${m.nombre}</div>
                        <div style="margin-top:6px;">${tagHtml}</div>
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                        <span style="font-size:1.2em;font-weight:800;">${m.costo_ctl} CTL</span>
                        <button onclick="window._medallasCloseModal()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:1.1em;">×</button>
                    </div>
                </div>
                <div style="padding:20px;display:flex;flex-direction:column;gap:14px;">
                    <div>
                        <div class="form-label">Efecto base</div>
                        <div style="font-size:0.9em;color:var(--gray-700);line-height:1.6;">${renderMarkup(m.efecto_desc||'Sin efecto.')}</div>
                    </div>
                    <div>
                        <div class="form-label">Requisitos</div>
                        ${reqsHtml}
                    </div>
                    ${condsHtml ? `<div><div class="form-label">Efectos condicionales</div>${condsHtml}</div>` : ''}
                    ${adminBtns}
                </div>
            </div>
        </div>`;
    el.style.display = 'block';
}

// ── Modal form medalla (OP) ───────────────────────────────────
export function renderFormMedalla(m = null) {
    const isEdit = !!m;
    const el = document.getElementById('medalla-modal');
    if (!el) return;

    // Requisitos unificados. Mínimo 1 fila vacía para medallas nuevas.
    const reqs  = (m?.requisitos_base||[]).length ? m.requisitos_base : [{}];
    const conds = m?.efectos_condicionales || [];

    el.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;">
            <div style="background:white;border-radius:var(--radius-lg);max-width:700px;width:100%;box-shadow:var(--shadow-lg);overflow:hidden;">
                <div class="modal-header">
                    <h3>${isEdit ? '✏️ Editar' : '✨ Nueva'} Medalla</h3>
                    <button class="modal-close" onclick="window._medallasCloseModal()">×</button>
                </div>
                <div class="modal-body">
                    <input type="hidden" id="fm-id" value="${m?.id||''}">

                    <div class="form-row">
                        <div>
                            <label class="form-label">Nombre *</label>
                            <input class="inp" id="fm-nombre" value="${_esc(m?.nombre||'')}" placeholder="Nombre de la medalla">
                        </div>
                        <div>
                            <label class="form-label">Costo CTL *</label>
                            <input class="inp" id="fm-ctl" type="number" min="1" max="50" value="${m?.costo_ctl||1}">
                        </div>
                    </div>

                    <div>
                        <label class="form-label">Tags de la medalla</label>
                        <input class="inp" id="fm-tags" value="${_esc((m?.tags||[]).join(', '))}"
                            placeholder="#Tag1, #Tag2 — separados por coma" autocomplete="off">
                        <div style="font-size:0.75em;color:var(--gray-500);margin-top:3px;">
                            El primer tag es el principal. Escribe <b>#</b> para ver sugerencias.
                            Tags nuevos se crean automáticamente al guardar.
                        </div>
                    </div>

                    <div>
                        <label class="form-label">Efecto base</label>
                        <textarea class="inp" id="fm-efecto" rows="3"
                            placeholder="Describe el efecto principal de la medalla…">${_esc(m?.efecto_desc||'')}</textarea>
                    </div>

                    <div>
                        <label class="form-label">Tipo</label>
                        <select class="inp" id="fm-tipo" style="max-width:200px;">
                            ${['activa','pasiva'].map(t =>
                                `<option value="${t}" ${m?.tipo===t?'selected':''}>${t}</option>`
                            ).join('')}
                        </select>
                    </div>

                    <!-- Requisitos (unificado, mínimo 1 fila) -->
                    <div>
                        <label class="form-label">Requisitos para equipar</label>
                        <div style="font-size:0.75em;color:var(--gray-500);margin-bottom:8px;">
                            El PJ debe tener el tag con los PT mínimos. Escribe <b>#</b> para ver sugerencias.
                            Tags que no existan se crean al guardar.
                        </div>
                        <div id="fm-reqs">
                            ${reqs.map((r, i) => _htmlReqRow(r, i)).join('')}
                        </div>
                        <button class="btn btn-outline btn-sm" style="margin-top:6px;"
                            onclick="window._medAddReq()">+ Añadir requisito</button>
                    </div>

                    <!-- Efectos condicionales -->
                    <div>
                        <label class="form-label">Efectos condicionales</label>
                        <div style="font-size:0.75em;color:var(--gray-500);margin-bottom:8px;">
                            Se activan si el PJ cumple el tag y PT al equipar. Escribe <b>#</b> para sugerencias.
                        </div>
                        <div id="fm-conds">
                            ${conds.map((c, i) => _htmlCondRow(c, i)).join('')}
                        </div>
                        <button class="btn btn-outline btn-sm" style="margin-top:6px;"
                            onclick="window._medAddCond()">+ Añadir efecto condicional</button>
                    </div>

                    <div style="display:flex;gap:10px;margin-top:4px;">
                        <button class="btn btn-green" onclick="window._medGuardar()">💾 Guardar Medalla</button>
                        <button class="btn btn-outline" onclick="window._medallasCloseModal()">Cancelar</button>
                    </div>
                    <div id="fm-msg" style="font-size:0.82em;color:var(--red);"></div>
                </div>
            </div>
        </div>`;
    el.style.display = 'block';

    window._fm_reqCount  = reqs.length;
    window._fm_condCount = conds.length;

    // Montar AC después de que el DOM esté pintado
    requestAnimationFrame(() => _mountFormAC());
}

// ── Filas de formulario ───────────────────────────────────────
export function _htmlReqRow(r = {}, idx) {
    return `<div class="cond-row" id="req-row-${idx}">
        <input class="inp" placeholder="#Tag — escribe # para sugerencias" style="flex:1;"
            value="${_esc(r.tag||'')}" id="req-tag-${idx}" autocomplete="off">
        <input class="inp" type="number" min="0" placeholder="PT mín." style="width:90px;"
            value="${r.pts_minimos||0}" id="req-pts-${idx}">
        <button class="btn btn-red btn-sm"
            onclick="document.getElementById('req-row-${idx}').remove()">✕</button>
    </div>`;
}

export function _htmlCondRow(c = {}, idx) {
    return `<div class="cond-row" style="flex-direction:column;align-items:stretch;" id="cond-row-${idx}">
        <div style="display:flex;gap:8px;">
            <input class="inp" placeholder="#Tag — escribe # para sugerencias" style="flex:1;"
                value="${_esc(c.tag||'')}" id="cond-tag-${idx}" autocomplete="off">
            <input class="inp" type="number" min="0" placeholder="PT mín." style="width:90px;"
                value="${c.pts_minimos||0}" id="cond-pts-${idx}">
            <button class="btn btn-red btn-sm"
                onclick="document.getElementById('cond-row-${idx}').remove()">✕</button>
        </div>
        <textarea class="inp" rows="2" placeholder="Efecto si se cumple la condición…"
            id="cond-efecto-${idx}" style="margin-top:6px;">${_esc(c.efecto||'')}</textarea>
    </div>`;
}

export function toast(msg, tipo='ok') {
    const el = document.getElementById('toast-msg');
    if (!el) return;
    el.textContent = msg; el.className = 'toast-' + tipo;
    setTimeout(() => { el.className = ''; }, 3000);
}
