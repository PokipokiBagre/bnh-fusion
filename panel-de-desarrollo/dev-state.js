import { currentConfig } from '../bnh-auth.js';

export const STORAGE_URL = currentConfig.storageUrl;

export const devState = {
    pjSeleccionado: null,
    listaPersonajes: [],
    filtroRolActual: 'jugadores',
    busquedaTexto: ''
};

export const norm = (str) => str.toString().trim().toLowerCase()
    .replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e').replace(/[íìïî]/g,'i')
    .replace(/[óòöô]/g,'o').replace(/[úùüû]/g,'u').replace(/ñ/g,'n').replace(/\s+/g,'_')
    .replace(/[^a-z0-9_]/g,'');
