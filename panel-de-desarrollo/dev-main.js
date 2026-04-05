// ============================================================
// dev-main.js — Controlador de Eventos y Renderizado Global
// ============================================================

import { bnhAuth, supabase } from '../bnh-auth.js';
import { db } from '../bnh-db.js';
import { devState, norm, STORAGE_URL } from './dev-state.js';
import { revisarCambiosPendientes, actualizarLogGlobal, ejecutarGuardadoGlobal } from './dev-logic.js';

// --- MÓDULOS ACTIVOS ---
import { initStatsDev } from './estadisticas/panel-stats-logic.js';
import { renderColumnaStats } from './estadisticas/panel-stats-ui.js';
import { initPaginaDev, renderColumnaPagina } from './pagina/panel-pagina-ui.js';
import { haycambiosPagina } from './pagina/panel-pagina-logic.js';

// --- [PENDIENTE] MÓDULOS EN CONSTRUCCIÓN ---
// import { initObjetosDev } from './objetos/panel-objetos-logic.js';
// import { renderColumnaObjetos } from './objetos/panel-objetos-ui.js';
// import { initHechizosDev } from './hechizos/panel-hechizos-logic.js';
// import { renderColumnaHechizos } from './hechizos/panel-hechizos-ui.js';
// import { initMapaDev } from './mapa/panel-mapa-logic.js';
// import { renderColumnaMapa } from './mapa/panel-mapa-ui.js';
// import { renderColumnaPersonaje } from './personajes/panel-personaje-ui.js';
// import { renderColumnaClonar }    from './clonar/panel-clonar-ui.js';

window.cambiarFiltroRol = cambiarFiltroRol;
window.filtrarPorNombre = filtrarPorNombre;
window.seleccionarPersonajeDev = seleccionarPersonajeDev;
window.copiarLogGlobal = copiarLogGlobal;
window.ejecutarGuardadoGlobal = ejecutarGuardadoGlobal;
window.cambiarPanelInferior = cambiarPanelInferior;
window.renderColumnaPagina = renderColumnaPagina;

window.onload = async () => {
    const favicon = document.getElementById("dynamic-favicon");
    if (favicon) favicon.href = `${STORAGE_URL}/imginterfaz/icon.png`;

    await bnhAuth.init();
    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();

    if (!bnhAuth.esAdmin()) {
        document.getElementById('pantalla-carga').classList.add('oculto');
        document.getElementById('access-denied').classList.remove('oculto');
        return;
    }

    try {
        // Hacemos las llamadas directo a Supabase para evitar errores si bnh-db.js está incompleto
        const [{data: personajesBD}, {data: estadosArr}] = await Promise.all([
            supabase.from('personajes').select('*'),
            supabase.from('estados_config').select('*')
        ]);

        devState.listaPersonajes = (personajesBD || []).filter(p => p.is_active);
        window.__devListaPersonajes = devState.listaPersonajes;

        const statsGlobalMock = {};
        (personajesBD || []).forEach(p => {
            statsGlobalMock[p.nombre] = {
                isPlayer: p.is_player,
                isActive: p.is_active,
                hex: Number(p.hex) || 0,
                asistencia: Number(p.asistencia) || 1,

                vidaRojaActual: Number(p.vida_roja_actual) || 0,
                baseVidaRojaMax: Number(p.base_vida_roja_max) || 0,
                baseVidaAzul: Number(p.base_vida_azul) || 0,
                baseGuardaDorada: Number(p.base_guarda_dorada) || 0,
                baseDanoRojo: Number(p.base_dano_rojo) || 0,
                baseDanoAzul: Number(p.base_dano_azul) || 0,
                baseElimDorada: Number(p.base_elim_dorada) || 0,

                afinidadesBase: {
                    fisica: Number(p.af_fisica) || 0, energetica: Number(p.af_energetica) || 0, espiritual: Number(p.af_espiritual) || 0,
                    mando: Number(p.af_mando) || 0, psiquica: Number(p.af_psiquica) || 0, oscura: Number(p.af_oscura) || 0
                },
                hechizos: { /* ... mock info ... */ },
                hechizosEfecto: { /* ... mock info ... */ },
                buffs: { /* ... mock info ... */ },
                estados: p.estados || {},
                notasAfinidad: p.notas_afinidad || {},
                iconoOverride: p.icono_override || ''
            };
        });

        const estadosListMock = (estadosArr || []).map(e => ({
            id: e.id, nombre: e.nombre, tipo: e.tipo, bg: e.color_bg, border: e.color_border, desc: e.descripcion
        }));

        // Inicializamos los módulos activos
        await initStatsDev(statsGlobalMock, estadosListMock);
        await initPaginaDev();

        // [PENDIENTE] Inicialización de módulos desactivados
        // initObjetosDev(catalogoObj, invObj);
        // initHechizosDev(catalogoHz, invHz || []);
        // initMapaDev(nodosParaMapa, enlacesParaMapa, coloresParaMapa);
        // renderColumnaMapa();

        document.getElementById('pantalla-carga').classList.add('oculto');
        document.getElementById('interfaz-master').classList.remove('oculto');

        renderSelectorPersonajes();

        window.addEventListener('devUIUpdate', () => {
            if (devState.pjSeleccionado) {
                renderColumnaStats(devState.pjSeleccionado);
                // [PENDIENTE]
                // renderColumnaObjetos(devState.pjSeleccionado);
                // renderColumnaHechizos(devState.pjSeleccionado);
            }
            revisarCambiosPendientes();
            actualizarLogGlobal();
        });

        window.addEventListener('devDataChanged', () => {
            revisarCambiosPendientes();
            actualizarLogGlobal();
        });

        // [PENDIENTE]
        // window.addEventListener('devMapaUpdate', () => { renderColumnaMapa(); });

        window.addEventListener('devPersonajesUpdate', () => {
            renderSelectorPersonajes();
        });

    } catch (error) {
        console.error("Error crítico cargando DB:", error);
        document.getElementById('pantalla-carga').innerHTML = `<h2 style="color:#ff4444;">Error de conexión a la Base de Datos: ${error.message}</h2>`;
    }
};

