// ============================================================
// dev-main.js — Controlador de Eventos y Renderizado Global
// ============================================================

import { bnhAuth } from '../bnh-auth.js';
import { STORAGE_URL } from './dev-state.js';
import { initStatsDev } from './estadisticas/panel-stats-logic.js';
import { renderPanelStats } from './estadisticas/panel-stats-ui.js';
import { initPaginaDev, renderColumnaPagina } from './pagina/panel-pagina-ui.js';

window.cambiarPestana = cambiarPestana;

window.onload = async () => {
    const favicon = document.getElementById("dynamic-favicon");
    if (favicon) favicon.href = `${STORAGE_URL}/imginterfaz/icon.png?v=${Date.now()}`;

    await bnhAuth.init();
    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();

    if (!bnhAuth.esAdmin()) {
        document.getElementById('pantalla-carga').classList.add('oculto');
        document.getElementById('access-denied').classList.remove('oculto');
        return;
    }

    try {
        await initStatsDev(); 
        await initPaginaDev();

        document.getElementById('pantalla-carga').classList.add('oculto');
        document.getElementById('interfaz-master').classList.remove('oculto');

        renderPanelStats();
        renderColumnaPagina();

    } catch (error) {
        console.error("Error crítico:", error);
        document.getElementById('pantalla-carga').innerHTML = `<h2 style="color:#ff4444;">Error de BD: ${error.message}</h2>`;
    }
};

function cambiarPestana(id) {
    document.querySelectorAll('.top-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${id}`).classList.add('active');

    document.getElementById('vista-stats').classList.add('oculto');
    document.getElementById('vista-pagina').classList.add('oculto');

    document.getElementById(`vista-${id}`).classList.remove('oculto');
}
