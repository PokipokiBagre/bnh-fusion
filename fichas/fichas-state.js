// ============================================================
// fichas-state.js
// ============================================================
// MODELO CORRECTO:
//   personajes            = aliases (nombre, refinado_id) — sin stats
//   personajes_refinados  = grupos  (nombre_refinado, stats, tags, lore)
//   El catálogo muestra GRUPOS, no personajes individuales.
// ============================================================
import { currentConfig } from '../bnh-auth.js';

export const STORAGE_URL = currentConfig.storageUrl;

// Grupos (personajes_refinados) — estos tienen stats, tags, lore
export let gruposGlobal  = [];

// Aliases (personajes) — solo nombre + refinado_id, sin stats
// Usados solo por el panel OP para gestionar membership
export let aliasesGlobal = [];

// PT por grupo: { nombre_refinado: { '#Tag': N } }
export let ptGlobal      = {};

// Hilos para el filtro
export let hilosGlobal   = [];

export let fichasUI = {
    vistaActual:   'catalogo',  // 'catalogo' | 'detalle'
    seleccionado:  null,        // nombre_refinado del grupo seleccionado
    esAdmin:       false,
    tagsFiltro:    [],
    hiloFiltro:    'todos',
    tagBusqueda:   '',
    nombreBusqueda:'',          // ← buscador de nombres/aliases
    modoAsignar:   false,       // ← modo asignar tags activo
    filtroRol:     'todos',     // 'todos' | '#Jugador' | '#NPC'
    filtroEstado:  'todos',     // 'todos' | '#Activo' | '#Inactivo'
    modoInverso:   false,       // ← modo inverso: selecciona personaje, asigna tags
    tagsAsignar:   new Set(),   // ← tags seleccionados en modo asignar
    grupoAsignar:  null,        // ← grupo seleccionado en modo inverso
};

export const norm = (str) => str.toString().trim().toLowerCase()
    .replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e')
    .replace(/[íìïî]/g,'i').replace(/[óòöô]/g,'o')
    .replace(/[úùüû]/g,'u').replace(/[ñ]/g,'n')
    .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
