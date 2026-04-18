// ============================================================
// tags/tags-logic.js — Cálculos de progresión y estadísticas
// ============================================================
import { grupos, puntosAll, catalogoTags, medallasCat } from './tags-state.js';

// Umbrales de canje
export const UMBRALES = [
    { pts: 50,  tipo: 'stat_pot', label: '50 → +1 POT', color: 'prog-green'  },
    { pts: 50,  tipo: 'stat_agi', label: '50 → +1 AGI', color: 'prog-green'  },
    { pts: 50,  tipo: 'stat_ctl', label: '50 → +1 CTL', color: 'prog-green'  },
    { pts: 75,  tipo: 'medalla',  label: '75 → Medalla', color: 'prog-orange' },
    { pts: 100, tipo: 'tres_tags',label: '100 → 3 tags', color: 'prog-red'    },
];
export const UMBRAL_MAX = 100;

// Puntos de un PJ por tag
export function getPuntosPJ(nombrePJ) {
    const mapa = {};
    puntosAll.filter(p => p.personaje_nombre === nombrePJ)
             .forEach(p => { mapa[p.tag] = p.cantidad; });
    return mapa;
}

// Tags que tiene el PJ (de gruposGlobal), con sus PT
export function getTagsConPuntos(nombrePJ) {
    const g = grupos.find(x => x.nombre_refinado === nombrePJ);
    if (!g) return [];
    const ptsMapa = getPuntosPJ(nombrePJ);
    return (g.tags || [])
        .map(t => {
            const tag = t.startsWith('#') ? t : '#' + t;
            const pts = ptsMapa[tag] || ptsMapa[tag.slice(1)] || 0;
            return { tag, pts };
        })
        .sort((a, b) => b.pts - a.pts);
}

// Estado de un tag respecto a sus umbrales
export function estadoUmbral(pts) {
    const pct = Math.min(pts / UMBRAL_MAX, 1);
    if (pts >= UMBRAL_MAX)   return { clase: 'done',  texto: '¡Listo para canjear!' };
    if (pts >= 75)           return { clase: 'done',  texto: `${pts}/100` };
    if (pts >= UMBRAL_MAX * 0.6) return { clase: 'close', texto: `${pts}/100` };
    return { clase: 'far', texto: `${pts}/100` };
}

// Lista de PJs ordenados por total de PT
export function rankingPorPT() {
    const totales = {};
    puntosAll.forEach(p => {
        totales[p.personaje_nombre] = (totales[p.personaje_nombre] || 0) + p.cantidad;
    });
    return Object.entries(totales)
        .map(([nombre, total]) => ({ nombre, total }))
        .sort((a, b) => b.total - a.total);
}

// Tags más comunes entre todos los PJs
export function tagsMasComunes(n = 20) {
    const mapa = {};
    grupos.forEach(g => (g.tags || []).forEach(t => {
        const k = t.startsWith('#') ? t : '#' + t;
        mapa[k] = (mapa[k] || 0) + 1;
    }));
    return Object.entries(mapa)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([tag, count]) => ({ tag, count }));
}

// Tags más cerca de canje (pts entre 80-99 o >= 100)
export function tagsCercaDeCanje() {
    const res = [];
    puntosAll.forEach(p => {
        if (p.cantidad >= 75) {
            res.push({ pj: p.personaje_nombre, tag: p.tag, pts: p.cantidad });
        }
    });
    return res.sort((a, b) => b.pts - a.pts).slice(0, 30);
}

// Para un tag dado, qué medallas están asociadas
export function medallasDe(tagNombre) {
    const t = tagNombre.startsWith('#') ? tagNombre.slice(1) : tagNombre;
    return medallasCat.filter(m =>
        (m.tags || []).some(mt => (mt.startsWith('#') ? mt.slice(1) : mt).toLowerCase() === t.toLowerCase())
    );
}

// Descripción del catálogo para un tag
export function descDe(tagNombre) {
    const t = tagNombre.startsWith('#') ? tagNombre.slice(1) : tagNombre;
    return catalogoTags.find(c => c.nombre.toLowerCase() === t.toLowerCase())?.descripcion || '';
}
