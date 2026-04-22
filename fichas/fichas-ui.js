// ============================================================
// fichas-ui.js — Catálogo y Detalle centrado en GRUPOS
// ============================================================
import { gruposGlobal, aliasesGlobal, ptGlobal, hilosGlobal, fichasUI, STORAGE_URL, norm } from './fichas-state.js';
import { guardarTagsGrupo, borrarPTDeTag, opcionesFusion, bannedTags } from './fichas-data.js';
import { calcTier, calcPVMax, calcCambios, colorTier, buildTagIndex, fmtTag, proyectarFicha } from './fichas-logic.js';
import { estaEnFusion, getFusionDe, renderFusionBadge } from '../bnh-fusion.js';
import { TAGS_CANONICOS, initTags } from '../bnh-tags.js';
import { renderMarkup } from './fichas-markup.js';
import { supabase } from '../bnh-auth.js';

// ⚡ IMPORTANTE: Conectar con el PAC para el CTL real
import { calcCTLUsadoPJ, setSupabaseRef } from '../bnh-pac.js';
setSupabaseRef(supabase);

// Inicializar tags del catálogo en cuanto carga el módulo
initTags();

const $ = id => document.getElementById(id);
const fallback = `${STORAGE_URL}/imginterfaz/no_encontrado.png`;
const onErr    = `this.onerror=null;this.src='${fallback}'`;

// ⚡ Helper: Muestra cadena de hasta 5 deltas con etiquetas de colores (badges)
function _fmtDChain(base, total, deltas) {
    const activos = (deltas || []).filter(d => d && String(d).trim() !== '0');
    if (!activos.length || base === total) return String(total);
    
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
    return `${total} <span style="display:inline-flex; align-items:center; vertical-align:middle; flex-wrap:wrap; margin-top:-2px; margin-left:4px;">${badgesHtml}</span>`;
}

// Helper legacy de un solo delta — conservado por compatibilidad
function _fmtD(base, total, deltaStr) {
    return _fmtDChain(base, total, [deltaStr]);
}

