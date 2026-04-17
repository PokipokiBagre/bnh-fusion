// ============================================================
// fichas-main.js
// ============================================================
import { bnhAuth, currentConfig } from '../bnh-auth.js';
import { fichasUI, gruposGlobal }  from './fichas-state.js';
import { cargarTodo, getPosterNamesDelHilo } from './fichas-data.js';
import { cargarFusiones } from '../bnh-fusion.js';
import { renderSidebar, renderActiveTagsBar, renderCatalogo, renderDetalle } from './fichas-ui.js';
import { abrirPanelOP, abrirCrearGrupo, abrirGestorAliases, exponerGlobalesOP } from './fichas-op.js';

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

    // Buscador de nombre/alias
    window._fichaNombreSearch = (v) => {
        fichasUI.nombreBusqueda = v;
        renderSidebar();
        renderCatalogo(postersDelHilo);
    };

    // Limpia todos los filtros (tags + nombre)
    window._fichaClearAll = () => {
        fichasUI.tagsFiltro     = [];
        fichasUI.nombreBusqueda = '';
        sincronizarVista();
    };

    window._fichaTagSearch = (v) => { fichasUI.tagBusqueda = v; renderSidebar(); };

    window._fichaSetHilo = async (val) => {
        fichasUI.hiloFiltro = val;
        postersDelHilo = val === 'todos' ? null : await getPosterNamesDelHilo(val);
        sincronizarVista();
    };
}

init().catch(console.error);
