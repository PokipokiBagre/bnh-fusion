// ============================================================
// combate/combate-state.js  v2
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

    equipoA: [null, null, null, null, null],
    equipoB: [null, null, null, null, null],

    slotActivoEquipo: null,
    slotActivoIdx:    null,

    registro: [],   // { nombre, cambios: [{etiqueta}] }

    // Filtros de la pool de personajes
    poolFiltros: {
        estado: 'todos',   // 'todos' | '#activo' | '#inactivo'
        rol:    'todos',   // 'todos' | '#jugador' | '#npc'
        tipo:   'todos',   // 'todos' | '#héroe_profesional' | '#villano'
    },
};

// ── Datos de BD ───────────────────────────────────────────────
export let todosLosPJs       = [];
export let todosLosPTs       = {};   // { nombrePJ: { '#Tag': N } }
export let todasLasMedallas  = [];
export let inventarios       = {};   // { nombrePJ: [medalla, ...] }
export let catalogoTagsArr   = [];

export function setTodosLosPJs(d)      { todosLosPJs      = d; }
export function setTodosLosPTs(d)      { todosLosPTs      = d; }
export function setTodasLasMedallas(d) { todasLasMedallas = d; }
export function setInventarios(d)      { inventarios      = d; }
export function setCatalogoTagsArr(d)  { catalogoTagsArr  = d; }

// ── Crear slot ────────────────────────────────────────────────
// El slot lleva _d: el mapa de deltas del PJ real (de la BD),
// que el usuario puede modificar en combate sin guardar.
export function crearSlot(pj, medEquipadas) {
    const pts = { ...(todosLosPTs[pj.nombre_refinado || pj.nombre] || {}) };

    // gOriginal es el raw de BD (sin proyección). Si el PJ viene proyectado lo usamos;
    // si no (PJ sin fusión), el propio pj tiene los valores raw.
    const raw = pj.gOriginal || pj;

    // Delta defaults: copiar los deltas reales del PJ de la BD
    const _d = {};
    const campos = ['pot','agi','ctl','pv','cambios','ctl_usado','pv_actual'];
    campos.forEach(c => {
        [1,2,3,4,5].forEach(n => {
            _d[`delta_${c}_${n}`] = raw[`delta_${c}_${n}`] || '0';
        });
    });

    return {
        nombre:   pj.nombre_refinado || pj.nombre,
        // Stats base RAW de la BD (sin deltas ni proyección de fusión)
        potBase:  raw.pot || 0,
        agiBase:  raw.agi || 0,
        ctlBase:  raw.ctl || 0,
        // Stats calculados por deltas (se actualizan con recalcSlot)
        pot:      pj.pot_total   || pj.pot || 0,
        agi:      pj.agi_total   || pj.agi || 0,
        ctl:      pj.ctl_total   || pj.ctl || 0,
        pvMax:    pj.pv_total    || 0,
        cambios:  pj.cambios_total || 0,
        pv:       pj.pv_actual_total !== undefined ? pj.pv_actual_total : (pj.pv_total || 0),
        // PV actual manual (null = usar pvMax)
        _pvActualManual: raw.pv_actual !== null && raw.pv_actual !== undefined ? raw.pv_actual : null,
        // Tags y PTs
        tags:     [...(pj.tags || [])],
        pts,
        // Medallas virtuales
        medallas: [...(medEquipadas || [])],
        // Dados { medalla_id: valor }
        dados: {},
        // Mapa de deltas (editable en combate)
        _d,
        // Referencia al raw de BD (para recalcSlot y guardar)
        _pj: raw,
        // Referencia al PJ proyectado completo (por si se necesita)
        _pjProyectado: pj,
    };
}
