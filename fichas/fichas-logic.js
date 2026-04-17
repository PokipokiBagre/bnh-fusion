// ============================================================
// fichas-logic.js — Cálculos derivados usando bnh-pac.js
// ============================================================
export { calcTier, calcPVMax, calcCambios, resumenPJ, fmtTag, normTag } from '../bnh-pac.js';

// Colores por Tier para la UI
export function colorTier(tier) {
    switch (tier) {
        case 4: return { bg: '#2d1b00', border: '#f59e0b', text: '#fbbf24' };
        case 3: return { bg: '#1a0030', border: '#a855f7', text: '#c084fc' };
        case 2: return { bg: '#001a30', border: '#3b82f6', text: '#60a5fa' };
        default: return { bg: '#0f1f0f', border: '#22c55e', text: '#4ade80' };
    }
}

// Total de PT de un personaje en todos sus tags
export function totalPT(ptDePersonaje) {
    if (!ptDePersonaje) return 0;
    return Object.values(ptDePersonaje).reduce((a, b) => a + b, 0);
}

// ¿Puede canjearse un tag? (Regla de Pureza)
export const COSTOS = { stat: 50, medalla: 75, mutacion: 100 };
export function puedeCanjear(ptDelTag, tipo) {
    return (ptDelTag || 0) >= (COSTOS[tipo] || Infinity);
}
