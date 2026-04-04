// ============================================================
// hist-state.js — Estado Global del Tracking de Posts
// ============================================================
import { currentConfig } from '../../bnh-auth.js';

export let hilosState    = [];   // Hilos rastreados
export let postsState    = [];   // Posts del hilo activo
export let puntosState   = [];   // Puntos por post
export let rankingState  = [];   // Ranking calculado

export let estadoUI = {
    vistaActual:      'ranking',   // 'ranking' | 'timeline' | 'hilos' | 'config'
    hiloActivo:       null,        // { board, thread_id, thread_url, titulo }
    autoRefresh:      false,
    refreshInterval:  null,
    refreshRate:      10000,       // ms — igual que Live Updates de 8chan
    esAdmin:          false,
    cargando:         false,
    ultimaActualizacion: null,
    nuevosPosts:      0            // Posts nuevos detectados en el último poll
};

// Configuración de puntos (editable desde la UI de admin)
export let CONFIG_PUNTOS = {
    base:            10,   // puntos si pasaron > 6 horas
    medio:           20,   // puntos si pasaron 1-6 horas
    rapido:          50,   // puntos si pasaron < 1 hora
    umbral_rapido:   60,   // minutos
    umbral_medio:    360   // minutos (6 horas)
};

export const BOARD_DEFAULT  = 'hisrol';
export const CORS_PROXY     = 'https://api.allorigins.win/raw?url=';
