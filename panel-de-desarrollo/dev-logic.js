// ============================================================
// dev-logic.js — Lógica Centralizada (Simplificada)
// ============================================================

import { stState } from './estadisticas/panel-stats-state.js';
import { paginaState } from './pagina/panel-pagina-state.js';

// Si en el futuro necesitas lógicas globales cruzadas entre 
// la página y las agrupaciones, irán aquí. 
// Por ahora, cada módulo se auto-gestiona de manera limpia.

export function limpiarSeleccion() {
    console.log("Limpiando selección global...");
}
