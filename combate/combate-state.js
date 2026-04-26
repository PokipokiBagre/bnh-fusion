// ============================================================
// combate/combate-state.js
// ============================================================
import { currentConfig } from '../bnh-auth.js';

export const STORAGE_URL = currentConfig.storageUrl;

export const norm = (str) => str.toString().trim().toLowerCase()
    .replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e').replace(/[íìïî]/g,'i')
    .replace(/[óòöô]/g,'o').replace(/[úùüû]/g,'u').replace(/ñ/g,'n')
    .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');

// ── Estado principal ──────────────────────────────────────────
export const combateState = {
    esAdmin: false,

    // Equipos: array de slots (null = vacío)
    equipoA: [null, null, null, null, null], // Azul
    equipoB: [null, null, null, null, null], // Rojo

    // Slot activo expandido (para edición)
    slotActivoEquipo: null,  // 'A' | 'B'
    slotActivoIdx:    null,

    // Registro de cambios acumulados
    registro: [], // { nombre, cambios: [{tipo, descripcion, valorDelta}] }
};

// ── Datos cargados de la BD ───────────────────────────────────
export let todosLosPJs       = [];   // personajes_refinados completos
export let todosLosPTs       = {};   // { nombrePJ: { '#Tag': N } }
export let todasLasMedallas  = [];   // medallas_catalogo completas
export let inventarios       = {};   // { nombrePJ: [medalla, ...] }
export let catalogoTagsArr   = [];   // tags del catálogo

export function setTodosLosPJs(d)      { todosLosPJs = d; }
export function setTodosLosPTs(d)      { todosLosPTs = d; }
export function setTodasLasMedallas(d) { todasLasMedallas = d; }
export function setInventarios(d)      { inventarios = d; }
export function setCatalogoTagsArr(d)  { catalogoTagsArr = d; }

// ── Slot de combate ───────────────────────────────────────────
// Cada slot es un objeto que extiende el personaje con estado virtual de combate
export function crearSlot(pj, medEquipadas) {
    const pts = { ...(todosLosPTs[pj.nombre_refinado] || {}) };
    return {
        // Identidad
        nombre:    pj.nombre_refinado,
        // Stats base reales
        potBase:   pj.pot_total   || pj.pot || 0,
        agiBase:   pj.agi_total   || pj.agi || 0,
        ctlBase:   pj.ctl_total   || pj.ctl || 0,
        pvMax:     pj.pv_total    || 0,
        pvActual:  pj.pv_actual_total !== undefined ? pj.pv_actual_total : (pj.pv_total || 0),
        cambios:   pj.cambios_total   || 0,
        // Stats actuales (modificables en combate)
        pot:       pj.pot_total   || pj.pot || 0,
        agi:       pj.agi_total   || pj.agi || 0,
        ctl:       pj.ctl_total   || pj.ctl || 0,
        pv:        pj.pv_actual_total !== undefined ? pj.pv_actual_total : (pj.pv_total || 0),
        // Tags y PTs
        tags:      [...(pj.tags || [])],
        pts,
        // Medallas virtuales (puede superar límite en simulación)
        medallas:  [...(medEquipadas || [])],
        // Dados por medalla { medalla_id: valor }
        dados: {},
        // Datos originales para referencia
        _pj: pj,
    };
}
