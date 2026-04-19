// medallas/medallas-state.js
import { currentConfig } from '../bnh-auth.js';

export const STORAGE_URL = currentConfig.storageUrl;
export const norm = (str) => str.toString().trim().toLowerCase()
    .replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e').replace(/[íìïî]/g,'i')
    .replace(/[óòöô]/g,'o').replace(/[úùüû]/g,'u').replace(/ñ/g,'n')
    .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');

export const medallaState = {
    tabActual:         'catalogo',
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
    pjBloquesSel:      null,         // PJ seleccionado en tab Bloques
    filtroRolBloques:  '#Jugador',
    filtroEstBloques:  '#Activo',
    equipacion:        [],           // medallas equipadas en tab Personaje
    equipacionDetalleId: null,       // id de medalla seleccionada para ver detalle en panel
    pjBusqueda:        '',           // buscador en tab Personaje
};

// Datos globales
export let medallas  = [];   // catálogo completo (aprobadas + propuestas)
export let grupos    = [];   // personajes_refinados con tags y stats
export let puntosAll = [];   // puntos_tag

export function setMedallas(d)  { medallas  = d; }
export function setGrupos(d)    { grupos    = d; }
export function setPuntosAll(d) { puntosAll = d; }
