// ============================================================
// fichas-ui.js — Catálogo y Detalle centrado en GRUPOS
// ============================================================
import { gruposGlobal, aliasesGlobal, ptGlobal, hilosGlobal, fichasUI, STORAGE_URL, norm } from './fichas-state.js';
import { guardarTagsGrupo, borrarPTDeTag } from './fichas-data.js';
import { calcTier, calcPVMax, calcCambios, colorTier, buildTagIndex, fmtTag } from './fichas-logic.js';
import { estaEnFusion, getFusionDe, renderFusionBadge } from '../bnh-fusion.js';
import { TAGS_CANONICOS, initTags } from '../bnh-tags.js';
import { renderMarkup } from './fichas-markup.js';

// Inicializar tags del catálogo en cuanto carga el módulo
initTags();

const $ = id => document.getElementById(id);
const fallback = `${STORAGE_URL}/imginterfaz/no_encontrado.png`;
const onErr    = `this.onerror=null;this.src='${fallback}'`;

// Imagen: siempre usa nombre_refinado (aliases no tienen imagen propia)
function imgGrupo(grupo) {
    return urlIcono(grupo.nombre_refinado);
}

// ── Filtrar GRUPOS según estado de fichasUI ───────────────────
export function getGruposFiltrados(postersDelHilo) {
    let lista = [...gruposGlobal];

    // Filtro de hilo: el grupo aparece si alguno de sus aliases participó
    if (postersDelHilo && fichasUI.hiloFiltro !== 'todos') {
        lista = lista.filter(g => {
            const misAliases = aliasesGlobal
                .filter(a => a.refinado_id === g.id)
                .map(a => a.nombre);
            return misAliases.some(a =>
                a.split(',').map(x=>x.trim()).some(x => postersDelHilo.has(x))
            );
        });
    }

    // Filtro por tags (AND)
    if (fichasUI.tagsFiltro.length > 0) {
        lista = lista.filter(g => {
            const tagsG = (g.tags||[]).map(t=>(t.startsWith('#')?t:'#'+t).toLowerCase());
            return fichasUI.tagsFiltro.every(tf => tagsG.includes(tf.toLowerCase()));
        });
    }

    // Filtro por nombre (busca en nombre del grupo Y en sus aliases)
    if (fichasUI.nombreBusqueda?.trim()) {
        const q = fichasUI.nombreBusqueda.trim().toLowerCase();
        lista = lista.filter(g => {
            if (g.nombre_refinado.toLowerCase().includes(q)) return true;
            // También busca en aliases del grupo
            const misAliases = aliasesGlobal
                .filter(a => a.refinado_id === g.id)
                .map(a => a.nombre.toLowerCase());
            return misAliases.some(a => a.includes(q));
        });
    }

    return lista;
}

