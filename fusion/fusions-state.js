// fusions/fusions-state.js
import { currentConfig } from '../bnh-auth.js';

export const STORAGE_URL = currentConfig.storageUrl;

export const fusionsState = {
    tabActual:           'simulador',
    pjA:                 null,
    pjB:                 null,
    d100:                null,
    rendTotal:           null,   
    resultadoCalculado:  null,
    statsEditadas:       { pot: null, agi: null, ctl: null },
    tagFusionNombre:     '',     
    compatTags:          0,      
    compatPct:           0,      
    esAdmin:             false,  
};

export let personajes       = [];
export let ptGlobales       = [];
export let fusionesActivas  = [];
export let registroFusiones = [];
export let bannedTags       = []; // NUEVO: Tags excluidos

export function setPersonajes(data)       { personajes       = data; }
export function setPtGlobales(data)       { ptGlobales       = data; }
export function setFusionesActivas(data)  { fusionesActivas  = data; }
export function setRegistroFusiones(data) { registroFusiones = data; }

// NUEVO: Almacenamos los tags baneados siempre en minúsculas y con #
export function setBannedTags(data) { 
    bannedTags = data.map(t => (t.startsWith('#') ? t : '#' + t).toLowerCase()); 
}

export const norm = (str) => str.toString().trim().toLowerCase()
    .replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e').replace(/[íìïî]/g,'i')
    .replace(/[óòöô]/g,'o').replace(/[úùüû]/g,'u').replace(/ñ/g,'n')
    .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
