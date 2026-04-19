// medallas/medallas-ui.js
import { medallaState, medallas, grupos, puntosAll, STORAGE_URL, norm } from './medallas-state.js';
import { filtrarMedallas, estadoMedallaPJ, efectosActivosPJ, getPuntosPJ } from './medallas-logic.js';
import { renderMarkup } from '../bnh-markup.js';
import { sugerirTags } from '../bnh-tags.js';
import { initBloques, updateBloques, clearBloques } from './bloques.js';
const mTags = m => (m.requisitos_base||[]).map(r => r.tag.startsWith('#') ? r.tag : '#'+r.tag);
const _esc  = s => String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const fb    = () => `${STORAGE_URL}/imginterfaz/no_encontrado.png`;

let _grafoCargado = false;
const TAGS_POR_PAG = 50;

// ── Tag autocomplete ──────────────────────────────────────────
function _attachTagAC(input) {
    if (!input || input._acMounted) return;
    input._acMounted = true;
    const dd = document.createElement('ul');
    dd.style.cssText = 'position:fixed;z-index:99999;background:#fff;border:2px solid var(--green);border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,0.18);margin:0;padding:4px 0;list-style:none;max-height:220px;overflow-y:auto;min-width:180px;font-size:0.85em;display:none';
    document.body.appendChild(dd);
    let _items = [], _idx = -1;
    const _pos  = () => { const r = input.getBoundingClientRect(); dd.style.top = (r.bottom+4)+'px'; dd.style.left = r.left+'px'; dd.style.width = Math.max(r.width,200)+'px'; };
    const _hide = () => { dd.style.display='none'; _items=[]; _idx=-1; };
    const _pick = t => { input.value = t; _hide(); input.focus(); };
    const _render = items => {
        _items = items; _idx = -1;
        if (!items.length) { dd.style.display='none'; return; }
        dd.innerHTML = items.map((t,i) => `<li data-i="${i}" style="padding:7px 14px;cursor:pointer;color:var(--blue);font-weight:600;">${t}</li>`).join('');
        dd.querySelectorAll('li').forEach(li => li.addEventListener('mousedown', e => { e.preventDefault(); _pick(_items[+li.dataset.i]); }));
        _pos(); dd.style.display='block';
    };
    input.addEventListener('input',  () => { const v=input.value.trim(); if(!v){_hide();return;} _render(sugerirTags(v,[],20)); });
    input.addEventListener('keydown', e => {
        if (dd.style.display==='none') return;
        if (e.key==='ArrowDown') { e.preventDefault(); _idx=Math.min(_idx+1,_items.length-1); dd.querySelectorAll('li').forEach((l,i)=>l.style.background=i===_idx?'var(--blue-pale)':''); }
        else if (e.key==='ArrowUp') { e.preventDefault(); _idx=Math.max(_idx-1,0); dd.querySelectorAll('li').forEach((l,i)=>l.style.background=i===_idx?'var(--blue-pale)':''); }
        else if ((e.key==='Tab'||e.key==='Enter') && _idx>=0) { e.preventDefault(); _pick(_items[_idx]); }
        else if (e.key==='Escape') _hide();
    });
    input.addEventListener('blur', () => setTimeout(_hide, 150));
    window.addEventListener('scroll', () => { if(dd.style.display!=='none') _pos(); }, true);
    const obs = new MutationObserver(() => { if(!document.body.contains(input)){dd.remove();obs.disconnect();} });
    obs.observe(document.body, { childList:true, subtree:true });
}

function _mountFormAC() {
    document.querySelectorAll('[id^="req-tag-"]').forEach(el => _attachTagAC(el));
    document.querySelectorAll('[id^="cond-tag-"]').forEach(el => _attachTagAC(el));
}

export function mountNewTagAC(inputId) {
    const el = document.getElementById(inputId);
    if (el) _attachTagAC(el);
}