// ── Sidebar ───────────────────────────────────────────────────
export function renderSidebar() {
    const sidebar = $('fichas-sidebar');
    if (!sidebar) return;

    // Índice de tags basado en grupos cargados
    const tagIndex = buildTagIndex(gruposGlobal);

    // Añadir tags del catálogo que ningún grupo tiene aún (count 0)
    TAGS_CANONICOS.forEach(t => {
        const k = t.startsWith('#') ? t : '#' + t;
        if (!(k in tagIndex)) tagIndex[k] = 0;
    });

    // Ordenar: con personajes primero (desc count), luego los 0 alfabéticamente
    let tagEntries = Object.entries(tagIndex).sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
    });

    if (fichasUI.tagBusqueda) {
        const q = fichasUI.tagBusqueda.toLowerCase();
        tagEntries = tagEntries.filter(([t]) => t.toLowerCase().includes(q));
    }

    const hilosOpts = hilosGlobal.map(h =>
        `<option value="${h.thread_id}" ${fichasUI.hiloFiltro==h.thread_id?'selected':''}>
            ${h.titulo||'Hilo #'+h.thread_id}</option>`
    ).join('');

    sidebar.innerHTML = `
    ${fichasUI.esAdmin ? `
    <div class="sidebar-section">
        <div class="sidebar-section-title">Admin</div>
        <button class="btn btn-green btn-sm" style="width:100%;margin-bottom:6px;"
            onclick="window.abrirCrearGrupo()">+ Nuevo Grupo</button>
        <button class="btn btn-outline btn-sm" style="width:100%;margin-bottom:6px;"
            onclick="window.abrirGestorAliases()">⚙ Gestionar Aliases</button>
        <button class="btn btn-outline btn-sm" style="width:100%;margin-bottom:6px;"
            onclick="window._fichaAsignarAliasesGrupo()">🔗 Asignar alias de grupo</button>
        <button id="btn-modo-asignar" class="btn btn-sm" style="width:100%;${fichasUI.modoAsignar?'background:#d35400;color:white;border-color:#d35400;':''}"
            onclick="window._fichaModoAsignar()">
            ${fichasUI.modoAsignar ? '✏️ Modo Asignar: ON (click para salir)' : '✏️ Modo Asignar Tags'}
        </button>
        ${fichasUI.modoAsignar && fichasUI.tagsAsignar.size > 0
            ? `<div style="margin-top:6px;padding:6px 8px;background:#fff3e0;border:1px solid #d35400;border-radius:6px;font-size:0.8em;">
                Tags activos (<b>${fichasUI.tagsAsignar.size}</b>):<br>
                <b style="color:#d35400;">${[...fichasUI.tagsAsignar].join(', ')}</b><br>
                <span style="color:#888;">Click en ficha = asignar/desasignar</span></div>`
            : fichasUI.modoAsignar
                ? `<div style="margin-top:6px;padding:6px 8px;background:#fff3e0;border:1px solid #d35400;border-radius:6px;font-size:0.8em;color:#888;">Selecciona uno o más tags →</div>`
                : ''}
    </div>` : ''}

    <div class="sidebar-section">
        <div class="sidebar-section-title">Hilo</div>
        <select onchange="window._fichaSetHilo(this.value)"
            style="width:100%;padding:5px 8px;border:1px solid var(--booru-border);
                   border-radius:var(--radius);font-size:0.85em;background:var(--white);">
            <option value="todos" ${fichasUI.hiloFiltro==='todos'?'selected':''}>Todos los hilos</option>
            ${hilosOpts}
        </select>
    </div>

    <div class="sidebar-section">
        <div class="sidebar-section-title">Buscar personaje</div>
        <input type="text" class="sidebar-search" placeholder="Nombre o alias..."
            value="${fichasUI.nombreBusqueda||''}"
            oninput="window._fichaNombreSearch(this.value)"
            style="margin-bottom:0;">
    </div>

    <div class="sidebar-section">
        <div class="sidebar-section-title">Tags <span style="color:var(--gray-500);font-weight:400;">(${tagEntries.length})</span></div>
        <input type="text" class="sidebar-search" placeholder="Buscar tag..."
            value="${fichasUI.tagBusqueda}" oninput="window._fichaTagSearch(this.value)">
        <ul class="tag-list">
            ${tagEntries.map(([tag, cnt]) => {
                const activo = fichasUI.tagsFiltro.includes(tag);
                const esTagAsignar = fichasUI.modoAsignar && fichasUI.tagsAsignar.has(tag);
                const cero   = cnt === 0;
                const click  = cero ? '' : `onclick="window._fichaToggleTag('${tag.replace(/'/g, "\\'")}')"`; 
                const estilo = (esTagAsignar || activo) ? 'color:var(--red);font-weight:700;' : cero ? 'color:var(--gray-400);' : '';
                return `<li class="${activo||esTagAsignar?'active':''}" ${click} style="${cero?'opacity:0.45;cursor:default;':''}">
                    <span class="tag-link" style="${estilo}">${tag}</span>
                    <span class="tag-count">${cnt}</span>
                </li>`;
            }).join('')}
            ${!tagEntries.length ? `<li style="color:var(--gray-500);font-size:0.82em;padding:4px;">Sin tags</li>` : ''}
        </ul>
    </div>

    `;
}

export function renderActiveTagsBar() {
    const bar = $('active-tags-bar');
    if (!bar) return;
    if (!fichasUI.tagsFiltro.length) { bar.style.display='none'; return; }
    bar.style.display = 'flex';
    bar.innerHTML = `
    <span style="font-size:0.8em;color:var(--gray-500);">Filtros:</span>
    ${fichasUI.tagsFiltro.map(t=>`
        <span class="active-tag-chip">${t}
            <button onclick="window._fichaToggleTag('${t.replace(/'/g,"\\'")}')")>×</button>
        </span>`).join('')}
    <button onclick="window._fichaClearTags()"
        style="background:none;border:none;color:var(--red);font-size:0.82em;cursor:pointer;text-decoration:underline;margin-left:4px;">Limpiar</button>`;
}

// ── CATÁLOGO ──────────────────────────────────────────────────
export function renderCatalogo(postersDelHilo) {
    const cont = $('fichas-grid-area');
    if (!cont) return;

    const lista = getGruposFiltrados(postersDelHilo);
    const infoEl = $('fichas-count-info');
    if (infoEl) infoEl.textContent = `${lista.length} personaje${lista.length!==1?'s':''}`;

    if (!lista.length) {
        cont.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
            <div class="empty-icon">👤</div>
            <h3>${fichasUI.tagsFiltro.length||fichasUI.nombreBusqueda?'Sin coincidencias':'No hay personajes'}</h3>
            ${fichasUI.tagsFiltro.length||fichasUI.nombreBusqueda?`<p><a href="#" onclick="window._fichaClearAll();return false;" style="color:var(--booru-link);">Limpiar filtros</a></p>`:''}
        </div>`;
        return;
    }

    cont.innerHTML = lista.map(g => {
        const pot  = g.pot||0, agi = g.agi||0, ctl = g.ctl||0;
        const { tier } = calcTier(pot, agi, ctl);
        const pvMax    = calcPVMax(pot, agi, ctl);
        const pac      = pot+agi+ctl;
        const tc       = colorTier(tier);
        const pvA      = g.pv_actual ?? pvMax;
        const pvPct    = pvMax>0 ? Math.round((pvA/pvMax)*100) : 100;
        const pvCls    = pvPct<25?'pv-crit':pvPct<60?'pv-warn':'';
        const enFusion = estaEnFusion(g.nombre_refinado);
        const safeN    = g.nombre_refinado.replace(/'/g,"\\'");

        // Aliases de este grupo (para mostrar como subtítulo)
        const misAliases = aliasesGlobal
            .filter(a => a.refinado_id === g.id)
            .map(a => a.nombre).join(', ');

        const tagsPreview = (g.tags||[]).slice(0,5)
            .map(t=>`<span class="ficha-tag-mini">${t.replace(/^#/,'')}</span>`).join('');

        // Modo asignar: detectar qué tags del Set activo ya tiene este grupo
        const enModoAsignar = fichasUI.modoAsignar && fichasUI.tagsAsignar.size > 0;
        const tagsGrupoNorm = (g.tags||[]).map(t => (t.startsWith('#')?t:'#'+t).toLowerCase());
        const tagsConAsignados = enModoAsignar
            ? [...fichasUI.tagsAsignar].filter(tag => tagsGrupoNorm.includes(tag.toLowerCase()))
            : [];
        const tieneAlgunTagActivo = tagsConAsignados.length > 0;
        const cardBorder = tieneAlgunTagActivo
            ? 'outline:3px solid #27ae60;outline-offset:-2px;background:rgba(39,174,96,0.13);'
            : enModoAsignar ? 'opacity:0.7;' : '';
        const cardClick = fichasUI.modoAsignar
            ? `window._fichaAsignarTagClick('${safeN}')`
            : `window.abrirFicha('${safeN}')`;

        return `
        <div class="ficha-card" onclick="${cardClick}" style="position:relative;${cardBorder}">
            ${tieneAlgunTagActivo ? `<div style="position:absolute;top:4px;left:4px;z-index:10;background:#27ae60;color:white;font-size:0.65em;font-weight:700;padding:2px 7px;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,0.18);">✓ ${tagsConAsignados.join(' ')}</div>` : ''}
            <div class="ficha-img-wrap">
                <img class="ficha-img" src="${imgGrupo(g)}" onerror="${onErr}" loading="lazy">
                <div class="ficha-tier-badge" style="background:${tc.bg};color:${tc.text};border:1px solid ${tc.border};">T${tier}</div>
                ${enFusion?`<div style="position:absolute;bottom:4px;right:4px;">${renderFusionBadge(g.nombre_refinado,STORAGE_URL,norm)}</div>`:''}
            </div>
            <div class="ficha-info">
                <div class="ficha-name" title="${g.nombre_refinado}">${g.nombre_refinado}</div>
                ${misAliases?`<div style="font-size:0.68em;color:var(--gray-400);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${misAliases}">${misAliases}</div>`:''}
                <div class="ficha-pac">PAC ${pac} · PV ${pvA}/${pvMax}</div>
                <div class="pv-bar"><div class="pv-fill ${pvCls}" style="width:${pvPct}%"></div></div>
                <div class="ficha-tags-preview" style="margin-top:4px;">${tagsPreview}</div>
            </div>
            ${fichasUI.esAdmin?`
            <button onclick="event.stopPropagation();window.abrirPanelOP('${safeN}')"
                style="position:absolute;bottom:5px;right:5px;background:rgba(30,132,73,0.85);
                       color:#fff;border:none;border-radius:3px;padding:2px 7px;font-size:0.68em;
                       cursor:pointer;font-weight:700;">OP</button>
            <button onclick="event.stopPropagation();window._fichasAbrirUpload('${safeN}')"
                class="ficha-upload-btn" title="Subir imagen">📷</button>`:''}
        </div>`;
    }).join('');
}

