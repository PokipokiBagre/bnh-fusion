// ============================================================
// fichas-ui.js — Vista Catálogo (booru) + Detalle
// ============================================================
import { fichasGlobal, gruposGlobal, ptGlobal, hilosGlobal, fichasUI, STORAGE_URL, norm } from './fichas-state.js';
import { calcTier, calcPVMax, calcCambios, colorTier, buildTagIndex, totalPT, fmtTag } from './fichas-logic.js';
import { estaEnFusion, getFusionDe, renderFusionBadge } from '../bnh-fusion.js';

const $ = id => document.getElementById(id);

// ── Imagen ────────────────────────────────────────────────────
function imgPJ(nombre) {
    const clave = nombre.includes(',') ? nombre.split(',')[0].trim() : nombre;
    return `${STORAGE_URL}/imgpersonajes/${norm(clave)}icon.png`;
}
const fallback = `${STORAGE_URL}/imginterfaz/no_encontrado.png`;
const onErr = `this.onerror=null;this.src='${fallback}'`;

// ── Filtrar personajes según estado de fichasUI ───────────────
// Regla de visibilidad:
//   - Público: solo ve personajes que tienen refinado_id (grupo nombre asignado)
//   - Admin:   ve todos, incluyendo los "sueltos"
// Además filtra por tags activos y por hilo
export function getPersonajesFiltrados(postersDelHilo) {
    let lista = [...fichasGlobal];

    // Visibilidad: no-admin solo ve los que tienen grupo nombre
    if (!fichasUI.esAdmin) {
        lista = lista.filter(p => p.refinado_id);
    }

    // Filtro de hilo (si hay hilo seleccionado)
    if (postersDelHilo && fichasUI.hiloFiltro !== 'todos') {
        // Cruzar el nombre del personaje contra los aliases del grupo nombre
        // Un personaje aparece si cualquiera de sus aliases está en postersDelHilo
        lista = lista.filter(p => {
            const aliases = p.nombre.split(',').map(a => a.trim());
            return aliases.some(a => postersDelHilo.has(a));
        });
    }

    // Filtro por tags activos (AND — debe tener todos)
    if (fichasUI.tagsFiltro.length > 0) {
        lista = lista.filter(p => {
            const tagsNorm = (p.tags || []).map(t => (t.startsWith('#')?t:'#'+t).toLowerCase());
            return fichasUI.tagsFiltro.every(tf =>
                tagsNorm.includes(tf.toLowerCase())
            );
        });
    }

    return lista;
}

// ── Render del sidebar de tags ────────────────────────────────
export function renderSidebar() {
    const sidebar = $('fichas-sidebar');
    if (!sidebar) return;

    // Construir índice de tags sobre los personajes visibles (sin filtro de tags)
    let base = fichasAdmin => fichasAdmin
        ? fichasGlobal
        : fichasGlobal.filter(p => p.refinado_id);
    const personajesBase = fichasUI.esAdmin ? fichasGlobal : fichasGlobal.filter(p => p.refinado_id);
    const tagIndex = buildTagIndex(personajesBase);

    // Filtrar tags por búsqueda en sidebar
    let tagEntries = Object.entries(tagIndex)
        .sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
    if (fichasUI.tagBusqueda) {
        const q = fichasUI.tagBusqueda.toLowerCase();
        tagEntries = tagEntries.filter(([t]) => t.toLowerCase().includes(q));
    }

    // Filtro de hilo
    const hilosOpts = hilosGlobal.map(h =>
        `<option value="${h.thread_id}" ${fichasUI.hiloFiltro==h.thread_id?'selected':''}>
            ${h.titulo || 'Hilo #'+h.thread_id}
        </option>`
    ).join('');

    sidebar.innerHTML = `
    <!-- Filtro de hilo -->
    <div class="sidebar-section">
        <div class="sidebar-section-title">Hilo</div>
        <select onchange="window._fichaSetHilo(this.value)"
            style="width:100%; padding:5px 8px; border:1px solid var(--booru-border);
                   border-radius:var(--radius); font-size:0.85em; background:var(--white);">
            <option value="todos" ${fichasUI.hiloFiltro==='todos'?'selected':''}>Todos los hilos</option>
            ${hilosOpts}
        </select>
    </div>

    <!-- Tags -->
    <div class="sidebar-section">
        <div class="sidebar-section-title">Tags <span style="color:var(--gray-500); font-weight:400;">(${tagEntries.length})</span></div>
        <input type="text" class="sidebar-search" placeholder="Buscar tag..."
            value="${fichasUI.tagBusqueda}"
            oninput="window._fichaTagSearch(this.value)">
        <ul class="tag-list">
            ${tagEntries.map(([tag, cnt]) => {
                const activo = fichasUI.tagsFiltro.includes(tag);
                return `<li class="${activo?'active':''}" onclick="window._fichaToggleTag('${tag.replace(/'/g,"\\'")}')">
                    <span class="tag-link" style="${activo?'color:var(--red);font-weight:700;':''}">${tag}</span>
                    <span class="tag-count">${cnt}</span>
                </li>`;
            }).join('')}
            ${tagEntries.length === 0 ? `<li style="color:var(--gray-500); font-size:0.82em; padding:4px;">Sin tags</li>` : ''}
        </ul>
    </div>

    ${fichasUI.esAdmin ? `
    <div class="sidebar-section">
        <div class="sidebar-section-title">Admin</div>
        <button class="btn btn-green btn-sm" style="width:100%;"
            onclick="window.abrirCrearPersonaje()">+ Nuevo Personaje</button>
    </div>` : ''}`;
}

