// ============================================================
// fichas-main.js — Orquestador
// ============================================================
import { bnhAuth, currentConfig } from '../bnh-auth.js';
import { fichasUI }                from './fichas-state.js';
import { cargarTodo }              from './fichas-data.js';
import { cargarFusiones }          from '../bnh-fusion.js';
import { renderCatalogo, renderDetalle } from './fichas-ui.js';
import { abrirPanelOP, abrirCrearPersonaje, exponerGlobalesOP } from './fichas-op.js';

async function init() {
    // Favicon
    const favicon = document.getElementById('dynamic-favicon');
    if (favicon && currentConfig) {
        favicon.href = `${currentConfig.storageUrl}/imginterfaz/icon.png?v=${Date.now()}`;
    }

    // Auth
    await bnhAuth.init();
    fichasUI.esAdmin = bnhAuth.esAdmin();

    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();

    // Botón crear: solo admins
    const btnCrear = document.getElementById('btn-crear-pj');
    if (btnCrear) btnCrear.style.display = fichasUI.esAdmin ? 'inline-block' : 'none';

    // Cargar datos
    await Promise.all([cargarTodo(), cargarFusiones()]);

    // Exponer funciones globales del panel OP
    exponerGlobalesOP();

    // Funciones globales de navegación
    window.abrirFicha = (nombre) => {
        fichasUI.vistaActual  = 'detalle';
        fichasUI.seleccionado = nombre;
        renderDetalle(nombre);
        window.scrollTo(0, 0);
    };

    window.volverCatalogo = () => {
        fichasUI.vistaActual  = 'catalogo';
        fichasUI.seleccionado = null;
        renderCatalogo();
        window.scrollTo(0, 0);
    };

    window.abrirPanelOP = (nombre) => {
        fichasUI.seleccionado = nombre;
        abrirPanelOP(nombre);
    };

    window.abrirCrearPersonaje = abrirCrearPersonaje;

    window.borrarPersonaje = async (nombre) => {
        if (!fichasUI.esAdmin) return;
        if (!confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return;
        const { eliminarPersonaje } = await import('./fichas-data.js');
        await eliminarPersonaje(nombre);
        window.sincronizarVista();
    };

    // Búsqueda
    const buscador = document.getElementById('fichas-buscar');
    if (buscador) {
        buscador.addEventListener('input', e => {
            fichasUI.filtroTexto = e.target.value;
            if (fichasUI.vistaActual === 'catalogo') renderCatalogo();
        });
    }

    // sincronizarVista: recarga datos y re-renderiza la vista actual
    window.sincronizarVista = async () => {
        await Promise.all([cargarTodo(), cargarFusiones()]);
        if (fichasUI.vistaActual === 'detalle' && fichasUI.seleccionado) {
            renderDetalle(fichasUI.seleccionado);
        } else {
            renderCatalogo();
        }
    };

    // Renderizado inicial
    renderCatalogo();
}

init().catch(console.error);
