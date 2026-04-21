// ============================================================
// fichas-main.js
// ============================================================
import { bnhAuth, currentConfig } from '../bnh-auth.js';
import { fichasUI, gruposGlobal, ptGlobal } from './fichas-state.js';
import { cargarTodo, getPosterNamesDelHilo } from './fichas-data.js';
import { cargarFusiones } from '../bnh-fusion.js';
import { renderSidebar, renderActiveTagsBar, renderCatalogo, renderDetalle, renderUploadPanel, cerrarUploadPanel } from './fichas-ui.js';
import { subirImagenGrupo } from './fichas-upload.js';
import { abrirPanelOP, abrirCrearGrupo, abrirGestorAliases, exponerGlobalesOP, abrirEditarLore } from './fichas-op.js';
import { guardarTagsGrupo, borrarPTDeTag, asignarAliasesDeGrupoNombre } from './fichas-data.js';
import { initMarkup, initMarkupTextarea } from './fichas-markup.js';
import { getEquipacionPJ, setSupabaseRef, calcCTLUsado, invalidarCacheEquipacion } from '../bnh-pac.js';

let postersDelHilo = null;

async function init() {
    // Inyectar supabase en bnh-pac para getEquipacionPJ
    const { supabase } = await import('../bnh-auth.js');
    setSupabaseRef(supabase);

    const favicon = document.getElementById('dynamic-favicon');
    if (favicon && currentConfig) favicon.href = `${currentConfig.storageUrl}/imginterfaz/icon.png?v=${Date.now()}`;

    await bnhAuth.init();
    fichasUI.esAdmin = bnhAuth.esAdmin();

    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();

    await Promise.all([cargarTodo(), cargarFusiones()]);

    // Cargar medallas para autocompletado !Medalla! en markup
    let medallasCargadas = [];
    try {
        const { supabase } = await import('../bnh-auth.js');
        const { data: med } = await supabase.from('medallas_catalogo')
            .select('nombre').eq('propuesta', false).order('nombre');
        medallasCargadas = med || [];
    } catch(e) { /* silencioso */ }

    initMarkup({ grupos: gruposGlobal, medallas: medallasCargadas });
    exponerGlobalesOP();
    exponerGlobales();

    // Navegación por URL: ?ficha=NombreGrupo
    const urlParams = new URLSearchParams(window.location.search);
    const fichaParam = urlParams.get('ficha');
    if (fichaParam) {
        const decoded = decodeURIComponent(fichaParam);
        const g = gruposGlobal.find(x =>
            x.nombre_refinado.toLowerCase() === decoded.toLowerCase() ||
            x.nombre_refinado.toLowerCase().replace(/ /g,'_') === decoded.toLowerCase().replace(/ /g,'_')
        );
        if (g) {
            fichasUI.vistaActual  = 'detalle';
            fichasUI.seleccionado = g.nombre_refinado;
        }
    }

    sincronizarVista();

    // Enfocar el buscador de nombre por defecto al cargar el catálogo
    setTimeout(() => {
        if (fichasUI.vistaActual === 'catalogo') {
            const inp = document.getElementById('nombre-buscar-inp');
            if (inp) inp.focus();
        }
    }, 150);
}

function sincronizarVista() {
    if (fichasUI.vistaActual === 'detalle' && fichasUI.seleccionado) {
        document.getElementById('fichas-layout').style.display = 'none';
        document.getElementById('fichas-detalle-wrap').style.display = 'block';
        const _gDet = gruposGlobal.find(x => x.nombre_refinado === fichasUI.seleccionado);
        if (_gDet) renderDetalle(_gDet);
    } else {
        document.getElementById('fichas-layout').style.display = 'grid';
        document.getElementById('fichas-detalle-wrap').style.display = 'none';
        renderSidebar();
        renderActiveTagsBar();
        renderCatalogo(postersDelHilo);
    }
}

