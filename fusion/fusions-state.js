// fusions/fusions-state.js
import { currentConfig } from '../bnh-auth.js';

export const STORAGE_URL = currentConfig.storageUrl;

export const fusionsState = {
    tabActual:           'simulador',
    pjA:                 null,   // nombre del sujeto A seleccionado
    pjB:                 null,   // nombre del sujeto B seleccionado
    d100:                null,
    resultadoCalculado:  null,
    // Stats editables post-cálculo (overrides manuales del OP)
    statsEditadas: { pot: null, agi: null, ctl: null },
};

export let personajes      = [];  // array de personajes_refinados
export let ptGlobales      = [];  // array de puntos_tag
export let fusionesActivas = [];  // array de fusiones_activas

export function setPersonajes(data)      { personajes      = data; }
export function setPtGlobales(data)      { ptGlobales      = data; }
export function setFusionesActivas(data) { fusionesActivas = data; }

export const norm = (str) => str.toString().trim().toLowerCase()
    .replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e').replace(/[íìïî]/g,'i')
    .replace(/[óòöô]/g,'o').replace(/[úùüû]/g,'u').replace(/ñ/g,'n')
    .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
