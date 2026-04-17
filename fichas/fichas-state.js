// ============================================================
// fichas-state.js
// ============================================================
import { currentConfig } from '../bnh-auth.js';

export const STORAGE_URL = currentConfig.storageUrl;

// Datos cargados
export let fichasGlobal  = [];   // todos los personajes de la DB
export let gruposGlobal  = [];   // personajes_refinados (grupos nombre)
export let ptGlobal      = {};   // { nombre_pj: { '#Tag': N } }
export let hilosGlobal   = [];   // historial_hilos para el filtro

// Estado de la UI
export let fichasUI = {
    vistaActual:    'catalogo',   // 'catalogo' | 'detalle'
    seleccionado:   null,
    esAdmin:        false,
    tagsFiltro:     [],           // tags activos (booru filter)
    hiloFiltro:     'todos',      // thread_id o 'todos'
    tagBusqueda:    '',           // texto buscador sidebar
};

export const norm = (str) => str.toString().trim().toLowerCase()
    .replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e')
    .replace(/[íìïî]/g,'i').replace(/[óòöô]/g,'o')
    .replace(/[úùüû]/g,'u').replace(/[ñ]/g,'n')
    .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
