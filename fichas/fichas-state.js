// ============================================================
// fichas-state.js
// ============================================================
import { currentConfig } from '../bnh-auth.js';

export const STORAGE_URL = currentConfig.storageUrl;

// Todos los personajes cargados con sus stats
export let fichasGlobal = [];       // array de objetos personaje completos
export let ptGlobal     = {};       // { nombre: { '#Tag': N, ... } }

export let fichasUI = {
    vistaActual:  'catalogo',       // 'catalogo' | 'detalle'
    seleccionado: null,             // nombre del personaje activo
    esAdmin:      false,
    filtroTexto:  ''
};

// Normaliza nombre para usar como clave de imagen
export const norm = (str) => str.toString().trim().toLowerCase()
    .replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i').replace(/[óòöô]/g, 'o')
    .replace(/[úùüû]/g, 'u').replace(/[ñ]/g, 'n')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
