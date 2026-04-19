// medallas/medallas-state.js
import { currentConfig } from '../bnh-auth.js';

export const STORAGE_URL = currentConfig.storageUrl;
export const norm = (str) => str.toString().trim().toLowerCase()
    .replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e').replace(/[íìïî]/g,'i')
    .replace(/[óòöô]/g,'o').replace(/[úùüû]/g,'u').replace(/ñ/g,'n')
    .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');

export const medallaState = {
    tabActual:         'catalogo',   // 'catalogo' | 'grafo' | 'personaje'
    esAdmin:           false,
    busqueda:          '',
    filtroTag:         '',
    filtroPropuestas:  false,        // mostrar solo propuestas (OP)
    pjSeleccionado:    null,
    filtroRolPJ:       '#Jugador',   // filtro pool personajes en tab Personaje
    filtroEstadoPJ:    '#Activo',
    // Grafo: tags seleccionados (array de strings con #)
    grafoTagsSel:      [],
    grafoTagPagina:    0,            // paginación del selector de tags
    grafoBusqueda:     '',
};

// Datos globales
export let medallas  = [];   // catálogo completo (aprobadas + propuestas)
export let grupos    = [];   // personajes_refinados con tags y stats
export let puntosAll = [];   // puntos_tag

export function setMedallas(d)  { medallas  = d; }
export function setGrupos(d)    { grupos    = d; }
export function setPuntosAll(d) { puntosAll = d; }
