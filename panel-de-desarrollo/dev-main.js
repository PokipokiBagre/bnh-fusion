// ============================================================
// dev-main.js — Controlador de Eventos y Renderizado Global
// ============================================================

import { bnhAuth, supabase } from '../bnh-auth.js';
import { devState, norm, STORAGE_URL } from './dev-state.js';
import { initStatsDev } from './estadisticas/panel-stats-logic.js';
import { renderColumnaStats } from './estadisticas/panel-stats-ui.js';
import { initPaginaDev, renderColumnaPagina } from './pagina/panel-pagina-ui.js';

window.cambiarFiltro = cambiarFiltro;
window.filtrarPorNombre = filtrarPorNombre;
window.seleccionarPersonajeDev = seleccionarPersonajeDev;
window.cambiarPestana = cambiarPestana;

window.onload = async () => {
    await bnhAuth.init();
    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();

    if (!bnhAuth.esAdmin()) {
        document.getElementById('pantalla-carga').classList.add('oculto');
        document.getElementById('access-denied').classList.remove('oculto');
        return;
    }

    try {
        // Carga SOLO lo necesario de Supabase. Tolerante a fallos si no hay datos aún.
        const { data: personajesBD } = await supabase.from('personajes').select('*');
        
        devState.listaPersonajes = personajesBD || [];
        devState.filtroActual = 'sueltos'; // Por defecto vemos los que faltan agrupar
        devState.busquedaTexto = '';

        // Inicializamos tus dos únicos módulos reales
        await initStatsDev({}, []); 
        await initPaginaDev();

        document.getElementById('pantalla-carga').classList.add('oculto');
        document.getElementById('interfaz-master').classList.remove('oculto');

        renderSelectorPersonajes();
        renderColumnaPagina();

    } catch (error) {
        console.error("Error crítico:", error);
        document.getElementById('pantalla-carga').innerHTML = `<h2 style="color:#ff4444;">Error de BD: ${error.message}</h2>`;
    }
};

function cambiarPestana(id) {
    // Control de pestañas superiores
    document.querySelectorAll('.top-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${id}`).classList.add('active');

    document.getElementById('vista-stats').classList.add('oculto');
    document.getElementById('vista-pagina').classList.add('oculto');

    document.getElementById(`vista-${id}`).classList.remove('oculto');
}

function cambiarFiltro(tipo) {
    devState.filtroActual = tipo;
    const btnS = document.getElementById('btn-filtro-sueltos');
    const btnA = document.getElementById('btn-filtro-agrupados');

    btnS.className = 'btn ' + (tipo === 'sueltos' ? 'btn-green' : 'btn-outline');
    btnA.className = 'btn ' + (tipo === 'agrupados' ? 'btn-green' : 'btn-outline');

    renderSelectorPersonajes();
    document.getElementById('content-stats').innerHTML = '<div style="color:#666; font-style:italic;">Selecciona un personaje de la lista.</div>';
}

function filtrarPorNombre(texto) {
    devState.busquedaTexto = texto.toLowerCase();
    renderSelectorPersonajes();
}

function renderSelectorPersonajes() {
    const contenedor = document.getElementById('dev-character-list');
    if (!contenedor) return;

    let filtrados = devState.listaPersonajes.filter(p => {
        const coincideFiltro = devState.filtroActual === 'sueltos' ? !p.refinado_id : !!p.refinado_id;
        const coincideNom = p.nombre.toLowerCase().includes(devState.busquedaTexto);
        return coincideFiltro && coincideNom;
    });

    if (filtrados.length === 0) {
        contenedor.innerHTML = `<div style="color:#666; font-style:italic; padding:20px;">No se encontraron personajes en esta categoría.</div>`;
        return;
    }

    let html = '';
    filtrados.sort((a,b) => a.nombre.localeCompare(b.nombre)).forEach(p => {
        const imgUrl = `${STORAGE_URL}/imgpersonajes/${norm(p.nombre)}icon.png`;
        const imgError = `this.onerror=null; this.src='${STORAGE_URL}/imginterfaz/no_encontrado.png'`;
        const borderColor = p.refinado_id ? '#00b4d8' : '#ff4444'; // Azul = Agrupado, Rojo = Suelto
        const claseActiva = (devState.pjSeleccionado === p.nombre) ? 'active' : '';

        html += `
        <div class="char-portrait-container ${claseActiva}" id="portrait-${norm(p.nombre)}" onclick="window.seleccionarPersonajeDev('${p.nombre.replace(/'/g, "\\'")}')">
            <img src="${imgUrl}" class="char-portrait" style="border-color: ${borderColor}44;" onerror="${imgError}" title="${p.nombre}">
            <div class="char-name">${p.nombre}</div>
        </div>`;
    });

    contenedor.innerHTML = html;
}

function seleccionarPersonajeDev(nombre) {
    devState.pjSeleccionado = nombre;

    document.querySelectorAll('.char-portrait-container').forEach(el => el.classList.remove('active'));
    const portrait = document.getElementById(`portrait-${norm(nombre)}`);
    if (portrait) portrait.classList.add('active');

    renderColumnaStats(devState.pjSeleccionado);
}
