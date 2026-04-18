// ============================================================
// fichas-main.js
// ============================================================
import { bnhAuth, currentConfig } from '../bnh-auth.js';
import { fichasUI, gruposGlobal, ptGlobal } from './fichas-state.js';
import { cargarTodo, getPosterNamesDelHilo } from './fichas-data.js';
import { cargarFusiones } from '../bnh-fusion.js';
import { renderSidebar, renderActiveTagsBar, renderCatalogo, renderDetalle, renderUploadPanel, cerrarUploadPanel } from './fichas-ui.js';
import { subirImagenGrupo } from './fichas-upload.js';
import { abrirPanelOP, abrirCrearGrupo, abrirGestorAliases, exponerGlobalesOP } from './fichas-op.js';
import { guardarTagsGrupo, borrarPTDeTag, asignarAliasesDeGrupoNombre } from './fichas-data.js';

let postersDelHilo = null;

async function init() {
    const favicon = document.getElementById('dynamic-favicon');
    if (favicon && currentConfig) favicon.href = `${currentConfig.storageUrl}/imginterfaz/icon.png?v=${Date.now()}`;

    await bnhAuth.init();
    fichasUI.esAdmin = bnhAuth.esAdmin();

    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();

    await Promise.all([cargarTodo(), cargarFusiones()]);
    exponerGlobalesOP();
    exponerGlobales();
    sincronizarVista();
}

function sincronizarVista() {
    if (fichasUI.vistaActual === 'detalle' && fichasUI.seleccionado) {
        document.getElementById('fichas-layout').style.display = 'none';
        document.getElementById('fichas-detalle-wrap').style.display = 'block';
        renderDetalle(fichasUI.seleccionado);
    } else {
        document.getElementById('fichas-layout').style.display = 'grid';
        document.getElementById('fichas-detalle-wrap').style.display = 'none';
        renderSidebar();
        renderActiveTagsBar();
        renderCatalogo(postersDelHilo);
    }
}

function exponerGlobales() {
    window.abrirFicha = (nombreGrupo) => {
        const g = gruposGlobal.find(x => x.nombre_refinado === nombreGrupo);
        if (!g) return;
        fichasUI.vistaActual  = 'detalle';
        fichasUI.seleccionado = nombreGrupo;
        sincronizarVista();
        window.scrollTo(0, 0);
    };

    window.volverCatalogo = () => {
        fichasUI.vistaActual  = 'catalogo';
        fichasUI.seleccionado = null;
        sincronizarVista();
        window.scrollTo(0, 0);
    };

    window.abrirPanelOP         = abrirPanelOP;
    window.abrirCrearGrupo      = abrirCrearGrupo;
    window.abrirGestorAliases   = abrirGestorAliases;

    window.sincronizarVista = async () => {
        await Promise.all([cargarTodo(), cargarFusiones()]);
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

    window._fichaTagSearch = (v) => { fichasUI.tagBusqueda = v; renderSidebar(); };

    // ── Modo Asignar Tags ─────────────────────────────────────
    // Activar/desactivar modo asignar (toggle)
    window._fichaModoAsignar = () => {
        fichasUI.modoAsignar = !fichasUI.modoAsignar;
        if (!fichasUI.modoAsignar) fichasUI.tagsAsignar.clear();
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
                // Desasignar: confirmar con aviso de PT
                const pts = (ptGlobal[nombreGrupo]||{})[tag] || 0;
                const msg = pts > 0
                    ? `¿Desasignar ${tag} de ${nombreGrupo}?\n\n${nombreGrupo} tiene ${pts} PT en ese tag.\nSe borrarán permanentemente.`
                    : `¿Desasignar ${tag} de ${nombreGrupo}?`;
                if (!confirm(msg)) continue;
                const nuevosTags = (g.tags||[]).filter(t =>
                    (t.startsWith('#')?t:'#'+t).toLowerCase() !== tag.toLowerCase()
                );
                const res = await guardarTagsGrupo(g.id, nuevosTags);
                if (res.ok && pts > 0) await borrarPTDeTag(nombreGrupo, tag);
            } else {
                // Asignar
                const tagNorm = tag.startsWith('#') ? tag : '#' + tag;
                const nuevosTags = [...(g.tags||[]), tagNorm];
                await guardarTagsGrupo(g.id, nuevosTags);
            }
        }
        renderCatalogo(postersDelHilo);
        renderSidebar();
    };

    // Al hacer click en un tag del sidebar en modo asignar → toggle ese tag en el Set
    const _originalToggleTag = window._fichaToggleTag;
    window._fichaToggleTag = (tag) => {
        if (fichasUI.modoAsignar) {
            // En modo asignar, click en tag del sidebar = toggle en el Set de tags activos
            if (fichasUI.tagsAsignar.has(tag)) {
                fichasUI.tagsAsignar.delete(tag);
            } else {
                fichasUI.tagsAsignar.add(tag);
            }
            renderSidebar();
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
                if (fichasUI.vistaActual === 'detalle') renderDetalle(fichasUI.seleccionado);
            }, 800);
        } catch(e) {
            if (msg)  { msg.textContent = '❌ ' + e.message; msg.style.color = 'var(--red)'; }
            if (fill) fill.style.width = '0%';
            setTimeout(() => { if (prog) prog.style.display = 'none'; }, 3500);
        }
    }

    window._fichaSetHilo = async (val) => {
        fichasUI.hiloFiltro = val;
        postersDelHilo = val === 'todos' ? null : await getPosterNamesDelHilo(val);
        sincronizarVista();
    };
}

init().catch(console.error);