// ── Tab Catálogo ──────────────────────────────────────────────
export function renderCatalogo() {
    const wrap = document.getElementById('vista-catalogo');
    if (!wrap) return;

    // Filtrar: si filtroPropuestas → solo propuestas; si no → solo aprobadas (o todas para OP)
    let lista = filtrarMedallas({ busqueda: medallaState.busqueda, tag: medallaState.filtroTag });
    if (medallaState.filtroPropuestas) {
        lista = lista.filter(m => m.propuesta);
    } else if (!medallaState.esAdmin) {
        lista = lista.filter(m => !m.propuesta);
    }

    const allTags = [...new Set(
        medallas.filter(m => !m.propuesta || medallaState.esAdmin).flatMap(m => mTags(m))
    )].sort();

    const btnProp = medallaState.esAdmin
        ? `<button class="btn btn-sm ${medallaState.filtroPropuestas ? 'btn-orange' : 'btn-outline'}"
            onclick="window._medTogglePropuestas()"
            style="${medallaState.filtroPropuestas ? 'background:#e67e22;border-color:#e67e22;color:white;' : ''}">
            🟠 Propuestas (${medallas.filter(m=>m.propuesta).length})
           </button>` : '';

    wrap.innerHTML = `
        <div style="display:flex;gap:10px;margin-bottom:16px;align-items:center;flex-wrap:wrap;">
            <input class="inp" id="med-search" placeholder="🔍 Buscar medalla, tag, efecto…"
                value="${_esc(medallaState.busqueda)}" oninput="window._medBuscar(this.value)"
                style="max-width:280px;">
            <select class="inp" id="med-filtro-tag" style="max-width:180px;" onchange="window._medFiltroTag(this.value)">
                <option value="">Todos los tags</option>
                ${allTags.map(t=>`<option value="${t}" ${medallaState.filtroTag===t?'selected':''}>${t}</option>`).join('')}
            </select>
            ${btnProp}
            <span style="color:var(--gray-500);font-size:0.85em;">${lista.length} medalla${lista.length!==1?'s':''}</span>
            ${medallaState.esAdmin ? `<button class="btn btn-green btn-sm" onclick="window._medallasNueva()">✨ Nueva</button>` : ''}
            <button class="btn btn-sm btn-outline" onclick="window._medProponerModal()"
                style="border-color:#e67e22;color:#e67e22;">📝 Proponer medalla</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;">
            ${lista.map(m => _renderCard(m)).join('') || `<div class="empty-state" style="grid-column:1/-1;"><h3>Sin resultados</h3></div>`}
        </div>`;

    setTimeout(() => { const el=document.getElementById('med-search'); if(el&&medallaState.busqueda) el.focus(); }, 10);
}

function _renderCard(m) {
    const tagLabel  = mTags(m).map(t => `<span class="medalla-tag">${t}</span>`).join(' ');
    const tieneReqs = (m.requisitos_base||[]).length > 0;
    const tieneConds= (m.efectos_condicionales||[]).length > 0;
    const isProp    = m.propuesta;

    const propBadge = isProp
        ? `<div style="background:#fef3e2;border:1.5px solid #e67e22;border-radius:6px;padding:3px 8px;font-size:0.72em;color:#e67e22;font-weight:700;margin-bottom:6px;">
            🟠 Propuesta${m.propuesta_por ? ` por ${m.propuesta_por}` : ''}
           </div>` : '';

    const aprobarBtn = isProp && medallaState.esAdmin
        ? `<button class="btn btn-green btn-sm" style="margin-top:6px;"
            onclick="event.stopPropagation();window._medAprobar('${m.id}')">✅ Aprobar</button>` : '';

    return `<div class="medalla-card${isProp?' medalla-propuesta':''}"
        style="${isProp ? 'border-color:#e67e22;background:#fffbf5;' : ''}"
        onclick="window._medallasAbrirDetalle(${JSON.stringify(m).replace(/"/g,'&quot;')})">
        ${propBadge}
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
            <div class="medalla-nombre">${m.nombre}</div>
            <div style="font-size:0.85em;font-weight:800;color:var(--purple);white-space:nowrap;">${m.costo_ctl} CTL</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">${tagLabel}</div>
        <div class="medalla-efecto">${m.efecto_desc||'Sin descripción.'}</div>
        <div style="display:flex;gap:5px;margin-top:4px;flex-wrap:wrap;">
            ${tieneReqs  ? `<span style="font-size:0.7em;background:var(--blue-pale);color:var(--blue);border:1px solid var(--blue);padding:1px 6px;border-radius:6px;">📋 Req</span>` : ''}
            ${tieneConds ? `<span style="font-size:0.7em;background:var(--orange-pale);color:var(--orange);border:1px solid var(--orange);padding:1px 6px;border-radius:6px;">⚡ Cond</span>` : ''}
            ${aprobarBtn}
        </div>
    </div>`;
}