// Imagen: siempre usa nombre_refinado (aliases no tienen imagen propia)
function imgGrupo(grupo) {
    return `${STORAGE_URL}/imgpersonajes/${norm(grupo.nombre_refinado)}icon.png`;
}
function urlProfile(nombreRefinado) {
    return `${STORAGE_URL}/imgpersonajes/${norm(nombreRefinado)}profile.png`;
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

    // Filtro por rol (#Jugador / #NPC)
    if (fichasUI.filtroRol && fichasUI.filtroRol !== 'todos') {
        lista = lista.filter(g => (g.tags||[]).some(t =>
            (t.startsWith('#')?t:'#'+t).toLowerCase() === fichasUI.filtroRol.toLowerCase()
        ));
    }

    // Filtro por estado (#Activo / #Inactivo)
    if (fichasUI.filtroEstado && fichasUI.filtroEstado !== 'todos') {
        lista = lista.filter(g => (g.tags||[]).some(t =>
            (t.startsWith('#')?t:'#'+t).toLowerCase() === fichasUI.filtroEstado.toLowerCase()
        ));
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
        <button id="btn-modo-asignar" class="btn btn-sm" style="width:100%;${fichasUI.modoInverso?'background:#6c3483;color:white;border-color:#6c3483;':fichasUI.modoAsignar?'background:#d35400;color:white;border-color:#d35400;':''}"
            onclick="window._fichaModoAsignar()">
            ${fichasUI.modoInverso ? '🔄 Modo Inverso: ON' : fichasUI.modoAsignar ? '✏️ Modo Asignar: ON' : '✏️ Modo Asignar Tags'}
        </button>
        ${fichasUI.modoInverso
            ? `<div style="margin-top:6px;padding:6px 8px;background:#f5eeff;border:1px solid #9b59b6;border-radius:6px;font-size:0.8em;">
                ${fichasUI.grupoAsignar
                    ? `Personaje: <b style="color:#6c3483;">${fichasUI.grupoAsignar}</b><br><span style="color:#888;">Click tag = asignar/desasignar</span>`
                    : `<span style='color:#888;'>Click en una ficha para seleccionarla</span>`}
            </div>`
            : fichasUI.modoAsignar && fichasUI.tagsAsignar.size > 0
            ? `<div style="margin-top:6px;padding:6px 8px;background:#fff3e0;border:1px solid #d35400;border-radius:6px;font-size:0.8em;">
                Tags: <b style="color:#d35400;">${[...fichasUI.tagsAsignar].join(', ')}</b><br>
                <span style="color:#888;">Click en ficha = asignar/desasignar</span></div>`
            : fichasUI.modoAsignar
                ? `<div style="margin-top:6px;padding:6px 8px;background:#fff3e0;border:1px solid #d35400;border-radius:6px;font-size:0.8em;"><span style='color:#888;'>Selecciona tags del sidebar</span></div>`
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
        <input type="text" id="nombre-buscar-inp" class="sidebar-search" placeholder="Nombre o alias..."
            value="${fichasUI.nombreBusqueda||''}"
            oninput="window._fichaNombreSearch(this.value)"
            autofocus
            style="margin-bottom:0;">
    </div>

    <div class="sidebar-section">
        <div class="sidebar-section-title">Filtros</div>
        <div style="display:flex;gap:3px;margin-bottom:6px;flex-wrap:wrap;">
            <button class="btn btn-sm ${fichasUI.filtroRol==='todos'?'btn-green':'btn-outline'}" style="flex:1;font-size:0.72em;padding:3px 4px;" onclick="window._fichaFiltroRol('todos')">Todos</button>
            <button class="btn btn-sm ${fichasUI.filtroRol==='#Jugador'?'btn-green':'btn-outline'}" style="flex:1;font-size:0.72em;padding:3px 4px;" onclick="window._fichaFiltroRol('#Jugador')">Jugador</button>
            <button class="btn btn-sm ${fichasUI.filtroRol==='#NPC'?'btn-green':'btn-outline'}" style="flex:1;font-size:0.72em;padding:3px 4px;" onclick="window._fichaFiltroRol('#NPC')">NPC</button>
        </div>
        <div style="display:flex;gap:3px;flex-wrap:wrap;">
            <button class="btn btn-sm ${fichasUI.filtroEstado==='todos'?'btn-green':'btn-outline'}" style="flex:1;font-size:0.72em;padding:3px 4px;" onclick="window._fichaFiltroEstado('todos')">Todos</button>
            <button class="btn btn-sm ${fichasUI.filtroEstado==='#Activo'?'btn-green':'btn-outline'}" style="flex:1;font-size:0.72em;padding:3px 4px;" onclick="window._fichaFiltroEstado('#Activo')">Activo</button>
            <button class="btn btn-sm ${fichasUI.filtroEstado==='#Inactivo'?'btn-green':'btn-outline'}" style="flex:1;font-size:0.72em;padding:3px 4px;" onclick="window._fichaFiltroEstado('#Inactivo')">Inactivo</button>
        </div>
    </div>

    <div class="sidebar-section">
        <div class="sidebar-section-title">Tags <span style="color:var(--gray-500);font-weight:400;">(${tagEntries.length})</span></div>
        <input id="sidebar-tag-search" type="text" class="sidebar-search" placeholder="Buscar tag..."
            value="${fichasUI.tagBusqueda}" oninput="window._fichaTagSearch(this.value)">
        <ul class="tag-list" id="sidebar-tag-list">
            ${tagEntries.map(([tag, cnt]) => {
                const activo = fichasUI.tagsFiltro.includes(tag);
                const esTagAsignar = fichasUI.modoAsignar && fichasUI.tagsAsignar.has(tag);
                // In inverso mode: show if selected grupo has this tag
                const grupoSel = fichasUI.modoInverso && fichasUI.grupoAsignar
                    ? gruposGlobal.find(g => g.nombre_refinado === fichasUI.grupoAsignar)
                    : null;
                const grupoTieneTag = grupoSel && (grupoSel.tags||[]).some(t =>
                    (t.startsWith('#')?t:'#'+t).toLowerCase() === tag.toLowerCase()
                );
                const cero   = cnt === 0;
                const click  = cero ? '' : `onclick="window._fichaToggleTag('${tag.replace(/'/g, "\\'")}')"`; 
                const estilo = fichasUI.modoInverso && grupoSel
                    ? grupoTieneTag ? 'color:var(--green);font-weight:700;' : ''
                    : (esTagAsignar || activo) ? 'color:var(--red);font-weight:700;' : cero ? 'color:var(--gray-400);' : '';
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

    cont.innerHTML = lista.map(grupoCrudo => {
        // 1. PROYECCIÓN: Toma el grupo crudo de Supabase y le aplica todos los deltas y fusiones
        const g = proyectarFicha(grupoCrudo, gruposGlobal, ptGlobal, opcionesFusion, bannedTags);
        
        // 2. Extraer totales calculados
        const pot      = g.pot_total;
        const agi      = g.agi_total;
        const ctl      = g.ctl_total;
        const { tier } = calcTier(pot, agi, ctl);
        const pvMax    = g.pv_total;
        const pac      = g.pac_total;
        const tc       = colorTier(tier);
        const pvA      = g.pv_actual_total; // Maneja null y delta interno
        
        const pvPct    = pvMax > 0 ? Math.round((pvA/pvMax)*100) : 100;
        const pvCls    = pvPct < 25 ? 'pv-crit' : pvPct < 60 ? 'pv-warn' : '';
        const enFusion = estaEnFusion(g.nombre_refinado);
        const safeN    = g.nombre_refinado.replace(/'/g,"\\'");

        // Aliases de este grupo
        const misAliases = aliasesGlobal
            .filter(a => a.refinado_id === g.id)
            .map(a => a.nombre).join(', ');

        const tagsPreview = (g.tags||[]).slice(0,5)
            .map(t=>`<span class="ficha-tag-mini">${t.replace(/^#/,'')}</span>`).join('');

        // Modo asignar
        const enModoAsignar = fichasUI.modoAsignar && fichasUI.tagsAsignar.size > 0;
        const tagsGrupoNorm = (g.tags||[]).map(t => (t.startsWith('#')?t:'#'+t).toLowerCase());
        const tagsConAsignados = enModoAsignar
            ? [...fichasUI.tagsAsignar].filter(tag => tagsGrupoNorm.includes(tag.toLowerCase()))
            : [];
        const tieneAlgunTagActivo = tagsConAsignados.length > 0;
        const esGrupoSeleccionado = fichasUI.modoInverso && fichasUI.grupoAsignar === g.nombre_refinado;
        
        const cardBorder = esGrupoSeleccionado
            ? 'outline:3px solid #9b59b6;outline-offset:-2px;background:rgba(155,89,182,0.1);'
            : tieneAlgunTagActivo
            ? 'outline:3px solid #27ae60;outline-offset:-2px;background:rgba(39,174,96,0.13);'
            : (enModoAsignar || fichasUI.modoInverso) ? 'opacity:0.7;' : '';
            
        const cardClick = fichasUI.modoInverso
            ? `window._fichaInversoClick('${safeN}')`
            : fichasUI.modoAsignar
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

// ⚡ Convertimos a async para poder hacer await al cálculo del CTL Usado desde Supabase
export async function renderDetalle(grupoCrudo, htmlLore) {
    const wrap = $('fichas-detalle-wrap');
    const cont = $('fichas-contenido');
    if (!wrap || !cont || !grupoCrudo) return;

    // 1. PROYECCIÓN: Le pasamos todas las variables globales
    const g = proyectarFicha(grupoCrudo, gruposGlobal, ptGlobal, opcionesFusion, bannedTags);
    if (!g) return;

    const proy = g; 
    const nombreGrupo = g.nombre_refinado;
    const safeN = nombreGrupo.replace(/'/g,"\\'");
    const fusion = getFusionDe(nombreGrupo);

    // ⚡ Consultamos al PAC el costo de las medallas equipadas (Esto usa caché si existe)
    const ctlUsado = await calcCTLUsadoPJ(nombreGrupo);

    // 2. Extraemos los valores calculados
    const pot = g.pot_total;
    const agi = g.agi_total;
    const ctl = g.ctl_total;
    const pvMax = g.pv_total;
    const pvActual = g.pv_actual_total;
    const cambios = g.cambios_total;
    const pac = g.pac_total;

    const { tier } = calcTier(pot, agi, ctl);
    const tc = colorTier(tier);

    // 3. Variables base para la visualización de la cadena de deltas
    const potA = g.pot_actual ?? pot;
    const agiA = g.agi_actual ?? agi;
    const ctlA = g.ctl_actual ?? ctl;
    
    const potChainBase = g.esFusion ? (g.pot_fusion_raw ?? (grupoCrudo.pot||0)) : (grupoCrudo.pot||0);
    const agiChainBase = g.esFusion ? (g.agi_fusion_raw ?? (grupoCrudo.agi||0)) : (grupoCrudo.agi||0);
    const ctlChainBase = g.esFusion ? (g.ctl_fusion_raw ?? (grupoCrudo.ctl||0)) : (grupoCrudo.ctl||0);
    
    const pvMaxBase = calcPVMax(grupoCrudo.pot||0, grupoCrudo.agi||0, grupoCrudo.ctl||0);
    const pvActualBase = (grupoCrudo.pv_actual !== null && grupoCrudo.pv_actual !== undefined) ? grupoCrudo.pv_actual : pvMaxBase;
    const cambiosBase = Math.floor((grupoCrudo.agi||0)/4);

    const misAliases = aliasesGlobal.filter(a => a.refinado_id === g.id).map(a => a.nombre);
    const ptG = g.ptsMapa || ptGlobal[nombreGrupo] || {};
    const tagsProy = g.tags || [];
    const tagsOrdenados = [...tagsProy].sort();
    const baseTagsNorm = (grupoCrudo.tags||[]).map(t => (t.startsWith('#')?t:'#'+t).toLowerCase());

    const statDisplay = (totalHTML, actualVal, baseVal) => {
        if (actualVal === undefined || actualVal === null || String(actualVal) === String(baseVal)) return totalHTML;
        return `<span style="color:#2980b9;">${actualVal}</span> / ${totalHTML}`;
    };
    
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
            `:'<span style="margin-left:auto;"></span>'}
            <button onclick="window.abrirEditarLore('${safeN}')" class="btn btn-sm" style="background:#6c757d;border-color:#6c757d;color:white;font-size:0.78em;padding:4px 10px;">📝 Editar lore</button>
        </div>

        ${misAliases.length?`
        <div style="color:var(--gray-500);font-size:0.82em;margin-bottom:14px;">
            Aliases: <b style="color:var(--gray-700);">${misAliases.join(', ')}</b>
        </div>`:''}

        <div class="wiki-section">
            <div class="wiki-section-header">Tags del Quirk</div>
            <div class="tags-detalle">
                ${tagsOrdenados.map(t=>{
                    const pts = ptG[t] || 0;
                    const tf = t.startsWith('#') ? t : '#' + t;
                    const normT = tf.toLowerCase();
                    const esFusionTag = proy.esFusion && !baseTagsNorm.includes(normT);
                    const extraStyle = esFusionTag ? 'border:1px solid #8e44ad; color:#8e44ad; background:#f5eeff;' : '';
                    const icon = esFusionTag ? '⚡ ' : '';
                    const extraPtsStyle = esFusionTag ? 'background:#8e44ad;color:white;' : '';
                    
                    return `<span class="tag-detalle" style="${extraStyle}" onclick="window._fichaToggleTagYVolver('${tf.replace(/'/g,"\\'")}')" title="${pts} PT">
                        ${icon}${tf}<span class="tag-detalle-pts" style="${extraPtsStyle}">${pts}pt</span></span>`;
                }).join('')||'<span style="color:var(--gray-500);">Sin tags</span>'}
            </div>
        </div>

${fusion?(()=>{
    const otro = fusion.pj_a===nombreGrupo?fusion.pj_b:fusion.pj_a;
    const comp = gruposGlobal.find(x => x.nombre_refinado === otro);
    if (!comp) return '';

    const compProj = proyectarFicha(comp, gruposGlobal, ptGlobal, opcionesFusion, bannedTags);
    const tierComp = calcTier(compProj.pot_total, compProj.agi_total, compProj.ctl_total).tier;

    return `
    <div class="wiki-section">
        <div class="wiki-section-header" style="background:#6c3483;">⚡ Fusión Activa</div>
        <div style="padding:12px 14px;">
            
            <div class="fusion-mini-card" onclick="window.abrirFicha('${otro.replace(/'/g,"\\'")}')">
                <img src="${imgGrupo(comp)}" class="fusion-mini-img">

                <div class="fusion-mini-info">
                    <div class="fusion-mini-name">${otro}</div>
                    <div class="fusion-mini-stats">
                        T${tierComp} | PV ${compProj.pv_actual_total}/${compProj.pv_total}
                        | ${compProj.pot_total}/${compProj.agi_total}/${compProj.ctl_total}
                    </div>
                </div>
            </div>

            ${fichasUI.esAdmin?`
            <button onclick="window._opTerminarFusion('${fusion.id}')" 
                class="op-btn op-btn-red" style="font-size:0.78em;margin-top:8px;">
                ✕ Terminar Fusión
            </button>`:''}

        </div>
    </div>`;
})():''}

        ${g.descripcion?`<div class="wiki-section"><div class="wiki-section-header">Descripción</div><div class="wiki-section-body" style="white-space:normal;">${renderMarkup(g.descripcion)}</div></div>`:''}
        ${g.lore?`<div class="wiki-section"><div class="wiki-section-header">Historia</div><div class="wiki-section-body" style="white-space:normal;">${renderMarkup(g.lore)}</div></div>`:''}
        ${g.personalidad?`<div class="wiki-section"><div class="wiki-section-header">Personalidad</div><div class="wiki-section-body" style="white-space:normal;">${renderMarkup(g.personalidad)}</div></div>`:''}
        ${g.quirk?`<div class="wiki-section"><div class="wiki-section-header">Quirk</div><div class="wiki-section-body" style="white-space:normal;">${renderMarkup(g.quirk)}</div></div>`:''}
<div class="wiki-section" id="medallas-section">
    <div class="wiki-section-header" style="background:#1a4a80;">Medallas</div>
    <div id="medallas-body" style="padding:14px;">
        <div style="display:flex;align-items:center;gap:8px;color:var(--gray-500);font-size:0.82em;">
            <div class="spinner" style="width:14px;height:14px;"></div> Cargando medallas…
        </div>
    </div>
</div>

        ${(Object.keys(ptG).length > 0 || tagsProy.length > 0)?`
        <div class="wiki-section">
<div class="wiki-section-header" style="background:#1e5631; display:flex; justify-content:space-between; align-items:center;">
    <span>Progresión — Puntos de Tag</span>
    <button class="btn btn-sm" 
        style="background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); color:white; padding:2px 8px; font-size:0.8em; cursor:pointer; border-radius:4px; transition:0.2s;"
        onmouseover="this.style.background='rgba(255,255,255,0.25)'"
        onmouseout="this.style.background='rgba(255,255,255,0.15)'"
        onclick="window._fichasCopiarTagsPT('${encodeURIComponent(JSON.stringify(ptG))}')">
        📋 Copiar
    </button>
</div>
            <table class="pt-table">
                <thead><tr><th>Tag</th><th>PT</th><th>Stat (50)</th><th>Medalla (75)</th><th>Mutación (100)</th></tr></thead>
                <tbody>${(()=>{
                    // Construir mapa unificado: PT real + tags del PJ con 0
                    const allPT = {...ptG};
                    tagsProy.forEach(t => {
                        const tf = t.startsWith('#') ? t : '#'+t;
                        if (!(tf in allPT) && !(t in allPT)) allPT[tf] = 0;
                    });
                    return Object.entries(allPT).sort((a,b)=>b[1]-a[1]).map(([tag,pts])=> {
                    const basePt = (ptGlobal[nombreGrupo] || {})[tag] || 0;
                    const esAlterado = proy.esFusion && pts !== basePt;
                    const icon = esAlterado ? '<span style="color:#8e44ad; margin-right:4px;" title="Alterado por Fusión">⚡</span>' : '';
                    const colorTxt = pts===0 ? 'var(--gray-400)' : esAlterado ? '#8e44ad' : (pts>=50?'#d68910':pts>=20?'#8e44ad':'var(--gray-900)');
                    
                    return `
                <tr style="${pts===0?'opacity:0.55;':''}">
                    <td style="color:var(--booru-link);font-weight:600;">${tag.startsWith('#')?tag:'#'+tag}</td>
                    <td style="font-weight:700;color:${colorTxt};">${icon}${pts}</td>
                    <td style="color:${pts>=50?'var(--green)':'var(--gray-400)'};">${pts>=50?'✓':`${50-pts}↑`}</td>
                    <td style="color:${pts>=75?'var(--green)':'var(--gray-400)'};">${pts>=75?'✓':`${75-pts}↑`}</td>
                    <td style="color:${pts>=100?'var(--green)':'var(--gray-400)'};">${pts>=100?'✓':`${100-pts}↑`}</td>
                </tr>`}).join('');
                })()}</tbody>
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
                <tr><td>POT</td><td>${statDisplay(_fmtDChain(potChainBase, pot, [1,2,3,4,5].map(n=>grupoCrudo['delta_pot_'+n])), potA, potChainBase)}</td></tr>
                <tr><td>AGI</td><td>${statDisplay(_fmtDChain(agiChainBase, agi, [1,2,3,4,5].map(n=>grupoCrudo['delta_agi_'+n])), agiA, agiChainBase)}</td></tr>
                
                <tr><td>CTL</td><td><span style="color:#2980b9;font-weight:600;">${ctlUsado}</span> / ${_fmtDChain(ctlChainBase, ctl, [1,2,3,4,5].map(n=>grupoCrudo['delta_ctl_'+n]))}</td></tr>
                
                <tr><td>PV</td><td>${_fmtDChain(pvActualBase, pvActual, [1,2,3,4,5].map(n=>grupoCrudo['delta_pv_actual_'+n]))} / ${_fmtDChain(pvMaxBase, pvMax, [1,2,3,4,5].map(n=>grupoCrudo['delta_pv_'+n]))}</td></tr>
                <tr><td>Cambios/t</td><td>${_fmtDChain(cambiosBase, cambios, [1,2,3,4,5].map(n=>grupoCrudo['delta_cambios_'+n]))}</td></tr>
                <tr><td>PT Total</td><td style="color:#2980b9;font-weight:700;">${Object.values(ptG).reduce((a,b)=>a+b,0)}</td></tr>
            </table>
            <div style="padding:6px 10px 4px;font-size:0.72em;font-weight:700;color:var(--gray-700);text-transform:uppercase;">Tags</div>
            <div class="infobox-tags">
                ${tagsProy.map(t=>{
                    const normT = (t.startsWith('#')?t:'#'+t).toLowerCase();
                    const esFusionTag = proy.esFusion && !baseTagsNorm.includes(normT);
                    const style = esFusionTag ? 'background:#f5eeff;border:1px solid #8e44ad;color:#8e44ad;' : 'background:var(--gray-100);border:1px solid var(--booru-border);color:var(--booru-link);';
                    const icon = esFusionTag ? '⚡' : '';
                    return `<span style="${style}padding:2px 6px;border-radius:3px;font-size:0.72em;">${icon}${t.startsWith('#')?t:'#'+t}</span>`;
                }).join('')||'<span style="color:var(--gray-400);font-size:0.78em;">—</span>'}
            </div>
            ${Object.values(g.info_extra||{}).some(v=>v)?`
            <div style="border-top:1px solid var(--gray-200);">
                <div style="padding:6px 10px 4px;font-size:0.72em;font-weight:700;color:var(--gray-700);text-transform:uppercase;">Información</div>
                <table style="width:100%;border-collapse:collapse;">
                ${(g.info_extra||{})['estado'] ? `<tr><td style="font-size:0.72em;font-weight:700;color:var(--gray-700);background:var(--gray-100);padding:4px 8px;white-space:nowrap;">Estado</td><td style="padding:4px 8px;font-size:0.78em;">${renderMarkup((g.info_extra||{})['estado'])}</td></tr>` : ''}
                ${(g.info_extra||{})['edad'] ? `<tr><td style="font-size:0.72em;font-weight:700;color:var(--gray-700);background:var(--gray-100);padding:4px 8px;white-space:nowrap;">Edad</td><td style="padding:4px 8px;font-size:0.78em;">${renderMarkup((g.info_extra||{})['edad'])}</td></tr>` : ''}
                ${(g.info_extra||{})['altura'] ? `<tr><td style="font-size:0.72em;font-weight:700;color:var(--gray-700);background:var(--gray-100);padding:4px 8px;white-space:nowrap;">Altura</td><td style="padding:4px 8px;font-size:0.78em;">${renderMarkup((g.info_extra||{})['altura'])}</td></tr>` : ''}
                ${(g.info_extra||{})['peso'] ? `<tr><td style="font-size:0.72em;font-weight:700;color:var(--gray-700);background:var(--gray-100);padding:4px 8px;white-space:nowrap;">Peso</td><td style="padding:4px 8px;font-size:0.78em;">${renderMarkup((g.info_extra||{})['peso'])}</td></tr>` : ''}
                ${(g.info_extra||{})['genero'] ? `<tr><td style="font-size:0.72em;font-weight:700;color:var(--gray-700);background:var(--gray-100);padding:4px 8px;white-space:nowrap;">Género</td><td style="padding:4px 8px;font-size:0.78em;">${renderMarkup((g.info_extra||{})['genero'])}</td></tr>` : ''}
                ${(g.info_extra||{})['lugar_nac'] ? `<tr><td style="font-size:0.72em;font-weight:700;color:var(--gray-700);background:var(--gray-100);padding:4px 8px;white-space:nowrap;">Lugar de nacimiento</td><td style="padding:4px 8px;font-size:0.78em;">${renderMarkup((g.info_extra||{})['lugar_nac'])}</td></tr>` : ''}
                ${(g.info_extra||{})['ocupacion'] ? `<tr><td style="font-size:0.72em;font-weight:700;color:var(--gray-700);background:var(--gray-100);padding:4px 8px;white-space:nowrap;">Ocupación</td><td style="padding:4px 8px;font-size:0.78em;">${renderMarkup((g.info_extra||{})['ocupacion'])}</td></tr>` : ''}
                ${(g.info_extra||{})['afiliacion'] ? `<tr><td style="font-size:0.72em;font-weight:700;color:var(--gray-700);background:var(--gray-100);padding:4px 8px;white-space:nowrap;">Afiliación</td><td style="padding:4px 8px;font-size:0.78em;">${renderMarkup((g.info_extra||{})['afiliacion'])}</td></tr>` : ''}
                ${(g.info_extra||{})['familia'] ? `<tr><td style="font-size:0.72em;font-weight:700;color:var(--gray-700);background:var(--gray-100);padding:4px 8px;white-space:nowrap;">Familia</td><td style="padding:4px 8px;font-size:0.78em;">${renderMarkup((g.info_extra||{})['familia'])}</td></tr>` : ''}
                ${(g.info_extra||{})['nota'] ? `<tr><td style="font-size:0.72em;font-weight:700;color:var(--gray-700);background:var(--gray-100);padding:4px 8px;white-space:nowrap;">Nota extra</td><td style="padding:4px 8px;font-size:0.78em;">${renderMarkup((g.info_extra||{})['nota'])}</td></tr>` : ''}
                </table>
            </div>`:'' }
            ${misAliases.length?`
            <div style="padding:6px 10px 8px;border-top:1px solid var(--gray-200);">
                <div style="font-size:0.72em;font-weight:700;color:var(--gray-700);text-transform:uppercase;margin-bottom:4px;">Aliases en hilo</div>
                ${misAliases.map(a=>`<div style="font-size:0.78em;color:var(--gray-600);">${a}</div>`).join('')}
            </div>`:''}
        </div>
      </div>
    </div>`;
_cargarMedallasEnFicha(nombreGrupo, proy, ctlUsado).catch(console.error);
}

// Carga y renderiza el catálogo de medallas del PJ en la sección de fusión
async function _cargarMedallasEnFicha(nombreGrupo, proy, ctlUsado) {
    const body = document.getElementById('medallas-body');
    if (!body) return;

    try {
        // Traer catálogo completo y equipación actual
        const { data: catalogo } = await supabase
            .from('medallas_catalogo')
            .select('*')
            .eq('propuesta', false)
            .order('nombre');

        const { data: inventario } = await supabase
            .from('medallas_inventario')
            .select('medalla_id, equipada')
            .eq('personaje_nombre', nombreGrupo)
            .eq('equipada', true);

        const equipadasIds = new Set((inventario || []).map(r => r.medalla_id));
        const tagsGrupo = (proy.tags || []).map(t => (t.startsWith('#') ? t : '#' + t).toLowerCase());
        const ptsMapa = proy.ptsMapa || {};

        // Clasificar medallas: solo las que el PJ puede usar (cumple requisitos de tag)
        const medAccesibles = (catalogo || []).filter(m => {
            const reqs = m.requisitos_base || [];
            if (!reqs.length) return false; // sin requisitos de tag = no aplica
            return reqs.every(req => {
                const tNorm = (req.tag.startsWith('#') ? req.tag : '#' + req.tag).toLowerCase();
                return tagsGrupo.includes(tNorm);
            });
        });

        if (!medAccesibles.length) {
            body.innerHTML = `<p style="color:var(--gray-500);font-size:0.82em;">Sin medallas disponibles para los tags actuales del personaje.</p>`;
            return;
        }

        // Separar equipadas / disponibles / bloqueadas por PT
        const equipadas  = medAccesibles.filter(m => equipadasIds.has(m.id));
        const disponibles = medAccesibles.filter(m => !equipadasIds.has(m.id) && _cumplePT(m, ptsMapa));
        const bloqueadas  = medAccesibles.filter(m => !equipadasIds.has(m.id) && !_cumplePT(m, ptsMapa));

        const ctlTotal = proy.ctl || 0;
        const ctlUsadoNow = ctlUsado || 0;

        body.innerHTML = `
        <div style="font-size:0.75em;color:var(--gray-500);margin-bottom:10px;">
            CTL usado: <b style="color:#2980b9;">${ctlUsadoNow}</b> / ${ctlTotal}
            &nbsp;·&nbsp; Tags fusionados: <b style="color:#8e44ad;">${tagsGrupo.filter(t=>![
                '#jugador','#npc','#activo','#inactivo'
            ].includes(t)).length}</b>
        </div>

        ${equipadas.length ? `
        <div style="margin-bottom:12px;">
            <div class="medalla-ficha-subheader" style="color:var(--green-dark);border-color:var(--green);">✅ Equipadas (${equipadas.length})</div>
            <div class="medalla-ficha-grid">${equipadas.map(m => _renderMedallaFichaCard(m, 'equipada', ptsMapa, tagsGrupo)).join('')}</div>
        </div>` : ''}

        ${disponibles.length ? `
        <div style="margin-bottom:12px;">
            <div class="medalla-ficha-subheader" style="color:#1a4a80;border-color:#2980b9;">🏅 Disponibles (${disponibles.length})</div>
            <div class="medalla-ficha-grid">${disponibles.map(m => _renderMedallaFichaCard(m, 'disponible', ptsMapa, tagsGrupo)).join('')}</div>
        </div>` : ''}

        ${bloqueadas.length ? `
        <div style="margin-bottom:12px;">
            <div class="medalla-ficha-subheader" style="color:#7f8c8d;border-color:#95a5a6;">🔒 Bloqueadas por PT insuficientes (${bloqueadas.length})</div>
            <div class="medalla-ficha-grid">${bloqueadas.map(m => _renderMedallaFichaCard(m, 'bloqueada', ptsMapa, tagsGrupo)).join('')}</div>
        </div>` : ''}

        ${!equipadas.length && !disponibles.length && !bloqueadas.length ? `
        <p style="color:var(--gray-500);font-size:0.82em;">Sin medallas para mostrar.</p>` : ''}
        `;
    } catch(e) {
        const body2 = document.getElementById('medallas-body');
        if (body2) body2.innerHTML = `<p style="color:var(--red);font-size:0.82em;">Error cargando medallas: ${e.message}</p>`;
    }
}

function _cumplePT(medalla, ptsMapa) {
    const reqs = medalla.requisitos_base || [];
    return reqs.every(req => {
        const tNorm = (req.tag.startsWith('#') ? req.tag : '#' + req.tag).toLowerCase();
        const pts = ptsMapa[tNorm] || ptsMapa[req.tag] || 0;
        return pts >= (req.pts_minimos || 0);
    });
}

function _renderMedallaFichaCard(m, estado, ptsMapa, tagsGrupo) {
    const esEq = estado === 'equipada';
    const esBloq = estado === 'bloqueada';
    const reqs = m.requisitos_base || [];

    // Para bloqueadas: mostrar cuánto PT falta
    const reqsInfo = reqs.map(req => {
        const tNorm = (req.tag.startsWith('#') ? req.tag : '#' + req.tag).toLowerCase();
        const ptsAct = ptsMapa[tNorm] || ptsMapa[req.tag] || 0;
        const ptsMin = req.pts_minimos || 0;
        const cumple = ptsAct >= ptsMin;
        return `<span style="font-size:0.68em;padding:1px 5px;border-radius:3px;
            background:${cumple?'#d5f5e3':'#fdecea'};color:${cumple?'#1e8449':'#c0392b'};
            border:1px solid ${cumple?'#27ae60':'#e74c3c'};">
            ${req.tag.startsWith('#')?req.tag:'#'+req.tag}${ptsMin?` ${ptsAct}/${ptsMin}pt`:''}
        </span>`;
    }).join('');

    // Efectos condicionales activos
    const condsActivas = (m.efectos_condicionales || []).filter(ec => {
        const tNorm = (ec.tag.startsWith('#') ? ec.tag : '#' + ec.tag).toLowerCase();
        const pts = ptsMapa[tNorm] || 0;
        return tagsGrupo.includes(tNorm) && pts >= (ec.pts_minimos || 0);
    });

    const borderColor = esEq ? 'var(--green)' : esBloq ? 'var(--gray-300)' : '#2980b9';
    const bgColor = esEq ? '#f0faf4' : esBloq ? 'var(--gray-100)' : '#f0f6ff';

    return `
    <div class="medalla-ficha-card" style="border-color:${borderColor};background:${bgColor};opacity:${esBloq?'0.7':'1'};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px;">
            <div style="font-weight:700;font-size:0.82em;color:var(--gray-900);line-height:1.3;">${m.nombre}</div>
            <div style="font-size:0.7em;font-weight:700;white-space:nowrap;color:#2980b9;flex-shrink:0;">${m.costo_ctl||0} CTL</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:5px;">${reqsInfo}</div>
        ${m.efecto_desc ? `<div style="font-size:0.72em;color:var(--gray-700);line-height:1.4;">${m.efecto_desc}</div>` : ''}
        ${condsActivas.length ? `
        <div style="margin-top:5px;padding:4px 6px;background:#fffbea;border:1px solid #f1c40f;border-radius:3px;">
            ${condsActivas.map(ec=>`<div style="font-size:0.68em;color:#7d6608;">⚡ <b>${ec.tag}</b>${ec.efecto?': '+ec.efecto:''}</div>`).join('')}
        </div>` : ''}
        ${esEq ? `<div style="margin-top:5px;font-size:0.7em;font-weight:700;color:var(--green);">✅ EQUIPADA</div>` : ''}
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

// ── Función para copiar Tags y PT en vista Detalle ──
window._fichasCopiarTagsPT = (encodedData) => {
    try {
        // Descodificamos los puntos que ya estaban listos en la pantalla
        const ptG = JSON.parse(decodeURIComponent(encodedData));
        
        // Formateamos asegurando el # y extrayendo los puntos
        const data = Object.entries(ptG).map(([tag, pts]) => ({
            tag: tag.startsWith('#') ? tag : '#' + tag,
            pts: Number(pts)
        }));

        // Ordenar de mayor a menor cantidad de PT
        data.sort((a, b) => b.pts - a.pts);

        // Formatear como: #Tag [PT]
        const texto = data.map(d => `${d.tag} [${d.pts}]`).join('\n');

        // Copiar al portapapeles
        navigator.clipboard.writeText(texto).then(() => {
            const toastEl = document.getElementById('fichas-toast');
            if (toastEl) {
                toastEl.textContent = '✅ Tags copiados al portapapeles';
                toastEl.className = 'toast-ok';
                toastEl.style.display = 'block';
                setTimeout(() => { toastEl.className = ''; toastEl.style.display = 'none'; }, 3000);
            } else {
                alert('✅ Tags copiados al portapapeles');
            }
        }).catch(err => console.error('Error al copiar:', err));
        
    } catch (e) {
        console.error('Error procesando datos para copiar:', e);
    }
};
