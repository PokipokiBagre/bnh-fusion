// ============================================================
// tags/tags-logic.js
// ============================================================
import { grupos, puntosAll, catalogoTags, medallasCat } from './tags-state.js';

export const UMBRALES = [
    { pts: 50,  tipo: 'stat_pot', label: '50 → +1 POT' },
    { pts: 50,  tipo: 'stat_agi', label: '50 → +1 AGI' },
    { pts: 50,  tipo: 'stat_ctl', label: '50 → +1 CTL' },
    { pts: 75,  tipo: 'medalla',  label: '75 → Medalla' },
    { pts: 100, tipo: 'tres_tags',label: '100 → 3 tags' },
];
export const UMBRAL_MAX = 100;

export function getPuntosPJ(nombrePJ) {
    const mapa = {};
    puntosAll.filter(p => p.personaje_nombre === nombrePJ)
             .forEach(p => { mapa[p.tag] = p.cantidad; });
    return mapa;
}

export function getTagsConPuntos(nombrePJ) {
    const g = grupos.find(x => x.nombre_refinado === nombrePJ);
    if (!g) return [];
    const ptsMapa = getPuntosPJ(nombrePJ);
    return (g.tags || []).map(t => {
        const tNorm = t.startsWith('#') ? t : '#' + t;
        const p = ptsMapa[tNorm] || ptsMapa[tNorm.slice(1)] || 0;
        return { tag: tNorm, pts: p };
    }).sort((a, b) => b.pts - a.pts || a.tag.localeCompare(b.tag));
}

export function descDe(tagNombre) {
    const t = tagNombre.startsWith('#') ? tagNombre.slice(1) : tagNombre;
    const item = catalogoTags.find(c => c.nombre.toLowerCase() === t.toLowerCase());
    return item ? item.descripcion : '';
}

export function rankingPorPT() {
    const totales = {};
    puntosAll.forEach(p => {
        totales[p.personaje_nombre] = (totales[p.personaje_nombre] || 0) + p.cantidad;
    });
    return Object.entries(totales)
        .map(([nombre, total]) => ({ nombre, total }))
        .sort((a, b) => b.total - a.total);
}

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

export function tagsCercaDeCanje() {
    const res = [];
    puntosAll.forEach(p => {
        if (p.cantidad >= 75) {
            res.push({ pj: p.personaje_nombre, tag: p.tag, pts: p.cantidad });
        }
    });
    return res.sort((a, b) => b.pts - a.pts).slice(0, 30);
}

export function medallasDe(tagNombre) {
    const t = tagNombre.startsWith('#') ? tagNombre : '#' + tagNombre;
    return medallasCat.filter(m => 
        (m.requisitos_base || []).some(r => 
            (r.tag.startsWith('#') ? r.tag : '#' + r.tag).toLowerCase() === t.toLowerCase()
        ) ||
        (m.efectos_condicionales || []).some(ec => 
            (ec.tag.startsWith('#') ? ec.tag : '#' + ec.tag).toLowerCase() === t.toLowerCase()
        )
    );
}

export function getMedallasAccesibles(nombrePJ) {
    const g = grupos.find(x => x.nombre_refinado === nombrePJ);
    if (!g) return [];
    const ptsMapa = getPuntosPJ(nombrePJ);
    const tagsGrupo = (g.tags||[]).map(t => (t.startsWith('#')?t:'#'+t).toLowerCase());

    return medallasCat.filter(m => {
        if (m.propuesta) return false;
        const reqs = m.requisitos_base || [];
        if (reqs.length === 0) return false; 
        for (const r of reqs) {
            const tNorm = (r.tag.startsWith('#')?r.tag:'#'+r.tag).toLowerCase();
            if (!tagsGrupo.includes(tNorm)) return false;
            const pts = ptsMapa[tNorm] || ptsMapa[tNorm.slice(1)] || 0;
            if (pts < (r.pts_minimos||0)) return false;
        }
        return true;
    }).sort((a, b) => a.nombre.localeCompare(b.nombre));
}
