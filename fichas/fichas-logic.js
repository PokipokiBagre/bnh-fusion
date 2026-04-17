// ============================================================
// fichas-logic.js
// ============================================================
export { calcTier, calcPVMax, calcCambios, fmtTag, normTag } from '../bnh-pac.js';

export function colorTier(tier) {
    const t = {
        4: { bg:'#7d3c00', border:'#f39c12', text:'#f8c471', label:'TIER 4' },
        3: { bg:'#4a235a', border:'#8e44ad', text:'#c39bd3', label:'TIER 3' },
        2: { bg:'#1a4a80', border:'#2980b9', text:'#7fb3d3', label:'TIER 2' },
        1: { bg:'#1e5631', border:'#27ae60', text:'#82e0aa', label:'TIER 1' }
    };
    return t[tier] || t[1];
}

// Construye mapa { '#Tag': count } de todos los personajes visibles
export function buildTagIndex(personajes) {
    const map = {};
    personajes.forEach(p => {
        (p.tags || []).forEach(t => {
            const k = t.startsWith('#') ? t : '#'+t;
            map[k] = (map[k] || 0) + 1;
        });
    });
    return map;
}

export function totalPT(ptDePJ) {
    if (!ptDePJ) return 0;
    return Object.values(ptDePJ).reduce((a,b)=>a+b, 0);
}

export const COSTOS = { stat:50, medalla:75, mutacion:100 };