// ── Tab Grafo (ahora Tetris de Bloques) ─────────────────────
// ── Tab Grafo (ahora Tetris de Bloques) ─────────────────────
export function renderGrafo() {
    const wrap = document.getElementById('vista-grafo');
    if (!wrap) return;

    const tagConteo = {};
    medallas.filter(m => !m.propuesta || medallaState.esAdmin).forEach(m => {
        const mTagsArr = (m.requisitos_base||[]).map(r => r.tag.startsWith('#') ? r.tag : '#'+r.tag);
        mTagsArr.forEach(t => { tagConteo[t] = (tagConteo[t]||0) + 1; });
    });
    
    let todosLosTags = Object.entries(tagConteo)
        .sort((a,b) => b[1]-a[1])
        .map(([tag, cnt]) => ({ tag, cnt }));

    const busq = medallaState.grafoBusqueda.toLowerCase();
    if (busq) {
        const match = todosLosTags.filter(t => t.tag.toLowerCase().includes(busq));
        const resto = todosLosTags.filter(t => !t.tag.toLowerCase().includes(busq));
        todosLosTags = [...match, ...resto];
    }

    const TAGS_POR_PAG = 50;
    const pagina    = medallaState.grafoTagPagina;
    const inicio    = pagina * TAGS_POR_PAG;
    const tagsPagina= todosLosTags.slice(inicio, inicio + TAGS_POR_PAG);
    const totalPags = Math.ceil(todosLosTags.length / TAGS_POR_PAG);
    const selTags   = medallaState.grafoTagsSel;

    const tagBtns = tagsPagina.map(({ tag, cnt }) => {
        const sel = selTags.includes(tag);
        return `<button onclick="window._medGrafoToggleTag('${tag.replace(/'/g,"\\'")}')"
            style="padding:4px 10px;font-size:0.78em;border-radius:12px;cursor:pointer;
                   border:1.5px solid ${sel?'#f39c12':'#dee2e6'};
                   background:${sel?'rgba(243,156,18,0.15)':'white'};
                   color:${sel?'#d68910':'#555'};font-weight:${sel?700:400};
                   transition:all 0.12s;">
            ${tag} <span style="color:#aaa;font-size:0.85em;">(${cnt})</span>
        </button>`;
    }).join('');

    const paginacion = totalPags > 1 ? `
        <div style="display:flex;align-items:center;gap:6px;margin-top:8px;">
            ${pagina>0 ? `<button class="btn btn-sm btn-outline" onclick="window._medGrafoPag(${pagina-1})">← Ant</button>` : ''}
            <span style="font-size:0.78em;color:#888;">${pagina+1} / ${totalPags}</span>
            ${pagina<totalPags-1 ? `<button class="btn btn-sm btn-outline" onclick="window._medGrafoPag(${pagina+1})">Sig →</button>` : ''}
        </div>` : '';

    const selHtml = selTags.length
        ? `<div style="margin-top:8px;font-size:0.75em;color:#888;">
            Seleccionados: ${selTags.map(t=>`<span style="background:rgba(243,156,18,0.15);border:1px solid #f39c12;padding:1px 6px;border-radius:8px;color:#d68910;margin-right:4px;">${t}</span>`).join('')}
            <button onclick="window._medGrafoClearTags()" style="background:none;border:none;color:#c0392b;cursor:pointer;font-size:0.85em;margin-left:4px;">✕ Limpiar</button>
           </div>` : '';

    // ¡CRÍTICO PARA EVITAR EL PARPADEO!
    // Solo construimos el Canvas HTML si no existe todavía en la pantalla
    let canvasContainer = document.getElementById('bloques-canvas-wrap');
    if (!canvasContainer) {
        wrap.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:10px;">
                <div id="grafo-controles" style="background:white;border:1.5px solid #dee2e6;border-radius:12px;padding:14px;"></div>
                <div id="bloques-canvas-wrap" style="position:relative;background:#0d1117;border-radius:12px;overflow:hidden;height:650px;">
                    <canvas id="bloques-canvas" style="display:block; cursor:pointer; width:100%; height:100%;"></canvas>
                    <div id="bloques-placeholder" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:0.9em;pointer-events:none;">← Selecciona tags para ver caer las figuras</div>
                </div>
            </div>`;
    }

    // Actualizamos ÚNICAMENTE el panel de botones, sin tocar el canvas
    const controles = document.getElementById('grafo-controles');
    if (controles) {
        controles.innerHTML = `
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
                <b style="font-size:0.85em;color:var(--gray-700);">Selecciona tags para soltar las figuras</b>
                <input id="grafo-buscar-tag" placeholder="🔍 Buscar tag…"
                    value="${_esc(medallaState.grafoBusqueda)}"
                    oninput="window._medGrafoBuscarTag(this.value)"
                    style="padding:4px 10px;font-size:0.8em;border:1.5px solid #dee2e6;border-radius:8px;outline:none;max-width:200px;">
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${tagBtns || '<span style="color:#aaa;font-size:0.82em;">Sin tags con medallas</span>'}
            </div>
            ${paginacion}
            ${selHtml}
        `;
        // Para no perder el foco si estabas escribiendo en el buscador
        if (document.activeElement.id === 'grafo-buscar-tag') {
            const inp = document.getElementById('grafo-buscar-tag');
            inp.focus();
            inp.setSelectionRange(inp.value.length, inp.value.length);
        }
    }

    // Ocultar/Mostrar el texto placeholder del canvas
    const placeholder = document.getElementById('bloques-placeholder');
    if (placeholder) {
        placeholder.style.display = selTags.length ? 'none' : 'flex';
    }

    // Finalmente, decirle al motor que dispare los bloques
    setTimeout(() => {
        const c = document.getElementById('bloques-canvas');
        if (!c) return;
        
        if (!c.dataset.init) {
            initBloques(c);
            c.dataset.init = "true";
        }

        if (selTags.length > 0) {
            const datosParaBloques = selTags.map(tag => {
                const medallasDeltag = medallas.filter(m =>
                    (!m.propuesta || medallaState.esAdmin) &&
                    (m.requisitos_base||[]).some(r => {
                        const t = r.tag.startsWith('#') ? r.tag : '#'+r.tag;
                        return t.toLowerCase() === tag.toLowerCase();
                    })
                );
                return { tag: tag, medallas: medallasDeltag };
            }).filter(g => g.medallas.length > 0);

            updateBloques(datosParaBloques);
        } else {
            clearBloques();
        }
    }, 10);
}

// ── Tab Personaje — con filtros rol/estado ────────────────────
export function renderPersonaje() {
    const wrap = document.getElementById('vista-personaje');
    if (!wrap) return;
    const pj        = medallaState.pjSeleccionado;
    const filtroRol = medallaState.filtroRolPJ;
    const filtroEst = medallaState.filtroEstadoPJ;

    // Filtrar personajes según rol y estado
    const gruposFiltrados = grupos.filter(g => {
        const tags = (g.tags||[]).map(t => (t.startsWith('#')?t:'#'+t).toLowerCase());
        const rolOk = filtroRol === 'todos' || tags.includes(filtroRol.toLowerCase());
        const estOk = filtroEst === 'todos' || tags.includes(filtroEst.toLowerCase());
        return rolOk && estOk;
    });

    const btnRol = (val, lbl) => {
        const a = filtroRol === val;
        return `<button class="btn btn-sm ${a?'btn-green':'btn-outline'}"
            style="padding:4px 10px;font-size:0.78em;"
            onclick="window._medFiltroRolPJ('${val}')">${lbl}</button>`;
    };
    const btnEst = (val, lbl) => {
        const a = filtroEst === val;
        return `<button class="btn btn-sm ${a?'btn-green':'btn-outline'}"
            style="padding:4px 10px;font-size:0.78em;"
            onclick="window._medFiltroEstPJ('${val}')">${lbl}</button>`;
    };

    const charHtml = gruposFiltrados.map(g => {
        const img   = `${STORAGE_URL}/imgpersonajes/${norm(g.nombre_refinado)}icon.png`;
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
        const g       = grupos.find(x => x.nombre_refinado === pj);
        const ptsMapa = getPuntosPJ(pj);
        const tagsDelPJ = (g?.tags||[]).map(t => '#'+(t.startsWith('#')?t.slice(1):t));

        const secciones = tagsDelPJ.map(tag => {
            const medallasDeltag = medallas.filter(m =>
                !m.propuesta &&
                mTags(m).some(t => t.toLowerCase() === tag.toLowerCase())
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
                return `<div class="medalla-card ${estado}"
                    onclick="window._medallasAbrirDetalle(${JSON.stringify(m).replace(/"/g,'&quot;')}, '${pj.replace(/'/g,"\\'")}')">
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

        content = secciones || `<div class="empty-state"><h3>Sin medallas disponibles para los tags de este personaje</h3></div>`;
    }

    wrap.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:16px;">
            <div class="card">
                <div class="card-title">Personaje</div>
                <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
                    ${btnRol('todos','Todos')} ${btnRol('#Jugador','Jugador')} ${btnRol('#NPC','NPC')}
                    <span style="width:1px;background:var(--gray-200);display:inline-block;margin:0 2px;"></span>
                    ${btnEst('todos','Todos')} ${btnEst('#Activo','Activo')} ${btnEst('#Inactivo','Inactivo')}
                </div>
                <div class="char-grid">${charHtml || '<span style="color:#aaa;font-size:0.85em;">Sin personajes con ese filtro</span>'}</div>
            </div>
            ${pj ? `<div>${content}</div>` : content}
        </div>`;
}

// ── Modal detalle ─────────────────────────────────────────────
export function renderDetalleMedalla(m, pjNombre = null) {
    const el = document.getElementById('medalla-modal');
    if (!el) return;

    const tagHtml  = mTags(m).map(t => `<span class="medalla-tag">${t}</span>`).join(' ');
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

    const isProp = m.propuesta;
    const propBanner = isProp
        ? `<div style="background:#fef3e2;border-bottom:2px solid #e67e22;padding:8px 20px;font-size:0.82em;color:#d68910;font-weight:600;">
            🟠 Medalla propuesta${m.propuesta_por ? ` por ${m.propuesta_por}` : ''}
           </div>` : '';

    const adminBtns = medallaState.esAdmin ? `
        <div style="display:flex;gap:8px;margin-top:12px;border-top:1px solid var(--gray-200);padding-top:12px;flex-wrap:wrap;">
            ${isProp ? `<button class="btn btn-green btn-sm" onclick="window._medAprobar('${m.id}');window._medallasCloseModal()">✅ Aprobar</button>` : ''}
            <button class="btn btn-green btn-sm" onclick="window._medallasEditar(${JSON.stringify(m).replace(/"/g,'&quot;')})">✏️ Editar</button>
            <button class="btn btn-red btn-sm" onclick="window._medallasEliminar('${m.id}')">🗑️ Eliminar</button>
        </div>` : '';

    el.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;">
            <div style="background:white;border-radius:var(--radius-lg);max-width:620px;width:100%;box-shadow:var(--shadow-lg);overflow:hidden;${isProp?'border:2px solid #e67e22;':''}">
                ${propBanner}
                <div style="background:${isProp?'#f39c12':'var(--green-dark)'};color:white;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">
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

// ── Modal proponer medalla (anónimos) ─────────────────────────
export function renderProponerMedalla() {
    const el = document.getElementById('medalla-modal');
    if (!el) return;

    const reqs = [{}];

    el.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;">
            <div style="background:white;border-radius:var(--radius-lg);max-width:700px;width:100%;box-shadow:var(--shadow-lg);overflow:hidden;border:2px solid #e67e22;">
                <div style="background:#e67e22;color:white;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="margin:0;font-family:'Cinzel',serif;">📝 Proponer Medalla</h3>
                    <button onclick="window._medallasCloseModal()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:1.1em;">×</button>
                </div>
                <div style="padding:20px;display:flex;flex-direction:column;gap:14px;">
                    <p style="font-size:0.85em;color:#888;margin:0;">Tu propuesta será revisada por el OP antes de publicarse.</p>

                    <div style="display:grid;grid-template-columns:1fr 120px;gap:12px;">
                        <div>
                            <label class="form-label">Nombre *</label>
                            <input class="inp" id="prop-nombre" placeholder="Nombre de la medalla">
                        </div>
                        <div>
                            <label class="form-label">Costo CTL *</label>
                            <input class="inp" id="prop-ctl" type="number" min="1" max="50" value="1">
                        </div>
                    </div>

                    <div>
                        <label class="form-label">Tu nombre (opcional)</label>
                        <input class="inp" id="prop-autor" placeholder="¿Cómo te llamamos?">
                    </div>

                    <div>
                        <label class="form-label">Efecto base</label>
                        <textarea class="inp" id="prop-efecto" rows="3" placeholder="Describe el efecto principal…"></textarea>
                    </div>

                    <div>
                        <label class="form-label">Tipo</label>
                        <select class="inp" id="prop-tipo" style="max-width:180px;">
                            <option value="activa">Activa</option>
                            <option value="pasiva">Pasiva</option>
                        </select>
                    </div>

                    <div>
                        <label class="form-label">Requisitos (tags)</label>
                        <div style="font-size:0.75em;color:#aaa;margin-bottom:8px;">Escribe # para buscar tags existentes.</div>
                        <div id="prop-reqs">
                            ${_htmlReqRow({}, 0)}
                        </div>
                        <button class="btn btn-outline btn-sm" style="margin-top:6px;" onclick="window._propAddReq()">+ Añadir requisito</button>
                    </div>

                    <div style="display:flex;gap:10px;margin-top:4px;">
                        <button class="btn btn-sm" style="background:#e67e22;border-color:#e67e22;color:white;"
                            onclick="window._medEnviarPropuesta()">📝 Enviar propuesta</button>
                        <button class="btn btn-outline btn-sm" onclick="window._medallasCloseModal()">Cancelar</button>
                    </div>
                    <div id="prop-msg" style="font-size:0.82em;color:var(--red);"></div>
                </div>
            </div>
        </div>`;
    el.style.display = 'block';

    window._propReqCount = 0;
    window._propAddReq   = () => {
        const c = ++window._propReqCount;
        document.getElementById('prop-reqs').insertAdjacentHTML('beforeend', _htmlReqRow({}, c));
        requestAnimationFrame(() => mountNewTagAC('req-tag-' + c));
    };

    requestAnimationFrame(() => {
        document.querySelectorAll('#prop-reqs [id^="req-tag-"]').forEach(el => _attachTagAC(el));
    });
}

