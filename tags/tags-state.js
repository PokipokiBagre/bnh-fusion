// ============================================================
// tags/tags-state.js
// ============================================================
import { currentConfig } from '../bnh-auth.js';

export const STORAGE_URL = currentConfig.storageUrl;

export const norm = (str) => str.toString().trim().toLowerCase()
    .replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e').replace(/[íìïî]/g,'i')
    .replace(/[óòöô]/g,'o').replace(/[úùüû]/g,'u').replace(/ñ/g,'n')
    .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');

export const tagsState = {
    tabActual:      'catalogo',   // 'progresion' | 'catalogo' | 'estadisticas'
    pjSeleccionado: null,           // nombre_refinado activo en tab Progresión
    busquedaCat:    '',             // filtro texto en Catálogo
    esAdmin:        false,
    filtroRol:      '#Jugador',     // 'todos' | '#Jugador' | '#NPC'
    filtroEstado:   '#Activo',      // 'todos' | '#Activo' | '#Inactivo'
};

// Datos globales cargados una sola vez
export let grupos        = [];   // personajes_refinados completos
export let puntosAll     = [];   // [{ personaje_nombre, tag, cantidad }]
export let catalogoTags  = [];   // [{ nombre, descripcion, baneado }] de tags_catalogo
export let medallasCat   = [];   // [{ nombre, tags[], costo_ctl, efecto_desc }]

export function setGrupos(d)       { grupos       = d; }
export function setPuntosAll(d)    { puntosAll    = d; }
export function setCatalogoTags(d) { catalogoTags = d; }
export function setMedallasCat(d)  { medallasCat  = d; }

// Tag seleccionado para vista detalle
export let tagDetalle = null;
export function setTagDetalle(t) { tagDetalle = t; }