function exponerGlobales() {
    window.abrirFicha = async (nombreGrupo) => {
        const g = gruposGlobal.find(x => x.nombre_refinado === nombreGrupo);
        if (!g) return;
        // Pre-cargar equipación en cache de bnh-pac para que fichas-ui la lea sync
        const medEq = await getEquipacionPJ(nombreGrupo, { forzar: true });
        window._equipCache = window._equipCache || {};
        window._equipCache[nombreGrupo] = medEq;
        fichasUI.vistaActual  = 'detalle';
        fichasUI.seleccionado = nombreGrupo;
        sincronizarVista();
        window.scrollTo(0, 0);
    };

await Promise.all(
    gruposGlobal.map(async g => {
        const medEq = await getEquipacionPJ(g.nombre_refinado);
        window._equipCache[g.nombre_refinado] = medEq;
    })
);
    
    window.volverCatalogo = () => {
        fichasUI.vistaActual  = 'catalogo';
        fichasUI.seleccionado = null;
        sincronizarVista();
        window.scrollTo(0, 0);
        // Enfocar buscador de nombre al volver al catálogo
        setTimeout(() => {
            const inp = document.getElementById('nombre-buscar-inp');
            if (inp) inp.focus();
        }, 100);
    };

    window.abrirPanelOP         = abrirPanelOP;
    window.abrirCrearGrupo      = abrirCrearGrupo;
    window.abrirGestorAliases   = abrirGestorAliases;
    window.abrirEditarLore      = abrirEditarLore;

    window.sincronizarVista = async () => {
        await Promise.all([cargarTodo(), cargarFusiones()]);
    try {
        const { supabase } = await import('../bnh-auth.js');
        const { data: med } = await supabase.from('medallas_catalogo')
            .select('nombre').eq('propuesta', false).order('nombre');
        initMarkup({ grupos: gruposGlobal, medallas: med || [] });
    } catch(e) { initMarkup({ grupos: gruposGlobal }); }
        sincronizarVista();
    };

    window._fichaToggleTag = (tag) => {
        const idx = fichasUI.tagsFiltro.indexOf(tag);
        idx === -1 ? fichasUI.tagsFiltro.push(tag) : fichasUI.tagsFiltro.splice(idx, 1);
        sincronizarVista();
    };

    window._fichaToggleTagYVolver = (tag) => {
        fichasUI.vistaActual = 'catalogo';
        fichasUI.seleccionado = null;
        if (!fichasUI.tagsFiltro.includes(tag)) fichasUI.tagsFiltro.push(tag);
        sincronizarVista();
        window.scrollTo(0, 0);
    };

    window._fichaClearTags = () => { fichasUI.tagsFiltro = []; sincronizarVista(); };

    // Buscador de nombre/alias — debounced para no rerenderizar en cada letra
    let _nombreSearchTimer = null;
    window._fichaNombreSearch = (v) => {
        fichasUI.nombreBusqueda = v;
        clearTimeout(_nombreSearchTimer);
        _nombreSearchTimer = setTimeout(() => {
            renderCatalogo(postersDelHilo);
        }, 180);
    };

    // Limpia todos los filtros (tags + nombre)
    window._fichaClearAll = () => {
        fichasUI.tagsFiltro     = [];
        fichasUI.nombreBusqueda = '';
        sincronizarVista();
    };

    window._fichaTagSearch = (v) => {
        fichasUI.tagBusqueda = v;
        _renderTagListOnly(); // update only tag list, preserve input focus
    };

    // ── Modo Asignar Tags ─────────────────────────────────────
    // Activar/desactivar modo asignar (toggle)
    window._fichaModoAsignar = () => {
        if (!fichasUI.modoAsignar && !fichasUI.modoInverso) {
            // off → asignar
            fichasUI.modoAsignar = true;
        } else if (fichasUI.modoAsignar && !fichasUI.modoInverso) {
            // asignar → inverso
            fichasUI.modoAsignar = false;
            fichasUI.modoInverso = true;
            fichasUI.tagsAsignar.clear();
            fichasUI.grupoAsignar = null;
        } else {
            // inverso → off
            fichasUI.modoInverso = false;
            fichasUI.grupoAsignar = null;
        }
        sincronizarVista();
    };

    // Al hacer click en una ficha en modo asignar
    window._fichaAsignarTagClick = async (nombreGrupo) => {
        const tags = [...fichasUI.tagsAsignar];
        if (!tags.length) return;
        const g = gruposGlobal.find(x => x.nombre_refinado === nombreGrupo);
        if (!g) return;

        for (const tag of tags) {
            const tieneTag = (g.tags||[]).some(t =>
                (t.startsWith('#')?t:'#'+t).toLowerCase() === tag.toLowerCase()
            );

            if (tieneTag) {
                // Desasignar sin confirmación
                const nuevosTags = (g.tags||[]).filter(t =>
                    (t.startsWith('#')?t:'#'+t).toLowerCase() !== tag.toLowerCase()
                );
                const res = await guardarTagsGrupo(g.id, nuevosTags);
                if (res.ok) {
                    const pts = (ptGlobal[nombreGrupo]||{})[tag] || 0;
                    if (pts > 0) await borrarPTDeTag(nombreGrupo, tag);
                }
            } else {
                // Asignar
                const tagNorm = tag.startsWith('#') ? tag : '#' + tag;
                const nuevosTags = [...(g.tags||[]), tagNorm];
                await guardarTagsGrupo(g.id, nuevosTags);
            }
        }
        await Promise.resolve();
        renderCatalogo(postersDelHilo);
        _renderTagListOnly();
    };

    // Al hacer click en un tag del sidebar en modo asignar → toggle ese tag en el Set
    const _originalToggleTag = window._fichaToggleTag;
    window._fichaToggleTag = async (tag) => {
        if (fichasUI.modoInverso) {
            if (!fichasUI.grupoAsignar) return; // need to select a group first
            const g = gruposGlobal.find(x => x.nombre_refinado === fichasUI.grupoAsignar);
            if (!g) return;
            const tagNorm = tag.startsWith('#') ? tag : '#' + tag;
            const tieneTag = (g.tags||[]).some(t =>
                (t.startsWith('#')?t:'#'+t).toLowerCase() === tag.toLowerCase()
            );
            if (tieneTag) {
                // Desasignar sin confirmar
                const nuevosTags = (g.tags||[]).filter(t =>
                    (t.startsWith('#')?t:'#'+t).toLowerCase() !== tag.toLowerCase()
                );
                const res = await guardarTagsGrupo(g.id, nuevosTags);
                if (res.ok) {
                    const pts = (ptGlobal[fichasUI.grupoAsignar]||{})[tag]||0;
                    if (pts > 0) await borrarPTDeTag(fichasUI.grupoAsignar, tag);
                }
            } else {
                const nuevosTags = [...(g.tags||[]), tagNorm];
                await guardarTagsGrupo(g.id, nuevosTags);
            }
            // Small delay ensures gruposGlobal memory update propagates to both renders
            await Promise.resolve();
            _renderTagListOnly();
            renderCatalogo(postersDelHilo);
        } else if (fichasUI.modoAsignar) {
            if (fichasUI.tagsAsignar.has(tag)) fichasUI.tagsAsignar.delete(tag);
            else fichasUI.tagsAsignar.add(tag);
            _renderTagListOnly();
            renderCatalogo(postersDelHilo);
        } else {
            _originalToggleTag(tag);
        }
    };

    // Botón "Asignar alias de grupo nombre"
    window._fichaAsignarAliasesGrupo = async () => {
        if (!confirm('¿Asignar alias de grupo nombre a todos los grupos?\n\nSe creará o reasignará el alias con el mismo nombre del grupo para cada grupo que no lo tenga.')) return;
        const res = await asignarAliasesDeGrupoNombre();
        alert(`✅ Aliases asignados\nCreados: ${res.creados}\nReasignados: ${res.reasignados}`);
        await sincronizarVista();
    };

    // ── Upload de imagen ─────────────────────────────────────
    window._fichasAbrirUpload = (nombreGrupo) => {
        renderUploadPanel(nombreGrupo);
        // Scroll al panel si está en detalle
        setTimeout(() => {
            document.getElementById('fichas-upload-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
    };

    window._fichasCerrarUpload = () => cerrarUploadPanel();

    // Modo inverso: click en ficha = seleccionar ese personaje
    window._fichaInversoClick = (nombreGrupo) => {
        fichasUI.grupoAsignar = fichasUI.grupoAsignar === nombreGrupo ? null : nombreGrupo;
        renderSidebar();
        renderCatalogo(postersDelHilo);
    };

    window._fichasSetTipo = (tipo) => {
        const panel = document.getElementById('fichas-upload-panel');
        if (!panel || panel.style.display === 'none') return;
        panel.dataset.tipo = tipo;
        // Forzar re-render sin pasar por el toggle: temporalmente cambiar grupo
        const nombreGrupo = panel.dataset.grupo;
        if (!nombreGrupo) return;
        panel.dataset.grupo = ''; // evitar que renderUploadPanel lo cierre por toggle
        renderUploadPanel(nombreGrupo);
    };

    window._fichasHandleDrop = async (e) => {
        e.preventDefault();
        e.currentTarget.style.borderColor = '';
        const file = e.dataTransfer.files[0];
        if (file?.type.startsWith('image/')) await _ejecutarSubidaFicha(file);
    };

    window._fichasHandleFile = async (e) => {
        const file = e.target.files[0];
        if (file) await _ejecutarSubidaFicha(file);
        e.target.value = '';
    };

    async function _ejecutarSubidaFicha(file) {
        const panel = document.getElementById('fichas-upload-panel');
        const nombreGrupo = panel?.dataset.grupo;
        const tipo = panel?.dataset.tipo || 'icon';
        if (!nombreGrupo) return;

        const prog = document.getElementById('fichas-upload-progress');
        const fill = document.getElementById('fichas-prog-fill');
        const msg  = document.getElementById('fichas-prog-msg');
        if (prog) prog.style.display = 'block';

        try {
            const url = await subirImagenGrupo(file, nombreGrupo, tipo, (pct, txt) => {
                if (fill) fill.style.width = pct + '%';
                if (msg)  msg.textContent = txt;
            });
            // Actualizar preview con la nueva imagen
            const preview = document.getElementById('upload-preview-img');
            if (preview) preview.src = url;
            if (msg) { msg.textContent = '✅ ¡Imagen actualizada!'; msg.style.color = 'var(--green)'; }
            // Refrescar catálogo para que la nueva imagen aparezca
            setTimeout(() => {
                renderCatalogo(postersDelHilo);
                if (fichasUI.vistaActual === 'detalle') {     const _gDet = gruposGlobal.find(x => x.nombre_refinado === fichasUI.seleccionado);     if (_gDet) renderDetalle(_gDet); }
            }, 800);
        } catch(e) {
            if (msg)  { msg.textContent = '❌ ' + e.message; msg.style.color = 'var(--red)'; }
            if (fill) fill.style.width = '0%';
            setTimeout(() => { if (prog) prog.style.display = 'none'; }, 3500);
        }
    }

    // Partial render: only update the tag list UL (preserves input focus)
    function _renderTagListOnly() {
        const ul = document.getElementById('sidebar-tag-list');
        if (!ul) { renderSidebar(); return; }
        // Rebuild tag entries with current state
        const { buildTagIndex } = window._fichasLogicExports || {};
        // Use gruposGlobal directly
        const tagMap = {};
        gruposGlobal.forEach(g => {
            (g.tags||[]).forEach(t => {
                const k = t.startsWith('#') ? t : '#'+t;
                tagMap[k] = (tagMap[k]||0) + 1;
            });
        });
        let entries = Object.entries(tagMap).sort((a,b) => b[1]!==a[1] ? b[1]-a[1] : a[0].localeCompare(b[0]));
        if (fichasUI.tagBusqueda) {
            const q = fichasUI.tagBusqueda.toLowerCase();
            entries = entries.filter(([t]) => t.toLowerCase().includes(q));
        }
        ul.innerHTML = entries.map(([tag, cnt]) => {
            const activo = fichasUI.tagsFiltro.includes(tag);
            const esTagAsignar = fichasUI.modoAsignar && fichasUI.tagsAsignar.has(tag);
            const grupoSel = fichasUI.modoInverso && fichasUI.grupoAsignar
                ? gruposGlobal.find(g => g.nombre_refinado === fichasUI.grupoAsignar) : null;
            const grupoTieneTag = grupoSel && (grupoSel.tags||[]).some(t =>
                (t.startsWith('#')?t:'#'+t).toLowerCase() === tag.toLowerCase()
            );
            const cero = cnt === 0;
            const click = `onclick="window._fichaToggleTag('${tag.replace(/'/g,"\'")}')"`; 
            const estilo = fichasUI.modoInverso && grupoSel
                ? grupoTieneTag ? 'color:var(--green);font-weight:700;' : ''
                : (esTagAsignar || activo) ? 'color:var(--red);font-weight:700;' : '';
            return `<li class="${activo||esTagAsignar||grupoTieneTag?'active':''}" ${click}>
                <span class="tag-link" style="${estilo}">${tag}</span>
                <span class="tag-count">${cnt}</span>
            </li>`;
        }).join('') || '<li style="color:var(--gray-500);font-size:0.82em;padding:4px;">Sin tags</li>';
    }

    window._fichaFiltroRol = (val) => {
        fichasUI.filtroRol = val;
        sincronizarVista();
    };

    window._fichaFiltroEstado = (val) => {
        fichasUI.filtroEstado = val;
        sincronizarVista();
    };

    window._fichaSetHilo = async (val) => {
        fichasUI.hiloFiltro = val;
        postersDelHilo = val === 'todos' ? null : await getPosterNamesDelHilo(val);
        sincronizarVista();
    };
}

init().catch(console.error);
