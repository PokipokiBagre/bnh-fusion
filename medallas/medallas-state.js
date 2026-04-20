// medallas/medallas-state.js
import { currentConfig } from '../bnh-auth.js';

export const STORAGE_URL = currentConfig.storageUrl;
export const norm = (str) => str.toString().trim().toLowerCase()
    .replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e').replace(/[íìïî]/g,'i')
    .replace(/[óòöô]/g,'o').replace(/[úùüû]/g,'u').replace(/ñ/g,'n')
    .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');

export const medallaState = {
    tabActual:         'personaje',
    esAdmin:           false,
    busqueda:          '',
    filtroTag:         '',
    filtroPropuestas:  false,
    pjSeleccionado:    null,
    filtroRolPJ:       '#Jugador',
    filtroEstadoPJ:    '#Activo',
    grafoTagsSel:      [],
    grafoTagPagina:    0,
    grafoBusqueda:     '',
    pjBloquesSel:      null,
    filtroRolBloques:  '#Jugador',
    filtroEstBloques:  '#Activo',
    equipacion:        [],
    equipacionPropuesta: [],
    equipacionDetalleId: null,
    pjBusqueda:        '',
};

// Datos globales
export let medallas  = [];
export let grupos    = [];
export let puntosAll = [];

// NUEVO: Variables del Lente de Fusión
export let opcionesFusion = {};
export let bannedTags     = [];

export function setMedallas(d)  { medallas = d; }
export function setGrupos(d)    { grupos = d; }
export function setPuntosAll(d) { puntosAll = d; }

export function setOpcionesFusion(d) { opcionesFusion = d; }
export function setBannedTags(d)     { bannedTags = d; }