// ── Modal form medalla (OP) ───────────────────────────────────
export function renderFormMedalla(m = null) {
    const isEdit = !!m;
    const el = document.getElementById('medalla-modal');
    if (!el) return;

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
                        <label class="form-label">Efecto base</label>
                        <textarea class="inp" id="fm-efecto" rows="3" placeholder="Describe el efecto principal de la medalla…">${_esc(m?.efecto_desc||'')}</textarea>
                    </div>
                    <div>
                        <label class="form-label">Tipo</label>
                        <select class="inp" id="fm-tipo" style="max-width:200px;">
                            ${['activa','pasiva'].map(t => `<option value="${t}" ${m?.tipo===t?'selected':''}>${t}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="form-label">Requisitos para equipar</label>
                        <div style="font-size:0.75em;color:var(--gray-500);margin-bottom:8px;">El PJ debe tener el tag con los PT mínimos. Escribe <b>#</b> para sugerencias.</div>
                        <div id="fm-reqs">${reqs.map((r, i) => _htmlReqRow(r, i)).join('')}</div>
                        <button class="btn btn-outline btn-sm" style="margin-top:6px;" onclick="window._medAddReq()">+ Añadir requisito</button>
                    </div>
                    <div>
                        <label class="form-label">Efectos condicionales</label>
                        <div style="font-size:0.75em;color:var(--gray-500);margin-bottom:8px;">Se activan si el PJ cumple el tag y PT al equipar.</div>
                        <div id="fm-conds">${conds.map((c, i) => _htmlCondRow(c, i)).join('')}</div>
                        <button class="btn btn-outline btn-sm" style="margin-top:6px;" onclick="window._medAddCond()">+ Añadir efecto condicional</button>
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
    requestAnimationFrame(() => _mountFormAC());
}

export function _htmlReqRow(r = {}, idx) {
    return `<div class="cond-row" id="req-row-${idx}">
        <input class="inp" placeholder="#Tag — escribe # para sugerencias" style="flex:1;"
            value="${_esc(r.tag||'')}" id="req-tag-${idx}" autocomplete="off">
        <input class="inp" type="number" min="0" placeholder="PT mín." style="width:90px;"
            value="${r.pts_minimos||0}" id="req-pts-${idx}">
        <button class="btn btn-red btn-sm" onclick="document.getElementById('req-row-${idx}').remove()">✕</button>
    </div>`;
}

export function _htmlCondRow(c = {}, idx) {
    return `<div class="cond-row" style="flex-direction:column;align-items:stretch;" id="cond-row-${idx}">
        <div style="display:flex;gap:8px;">
            <input class="inp" placeholder="#Tag — escribe # para sugerencias" style="flex:1;"
                value="${_esc(c.tag||'')}" id="cond-tag-${idx}" autocomplete="off">
            <input class="inp" type="number" min="0" placeholder="PT mín." style="width:90px;"
                value="${c.pts_minimos||0}" id="cond-pts-${idx}">
            <button class="btn btn-red btn-sm" onclick="document.getElementById('cond-row-${idx}').remove()">✕</button>
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