// ── Tags activos bar ──────────────────────────────────────────
export function renderActiveTagsBar() {
    const bar = $('active-tags-bar');
    if (!bar) return;
    if (fichasUI.tagsFiltro.length === 0) {
        bar.style.display = 'none'; return;
    }
    bar.style.display = 'flex';
    bar.innerHTML = `
    <span style="font-size:0.8em; color:var(--gray-500);">Filtros:</span>
    ${fichasUI.tagsFiltro.map(t => `
        <span class="active-tag-chip">
            ${t}
            <button onclick="window._fichaToggleTag('${t.replace(/'/g,"\\'")}')">×</button>
        </span>`).join('')}
    <button onclick="window._fichaClearTags()"
        style="background:none; border:none; color:var(--red); font-size:0.82em;
               cursor:pointer; text-decoration:underline; margin-left:4px;">Limpiar</button>`;
}

// ── CATÁLOGO BOORU ────────────────────────────────────────────
export function renderCatalogo(postersDelHilo) {
    const cont = $('fichas-grid-area');
    if (!cont) return;

    const lista = getPersonajesFiltrados(postersDelHilo);

    // Actualizar info de conteo
    const infoEl = $('fichas-count-info');
    if (infoEl) infoEl.textContent = `${lista.length} personaje${lista.length!==1?'s':''}`;

    if (!lista.length) {
        cont.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
            <div class="empty-icon">👤</div>
            <h3>${fichasUI.tagsFiltro.length ? 'Sin coincidencias con esos tags' : 'No hay personajes'}</h3>
            ${fichasUI.tagsFiltro.length ? `<p><a href="#" onclick="window._fichaClearTags();return false;" style="color:var(--booru-link);">Limpiar filtros</a></p>` : ''}
        </div>`;
        return;
    }

    cont.innerHTML = lista.map(p => {
        const { tier } = calcTier(p.pot||0, p.agi||0, p.ctl||0);
        const pvMax    = calcPVMax(p.pot||0, p.agi||0, p.ctl||0);
        const tc       = colorTier(tier);
        const pac      = (p.pot||0)+(p.agi||0)+(p.ctl||0);
        const pvA      = p.pv_actual ?? pvMax;
        const pvPct    = pvMax > 0 ? Math.round((pvA/pvMax)*100) : 100;
        const pvClass  = pvPct < 25 ? 'pv-crit' : pvPct < 60 ? 'pv-warn' : '';
        const enFusion = estaEnFusion(p.nombre);
        const safeNom  = p.nombre.replace(/'/g,"\\'");

        // Mostrar el nombre del grupo si existe
        const grupo = gruposGlobal.find(g => g.id === p.refinado_id);
        const displayName = grupo ? grupo.nombre_refinado : p.nombre;

        const tagsPreview = (p.tags||[]).slice(0,5)
            .map(t => `<span class="ficha-tag-mini">${t.replace(/^#/,'')}</span>`)
            .join('');

        return `
        <div class="ficha-card" onclick="window.abrirFicha('${safeNom}')">
            <div class="ficha-img-wrap">
                <img class="ficha-img" src="${imgPJ(p.nombre)}" onerror="${onErr}" loading="lazy">
                <div class="ficha-tier-badge"
                    style="background:${tc.bg}; color:${tc.text}; border:1px solid ${tc.border};">
                    T${tier}
                </div>
                ${enFusion ? `<div style="position:absolute;bottom:4px;right:4px;">${renderFusionBadge(p.nombre,STORAGE_URL,norm)}</div>` : ''}
                ${fichasUI.esAdmin && !p.refinado_id ? `<div style="position:absolute;top:4px;right:4px;background:rgba(192,57,43,0.85);color:#fff;padding:1px 5px;border-radius:3px;font-size:0.65em;font-weight:700;">SUELTO</div>` : ''}
            </div>
            <div class="ficha-info">
                <div class="ficha-name" title="${displayName}">${displayName}</div>
                <div class="ficha-pac">PAC ${pac} · PV ${pvA}/${pvMax}</div>
                <div class="pv-bar"><div class="pv-fill ${pvClass}" style="width:${pvPct}%"></div></div>
                <div class="ficha-tags-preview" style="margin-top:4px;">${tagsPreview}</div>
            </div>
            ${fichasUI.esAdmin ? `
            <button onclick="event.stopPropagation();window.abrirPanelOP('${safeNom}')"
                style="position:absolute;bottom:6px;right:5px;background:rgba(30,132,73,0.85);
                       color:#fff;border:none;border-radius:3px;padding:2px 7px;font-size:0.68em;
                       cursor:pointer;font-weight:700;">OP</button>` : ''}
        </div>`;
    }).join('');
}

// ── VISTA DETALLE ─────────────────────────────────────────────
export function renderDetalle(nombre) {
    const cont = $('fichas-contenido');
    if (!cont) return;

    const p = fichasGlobal.find(x => x.nombre === nombre);
    if (!p) { window.volverCatalogo(); return; }

    const { tier } = calcTier(p.pot||0, p.agi||0, p.ctl||0);
    const pvMax    = calcPVMax(p.pot||0, p.agi||0, p.ctl||0);
    const pac      = (p.pot||0)+(p.agi||0)+(p.ctl||0);
    const cambios  = calcCambios(p.agi||0);
    const tc       = colorTier(tier);
    const fusion   = getFusionDe(nombre);
    const ptPJ     = ptGlobal[nombre] || {};
    const safeNom  = nombre.replace(/'/g,"\\'");
    const grupo    = gruposGlobal.find(g => g.id === p.refinado_id);
    const displayName = grupo ? grupo.nombre_refinado : nombre;

    const tagsOrdenados = [...(p.tags||[])].sort((a,b)=>(ptPJ[b]||0)-(ptPJ[a]||0));

    cont.innerHTML = `
    <div class="detalle-layout">

      <!-- Columna wiki -->
      <div>
        <a class="detalle-back" onclick="window.volverCatalogo()">← Volver</a>

        <div class="detalle-titulo">
            ${displayName}
            ${fusion ? renderFusionBadge(nombre, STORAGE_URL, norm) : ''}
            ${fichasUI.esAdmin ? `
            <button onclick="window.abrirPanelOP('${safeNom}')"
                class="btn btn-green btn-sm" style="margin-left:auto;">⚙️ Panel OP</button>` : ''}
        </div>

        <!-- Tags -->
        <div class="wiki-section">
            <div class="wiki-section-header">Tags del Quirk</div>
            <div class="tags-detalle">
                ${tagsOrdenados.map(t => {
                    const pts = ptPJ[t]||0;
                    const tf  = t.startsWith('#') ? t : '#'+t;
                    return `<span class="tag-detalle"
                        onclick="window._fichaToggleTagYVolver('${tf.replace(/'/g,"\\'")}')"
                        title="Filtrar por ${tf} — ${pts} PT">
                        ${tf}<span class="tag-detalle-pts">${pts}pt</span>
                    </span>`;
                }).join('') || '<span style="color:var(--gray-500);">Sin tags</span>'}
            </div>
        </div>

        ${fusion ? `
        <div class="wiki-section">
            <div class="wiki-section-header" style="background:#6c3483;">⚡ Fusión Activa</div>
            <div style="padding:12px 14px;">
                <p style="color:#6c3483; font-weight:600; margin-bottom:8px;">
                    Fusionado con: <b>${fusion.pj_a===nombre?fusion.pj_b:fusion.pj_a}</b>
                </p>
                <div style="display:flex; flex-wrap:wrap; gap:4px;">
                    ${(fusion.tags_fusionados||[]).map(t =>
                        `<span style="background:#f5eeff;border:1px solid #9b59b6;color:#6c3483;padding:2px 8px;border-radius:8px;font-size:0.78em;">${t.startsWith('#')?t:'#'+t}</span>`
                    ).join('')}
                </div>
                ${fichasUI.esAdmin ? `<button onclick="window._opTerminarFusion('${fusion.id}')"
                    class="op-btn op-btn-red" style="margin-top:10px; font-size:0.78em;">✕ Terminar Fusión</button>` : ''}
            </div>
        </div>` : ''}

        ${p.lore ? `
        <div class="wiki-section">
            <div class="wiki-section-header">Historia</div>
            <div class="wiki-section-body">${escHTML(p.lore)}</div>
        </div>` : ''}

        ${p.quirk ? `
        <div class="wiki-section">
            <div class="wiki-section-header">Quirk</div>
            <div class="wiki-section-body">${escHTML(p.quirk)}</div>
        </div>` : ''}

        ${Object.keys(ptPJ).length ? `
        <div class="wiki-section">
            <div class="wiki-section-header">Progresión — Puntos de Tag</div>
            <table class="pt-table">
                <thead><tr>
                    <th>Tag</th><th>PT</th>
                    <th>Stat (50)</th><th>Medalla (75)</th><th>Mutación (100)</th>
                </tr></thead>
                <tbody>
                ${Object.entries(ptPJ).sort((a,b)=>b[1]-a[1]).map(([tag,pts]) => `
                <tr>
                    <td style="color:var(--booru-link); font-weight:600;">${tag.startsWith('#')?tag:'#'+tag}</td>
                    <td style="font-weight:700; color:${pts>=50?'#d68910':pts>=20?'#8e44ad':'var(--gray-900)'};">${pts}</td>
                    <td style="color:${pts>=50?'var(--green)':'var(--gray-400)'};">${pts>=50?'✓':`${50-pts}↑`}</td>
                    <td style="color:${pts>=75?'var(--green)':'var(--gray-400)'};">${pts>=75?'✓':`${75-pts}↑`}</td>
                    <td style="color:${pts>=100?'var(--green)':'var(--gray-400)'};">${pts>=100?'✓':`${100-pts}↑`}</td>
                </tr>`).join('')}
                </tbody>
            </table>
        </div>` : ''}
      </div>

      <!-- Infobox lateral -->
      <div>
        <div class="infobox">
            <div class="infobox-header" style="background:${tc.border};">${displayName}</div>
            <img src="${imgPJ(nombre)}" onerror="${onErr}">
            <table>
                <tr><td>PAC Total</td><td style="color:${tc.text}; font-weight:700;">${pac}</td></tr>
                <tr><td>Tier</td><td style="color:${tc.text}; font-weight:700;">${tc.label}</td></tr>
                <tr><td>POT</td><td>${p.pot||0}</td></tr>
                <tr><td>AGI</td><td>${p.agi||0}</td></tr>
                <tr><td>CTL</td><td>${p.ctl||0}</td></tr>
                <tr><td>PV</td><td>${p.pv_actual??pvMax} / ${pvMax}</td></tr>
                <tr><td>Cambios/turno</td><td>${cambios}</td></tr>
                <tr><td>PT Total</td><td style="color:#2980b9; font-weight:700;">${Object.values(ptPJ).reduce((a,b)=>a+b,0)}</td></tr>
            </table>
            <div style="padding:6px 10px 4px; font-size:0.72em; font-weight:700; color:var(--gray-700); text-transform:uppercase;">Tags</div>
            <div class="infobox-tags">
                ${(p.tags||[]).map(t =>
                    `<span style="background:var(--gray-100);border:1px solid var(--booru-border);color:var(--booru-link);padding:2px 6px;border-radius:3px;font-size:0.72em;">${t.startsWith('#')?t:'#'+t}</span>`
                ).join('') || '<span style="color:var(--gray-400); font-size:0.78em;">—</span>'}
            </div>
        </div>
      </div>
    </div>`;
}

function escHTML(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
