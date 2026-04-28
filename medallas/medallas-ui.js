// medallas/medallas-ui.js
import { medallaState, medallas, grupos, puntosAll, STORAGE_URL, norm } from './medallas-state.js';
import { filtrarMedallas, estadoMedallaPJ, efectosActivosPJ, getPuntosPJ, proyectarPJ, calcCtlUsadoProyectado } from './medallas-logic.js';
import { renderMarkup, initMarkupTextarea } from '../bnh-markup.js';
import { sugerirTags } from '../bnh-tags.js';
import { initBloques, updateBloques, clearBloques } from './bloques.js';
import { renderFusionBadge } from '../bnh-fusion.js';
import { renderBloqueIA, renderBarraIAGlobal } from './medallas-ai.js';

const mTags = m => (m.requisitos_base||[]).map(r => r.tag.startsWith('#') ? r.tag : '#'+r.tag);
const _esc  = s => String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const fb    = () => `${STORAGE_URL}/imginterfaz/no_encontrado.png`;
const _onErr = () => `this.onerror=null;this.src='${STORAGE_URL}/imginterfaz/no_encontrado.png'`;

// Helper: muestra cadena de hasta 5 deltas con etiquetas de colores (badges)
function _fmtDChain(base, total, deltas, prefix = '') {
    const activos = (deltas || []).filter(d => d && String(d).trim() !== '0');
    
    // Si no hay modificadores (deltas), devolvemos solo el número perfectamente centrado
    if (!activos.length || base === total) {
        return `<div style="text-align:center; width:100%; white-space:nowrap;">${prefix}${total}</div>`;
    }
    
    const makeBadge = (text, bg, color, border) => 
        `<span style="display:inline-flex; align-items:center; justify-content:center; padding:1px 4px; border-radius:4px; font-size:0.65em; font-weight:700; font-family:monospace; background:${bg}; color:${color}; border:1px solid ${border}; line-height:1.2; margin:0 1px;">${text}</span>`;

    let badgesHtml = makeBadge(base, '#f1f2f6', '#576574', '#ced6e0'); 
    let acc = base;

    for (const d of activos) {
        const s = String(d).trim();
        const powM  = s.match(/^\^([+-]?\d+(?:\.\d+)?)$/);
        const multM = s.match(/^[xX\*]([+-]?\d+(?:\.\d+)?)$/);
        const divM  = s.match(/^\/([+-]?\d+(?:\.\d+)?)$/);
        const addM  = s.match(/^([+-]?\d+(?:\.\d+)?)$/);

        if (powM) {
            acc = Math.round(Math.pow(acc, parseFloat(powM[1])));
            badgesHtml += makeBadge(`^${powM[1]}`, '#fce4ec', '#ad1457', '#f48fb1');
        } else if (multM) {
            acc = Math.round(acc * parseFloat(multM[1]));
            badgesHtml += makeBadge(`×${multM[1]}`, '#f3e5f5', '#6a1b9a', '#ce93d8'); 
        } else if (divM) {
            acc = Math.round(acc / parseFloat(divM[1]));
            badgesHtml += makeBadge(`÷${divM[1]}`, '#fff3e0', '#ef6c00', '#ffcc80'); 
        } else if (addM) {
            const n = parseFloat(addM[1]);
            acc = Math.round(acc + n);
            if (n >= 0) badgesHtml += makeBadge(`+${n}`, '#e3f2fd', '#1565c0', '#90caf9'); 
            else badgesHtml += makeBadge(`${n}`, '#ffebee', '#c62828', '#ef9a9a'); 
        }
    }
    
    // Envolvemos el número y las etiquetas en DIVs separados para forzar el apilamiento y centrado absoluto
    return `
        <div style="text-align:center; width:100%; white-space:nowrap;">${prefix}${total}</div>
        <div style="display:flex; justify-content:center; align-items:center; flex-wrap:wrap; margin-top:4px; width:100%; gap:2px;">${badgesHtml}</div>
    `;
}

// Exponer initMarkupTextarea para uso en callbacks
window._initMarkupTA = initMarkupTextarea;

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
    const _pos  = () => { 
        const r = input.getBoundingClientRect(); 
        dd.style.top = (r.bottom+4)+'px'; 
        dd.style.left = r.left+'px'; 
        dd.style.width = Math.max(r.width,200)+'px'; 
    };
    const _hide = () => { 
        dd.style.display='none'; 
        _items=[]; 
        _idx=-1; 
    };
    const _pick = t => { 
        input.value = t; 
        _hide(); 
        input.focus(); 
    };
    const _render = items => {
        _items = items; 
        _idx = -1;
        if (!items.length) { 
            dd.style.display='none'; 
            return; 
        }
        dd.innerHTML = items.map((t,i) => `
            <li data-i="${i}" style="padding:7px 14px;cursor:pointer;color:var(--blue);font-weight:600;">
                ${t}
            </li>
        `).join('');
        dd.querySelectorAll('li').forEach(li => li.addEventListener('mousedown', e => { 
            e.preventDefault(); 
            _pick(_items[+li.dataset.i]); 
        }));
        _pos(); 
        dd.style.display='block';
    };
    input.addEventListener('input',  () => { 
        const v = input.value.trim(); 
        if(!v){_hide(); return;} 
        _render(sugerirTags(v,[],20)); 
    });
    input.addEventListener('keydown', e => {
        if (dd.style.display==='none') return;
        if (e.key==='ArrowDown') { 
            e.preventDefault(); 
            _idx = Math.min(_idx+1,_items.length-1); 
            dd.querySelectorAll('li').forEach((l,i) => l.style.background = i===_idx ? 'var(--blue-pale)' : ''); 
        }
        else if (e.key==='ArrowUp') { 
            e.preventDefault(); 
            _idx = Math.max(_idx-1,0); 
            dd.querySelectorAll('li').forEach((l,i) => l.style.background = i===_idx ? 'var(--blue-pale)' : ''); 
        }
        else if ((e.key==='Tab'||e.key==='Enter') && _idx>=0) { 
            e.preventDefault(); 
            _pick(_items[_idx]); 
        }
        else if (e.key==='Escape') _hide();
    });
    input.addEventListener('blur', () => setTimeout(_hide, 150));
    window.addEventListener('scroll', () => { if(dd.style.display!=='none') _pos(); }, true);
    const obs = new MutationObserver(() => { 
        if(!document.body.contains(input)){ dd.remove(); obs.disconnect(); } 
    });
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

    // 1. Guardar foco y posición del cursor ANTES de redibujar
    const activeEl = document.activeElement;
    const prevFocusSearch = activeEl?.id === 'med-search';
    const cursorPos = prevFocusSearch ? activeEl.selectionStart : null;

    let lista = filtrarMedallas({ busqueda: medallaState.busqueda, tag: medallaState.filtroTag });
    if (medallaState.filtroPropuestas) {
        lista = lista.filter(m => m.propuesta);
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

    // Multi-select toolbar (solo admin)
    const selIds = medallaState.seleccionados || [];
    const modoSel = medallaState.modoSeleccion || false;

    const toolbarMulti = medallaState.esAdmin ? `
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--gray-50);padding:8px 12px;border-radius:8px;border:1px solid var(--gray-200);margin-top:12px;">
            <button class="btn btn-sm ${modoSel ? 'btn-red' : 'btn-outline'}"
                onclick="window._medToggleModoSel()"
                style="${modoSel ? 'background:#c0392b;border-color:#c0392b;color:white;' : ''}">
                ${modoSel ? '✕ Cancelar selección' : '☑ Seleccionar'}
            </button>
            ${modoSel && selIds.length > 0 ? `
                <span style="font-size:0.85em;color:var(--gray-700);font-weight:700;margin:0 6px;">${selIds.length} seleccionada${selIds.length!==1?'s':''}</span>
                <button class="btn btn-sm" style="background:#c0392b;border-color:#c0392b;color:white;"
                    onclick="window._medEliminarSeleccion()">🗑️ Eliminar selección</button>
                <button class="btn btn-sm btn-outline" onclick="window._medDeselAll()">Deseleccionar todo</button>
                <button class="btn btn-sm btn-outline" onclick="window._medSelAll()">Seleccionar todo</button>
            ` : ''}
        </div>` : '';

    // Botones de creación múltiple (solo admin)
    const botonesMulti = medallaState.esAdmin ? `
        <button class="btn btn-green btn-sm" onclick="window._medallasNueva()" title="Crear una medalla nueva">✨ Nueva</button>
        <button class="btn btn-sm" style="background:#1a7a3a;border-color:#1a7a3a;color:white;" onclick="window._medNuevaMultiple()" title="Abrir varios formularios en la misma página">✨×N Múltiple</button>` : '';

    // Botones de propuesta (visibles siempre)
    const botonesProponerMulti = `
        <button class="btn btn-sm btn-outline" onclick="window._medProponerModal()"
            style="border-color:#e67e22;color:#e67e22;">📝 Proponer</button>
        <button class="btn btn-sm btn-outline" onclick="window._medProponerMultiple()"
            style="border-color:#e67e22;color:#e67e22;">📝×N Proponer múltiple</button>`;

    // ── Renderizado ──────────────────────────────────────────────
    // Si ya existe la toolbar sticky, solo actualizamos el grid de medallas
    const existeStickyBar = document.getElementById('cat-sticky-bar');
    if (!existeStickyBar) {
        wrap.innerHTML = `
            <div id="cat-sticky-bar" style="position:sticky;top:0;z-index:50;background:white;border:1px solid var(--gray-200);border-radius:10px;padding:16px 20px;margin-bottom:20px;box-shadow:0 4px 12px rgba(0,0,0,0.05);display:flex;flex-direction:column;">
                
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
                    
                    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;flex:1;">
                        <input class="inp" id="med-search" placeholder="🔍 Buscar medalla, tag, efecto…"
                            value="${_esc(medallaState.busqueda)}" oninput="window._medBuscar(this.value)"
                            style="min-width:200px; max-width:300px; flex:1;">
                        <select class="inp" id="med-filtro-tag" style="min-width:160px; max-width:200px;" onchange="window._medFiltroTag(this.value)">
                            <option value="">Todos los tags</option>
                            ${allTags.map(t=>`<option value="${t}" ${medallaState.filtroTag===t?'selected':''}>${t}</option>`).join('')}
                        </select>
                        ${btnProp}
                        <span id="cat-count" style="color:var(--gray-500);font-size:0.9em;font-weight:600;margin-left:4px;white-space:nowrap;">${lista.length} medallas</span>
                    </div>

                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
                        ${botonesMulti}
                        ${botonesProponerMulti}
                    </div>
                </div>

                <div id="cat-toolbar-multi-wrap">
                    ${toolbarMulti}
                </div>
            </div>

            <div id="cat-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;padding:0 2px;">
                ${lista.map(m => _renderCard(m, modoSel, selIds)).join('') || `<div class="empty-state" style="grid-column:1/-1;"><h3>Sin resultados</h3></div>`}
            </div>`;
    } else {
        // Actualizar solo partes dinámicas sin reconstruir todo el DOM
        const tagSel = document.getElementById('med-filtro-tag');
        if (tagSel) {
            tagSel.innerHTML = `<option value="">Todos los tags</option>${allTags.map(t=>`<option value="${t}" ${medallaState.filtroTag===t?'selected':''}>${t}</option>`).join('')}`;
        }
        const countEl = document.getElementById('cat-count');
        if (countEl) countEl.textContent = `${lista.length} medallas`;

        // Actualizar toolbar multi-select de forma segura
        let multiDiv = existeStickyBar.querySelector('#cat-toolbar-multi-wrap');
        if (!multiDiv) {
            multiDiv = document.createElement('div');
            multiDiv.id = 'cat-toolbar-multi-wrap';
            existeStickyBar.appendChild(multiDiv);
        }
        multiDiv.innerHTML = toolbarMulti;

        const grid = document.getElementById('cat-grid');
        if (grid) {
            grid.innerHTML = lista.map(m => _renderCard(m, modoSel, selIds)).join('')
                || `<div class="empty-state" style="grid-column:1/-1;"><h3>Sin resultados</h3></div>`;
        }
    }

    // 2. Restaurar el foco y el cursor EXACTAMENTE donde estaba
    if (prevFocusSearch) {
        const inp = document.getElementById('med-search');
        if (inp) {
            inp.focus();
            inp.setSelectionRange(cursorPos, cursorPos);
        }
    }

    // ⚡ Ajustar la barra para que no se esconda bajo el header principal de BNH
    requestAnimationFrame(() => {
        const header = document.querySelector('.app-header');
        const stickyBar = document.getElementById('cat-sticky-bar');
        if (header && stickyBar) {
            // Le damos un pequeño margen extra visual (ej: +8px) para que respire bajo el menú
            stickyBar.style.top = (header.getBoundingClientRect().height + 8) + 'px';
        }
    });
}