// ── DETALLE ───────────────────────────────────────────────────
export function renderDetalle(nombreGrupo) {
    const cont = $('fichas-contenido');
    if (!cont) return;

    const g = gruposGlobal.find(x => x.nombre_refinado === nombreGrupo);
    if (!g) { window.volverCatalogo(); return; }

    const pot  = g.pot||0, agi = g.agi||0, ctl = g.ctl||0;
    const { tier } = calcTier(pot, agi, ctl);
    const pvMax    = calcPVMax(pot, agi, ctl);
    const pac      = pot+agi+ctl;
    const cambios  = calcCambios(agi);
    const tc       = colorTier(tier);
    const fusion   = getFusionDe(nombreGrupo);
    const ptG      = ptGlobal[nombreGrupo] || {};
    const safeN    = nombreGrupo.replace(/'/g,"\\'");

    const misAliases = aliasesGlobal.filter(a=>a.refinado_id===g.id).map(a=>a.nombre);
    const potA = g.pot_actual ?? pot;
    const agiA = g.agi_actual ?? agi;
    const ctlA = g.ctl_actual ?? ctl;

    function statDisplay(total, actual) {
        return actual === total ? `${total}` : `<span style="color:#2980b9;">${actual}</span>/${total}`;
    }

    const tagsOrdenados = [...(g.tags||[])].sort((a,b)=>(ptG[b]||0)-(ptG[a]||0));

    cont.innerHTML = `
    <div class="detalle-layout">
      <div>
        <a class="detalle-back" onclick="window.volverCatalogo()">← Volver</a>
        <div class="detalle-titulo">
            ${g.nombre_refinado}
            ${fusion ? renderFusionBadge(nombreGrupo, STORAGE_URL, norm) : ''}
            ${fichasUI.esAdmin?`
            <button onclick="window.abrirPanelOP('${safeN}')" class="btn btn-green btn-sm" style="margin-left:auto;">⚙️ Panel OP</button>
            <button onclick="window._fichasAbrirUpload('${safeN}')" class="btn btn-sm" style="background:#1a4a80;border-color:#2980b9;color:white;">📷 Imagen</button>
            `:''}
        </div>

        ${misAliases.length?`
        <div style="color:var(--gray-500);font-size:0.82em;margin-bottom:14px;">
            Aliases: <b style="color:var(--gray-700);">${misAliases.join(', ')}</b>
        </div>`:''}

        <div class="wiki-section">
            <div class="wiki-section-header">Tags del Quirk</div>
            <div class="tags-detalle">
                ${tagsOrdenados.map(t=>{
                    const pts=ptG[t]||0, tf=t.startsWith('#')?t:'#'+t;
                    return `<span class="tag-detalle" onclick="window._fichaToggleTagYVolver('${tf.replace(/'/g,"\\'")}')" title="${pts} PT">
                        ${tf}<span class="tag-detalle-pts">${pts}pt</span></span>`;
                }).join('')||'<span style="color:var(--gray-500);">Sin tags</span>'}
            </div>
        </div>

        ${fusion?`
        <div class="wiki-section">
            <div class="wiki-section-header" style="background:#6c3483;">⚡ Fusión Activa</div>
            <div style="padding:12px 14px;">
                <p style="color:#6c3483;font-weight:600;margin-bottom:8px;">Con: <b>${fusion.pj_a===nombreGrupo?fusion.pj_b:fusion.pj_a}</b></p>
                <div style="display:flex;flex-wrap:wrap;gap:4px;">
                    ${(fusion.tags_fusionados||[]).map(t=>`<span style="background:#f5eeff;border:1px solid #9b59b6;color:#6c3483;padding:2px 8px;border-radius:8px;font-size:0.78em;">${t.startsWith('#')?t:'#'+t}</span>`).join('')}
                </div>
                ${fichasUI.esAdmin?`<button onclick="window._opTerminarFusion('${fusion.id}')" class="op-btn op-btn-red" style="margin-top:10px;font-size:0.78em;">✕ Terminar</button>`:''}
            </div>
        </div>`:''}

        ${g.lore?`<div class="wiki-section"><div class="wiki-section-header">Historia</div><div class="wiki-section-body" style="white-space:normal;">${renderMarkup(g.lore)}</div></div>`:''}
        ${g.quirk?`<div class="wiki-section"><div class="wiki-section-header">Quirk</div><div class="wiki-section-body" style="white-space:normal;">${renderMarkup(g.quirk)}</div></div>`:''}

        ${Object.keys(ptG).length?`
        <div class="wiki-section">
            <div class="wiki-section-header">Progresión — Puntos de Tag</div>
            <table class="pt-table">
                <thead><tr><th>Tag</th><th>PT</th><th>Stat (50)</th><th>Medalla (75)</th><th>Mutación (100)</th></tr></thead>
                <tbody>${Object.entries(ptG).sort((a,b)=>b[1]-a[1]).map(([tag,pts])=>`
                <tr>
                    <td style="color:var(--booru-link);font-weight:600;">${tag.startsWith('#')?tag:'#'+tag}</td>
                    <td style="font-weight:700;color:${pts>=50?'#d68910':pts>=20?'#8e44ad':'var(--gray-900)'};">${pts}</td>
                    <td style="color:${pts>=50?'var(--green)':'var(--gray-400)'};">${pts>=50?'✓':`${50-pts}↑`}</td>
                    <td style="color:${pts>=75?'var(--green)':'var(--gray-400)'};">${pts>=75?'✓':`${75-pts}↑`}</td>
                    <td style="color:${pts>=100?'var(--green)':'var(--gray-400)'};">${pts>=100?'✓':`${100-pts}↑`}</td>
                </tr>`).join('')}</tbody>
            </table>
        </div>`:''} 
      </div>

      <div>
        <div class="infobox">
            <div class="infobox-header" style="background:${tc.border};">${g.nombre_refinado}</div>
            <img src="${urlProfile(g.nombre_refinado)}"
                onerror="this.onerror=null;this.src='${fallback}';"
                style="width:100%;height:auto;display:block;border-bottom:1px solid var(--booru-border);">
            <table>
                <tr><td>PAC</td><td style="color:${tc.text};font-weight:700;">${pac}</td></tr>
                <tr><td>Tier</td><td style="color:${tc.text};font-weight:700;">${tc.label}</td></tr>
                <tr><td>POT</td><td>${statDisplay(pot,potA)}</td></tr>
                <tr><td>AGI</td><td>${statDisplay(agi,agiA)}</td></tr>
                <tr><td>CTL</td><td>${statDisplay(ctl,ctlA)}</td></tr>
                <tr><td>PV</td><td>${g.pv_actual??pvMax} / ${pvMax}</td></tr>
                <tr><td>Cambios/t</td><td>${cambios}</td></tr>
                <tr><td>PT Total</td><td style="color:#2980b9;font-weight:700;">${Object.values(ptG).reduce((a,b)=>a+b,0)}</td></tr>
            </table>
            <div style="padding:6px 10px 4px;font-size:0.72em;font-weight:700;color:var(--gray-700);text-transform:uppercase;">Tags</div>
            <div class="infobox-tags">
                ${(g.tags||[]).map(t=>`<span style="background:var(--gray-100);border:1px solid var(--booru-border);color:var(--booru-link);padding:2px 6px;border-radius:3px;font-size:0.72em;">${t.startsWith('#')?t:'#'+t}</span>`).join('')||'<span style="color:var(--gray-400);font-size:0.78em;">—</span>'}
            </div>
            ${misAliases.length?`
            <div style="padding:6px 10px 8px;border-top:1px solid var(--gray-200);">
                <div style="font-size:0.72em;font-weight:700;color:var(--gray-700);text-transform:uppercase;margin-bottom:4px;">Aliases en hilo</div>
                ${misAliases.map(a=>`<div style="font-size:0.78em;color:var(--gray-600);">${a}</div>`).join('')}
            </div>`:''}
        </div>
      </div>
    </div>`;
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Panel lateral de subida de imagen ─────────────────────────
export function renderUploadPanel(nombreGrupo) {
    const panel = document.getElementById('fichas-upload-panel');
    if (!panel) return;

    if (panel.dataset.grupo === nombreGrupo && panel.style.display !== 'none') {
        cerrarUploadPanel();
        return;
    }

    panel.dataset.grupo = nombreGrupo;
    panel.dataset.tipo  = panel.dataset.tipo || 'icon';
    panel.style.display = 'flex';

    const SURL = STORAGE_URL;
    const tipo = panel.dataset.tipo;

    panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-weight:700;color:var(--green-dark);font-family:'Cinzel',serif;font-size:0.95em;">
            📷 ${nombreGrupo}
        </span>
        <button onclick="window._fichasCerrarUpload()"
            style="background:none;border:none;font-size:1.4em;cursor:pointer;color:#aaa;line-height:1;">×</button>
    </div>

    <div class="upload-tipo-sel">
        <button class="upload-tipo-btn ${tipo==='icon'?'active':''}"
            onclick="window._fichasSetTipo('icon')">
            🖼 Icono<br><span style="font-weight:400;font-size:0.85em;color:var(--gray-500);">Tarjeta · 512px</span>
        </button>
        <button class="upload-tipo-btn ${tipo==='profile'?'active':''}"
            onclick="window._fichasSetTipo('profile')">
            👤 Profile<br><span style="font-weight:400;font-size:0.85em;color:var(--gray-500);">Detalle · 800px</span>
        </button>
    </div>

    <div style="margin-bottom:10px;text-align:center;">
        <img id="upload-preview-img"
            src="${tipo==='icon'
                ? SURL+'/imgpersonajes/'+norm(nombreGrupo)+'icon.png'
                : SURL+'/imgpersonajes/'+norm(nombreGrupo)+'profile.png'}?v=${Date.now()}"
            onerror="this.onerror=null;this.src='${SURL}/imginterfaz/no_encontrado.png';"
            style="width:100%;max-height:150px;object-fit:cover;object-position:top;
                   border-radius:6px;border:1px solid var(--booru-border);">
        <div style="font-size:0.7em;color:var(--gray-400);margin-top:4px;">Actual</div>
    </div>

    <div class="fichas-dropzone" id="fichas-drop-zone"
        onclick="document.getElementById('fichas-file-input').click()"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="window._fichasHandleDrop(event)">
        <div style="font-size:1.6em;margin-bottom:4px;">🖼️</div>
        <div style="font-size:0.8em;color:var(--green-dark);font-weight:600;">Arrastra aquí o click</div>
        <div style="font-size:0.7em;color:var(--gray-400);margin-top:2px;">JPG · PNG · WEBP</div>
    </div>

    <input type="file" id="fichas-file-input" accept="image/*" style="display:none"
        onchange="window._fichasHandleFile(event)">

    <div id="fichas-upload-progress" style="display:none;margin-bottom:8px;">
        <div class="fichas-prog-bar">
            <div id="fichas-prog-fill" class="fichas-prog-fill"></div>
        </div>
        <div id="fichas-prog-msg" style="font-size:0.72em;text-align:center;color:var(--gray-500);"></div>
    </div>`;
}

export function cerrarUploadPanel() {
    const panel = document.getElementById('fichas-upload-panel');
    if (panel) { panel.style.display = 'none'; panel.dataset.grupo = ''; }
}