function cambiarFiltroRol(rol) {
    devState.filtroRolActual = rol;
    const btnJ = document.getElementById('tab-jugadores');
    const btnN = document.getElementById('tab-npcs');

    btnJ.className = 'tab-rol-btn' + (rol === 'jugadores' ? ' active-jugadores' : '');
    btnN.className = 'tab-rol-btn' + (rol === 'npcs'      ? ' active-npcs'      : '');

    renderSelectorPersonajes();
}

function filtrarPorNombre(texto) {
    devState.busquedaTexto = texto.toLowerCase();
    renderSelectorPersonajes();
}

function renderSelectorPersonajes() {
    const contenedor = document.getElementById('dev-character-list');
    if (!contenedor) return;

    let filtrados = devState.listaPersonajes.filter(p => {
        const coincideRol = devState.filtroRolActual === 'jugadores' ? p.is_player : !p.is_player;
        const coincideNom = p.nombre.toLowerCase().includes(devState.busquedaTexto);
        return coincideRol && coincideNom;
    });

    if (filtrados.length === 0) {
        contenedor.innerHTML = `<div style="color:#666; font-style:italic; padding:20px;">No se encontraron personajes.</div>`;
        return;
    }

    let html = '';
    filtrados.sort((a,b) => a.nombre.localeCompare(b.nombre)).forEach(p => {
        const icono = norm(p.icono_override || p.nombre);
        const imgUrl = `${STORAGE_URL}/imgpersonajes/${icono}icon.png`;
        const imgError = `this.onerror=null; this.src='${STORAGE_URL}/imginterfaz/no_encontrado.png'`;
        const borderColor = p.is_player ? '#00e676' : '#ff4444';
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

    document.getElementById('dev-workspace').classList.remove('oculto');

    renderColumnaStats(devState.pjSeleccionado);
    // [PENDIENTE]
    // renderColumnaObjetos(devState.pjSeleccionado);
    // renderColumnaHechizos(devState.pjSeleccionado);
}

function cambiarPanelInferior(panel) {
    const paneles = ['mapa', 'personaje', 'acciones', 'pagina'];
    paneles.forEach(p => {
        document.getElementById(`panel-inf-${p}`)?.classList.add('oculto');
        const tab = document.getElementById(`tab-inf-${p}`);
        if (tab) {
            tab.style.background   = '#111';
            tab.style.color        = '#666';
            tab.style.borderBottom = '2px solid #333';
        }
    });

    document.getElementById(`panel-inf-${panel}`)?.classList.remove('oculto');
    const tabActivo = document.getElementById(`tab-inf-${panel}`);
    if (tabActivo) {
        tabActivo.style.background   = '#05050a';
        tabActivo.style.color        = '#d4af37';
        tabActivo.style.borderBottom = '2px solid #05050a';
    }

    if (panel === 'pagina')    renderColumnaPagina();
    // [PENDIENTE]
    // if (panel === 'mapa')      renderColumnaMapa();
    // if (panel === 'personaje') renderColumnaPersonaje();
    // if (panel === 'acciones')  renderColumnaClonar();
}

function copiarLogGlobal() {
    const textarea = document.getElementById('log-global-textarea');
    if (!textarea || !textarea.value) return;

    navigator.clipboard.writeText(textarea.value).then(() => {
        const btn = document.querySelector('button[onclick="window.copiarLogGlobal()"]');
        if (btn) {
            const textoOriginal = btn.innerText;
            btn.innerText = "📄 ¡LOG COPIADO!";
            btn.style.filter = "brightness(1.3)";
            setTimeout(() => {
                btn.innerText = textoOriginal;
                btn.style.filter = "brightness(1)";
            }, 1500);
        }
    });
}