// Rescate de foco inicial por si la pestaña acaba de abrirse
setTimeout(() => { 
    const el = document.getElementById('med-search'); 
    if(el && medallaState.busqueda) el.focus(); 
}, 10);

function _renderCard(m, modoSel = false, selIds = []) {
    const tagLabel  = mTags(m).map(t => `<span class="medalla-tag">${t}</span>`).join(' ');
    const tieneReqs = (m.requisitos_base||[]).length > 0;
    const tieneConds= (m.efectos_condicionales||[]).length > 0;
    const isProp    = m.propuesta;
    const isSel     = selIds.includes(m.id);

    const propBadge = isProp
        ? `<div style="background:#fef3e2;border:1.5px solid #e67e22;border-radius:6px;padding:3px 8px;font-size:0.72em;color:#e67e22;font-weight:700;margin-bottom:6px;">
            🟠 Propuesta${m.propuesta_por ? ` por ${m.propuesta_por}` : ''}
           </div>` : '';

    const aprobarBtn = isProp && medallaState.esAdmin
        ? `<button class="btn btn-green btn-sm" style="margin-top:6px;"
            onclick="event.stopPropagation();window._medAprobar('${m.id}')">✅ Aprobar</button>` : '';

    // Checkbox de selección múltiple (solo en modo selección admin)
    const selCheck = modoSel && medallaState.esAdmin ? `
        <div style="position:absolute;top:8px;right:8px;z-index:5;"
             onclick="event.stopPropagation();window._medToggleSel('${m.id}')">
            <div style="width:20px;height:20px;border-radius:4px;border:2px solid ${isSel?'var(--green)':'#bbb'};
                        background:${isSel?'var(--green)':'white'};display:flex;align-items:center;justify-content:center;
                        cursor:pointer;transition:all 0.15s;">
                ${isSel ? '<span style="color:white;font-size:13px;line-height:1;">✓</span>' : ''}
            </div>
        </div>` : '';

    const cardStyle = isSel
        ? `border-color:var(--green);background:rgba(39,174,96,0.06);box-shadow:0 0 0 2px var(--green);`
        : (isProp ? 'border-color:#e67e22;background:#fffbf5;' : '');

    const clickHandler = modoSel
        ? `onclick="window._medToggleSel('${m.id}')"`
        : `onclick="window._medallasAbrirDetalle(${JSON.stringify(m).replace(/"/g,'&quot;')})"`;

    return `
    <div class="medalla-card${isProp ? ' medalla-propuesta' : ''}"
        style="position:relative;cursor:pointer;${cardStyle}"
        ${clickHandler}>
        
        ${selCheck}
        ${propBadge}
        
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
            <div class="medalla-nombre">${m.nombre}</div>
            <div style="font-size:0.85em;font-weight:800;color:var(--purple);white-space:nowrap;">${m.costo_ctl} CTL</div>
        </div>
        
        <div style="display:flex;flex-wrap:wrap;gap:4px;">${tagLabel}</div>
        <div class="medalla-efecto">${renderMarkup(m.efecto_desc||'Sin descripción.')}</div>
        
        <div style="display:flex;gap:5px;margin-top:4px;flex-wrap:wrap;">
            ${tieneReqs  ? `<span style="font-size:0.7em;background:var(--blue-pale);color:var(--blue);border:1px solid var(--blue);padding:1px 6px;border-radius:6px;">📋 Req</span>` : ''}
            ${tieneConds ? `<span style="font-size:0.7em;background:var(--orange-pale);color:var(--orange);border:1px solid var(--orange);padding:1px 6px;border-radius:6px;">⚡ Cond</span>` : ''}
            ${aprobarBtn}
        </div>
    </div>`;
}

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
        return `
        <button onclick="window._medGrafoToggleTag('${tag.replace(/'/g,"\\'")}')"
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
        ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;align-items:center;gap:4px;max-width:100%;">
            <span style="font-size:0.75em;color:#888;white-space:nowrap;">Seleccionados:</span>
            ${selTags.map(t=>`<span style="background:rgba(243,156,18,0.15);border:1px solid #f39c12;padding:2px 8px;border-radius:8px;color:#d68910;font-size:0.75em;white-space:nowrap;">${t}</span>`).join('')}
            <button onclick="window._medGrafoClearTags()" style="background:none;border:none;color:#c0392b;cursor:pointer;font-size:0.78em;padding:2px 4px;white-space:nowrap;">✕ Limpiar</button>
           </div>` : '';

    let canvasContainer = document.getElementById('bloques-canvas-wrap');
    if (!canvasContainer) {
        wrap.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:0;">
                <div id="grafo-controles" style="background:white;border:1.5px solid #dee2e6;border-radius:12px 12px 0 0;padding:14px;position:sticky;top:0;z-index:20;box-shadow:0 4px 12px rgba(0,0,0,0.08);"></div>
                <div id="bloques-canvas-wrap" style="position:relative;background:#0d1117;border-radius:0 0 12px 12px;overflow:hidden;height:720px;transition:height 0.5s ease;">
                    <canvas id="bloques-canvas" style="display:block; cursor:pointer; width:100%; height:100%;"></canvas>
                    <div id="bloques-placeholder" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:0.9em;pointer-events:none;">Selecciona tags para ver caer las figuras</div>
                </div>
            </div>
        `;
        requestAnimationFrame(() => {
            const header = document.querySelector('.app-header');
            const ctrl   = document.getElementById('grafo-controles');
            if (header && ctrl) ctrl.style.top = header.getBoundingClientRect().height + 'px';
        });
    }

    const controles = document.getElementById('grafo-controles');
    if (controles) {
        const fRol = medallaState.filtroRolBloques || '#Jugador';
        const fEst = medallaState.filtroEstBloques || '#Activo';
        const gpFilt = grupos.filter(g => {
            const ts = (g.tags||[]).map(t => (t.startsWith('#')?t:'#'+t).toLowerCase());
            return (fRol==='todos'||ts.includes(fRol.toLowerCase()))
                && (fEst==='todos'||ts.includes(fEst.toLowerCase()));
        });
        const bRol = (v,l) => { 
            const a = fRol === v; 
            return `<button onclick="window._medBloquesFiltroRol('${v}')" style="padding:2px 8px;font-size:0.72em;border-radius:6px;border:1.5px solid ${a?'var(--green)':'#dee2e6'};background:${a?'var(--green)':'white'};color:${a?'white':'#555'};cursor:pointer;font-weight:600;">${l}</button>`; 
        };
        const bEst = (v,l) => { 
            const a = fEst === v; 
            return `<button onclick="window._medBloquesFiltroEst('${v}')" style="padding:2px 8px;font-size:0.72em;border-radius:6px;border:1.5px solid ${a?'var(--green)':'#dee2e6'};background:${a?'var(--green)':'white'};color:${a?'white':'#555'};cursor:pointer;font-weight:600;">${l}</button>`; 
        };
        const pjSel = medallaState.pjBloquesSel;
        const pjBtns = gpFilt.map(g => {
            const img = `${STORAGE_URL}/imgpersonajes/${norm(g.nombre_refinado)}icon.png`;
            const act = pjSel === g.nombre_refinado;
            return `
            <div onclick="window._medBloqueSelPJ('${g.nombre_refinado.replace(/'/g,"\\'")}')"
                style="display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;cursor:pointer;
                       background:${act?'rgba(39,174,96,0.1)':'white'};border:1.5px solid ${act?'var(--green)':'#dee2e6'};">
                <img src="${img}" onerror="this.src='${STORAGE_URL}/imginterfaz/no_encontrado.png'" style="width:20px;height:20px;border-radius:50%;object-fit:cover;object-position:top;">
                <span style="font-size:0.74em;font-weight:${act?700:400};color:${act?'var(--green-dark)':'#333'};white-space:nowrap;">${g.nombre_refinado}</span>
            </div>`;
        }).join('');

        const prevSearchFocused = document.activeElement?.id === 'grafo-buscar-tag';

        controles.innerHTML = `
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
                <b style="font-size:0.85em;color:var(--gray-700);">Selecciona tags para soltar las figuras</b>
                <input id="grafo-buscar-tag" placeholder="Buscar tag..."
                    value="${_esc(medallaState.grafoBusqueda)}"
                    style="padding:4px 10px;font-size:0.8em;border:1.5px solid #dee2e6;border-radius:8px;outline:none;max-width:180px;">
            </div>
            <div id="grafo-tags-lista" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
                ${tagBtns || '<span style="color:#aaa;font-size:0.82em;">Sin tags con medallas</span>'}
            </div>
            ${paginacion}
            ${selHtml}
            <div style="border-top:1px solid #f1f3f4;margin-top:10px;padding-top:10px;">
                <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">
                    ${bRol('todos','Todos')} ${bRol('#Jugador','Jugador')} ${bRol('#NPC','NPC')}
                    <span style="width:1px;background:#dee2e6;display:inline-block;margin:0 2px;"></span>
                    ${bEst('todos','Todos')} ${bEst('#Activo','Activo')} ${bEst('#Inactivo','Inactivo')}
                    ${pjSel ? '<button onclick="window._medBloqueSelPJ(null)" style="padding:2px 8px;font-size:0.72em;border-radius:6px;border:1.5px solid #c0392b;background:white;color:#c0392b;cursor:pointer;">Quitar PJ</button>' : ''}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:5px;max-height:80px;overflow-y:auto;">
                    ${pjBtns || '<span style="color:#aaa;font-size:0.78em;">Sin personajes</span>'}
                </div>
            </div>
        `;

        const searchInp = document.getElementById('grafo-buscar-tag');
        if (searchInp && !searchInp._grafoBusqInit) {
            searchInp._grafoBusqInit = true;
            searchInp.addEventListener('input', e => {
                medallaState.grafoBusqueda  = e.target.value;
                medallaState.grafoTagPagina = 0;
                const lista = document.getElementById('grafo-tags-lista');
                if (!lista) return;
                const busqV = e.target.value.toLowerCase();
                const tagConteoV = {};
                medallas.filter(m => !m.propuesta || medallaState.esAdmin).forEach(m => {
                    (m.requisitos_base||[]).map(r => r.tag.startsWith('#')?r.tag:'#'+r.tag)
                        .forEach(t => { tagConteoV[t] = (tagConteoV[t]||0)+1; });
                });
                let todosV = Object.entries(tagConteoV).sort((a,b)=>b[1]-a[1]).map(([tag,cnt])=>({tag,cnt}));
                if (busqV) {
                    const match = todosV.filter(t=>t.tag.toLowerCase().includes(busqV));
                    const resto = todosV.filter(t=>!t.tag.toLowerCase().includes(busqV));
                    todosV = [...match, ...resto];
                }
                const selV = medallaState.grafoTagsSel;
                lista.innerHTML = todosV.slice(0, TAGS_POR_PAG).map(({tag,cnt}) => {
                    const sel = selV.includes(tag);
                    return `
                    <button onclick="window._medGrafoToggleTag('${tag.replace(/'/g,"\\'")}')"
                        style="padding:4px 10px;font-size:0.78em;border-radius:12px;cursor:pointer;
                               border:1.5px solid ${sel?'#f39c12':'#dee2e6'};
                               background:${sel?'rgba(243,156,18,0.15)':'white'};
                               color:${sel?'#d68910':'#555'};font-weight:${sel?700:400};">
                        ${tag} <span style="color:#aaa;font-size:0.85em;">(${cnt})</span>
                    </button>`;
                }).join('') || '<span style="color:#aaa;font-size:0.82em;">Sin resultados</span>';
            });
        }

        if (prevSearchFocused && searchInp) {
            searchInp.focus();
            searchInp.setSelectionRange(searchInp.value.length, searchInp.value.length);
        }
    }

    const placeholder = document.getElementById('bloques-placeholder');
    if (placeholder) {
        placeholder.style.display = selTags.length ? 'none' : 'flex';
    }

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

export function renderPersonaje() {
    const wrap = document.getElementById('vista-personaje');
    if (!wrap) return;
    
    const pj        = medallaState.pjSeleccionado;
    const filtroRol = medallaState.filtroRolPJ;
    const filtroEst = medallaState.filtroEstadoPJ;

    // ⚡ 1. INVOCAMOS EL LENTE DE FUSIÓN PARA TODO EL PERSONAJE
    const proy = pj ? proyectarPJ(pj) : null;

    const gruposFiltrados = grupos.filter(g => {
        const tags = (g.tags||[]).map(t => (t.startsWith('#')?t:'#'+t).toLowerCase());
        const rolOk = filtroRol === 'todos' || tags.includes(filtroRol.toLowerCase());
        const estOk = filtroEst === 'todos' || tags.includes(filtroEst.toLowerCase());
        return rolOk && estOk;
    });

    const btnRol = (val, lbl) => {
        const a = filtroRol === val;
        return `
        <button class="btn btn-sm ${a?'btn-green':'btn-outline'}"
            style="padding:4px 10px;font-size:0.78em;"
            onclick="window._medFiltroRolPJ('${val}')">${lbl}</button>`;
    };
    const btnEst = (val, lbl) => {
        const a = filtroEst === val;
        return `
        <button class="btn btn-sm ${a?'btn-green':'btn-outline'}"
            style="padding:4px 10px;font-size:0.78em;"
            onclick="window._medFiltroEstPJ('${val}')">${lbl}</button>`;
    };

    const charHtml = gruposFiltrados.map(g => {
        const img   = `${STORAGE_URL}/imgpersonajes/${norm(g.nombre_refinado)}icon.png`;
        const activo = pj === g.nombre_refinado;
        return `
        <div class="char-thumb ${activo?'active':''}" onclick="window._medSelPJ('${g.nombre_refinado.replace(/'/g,"\\'")}')">
            <img src="${img}" onerror="this.onerror=null;this.src='${fb()}';">
            <span>${g.nombre_refinado}</span>
        </div>`;
    }).join('');

    // ── Determinar medallas base según el PJ seleccionado ─────────────
    medallaState.filtroTagsPJ = medallaState.filtroTagsPJ || [];
    const busqPJ = (medallaState.pjBusqueda || '').toLowerCase();

    // ⚡ 2. USAMOS LOS TAGS PROYECTADOS PARA FILTRAR EL CATÁLOGO
    const pjTags = proy ? proy.tags.map(t => t.startsWith('#') ? t : '#' + t) : null;

    let medallasBase = medallas.filter(m => !m.propuesta || medallaState.esAdmin);

    if (pj && pjTags && pjTags.length > 0) {
        medallasBase = medallasBase.filter(m =>
            mTags(m).some(t => pjTags.some(pt => pt.toLowerCase() === t.toLowerCase()))
        );
    }

    const mTagsList = (pj && pjTags)
        ? pjTags.filter(pt => medallasBase.some(m => mTags(m).some(t => t.toLowerCase() === pt.toLowerCase())))
        : [...new Set(medallasBase.flatMap(m => mTags(m)))].sort();

    // ⚡ 3. USAMOS LOS PUNTOS PROYECTADOS
    const ptsMapa = proy ? proy.ptsMapa : {};

    let medallasUnicas = medallasBase;
    if (busqPJ) {
        medallasUnicas = medallasUnicas.filter(m =>
            m.nombre.toLowerCase().includes(busqPJ) ||
            (m.efecto_desc || '').toLowerCase().includes(busqPJ) ||
            mTags(m).some(t => t.toLowerCase().includes(busqPJ))
        );
    }

    if (medallaState.filtroTagsPJ.length > 0) {
        medallasUnicas = medallasUnicas.filter(m => {
            const tagsMed = mTags(m).map(t => t.toLowerCase());
            return medallaState.filtroTagsPJ.every(f => tagsMed.includes(f.toLowerCase()));
        });
    }

    const tagsFiltrosHtml = mTagsList.map(tag => {
        const activo = medallaState.filtroTagsPJ.includes(tag);
        // Marcamos de morado si es un tag prestado por la fusión (opcional, pero visualmente útil)
        const gEq = grupos.find(x => x.nombre_refinado === pj);
        const tagsOriginales = gEq ? (gEq.tags||[]).map(t => t.toLowerCase()) : [];
        const esPrestado = proy && proy.esFusion && !tagsOriginales.includes(tag.replace('#','').toLowerCase());
        
        return `<button class="btn btn-sm"
                style="padding:3px 8px; font-size:0.75em; border-radius:12px; margin:2px; cursor:pointer;
                       border:1.5px solid ${activo ? (esPrestado ? 'var(--purple)' : 'var(--green)') : '#dee2e6'};
                       background:${activo ? (esPrestado ? 'rgba(142,68,173,0.1)' : 'rgba(39,174,96,0.1)') : 'white'};
                       color:${activo ? (esPrestado ? 'var(--purple)' : 'var(--green-dark)') : '#555'}; font-weight:${activo ? '700' : '600'};"
                onclick="window._medToggleFiltroTagPJ('${tag}')">
            ${esPrestado ? '⚡ ' : ''}${tag}
        </button>`;
    }).join('');

    const controlesFiltroHtml = `
        <div style="margin-bottom:14px; background:white; padding:12px; border-radius:8px; border:1px solid var(--gray-200);">
            <div style="font-size:0.75em; font-weight:800; color:var(--gray-500); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">
                ${pj ? `Tags de ${pj}` : 'Filtros por Tags'}
                ${medallaState.filtroTagsPJ.length > 0 ? `<span style="float:right; cursor:pointer; color:var(--red);" onclick="window._medLimpiarFiltrosTagPJ()">✕ Limpiar (${medallaState.filtroTagsPJ.length})</span>` : ''}
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:4px;">
                ${tagsFiltrosHtml || '<span style="font-size:0.82em;color:#aaa;">Sin tags disponibles</span>'}
            </div>
        </div>
    `;

    const tarjetasHtml = medallasUnicas.length > 0
        ? medallasUnicas.map(m => pj ? _renderCardCompletaParaPJ(m, pj, ptsMapa) : _renderCard(m)).join('')
        : `<div class="empty-state" style="grid-column:1/-1;"><h3>${pj ? 'Sin medallas para los tags de este personaje' : 'No se encontraron medallas'}</h3></div>`;

    let content = `
        ${controlesFiltroHtml}
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px; align-items:start;">
            ${tarjetasHtml}
        </div>
    `;

    // ── Panel equipación ────────────────────────────────────
    let equipHtml = '';
    
    if (pj) {
        const gEq    = grupos.find(x => x.nombre_refinado === pj);
        const ctl    = proy.ctl; // ⚡ USAMOS CTL PROYECTADO
        const equipados = medallaState.equipacion || [];
        const { base: ctlUsadoBase, total: ctlUsado } = calcCtlUsadoProyectado(equipados, gEq);

        // ── Datos para el Resumen reactivo ─────────────────────────
        const pot = proy.pot; // ⚡ USAMOS POT PROYECTADO
        const agi = proy.agi; // ⚡ USAMOS AGI PROYECTADO
        const pac = pot + agi + ctl;
        const tierData = (() => {
            if (pac >= 100) return { label: 'TIER 4', color: '#f39c12' };
            if (pac >= 80)  return { label: 'TIER 3', color: '#8e44ad' };
            if (pac >= 60)  return { label: 'TIER 2', color: '#2980b9' };
            return          { label: 'TIER 1', color: '#27ae60' };
        })();
        const cambios   = Math.floor(agi / 4);
        const tierNum   = pac>=100?4:pac>=80?3:pac>=60?2:1;
        const bonoPV    = [5,10,15,20][tierNum-1] || 5;
        const pvMax     = Math.floor(pot/4)+Math.floor(agi/4)+Math.floor(ctl/4)+bonoPV+(gEq?.pv_max_delta||0);
        const pvActual  = gEq?.pv_actual ?? pvMax;
        const norm_pj   = pj.toString().trim().toLowerCase()
            .replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e').replace(/[íìïî]/g,'i')
            .replace(/[óòöô]/g,'o').replace(/[úùüû]/g,'u').replace(/ñ/g,'n')
            .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
        const profileUrl = STORAGE_URL + '/imgpersonajes/' + norm_pj + 'profile.png';
        const iconUrl    = STORAGE_URL + '/imgpersonajes/' + norm_pj + 'icon.png';
        const noImgUrl   = STORAGE_URL + '/imginterfaz/no_encontrado.png';
        
        // ⚡ Colores adaptativos para la fusión
        const baseCtl    = gEq?.ctl || 0;
        const ctlExcedido = ctlUsado > ctl;
        const ctlEsFusionado = proy.esFusion && ctl !== baseCtl;
        const colorCtlTxt = ctlExcedido ? '#c0392b' : ctlEsFusionado ? '#8e44ad' : (ctlUsado >= ctl * 0.8 ? '#e67e22' : 'var(--green-dark)');
        const iconCtl     = ctlEsFusionado ? '⚡ ' : '';
        const badgeFusion = proy.esFusion ? renderFusionBadge(pj, STORAGE_URL, norm) : '';
        
        const ctlColor   = ctlExcedido ? '#c0392b' : ctlUsado >= ctl * 0.8 ? '#e67e22' : 'var(--green-dark)';
        const ctlRatio   = ctl > 0 ? Math.min(ctlUsado / ctl, 1) : 0;
        const barColor   = ctlExcedido ? '#c0392b' : ctlUsado >= ctl * 0.8 ? '#e67e22' : '#27ae60';

        const ptsMapa2  = proy.ptsMapa;
        const totalPT   = Object.values(ptsMapa2).reduce((a,b)=>a+b,0);
        const listos    = Object.values(ptsMapa2).filter(v=>v>=50).length;

        const basePot = proy.esFusion ? (proy.pot_fusion_raw ?? gEq?.pot ?? 0) : (gEq?.pot ?? 0);
        const baseAgi = proy.esFusion ? (proy.agi_fusion_raw ?? gEq?.agi ?? 0) : (gEq?.agi ?? 0);
        const baseCtlVal = proy.esFusion ? (proy.ctl_fusion_raw ?? gEq?.ctl ?? 0) : (gEq?.ctl ?? 0);

        const resumenCard = `
        <div style="background:white;border:1.5px solid #dee2e6;border-radius:12px;overflow:hidden;flex-shrink:0;">
            <div style="background:#f8f9fa;max-height:220px;overflow:hidden;">
                <img src="${profileUrl}"
                    onerror="this.src='${iconUrl}';this.onerror=function(){this.src='${noImgUrl}';};"
                    style="width:100%;display:block;object-fit:cover;object-position:top;">
            </div>
            <div style="padding:12px;display:flex;flex-direction:column;gap:8px;">
                <div style="display:flex; justify-content:center; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
                    <div style="text-align:center;font-family:'Cinzel',serif;font-size:0.9em;font-weight:800;
                        color:${tierData.color};letter-spacing:1px;">${tierData.label}</div>
                    ${badgeFusion}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;">
                    <div style="background:#fef9f0;border:1px solid #f39c12;border-radius:6px;padding:6px 2px;text-align:center;display:flex;flex-direction:column;align-items:center;">
                        <div style="font-size:0.6em;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">POT</div>
                        <div style="font-size:0.95em;font-weight:800;color:#d68910;display:flex;flex-direction:column;align-items:center;line-height:1;width:100%;">
                            ${_fmtDChain(proy.pot_chain_base, pot, [1,2,3,4,5].map(n=>gEq?.['delta_pot_'+n]), proy.esFusion ? '⚡ ' : '')}
                        </div>
                    </div>
                    <div style="background:#f0f8fe;border:1px solid #2980b9;border-radius:6px;padding:6px 2px;text-align:center;display:flex;flex-direction:column;align-items:center;">
                        <div style="font-size:0.6em;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">AGI</div>
                        <div style="font-size:0.95em;font-weight:800;color:#2980b9;display:flex;flex-direction:column;align-items:center;line-height:1;width:100%;">
                            ${_fmtDChain(proy.agi_chain_base, agi, [1,2,3,4,5].map(n=>gEq?.['delta_agi_'+n]), proy.esFusion ? '⚡ ' : '')}
                        </div>
                    </div>
                    <div style="border:1px solid #27ae60;border-radius:6px;overflow:hidden;text-align:center;display:flex;flex-direction:column;" title="${ctlEsFusionado ? `Base: ${baseCtl}` : ''}">
                        <!-- Zona superior: CTL USADO -->
                        <div style="background:${ctlExcedido?'#fde8e8':'#c8f5dc'};padding:5px 2px 3px;display:flex;flex-direction:column;align-items:center;border-bottom:1px solid #27ae6055;">
                            <div style="font-size:0.55em;color:${ctlExcedido?'#c0392b':'#1a6b3a'};text-transform:uppercase;letter-spacing:.5px;margin-bottom:1px;">🛡 usado</div>
                            <div style="font-size:0.95em;font-weight:800;color:${ctlExcedido?'#c0392b':colorCtlTxt};display:flex;flex-direction:column;align-items:center;line-height:1;width:100%;">
                                ${_fmtDChain(ctlUsadoBase, ctlUsado, [1,2,3,4,5].map(n=>gEq?.['delta_ctl_usado_'+n]))}
                            </div>
                        </div>
                        <!-- Zona inferior: CTL TOTAL -->
                        <div style="background:#f0fff4;padding:4px 2px 5px;display:flex;flex-direction:column;align-items:center;">
                            <div style="font-size:0.55em;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:1px;">CTL total</div>
                            <div style="font-size:0.95em;font-weight:800;color:${colorCtlTxt};display:flex;flex-direction:column;align-items:center;line-height:1;width:100%;">
                                ${_fmtDChain(proy.ctl_chain_base, ctl, [1,2,3,4,5].map(n=>gEq?.['delta_ctl_'+n]), iconCtl)}
                            </div>
                        </div>
                    </div>
                </div>
                <div style="height:5px;background:#f0f0f0;border-radius:4px;overflow:hidden;">
                    <div style="height:100%;width:${Math.min(ctlRatio*100,100)}%;background:${barColor};border-radius:4px;transition:width .3s;"></div>
                </div>
                ${ctlExcedido ? `<div style="font-size:0.7em;color:#e74c3c;margin-top:4px;font-weight:700;">⚠ CTL EXCEDIDO. Desequipa o se auto-ajustará.</div>` : ''}
                <div style="display:flex;flex-direction:column;gap:4px;font-size:0.78em;border-top:1px solid var(--gray-200);padding-top:6px;margin-top:4px;">
                    <div style="display:flex;justify-content:space-between;"><span>PAC</span><b style="${proy.esFusion ? 'color:#8e44ad;' : ''}">${proy.esFusion ? '⚡' : ''}${pac}</b></div>
                    <div style="display:flex;justify-content:space-between;"><span>PV</span><b>${pvActual} / ${pvMax}</b></div>
                    <div style="display:flex;justify-content:space-between;"><span>Cambios/t</span><b>${cambios}</b></div>
                    <div style="display:flex;justify-content:space-between;border-top:1px solid #f0f0f0;padding-top:4px;margin-top:2px;">
                        <span>PT totales</span><b style="${proy.esFusion ? 'color:#8e44ad;' : 'color:var(--green);'}">${proy.esFusion ? '⚡' : ''}${totalPT}</b>
                    </div>
                    <div style="display:flex;justify-content:space-between;">
                        <span>Tags ≥50 PT</span><b style="color:var(--orange);">${listos}</b>
                    </div>
                    <div style="display:flex;justify-content:space-between;">
                        <span>Tags totales</span><b>${proy.tags.length}</b>
                    </div>
                </div>
            </div>
        </div>`;
        let ctlAcum = 0;
        const equipadosConEstado = equipados.map(m => {
            const cabe = (ctlAcum + (m.costo_ctl||0)) <= ctl;
            if (cabe) ctlAcum += (m.costo_ctl||0);
            return { ...m, _cabe: cabe };
        });

        const selDetalle = medallaState.equipacionDetalleId;

        const filaEq = equipados.length
            ? equipadosConEstado.map(m => {
                const esSel = selDetalle === m.id;
                const excede = !m._cabe;
                return `
                <div onclick="window._medEquipSelDetalle('${m.id}')"
                    style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:7px;margin-bottom:4px;cursor:pointer;
                           background:${esSel ? 'rgba(39,174,96,0.08)' : excede ? 'rgba(231,76,60,0.05)' : m.tipo==='activa'?'rgba(26,74,128,0.05)':'rgba(108,52,131,0.05)'};
                           border:1.5px solid ${esSel ? 'var(--green)' : excede ? '#e74c3c' : m.tipo==='activa'?'rgba(26,74,128,0.2)':'rgba(108,52,131,0.2)'};">
                    <span style="font-size:0.65em;padding:2px 5px;border-radius:4px;font-weight:700;flex-shrink:0;
                        background:${m.tipo==='activa'?'rgba(26,74,128,0.12)':'rgba(108,52,131,0.12)'};
                        color:${m.tipo==='activa'?'#1a4a80':'#6c3483'};
                        border:1px solid ${m.tipo==='activa'?'#1a4a80':'#6c3483'};">${m.tipo==='activa'?'⚡ A':'🛡 P'}</span>
                    <span style="flex:1;font-size:0.78em;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2;
                                 color:${excede?'#e74c3c':'inherit'};" title="${excede?'Excede el límite CTL':''}">${m.nombre}${excede?' ⚠':''}
                    </span>
                    <span style="font-size:0.72em;color:${excede?'#e74c3c':'var(--purple)'};font-weight:800;white-space:nowrap;">${m.costo_ctl} CTL</span>
                    <button onclick="event.stopPropagation();window._medEquiparToggle('${m.id}')"
                        style="background:none;border:none;color:#c0392b;cursor:pointer;font-size:1em;padding:0;line-height:1;flex-shrink:0;" title="Quitar">✕</button>
                </div>`;
            }).join('')
            : `
            <div style="font-size:0.78em;color:#bbb;text-align:center;padding:16px 0;border:1.5px dashed #eee;border-radius:8px;">
                Sin medallas equipadas<br><span style="font-size:0.85em;">Usa "+ Equipar" en las tarjetas</span>
            </div>`;

        // ⚡ 4. USAMOS LOS TAGS PROYECTADOS PARA LAS SUGERENCIAS
        const tagsDelPJ = proy.tags.map(t => '#'+(t.startsWith('#')?t.slice(1):t));
        const equipadosIds = new Set(equipados.map(m => m.id));
        const sugeridas = medallas.filter(m =>
            !m.propuesta &&
            !equipadosIds.has(m.id) &&
            mTags(m).some(t => tagsDelPJ.some(tp => tp.toLowerCase() === t.toLowerCase()))
        ).slice(0, 30);

        const poolHtml = sugeridas.length
            ? sugeridas.map(m => {
                const ctlLibre = ctl - ctlUsado;
                const puedeFit = m.costo_ctl <= ctlLibre;
                return `
                <div style="display:flex;align-items:center;gap:5px;padding:5px 6px;border-radius:6px;margin-bottom:3px;cursor:pointer;
                             border:1px solid ${puedeFit?'#dee2e6':'#f8d7da'};
                             background:${puedeFit?'white':'#fff8f8'};"
                     onclick="window._medEquiparToggle('${m.id}',${JSON.stringify(m).replace(/"/g,"'")})">
                    <span style="font-size:0.6em;padding:1px 4px;border-radius:3px;font-weight:700;flex-shrink:0;
                        background:${m.tipo==='activa'?'rgba(26,74,128,0.1)':'rgba(108,52,131,0.1)'};
                        color:${m.tipo==='activa'?'#1a4a80':'#6c3483'};border:1px solid ${m.tipo==='activa'?'#1a4a80':'#6c3483'};">${m.tipo==='activa'?'⚡':'🛡'}</span>
                    <span style="flex:1;font-size:0.75em;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
                                 color:${puedeFit?'#333':'#aaa'};">${m.nombre}</span>
                    <span style="font-size:0.68em;color:${puedeFit ? 'var(--purple)' : '#e74c3c'};font-weight:700;white-space:nowrap;">${m.costo_ctl} CTL</span>
                </div>`;
            }).join('')
            : `<div style="font-size:0.75em;color:#bbb;text-align:center;padding:8px 0;">Sin sugerencias disponibles</div>`;

        const guardarBtn = medallaState.esAdmin
            ? `
            <button onclick="window._medGuardarEquipacionValida()"
                style="width:100%;padding:8px;font-size:0.8em;background:var(--green);border:none;border-radius:8px;color:white;cursor:pointer;font-weight:700;letter-spacing:.3px;">
                💾 Guardar equipación
            </button>`
            : `
            <button onclick="window._medProponerEquipacion()"
                style="width:100%;padding:8px;font-size:0.8em;background:#e67e22;border:none;border-radius:8px;color:white;cursor:pointer;font-weight:700;letter-spacing:.3px;">
                📝 Proponer equipación
            </button>`;

        let detalleHtml = '';
        if (selDetalle) {
            const md = equipados.find(m => m.id === selDetalle) || (medallaState.equipacionPropuesta || []).find(m => m.id === selDetalle);
            if (md) {
                // ⚡ 5. USAMOS LOS PUNTOS PROYECTADOS PARA EL DETALLE DE LA MEDALLA
                const ptsMapaD = proy.ptsMapa;
                const reqsD = (md.requisitos_base||[]).map(r => {
                    const normTagReq = r.tag.startsWith('#') ? r.tag.toLowerCase() : '#' + r.tag.toLowerCase();
                    const pts = ptsMapaD[normTagReq] || ptsMapaD[r.tag] || ptsMapaD[r.tag.replace('#','')] || 0;
                    const ok = pts >= (r.pts_minimos||0);
                    return `
                    <div style="display:flex;align-items:center;justify-content:space-between;font-size:0.75em;padding:4px 0;border-bottom:1px solid #f5f5f5;">
                        <span style="color:var(--blue);font-weight:600;">${r.tag}</span>
                        <span style="color:${ok?'var(--green-dark)':'#e74c3c'};font-weight:700;">${pts}/${r.pts_minimos} PT ${ok?'✓':'✗'}</span>
                    </div>`;
                }).join('') || '<div style="font-size:0.75em;color:#bbb;">Sin requisitos</div>';

                const condsD = (md.efectos_condicionales||[]).map(ec => {
                    const normTagCond = ec.tag.startsWith('#') ? ec.tag.toLowerCase() : '#' + ec.tag.toLowerCase();
                    const pts = ptsMapaD[normTagCond] || ptsMapaD[ec.tag] || ptsMapaD[ec.tag.replace('#','')] || 0;
                    const activo = pts >= (ec.pts_minimos||0);
                    return `
                    <div style="border-radius:8px;padding:8px;margin-bottom:6px;
                                background:${activo?'rgba(39,174,96,0.06)':'rgba(0,0,0,0.03)'};
                                border:1.5px solid ${activo?'var(--green)':'#dee2e6'};">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                            <span style="font-size:0.72em;color:var(--orange);font-weight:700;">${ec.tag}</span>
                            <span style="font-size:0.68em;font-weight:700;color:${activo?'var(--green-dark)':'#aaa'};">
                                ${activo?'⚡ ACTIVO':'🔒 '+pts+'/'+ec.pts_minimos+' PT'}
                            </span>
                        </div>
                        <div style="font-size:0.73em;color:#555;line-height:1.4;">${renderMarkup(ec.efecto||'')}</div>
                    </div>`;
                }).join('') || '<div style="font-size:0.75em;color:#bbb;">Sin efectos condicionales</div>';

                const tagsD = mTags(md).map(t => `<span style="background:rgba(243,156,18,0.12);border:1px solid #f39c12;color:#d68910;padding:2px 7px;border-radius:8px;font-size:0.72em;">${t}</span>`).join(' ');

                detalleHtml = `
                <div style="background:white;border:1.5px solid var(--green);border-radius:12px;padding:14px;flex-shrink:0;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
                        <div>
                            <div style="font-size:0.88em;font-weight:800;color:#1a1a2e;line-height:1.2;margin-bottom:4px;">${md.nombre}</div>
                            <div style="display:flex;flex-wrap:wrap;gap:4px;">${tagsD}</div>
                        </div>
                        <div style="text-align:right;flex-shrink:0;">
                            <div style="font-size:0.95em;font-weight:800;color:var(--purple);">${md.costo_ctl} CTL</div>
                            <div style="font-size:0.7em;color:${md.tipo==='activa'?'#1a4a80':'#6c3483'};font-weight:700;">${md.tipo==='activa'?'⚡ Activa':'🛡 Pasiva'}</div>
                        </div>
                    </div>
                    <div style="font-size:0.78em;color:#444;line-height:1.5;margin-bottom:10px;padding:8px;background:#f8f9fa;border-radius:6px;">
                        ${renderMarkup(md.efecto_desc||'Sin descripción.')}
                    </div>
                    ${(md.requisitos_base||[]).length ? `
                    <div style="margin-bottom:10px;">
                        <div style="font-size:0.68em;font-weight:800;text-transform:uppercase;color:#aaa;letter-spacing:.5px;margin-bottom:6px;">Requisitos</div>
                        ${reqsD}
                    </div>` : ''}
                    ${(md.efectos_condicionales||[]).length ? `
                    <div>
                        <div style="font-size:0.68em;font-weight:800;text-transform:uppercase;color:#aaa;letter-spacing:.5px;margin-bottom:6px;">Efectos condicionales</div>
                        ${condsD}
                    </div>` : ''}
                    <button onclick="window._medEquipSelDetalle(null)"
                        style="margin-top:10px;width:100%;padding:5px;font-size:0.72em;background:none;border:1.5px solid #dee2e6;border-radius:6px;cursor:pointer;color:#888;">
                        Cerrar detalle
                    </button>
                </div>`;
            }
        }

        let propHtml = '';
        if (medallaState.equipacionPropuesta?.length > 0) {
            const pUsado = medallaState.equipacionPropuesta.reduce((s, m) => s + (m.costo_ctl||0), 0);
            const filasProp = medallaState.equipacionPropuesta.map(m => `
                <div onclick="window._medEquipSelDetalle('${m.id}')"
                    style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:7px;margin-bottom:4px;cursor:pointer;
                           background:rgba(230,126,34,0.06); border:1.5px solid rgba(230,126,34,0.3);">
                    <span style="font-size:0.65em;padding:2px 5px;border-radius:4px;font-weight:700;flex-shrink:0;
                        background:rgba(230,126,34,0.15); color:#d68910; border:1px solid #d68910;">${m.tipo==='activa'?'⚡ A':'🛡 P'}</span>
                    <span style="flex:1;font-size:0.78em;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#d68910;">${m.nombre}</span>
                    <span style="font-size:0.72em;color:#e67e22;font-weight:800;">${m.costo_ctl} CTL</span>
                </div>
            `).join('');

            const btnAcc = medallaState.esAdmin
                ? `
                <div style="display:flex;gap:5px;margin-top:10px;">
                    <button onclick="window._medAprobarPropuestaEq()" style="flex:1;padding:6px;background:var(--green);color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:0.75em;">✅ Aprobar</button>
                    <button onclick="window._medRechazarPropuestaEq()" style="flex:1;padding:6px;background:var(--red);color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:0.75em;">❌ Rechazar</button>
                </div>`
                : `
                <button onclick="window._medRechazarPropuestaEq()" style="margin-top:10px;width:100%;padding:6px;background:none;border:1.5px solid var(--red);color:var(--red);border-radius:6px;font-weight:bold;cursor:pointer;font-size:0.75em;">
                    🗑️ Retirar Propuesta
                </button>`;

            propHtml = `
                <div style="background:#fffbf5;border:1.5px solid #e67e22;border-radius:12px;padding:14px;flex-shrink:0;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <span style="font-size:0.72em;font-weight:800;color:#d68910;text-transform:uppercase;letter-spacing:.6px;">🟠 Propuesta Pendiente</span>
                    </div>
                    <div style="font-size:0.72em;color:#e67e22;margin-bottom:8px;font-weight:700;">
                        CTL propuesto: ${pUsado} / ${ctl}
                    </div>
                    <div>${filasProp}</div>
                    ${btnAcc}
                </div>
            `;
        }

        equipHtml = `
        <div id="pj-equip-panel" style="width:260px;min-width:260px;flex-shrink:0;align-self:flex-start;position:sticky;top:0;
                    display:flex;flex-direction:column;gap:10px;max-height:calc(100vh - 80px);overflow-y:auto;overflow-x:hidden;">

            ${resumenCard}

            ${propHtml}

            <div style="background:white;border:1.5px solid #dee2e6;border-radius:12px;padding:14px;flex-shrink:0;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <span style="font-size:0.72em;font-weight:800;color:#555;text-transform:uppercase;letter-spacing:.6px;">⚔ Equipación</span>
                    ${ctlUsado > 0 ? `
                    <button onclick="window._medLimpiarEquipacion()"
                        style="font-size:0.7em;background:none;border:1px solid #e74c3c;color:#c0392b;cursor:pointer;padding:2px 6px;border-radius:5px;font-weight:600;">
                        ✕ Limpiar
                    </button>` : ''}
                </div>
                <div style="margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                        <span style="font-size:0.75em;color:#888;">CTL usado</span>
                        <span style="font-size:0.82em;font-weight:800;color:${ctlColor};">${ctlUsado} / ${ctl}</span>
                    </div>
                    <div style="height:6px;background:#f0f0f0;border-radius:4px;overflow:hidden;">
                        <div style="height:100%;width:${Math.min(ctlRatio*100,100)}%;background:${barColor};border-radius:4px;transition:width .3s;"></div>
                    </div>
                    ${ctlUsado > ctl ? `<div style="font-size:0.7em;color:#e74c3c;margin-top:4px;font-weight:600;">⚠ Las marcadas con ⚠ exceden el límite y no se guardarán</div>` : ''}
                </div>
                <div style="margin-bottom:10px;">
                    ${filaEq}
                </div>
                ${guardarBtn}
            </div>

            ${detalleHtml}

            <div style="background:white;border:1.5px solid #dee2e6;border-radius:12px;padding:14px;flex-shrink:0;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <span style="font-size:0.72em;font-weight:800;color:#555;text-transform:uppercase;letter-spacing:.6px;">💡 Sugeridas</span>
                    <span style="font-size:0.68em;color:#bbb;">${sugeridas.length} disponibles</span>
                </div>
                <div style="font-size:0.7em;color:#aaa;margin-bottom:8px;">Tags del PJ · Click para equipar · <span style="color:#e74c3c;">Rojo = sin CTL</span></div>
                <div>
                    ${poolHtml}
                </div>
            </div>
        </div>`;
    }

    const prevFocus = document.activeElement?.id === 'pj-med-buscar';
    
    wrap.innerHTML = `
        <div id="pj-main-layout" style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">
            <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:14px;">
                <div class="card" id="pj-selector-card" style="position:sticky;top:0;z-index:15;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
                    <div class="card-title">Personaje</div>
                    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
                        ${btnRol('todos','Todos')} ${btnRol('#Jugador','Jugador')} ${btnRol('#NPC','NPC')}
                        <span style="width:1px;background:var(--gray-200);display:inline-block;margin:0 2px;"></span>
                        ${btnEst('todos','Todos')} ${btnEst('#Activo','Activo')} ${btnEst('#Inactivo','Inactivo')}
                    </div>
                    <div class="char-grid">${charHtml || '<span style="color:#aaa;font-size:0.85em;">Sin personajes</span>'}</div>
                    <input id="pj-med-buscar" placeholder="🔍 Filtrar medallas o tags..."
                        oninput="window._medPJBuscar(this.value)"
                        value="${_esc(medallaState.pjBusqueda||'')}"
                        style="margin-top:10px;padding:7px 12px;font-size:0.82em;border:1.5px solid #dee2e6;border-radius:8px;outline:none;width:100%;box-sizing:border-box;">
                </div>
                ${content}
            </div>
            ${equipHtml}
        </div>`;

    if (prevFocus) {
        const inp = document.getElementById('pj-med-buscar');
        if (inp) {
            inp.focus();
            inp.setSelectionRange(inp.value.length, inp.value.length);
        }
    }

    requestAnimationFrame(() => {
        const header = document.querySelector('.app-header');
        if (!header) return;
        const hh = header.getBoundingClientRect().height + 'px';
        const card = document.getElementById('pj-selector-card');
        if (card) card.style.top = hh;
        const equip = document.getElementById('pj-equip-panel');
        if (equip) equip.style.top = hh;
    });
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
        return `
        <div style="background:var(--orange-pale);border:1px solid var(--orange);border-radius:var(--radius);padding:10px;margin-top:8px;">
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

    const adminBtns = medallaState.esAdmin
        ? `<div style="display:flex;gap:8px;margin-top:12px;border-top:1px solid var(--gray-200);padding-top:12px;flex-wrap:wrap;">
            ${isProp ? `<button class="btn btn-green btn-sm" onclick="window._medAprobar('${m.id}');window._medallasCloseModal()">✅ Aprobar</button>` : ''}
            <button class="btn btn-green btn-sm" onclick="window._medallasEditar(${JSON.stringify(m).replace(/"/g,'&quot;')})">✏️ Editar</button>
            <button class="btn btn-red btn-sm" onclick="window._medallasEliminar('${m.id}')">🗑️ Eliminar</button>
           </div>`
        : isProp
        ? `<div style="display:flex;gap:8px;margin-top:12px;border-top:1px solid var(--gray-200);padding-top:12px;flex-wrap:wrap;">
            <button class="btn btn-sm" style="background:#e67e22;border-color:#e67e22;color:white;" onclick="window._medallasEditar(${JSON.stringify(m).replace(/"/g,'&quot;')})">✏️ Editar propuesta</button>
            <button class="btn btn-red btn-sm" onclick="window._medallasEliminar('${m.id}')">🗑️ Eliminar propuesta</button>
           </div>`
        : '';

    el.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;"
             onclick="if(event.target===this)window._medallasCloseModal()">
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
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;"
             onclick="if(event.target===this)window._medallasCloseModal()">
            <div style="background:white;border-radius:var(--radius-lg);max-width:700px;width:100%;box-shadow:var(--shadow-lg);overflow:hidden;border:2px solid #e67e22;">
                <div style="background:#e67e22;color:white;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="margin:0;font-family:'Cinzel',serif;">📝 Proponer Medalla</h3>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <button onclick="window._medallasCloseModal()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:1.1em;">×</button>
                    </div>
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
                        <label class="form-label">Efecto base <span style="font-size:0.75em;color:#aaa;font-weight:400;">(@Personaje@ #Tag !Medalla! %90+: efecto%)</span></label>
                        <textarea class="inp" id="prop-efecto" rows="3" placeholder="Describe el efecto… %90+: daño adicional.% %20-: autoquita 10 PVs.%"
                            onmouseenter="if(window._initMarkupTA)window._initMarkupTA(this)"></textarea>
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

                    <div>
                        <label class="form-label">Efectos condicionales</label>
                        <div style="font-size:0.75em;color:#aaa;margin-bottom:8px;">Se activan si el PJ cumple el tag y PT. Escribe # para buscar.</div>
                        <div id="prop-conds"></div>
                        <button class="btn btn-outline btn-sm" style="margin-top:6px;" onclick="window._propAddCond()">+ Añadir efecto condicional</button>
                    </div>
                    ${renderBloqueIA('prop-fm', 'window._iaGenerarProp')}
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

    window._propReqCount  = 0;
    window._propCondCount = 0;
    window._propAddReq = () => {
        const idx = ++window._propReqCount;
        document.getElementById('prop-reqs').insertAdjacentHTML('beforeend', _htmlReqRow({}, idx));
        requestAnimationFrame(() => mountNewTagAC('req-tag-' + idx));
    };
    window._propAddCond = () => {
        const idx = ++window._propCondCount;
        document.getElementById('prop-conds').insertAdjacentHTML('beforeend', _htmlCondRow({}, idx));
        requestAnimationFrame(() => mountNewTagAC('cond-tag-' + idx));
    };

    requestAnimationFrame(() => {
        document.querySelectorAll('#prop-reqs [id^="req-tag-"]').forEach(el => _attachTagAC(el));
        const ef = document.getElementById('prop-efecto');
        if (ef && window._initMarkupTA) window._initMarkupTA(ef);
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
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;"
             onclick="if(event.target===this)window._medallasCloseModal()">
            <div style="background:white;border-radius:var(--radius-lg);max-width:700px;width:100%;box-shadow:var(--shadow-lg);overflow:hidden;">
                <div class="modal-header">
                    <h3>${isEdit ? '✏️ Editar' : '✨ Nueva'} Medalla</h3>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <button class="modal-close" onclick="window._medallasCloseModal()">×</button>
                    </div>
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
                        <label class="form-label">Efecto base <span style="font-size:0.75em;color:#aaa;font-weight:400;">(@Personaje@ #Tag !Medalla! %90+: efecto% — Tab para autocompletar)</span></label>
                        <textarea class="inp" id="fm-efecto" rows="3" placeholder="Describe el efecto principal… %90+: daño adicional.% %20-: autoquita 10 PVs.%"
                            onmouseenter="if(window._initMarkupTA)window._initMarkupTA(this)">${_esc(m?.efecto_desc||'')}</textarea>
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
                    ${renderBloqueIA('admin-fm', 'window._iaGenerarAdmin')}
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
    requestAnimationFrame(() => {
        _mountFormAC();
        ['fm-efecto'].concat(
            [...document.querySelectorAll('[id^="cond-efecto-"]')].map(e => e.id)
        ).forEach(id => {
            const elm = document.getElementById(id);
            if (elm && window._initMarkupTA) window._initMarkupTA(elm);
        });
    });
}

// ── Formularios múltiples (Dinámico N) ────────────────────────
export function renderFormsMultiple(esPropuesta = false, numForms = 4) {
    const N = parseInt(numForms) || 4;
    const prefix = esPropuesta ? 'mp' : 'mm';
    const titulo = esPropuesta ? `📝×${N} Proponer múltiples medallas` : `✨×${N} Crear múltiples medallas`;
    const subtitulo = esPropuesta ? 'Cada formulario generará una propuesta independiente para revisión del OP.' : 'Cada formulario generará una medalla independiente al guardar.';

    // Exponemos la función de refrescar dinámicamente
    window._medReRenderMulti = (propuesta) => {
        const input = document.getElementById('mf-num-forms');
        if (input) renderFormsMultiple(propuesta, input.value);
    };

    function _miniForm(i) {
        const fid = `${prefix}${i}`;
        return `
        <div id="mf-form-${fid}" style="background:white;border:2px solid var(--gray-200);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
                <div style="width:24px;height:24px;border-radius:50%;background:var(--green);color:white;font-size:0.75em;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i+1}</div>
                <span style="font-size:0.82em;font-weight:700;color:var(--gray-700);">Medalla ${i+1}</span>
                <span id="mf-badge-${fid}" style="font-size:0.7em;display:none;padding:2px 7px;border-radius:8px;font-weight:700;"></span>
            </div>
            <input type="hidden" id="mf-id-${fid}" value="">
            <div style="display:grid;grid-template-columns:1fr 80px;gap:8px;">
                <div>
                    <label style="font-size:0.72em;font-weight:700;color:var(--gray-600);display:block;margin-bottom:3px;">Nombre *</label>
                    <input class="inp" id="mf-nombre-${fid}" placeholder="Nombre de la medalla" style="font-size:0.85em;">
                </div>
                <div>
                    <label style="font-size:0.72em;font-weight:700;color:var(--gray-600);display:block;margin-bottom:3px;">CTL *</label>
                    <input class="inp" id="mf-ctl-${fid}" type="number" min="1" max="50" value="1" style="font-size:0.85em;">
                </div>
            </div>

            <div>
                <label style="font-size:0.72em;font-weight:700;color:var(--gray-600);display:block;margin-bottom:3px;">Efecto base <span style="font-weight:400;color:#aaa;">(@ # ! %dado%)</span></label>
                <textarea class="inp" id="mf-efecto-${fid}" rows="2" placeholder="Describe el efecto…" style="font-size:0.83em;" onmouseenter="if(window._initMarkupTA)window._initMarkupTA(this)"></textarea>
            </div>
            <div>
                <label style="font-size:0.72em;font-weight:700;color:var(--gray-600);display:block;margin-bottom:3px;">Tipo</label>
                <select class="inp" id="mf-tipo-${fid}" style="font-size:0.83em;max-width:140px;">
                    <option value="activa">Activa</option>
                    <option value="pasiva">Pasiva</option>
                </select>
            </div>
            <div>
                <label style="font-size:0.72em;font-weight:700;color:var(--gray-600);display:block;margin-bottom:3px;">Requisitos</label>
                <div id="mf-reqs-${fid}">
                    <div class="cond-row" id="mf-rrow-${fid}-0" style="margin-bottom:4px;">
                        <input class="inp" placeholder="#Tag" style="flex:1;font-size:0.82em;" id="mf-rtag-${fid}-0" autocomplete="off">
                        <input class="inp" type="number" min="0" placeholder="PT" style="width:60px;font-size:0.82em;" id="mf-rpts-${fid}-0">
                        <button class="btn btn-red btn-sm" onclick="document.getElementById('mf-rrow-${fid}-0').remove()">✕</button>
                    </div>
                </div>
                <button class="btn btn-outline btn-sm" style="margin-top:4px;font-size:0.75em;"
                    onclick="window._mfAddReq('${fid}')">+ Requisito</button>
            </div>
            <div>
                <label style="font-size:0.72em;font-weight:700;color:var(--gray-600);display:block;margin-bottom:3px;">Condicionales</label>
                <div id="mf-conds-${fid}"></div>
                <button class="btn btn-outline btn-sm" style="margin-top:4px;font-size:0.75em;"
                    onclick="window._mfAddCond('${fid}')">+ Condicional</button>
            </div>
            <div id="mf-msg-${fid}" style="font-size:0.75em;color:var(--red);min-height:14px;"></div>
        </div>`;
    }

    const el = document.getElementById('medalla-modal');
    if (!el) return;

    el.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:500;overflow-y:auto;padding:20px 8px 40px;">
            <div style="max-width:1400px;margin:0 auto;">
                <div style="background:white;border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);overflow:hidden;">
                    <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;gap:10px;${esPropuesta ? 'background:#e67e22;color:white;' : ''}">
                        <h3 style="margin:0;">${titulo}</h3>
                        <div style="display:flex;gap:8px;align-items:center;">
                            <button class="btn btn-green" id="mf-guardar-todos" onclick="window._mfGuardarTodos('${prefix}',${N},${esPropuesta})">
                                💾 Guardar todas
                            </button>
                            <button class="modal-close" onclick="window._medallasCloseModal()">×</button>
                        </div>
                    </div>
                    <div style="padding:16px;">
                        <div style="margin-bottom: 14px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <label style="font-size:0.85em; font-weight:700; color:#555;">Cantidad de formularios:</label>
                            <input type="number" id="mf-num-forms" value="${N}" min="1" max="50" class="inp" style="width: 70px; font-size: 0.85em; padding: 4px;">
                            <button class="btn btn-sm btn-outline" onclick="window._medReRenderMulti(${esPropuesta})">Actualizar</button>
                            <span style="font-size: 0.75em; color: var(--red); font-weight:bold;">(Atención: Actualizar borrará los datos no guardados)</span>
                        </div>
                        <p style="font-size:0.83em;color:#888;margin:0 0 14px;">${subtitulo} Los formularios vacíos se omiten automáticamente.</p>
                        
                        ${renderBarraIAGlobal(prefix, N)}
                        
                        <div id="mf-resumen" style="display:none;padding:10px 14px;border-radius:8px;margin-bottom:14px;font-size:0.85em;font-weight:600;"></div>
                        
                        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;">
                            ${Array.from({length:N},(_,i)=>_miniForm(i)).join('')}
                        </div>
                        <div style="margin-top:18px;display:flex;justify-content:flex-end;">
                            <button class="btn btn-green" style="min-width:160px;" onclick="window._mfGuardarTodos('${prefix}',${N},${esPropuesta})">
                                💾 Guardar todas
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    el.style.display = 'block';

    // Inicializar contadores de requisitos y condicionales
    window._mfReqCounters = {};
    window._mfCondCounters = {};
    
    for (let i = 0; i < N; i++) {
        const fid = `${prefix}${i}`;
        window._mfReqCounters[fid] = 0;
        window._mfCondCounters[fid] = 0;
        
        // Autocomplete en el primer req-tag
        requestAnimationFrame(() => {
            const inp = document.getElementById(`mf-rtag-${fid}-0`);
            if (inp) _attachTagAC(inp);
        });
    }

    // Funciones dinámicas para añadir filas
    window._mfAddReq = (fid) => {
        const c = ++(window._mfReqCounters[fid]);
        const rowId = `mf-rrow-${fid}-${c}`;
        document.getElementById(`mf-reqs-${fid}`)?.insertAdjacentHTML('beforeend', `
            <div class="cond-row" id="${rowId}" style="margin-bottom:4px;">
                <input class="inp" placeholder="#Tag" style="flex:1;font-size:0.82em;" id="mf-rtag-${fid}-${c}" autocomplete="off">
                <input class="inp" type="number" min="0" placeholder="PT" style="width:60px;font-size:0.82em;" id="mf-rpts-${fid}-${c}">
                <button class="btn btn-red btn-sm" onclick="document.getElementById('${rowId}').remove()">✕</button>
            </div>`);
        requestAnimationFrame(() => {
            const inp = document.getElementById(`mf-rtag-${fid}-${c}`);
            if (inp) _attachTagAC(inp);
        });
    };

    window._mfAddCond = (fid) => {
        const c = ++(window._mfCondCounters[fid]);
        const rowId = `mf-crow-${fid}-${c}`;
        document.getElementById(`mf-conds-${fid}`)?.insertAdjacentHTML('beforeend', `
            <div class="cond-row" id="${rowId}" style="flex-direction:column;align-items:stretch;margin-bottom:6px;">
                <div style="display:flex;gap:4px;">
                    <input class="inp" placeholder="#Tag" style="flex:1;font-size:0.82em;" id="mf-ctag-${fid}-${c}" autocomplete="off">
                    <input class="inp" type="number" min="0" placeholder="PT" style="width:60px;font-size:0.82em;" id="mf-cpts-${fid}-${c}">
                    <button class="btn btn-red btn-sm" onclick="document.getElementById('${rowId}').remove()">✕</button>
                </div>
                <textarea class="inp" rows="1" placeholder="Efecto… @Personaje@ #Tag !Medalla! %90+: efecto%" style="font-size:0.82em;margin-top:4px;" id="mf-cefecto-${fid}-${c}" onmouseenter="if(window._initMarkupTA)window._initMarkupTA(this)"></textarea>
            </div>`);
        requestAnimationFrame(() => {
            const inp = document.getElementById(`mf-ctag-${fid}-${c}`);
            if (inp) _attachTagAC(inp);
        });
    };
}

export function _htmlReqRow(r = {}, idx) {
    return `
    <div class="cond-row" id="req-row-${idx}">
        <input class="inp" placeholder="#Tag — escribe # para sugerencias" style="flex:1;"
            value="${_esc(r.tag||'')}" id="req-tag-${idx}" autocomplete="off">
        <input class="inp" type="number" min="0" placeholder="PT mín." style="width:90px;"
            value="${r.pts_minimos||0}" id="req-pts-${idx}">
        <button class="btn btn-red btn-sm" onclick="document.getElementById('req-row-${idx}').remove()">✕</button>
    </div>`;
}

export function _htmlCondRow(c = {}, idx) {
    return `
    <div class="cond-row" style="flex-direction:column;align-items:stretch;" id="cond-row-${idx}">
        <div style="display:flex;gap:8px;">
            <input class="inp" placeholder="#Tag — escribe # para sugerencias" style="flex:1;"
                value="${_esc(c.tag||'')}" id="cond-tag-${idx}" autocomplete="off">
            <input class="inp" type="number" min="0" placeholder="PT mín." style="width:90px;"
                value="${c.pts_minimos||0}" id="cond-pts-${idx}">
            <button class="btn btn-red btn-sm" onclick="document.getElementById('cond-row-${idx}').remove()">✕</button>
        </div>
        <textarea class="inp" rows="2" placeholder="Efecto si se cumple la condición… (@Personaje@ #Tag !Medalla! %90+: efecto%)"
            id="cond-efecto-${idx}" style="margin-top:6px;"
            onmouseenter="if(window._initMarkupTA)window._initMarkupTA(this)">${_esc(c.efecto||'')}</textarea>
    </div>`;
}

export function toast(msg, tipo='ok') {
    const el = document.getElementById('toast-msg');
    if (!el) return;
    el.textContent = msg; el.className = 'toast-' + tipo;
    setTimeout(() => { el.className = ''; }, 3000);
}
// --- NUEVA TARJETA COMPLETA PARA TAB PERSONAJE ---
function _renderCardCompletaParaPJ(m, pjNombre, ptsMapa) {
    const estado      = estadoMedallaPJ(m, pjNombre);
    const condActivos = efectosActivosPJ(m, pjNombre);
    const equipada    = (medallaState.equipacion||[]).some(e => e.id === m.id);

    let iconoEstado = '🔒';
    let colorBorde = 'var(--gray-200)';
    let opacity = '0.7';

    if (estado === 'activable') {
        iconoEstado = '✅';
        colorBorde = 'var(--green)';
        opacity = '1';
    } else if (estado === 'parcial') {
        iconoEstado = '⚠️';
        colorBorde = 'var(--orange)';
        opacity = '0.9';
    }

    if (equipada) colorBorde = 'var(--green-dark)';

    const tagsD = mTags(m).map(t => `<span style="font-size:0.68em;background:rgba(52,152,219,0.1);color:var(--blue);border:1px solid rgba(52,152,219,0.3);padding:2px 6px;border-radius:10px;margin-right:3px;font-weight:600;">${t}</span>`).join('');

const reqsHtml = (m.requisitos_base||[]).map(r => {
    // NORMALIZACIÓN CRÍTICA: Convertir a minúsculas antes de buscar
    const tagBusqueda = r.tag.startsWith('#') ? r.tag.toLowerCase() : '#' + r.tag.toLowerCase();
    const pts = ptsMapa[tagBusqueda] || 0; 
    const ok = pts >= (r.pts_minimos||0);
    
    return `<div style="font-size:0.75em; display:flex; justify-content:space-between; margin-bottom:2px;">
        <span style="color:var(--gray-600);">${r.tag}</span>
        <span style="color:${ok?'var(--green-dark)':'#e74c3c'};font-weight:bold;">${pts}/${r.pts_minimos} PT ${ok?'✓':'✗'}</span>
    </div>`;
}).join('');

    const condHtml = condActivos.map(ec => `
        <div style="font-size:0.72em; padding:6px; margin-top:4px; background:${ec.activo?'rgba(39,174,96,0.06)':'rgba(0,0,0,0.03)'}; border:1px solid ${ec.activo?'var(--green)':'#eee'}; border-radius:6px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                <span style="font-weight:bold; color:var(--orange);">${ec.tag}</span>
                <span style="font-weight:bold; color:${ec.activo?'var(--green-dark)':'#aaa'};">${ec.activo?'⚡ ACTIVO':'🔒 '+ec.pts_actuales+'/'+ec.pts_minimos+' PT'}</span>
            </div>
            <div style="color:var(--gray-600); line-height:1.3;">${renderMarkup(ec.efecto||'')}</div>
        </div>
    `).join('');

    return `
    <div class="medalla-card" style="opacity:${opacity}; border-color:${colorBorde}; background:${equipada ? 'rgba(39,174,96,0.05)' : 'white'}; padding:14px; border-radius:10px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 2px 6px rgba(0,0,0,0.06); transition:all 0.2s;">
        <div onclick="window._medallasAbrirDetalle(${JSON.stringify(m).replace(/"/g,'&quot;')}, '${pjNombre.replace(/'/g,"\\'")}'); event.stopPropagation();" style="cursor:pointer; flex-grow:1;">
            
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                <div style="font-weight:800; font-size:0.95em; color:var(--gray-900); display:flex; align-items:center; gap:6px; line-height:1.2;">
                    <span title="Estado: ${estado}">${iconoEstado}</span> 
                    ${m.nombre}
                </div>
                <div style="font-size:0.8em; font-weight:800; color:var(--purple); background:rgba(142,68,173,0.08); border:1px solid rgba(142,68,173,0.22); padding:2px 8px; border-radius:8px; white-space:nowrap; flex-shrink:0;">
                    ${m.costo_ctl} CTL
                </div>
            </div>

            <div style="margin-bottom:8px; display:flex; flex-wrap:wrap; gap:4px;">${tagsD}</div>
            
            <div style="font-size:0.78em; color:var(--gray-600); line-height:1.5; border-top:1px solid var(--gray-100); padding-top:8px; margin-bottom:8px;">
                ${renderMarkup(m.efecto_desc || 'Sin descripción.')}
            </div>

            ${reqsHtml ? `<div style="border-top:1px dashed var(--gray-200); padding-top:6px; margin-bottom:6px;"><div style="font-size:0.68em; font-weight:800; color:#aaa; text-transform:uppercase; margin-bottom:4px; letter-spacing:0.5px;">Requisitos</div>${reqsHtml}</div>` : ''}
            ${condHtml ? `<div style="border-top:1px dashed var(--gray-200); padding-top:6px;"><div style="font-size:0.68em; font-weight:800; color:#aaa; text-transform:uppercase; margin-bottom:4px; letter-spacing:0.5px;">Condicionales</div>${condHtml}</div>` : ''}
        </div>

        <button onclick="window._medEquiparToggle('${m.id}',${JSON.stringify(m).replace(/"/g,"&quot;")})"
            style="margin-top:10px; width:100%; padding:8px; font-size:0.8em; border-radius:8px; cursor:${estado === 'activable' || equipada ? 'pointer' : 'not-allowed'};
                   border:1.5px solid ${equipada ? 'var(--green)' : 'var(--gray-300)'};
                   background:${equipada ? 'var(--green)' : 'white'};
                   color:${equipada ? 'white' : 'var(--gray-700)'}; font-weight:700;
                   transition:all 0.2s;"
            ${estado !== 'activable' && !equipada ? 'disabled title="No cumples los requisitos"' : ''}>
            ${equipada ? '✅ Equipada' : (estado === 'activable' ? '+ Equipar' : '🔒 Bloqueada')}
        </button>
    </div>`;
}
