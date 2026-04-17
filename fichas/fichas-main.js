// ============================================================
// fichas-main.js
// ============================================================
import { bnhAuth, currentConfig } from '../bnh-auth.js';
import { fichasUI, fichasGlobal }  from './fichas-state.js';
import { cargarTodo, getPosterNamesDelHilo } from './fichas-data.js';
import { cargarFusiones }          from '../bnh-fusion.js';
import { renderSidebar, renderActiveTagsBar, renderCatalogo, renderDetalle } from './fichas-ui.js';
import { abrirPanelOP, abrirCrearPersonaje, exponerGlobalesOP } from './fichas-op.js';

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
    exponerGlobalesFichas();

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

function exponerGlobalesFichas() {

    window.abrirFicha = (nombre) => {
        fichasUI.vistaActual  = 'detalle';
        fichasUI.seleccionado = nombre;
        sincronizarVista();
        window.scrollTo(0,0);
    };

    window.volverCatalogo = () => {
        fichasUI.vistaActual  = 'catalogo';
        fichasUI.seleccionado = null;
        sincronizarVista();
        window.scrollTo(0,0);
    };

    window.abrirPanelOP = (nombre) => {
        fichasUI.seleccionado = nombre;
        abrirPanelOP(nombre);
    };

    window.abrirCrearPersonaje = abrirCrearPersonaje;

    window.borrarPersonaje = async (nombre) => {
        if (!fichasUI.esAdmin) return;
        if (!confirm(`¿Eliminar a ${nombre}?`)) return;
        const { eliminarPersonaje } = await import('./fichas-data.js');
        await eliminarPersonaje(nombre);
        sincronizarVista();
    };

    window.sincronizarVista = async () => {
        await Promise.all([cargarTodo(), cargarFusiones()]);
        sincronizarVista();
    };

    // Filtros booru
    window._fichaToggleTag = (tag) => {
        const idx = fichasUI.tagsFiltro.indexOf(tag);
        if (idx === -1) fichasUI.tagsFiltro.push(tag);
        else fichasUI.tagsFiltro.splice(idx, 1);
        sincronizarVista();
    };

    window._fichaToggleTagYVolver = (tag) => {
        fichasUI.vistaActual = 'catalogo';
        fichasUI.seleccionado = null;
        const idx = fichasUI.tagsFiltro.indexOf(tag);
        if (idx === -1) fichasUI.tagsFiltro.push(tag);
        sincronizarVista();
        window.scrollTo(0,0);
    };

    window._fichaClearTags = () => {
        fichasUI.tagsFiltro = [];
        sincronizarVista();
    };

    window._fichaTagSearch = (v) => {
        fichasUI.tagBusqueda = v;
        renderSidebar();
    };

    window._fichaSetHilo = async (val) => {
        fichasUI.hiloFiltro = val;
        if (val === 'todos') {
            postersDelHilo = null;
        } else {
            postersDelHilo = await getPosterNamesDelHilo(val);
        }
        sincronizarVista();
    };
}

function toast(msg, tipo='ok') {
    let el = document.getElementById('fichas-toast');
    if (!el) return;
    el.textContent = msg;
    el.className = `toast-${tipo}`;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = ''; }, 3000);
}

window._fichasToast = toast;

init().catch(console.error);
