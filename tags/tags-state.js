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
    tabActual:      'progresion',   // Ahora arranca en progresión
    pjSeleccionado: null,           
    busquedaCat:    '',             
    busquedaMedallasAcc: '',        // Buscador de medallas accesibles
    esAdmin:        false,
    filtroRol:      '#Jugador',     
    filtroEstado:   '#Activo',      
};

export let grupos        = [];   
export let puntosAll     = [];   
export let catalogoTags  = [];   
export let medallasCat   = [];   
export let solicitudes   = [];   

export function setGrupos(d)       { grupos       = d; }
export function setPuntosAll(d)    { puntosAll    = d; }
export function setCatalogoTags(d) { catalogoTags = d; }
export function setMedallasCat(d)  { medallasCat  = d; }
export function setSolicitudes(d)  { solicitudes  = d; }

export let tagDetalle = null;
export function setTagDetalle(v) { tagDetalle = v; }
