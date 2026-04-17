// ============================================================
// hist-state.js — Estado Global del Tracking de Posts
// ============================================================
import { currentConfig } from '../bnh-auth.js';

export let hilosState   = [];  // Hilos rastreados
export let postsState   = [];  // Posts del hilo activo
export let rankingState = [];  // Ranking: { poster_name, total_posts, pt_total, tags_ganados{} }

// PT por tag acumulados en el hilo activo
// { 'NombrePersonaje': { '#Eldritch': 5, '#Horror': 2, ... } }
export let ptTagState = {};

export let estadoUI = {
    vistaActual:         'ranking',  // 'ranking' | 'timeline' | 'hilos'
    hiloActivo:          null,       // { board, thread_id, thread_url, titulo }
    autoRefresh:         false,
    refreshInterval:     null,
    refreshRate:         10000,
    esAdmin:             false,
    cargando:            false,
    ultimaActualizacion: null,
    nuevosPosts:         0
};

export const BOARD_DEFAULT = 'hisrol';
export const CORS_PROXY    = 'https://api.allorigins.win/raw?url=';
