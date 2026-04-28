// ============================================================
// tags/tags-logic.js
// ============================================================
import { grupos, puntosAll, catalogoTags, medallasCat, opcionesFusion, bannedTags } from './tags-state.js';
import { getFusionDe } from '../bnh-fusion.js';
import { aplicarDeltas } from '../bnh-pac.js';

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

// ── LENTE DE FUSIÓN ──────────────────────────────────────────
export function proyectarPJ(nombrePJ) {
    const g = grupos.find(x => x.nombre_refinado === nombrePJ);
    if (!g) return null;
    
    const f = getFusionDe(nombrePJ);
    const ptOriginal = getPuntosPJ(nombrePJ);
    const tagsOriginal = g.tags || [];

    // ── Bonos de PT estructurales (50 PT = +1 Stat) ──────────
    let ptPot = 0, ptAgi = 0, ptCtl = 0;
    Object.keys(ptOriginal).forEach(k => {
        const norm = k.toLowerCase().replace(/^#/, '');
        if (norm === 'stat_pot') ptPot = ptOriginal[k];
        if (norm === 'stat_agi') ptAgi = ptOriginal[k];
        if (norm === 'stat_ctl') ptCtl = ptOriginal[k];
    });
    const bonoPot = Math.floor(ptPot / 50);
    const bonoAgi = Math.floor(ptAgi / 50);
    const bonoCtl = Math.floor(ptCtl / 50);

    // Base Real = Base DB + Bonos PT
    const potBaseReal = (g.pot || 0) + bonoPot;
    const agiBaseReal = (g.agi || 0) + bonoAgi;
    const ctlBaseReal = (g.ctl || 0) + bonoCtl;

    // Caso sin fusión: aplicar 5 deltas encadenados sobre la Base Real
    const potSolo = aplicarDeltas(potBaseReal, g.delta_pot_1, g.delta_pot_2, g.delta_pot_3, g.delta_pot_4, g.delta_pot_5);
    const agiSolo = aplicarDeltas(agiBaseReal, g.delta_agi_1, g.delta_agi_2, g.delta_agi_3, g.delta_agi_4, g.delta_agi_5);
    const ctlSolo = aplicarDeltas(ctlBaseReal, g.delta_ctl_1, g.delta_ctl_2, g.delta_ctl_3, g.delta_ctl_4, g.delta_ctl_5);

    if (!f) return {
        esFusion: false,
        pot: potSolo, agi: agiSolo, ctl: ctlSolo,
        pot_chain_base: potBaseReal, agi_chain_base: agiBaseReal, ctl_chain_base: ctlBaseReal,
        tags: tagsOriginal, ptsMapa: ptOriginal, ptOriginal, gOriginal: g
    };

    const compNombre = f.pj_a === nombrePJ ? f.pj_b : f.pj_a;
    const compG = grupos.find(x => x.nombre_refinado === compNombre) || {};
    const compPt = getPuntosPJ(compNombre);

    // Bonos PT del compañero
    let ptPotC = 0, ptAgiC = 0, ptCtlC = 0;
    Object.keys(compPt).forEach(k => {
        const n = k.toLowerCase().replace(/^#/, '');
        if (n === 'stat_pot') ptPotC = compPt[k];
        if (n === 'stat_agi') ptAgiC = compPt[k];
        if (n === 'stat_ctl') ptCtlC = compPt[k];
    });
    const potBaseRealC = (compG.pot || 0) + Math.floor(ptPotC / 50);
    const agiBaseRealC = (compG.agi || 0) + Math.floor(ptAgiC / 50);
    const ctlBaseRealC = (compG.ctl || 0) + Math.floor(ptCtlC / 50);

    // Fusión: 1) combinar bases reales × MULT, 2) aplicar deltas propios
    const MULT = f.rendimiento > 100 ? 1.5 : 1;
    const calcStat = (valA, valB) => {
        const modo = opcionesFusion?.modo_stats || 'suma';
        if (modo === 'promedio') return Math.ceil((valA + valB) / 2);
        if (modo === 'mayor') return Math.max(valA, valB);
        return valA + valB; 
    };

    const potFusionRaw = Math.round(calcStat(potBaseReal, potBaseRealC) * MULT);
    const agiFusionRaw = Math.round(calcStat(agiBaseReal, agiBaseRealC) * MULT);
    const ctlFusionRaw = Math.round(calcStat(ctlBaseReal, ctlBaseRealC) * MULT);

    const pot = aplicarDeltas(potFusionRaw, g.delta_pot_1, g.delta_pot_2, g.delta_pot_3, g.delta_pot_4, g.delta_pot_5);
    const agi = aplicarDeltas(agiFusionRaw, g.delta_agi_1, g.delta_agi_2, g.delta_agi_3, g.delta_agi_4, g.delta_agi_5);
    const ctl = aplicarDeltas(ctlFusionRaw, g.delta_ctl_1, g.delta_ctl_2, g.delta_ctl_3, g.delta_ctl_4, g.delta_ctl_5);

    const norm = t => (t.startsWith('#') ? t : '#' + t).toLowerCase();
    const tagsA = tagsOriginal.filter(t => !(bannedTags||[]).includes(norm(t)));
    const tagsB = (compG.tags || []).filter(t => !(bannedTags||[]).includes(norm(t)));
    
    const tagsUnionSet = new Set([...tagsA, ...tagsB]);
    tagsOriginal.filter(t => (bannedTags||[]).includes(norm(t))).forEach(t => tagsUnionSet.add(t));
    if (f.tag_fusion) tagsUnionSet.add(f.tag_fusion);

    const d100 = Math.min(f.rendimiento, 100);
    let comp = 'suma'; 
    if (opcionesFusion) {
        if (d100 <= (opcionesFusion.umbral_1 || 33)) comp = opcionesFusion.comportamiento_z1;
        else if (opcionesFusion.num_umbrales === 3 && d100 <= (opcionesFusion.umbral_2 || 66)) comp = opcionesFusion.comportamiento_z2;
        else comp = opcionesFusion.comportamiento_z3;
    }

    const calcPT = (valA, valB) => {
        if (comp === 'mayor') return Math.max(valA, valB);
        if (comp === 'suma') return valA + valB;
        if (comp === 'promedio') return Math.ceil((valA + valB) / 2);
        if (comp === 'cero') return 0;
        return valA + valB;
    };

    const ptsMapa = {};
    const todosTags = [...new Set([...Object.keys(ptOriginal), ...Object.keys(compPt)])];
    
    todosTags.forEach(tag => {
        if ((bannedTags||[]).includes(norm(tag))) {
            if (ptOriginal[tag]) ptsMapa[tag] = ptOriginal[tag]; 
        } else {
            const valA = ptOriginal[tag] || 0;
            const valB = compPt[tag] || 0;
            ptsMapa[tag] = Math.round(calcPT(valA, valB) * MULT);
        }
    });

    if (f.tag_fusion && !ptsMapa[f.tag_fusion]) {
        ptsMapa[f.tag_fusion] = opcionesFusion?.pts_tag_fusion || 0;
    }

    return {
        esFusion: true, compañero: compNombre, rendimiento: f.rendimiento,
        pot, agi, ctl,
        pot_chain_base: potFusionRaw, agi_chain_base: agiFusionRaw, ctl_chain_base: ctlFusionRaw,
        tags: [...tagsUnionSet], ptsMapa, 
        tagFusion: f.tag_fusion, ptOriginal, gOriginal: g
    };
}

// ── GETTERS REESCRITOS PARA USAR EL LENTE ────────────────────
export function getTagsConPuntos(nombrePJ) {
    const proy = proyectarPJ(nombrePJ);
    if (!proy) return [];
    return proy.tags.map(t => {
        const tNorm = t.startsWith('#') ? t : '#' + t;
        const ptsVirtuales = proy.ptsMapa[tNorm] || proy.ptsMapa[tNorm.slice(1)] || 0;
        const ptsReales = proy.ptOriginal[tNorm] || proy.ptOriginal[tNorm.slice(1)] || 0;
        return { 
            tag: tNorm, 
            pts: ptsVirtuales, 
            ptsReales: ptsReales,
            alterado: proy.esFusion && ptsVirtuales !== ptsReales // <-- DETECTA SI ES PT DE FUSIÓN
        };
    }).sort((a, b) => b.pts - a.pts || a.tag.localeCompare(b.tag));
}

export function getMedallasAccesibles(nombrePJ) {
    const proy = proyectarPJ(nombrePJ);
    if (!proy) return [];
    
    const ptsLookup = {};
    Object.keys(proy.ptsMapa).forEach(k => {
        const cleanKey = k.startsWith('#') ? k.toLowerCase() : '#' + k.toLowerCase();
        ptsLookup[cleanKey] = proy.ptsMapa[k];
    });

    const tagsGrupo = proy.tags.map(t => (t.startsWith('#')?t:'#'+t).toLowerCase());

    const medallasValidas = medallasCat.filter(m => {
        if (m.propuesta) return false;
        const reqs = m.requisitos_base || [];
        if (reqs.length === 0) return false; 
        
        for (const r of reqs) {
            const tNorm = (r.tag.startsWith('#')?r.tag:'#'+r.tag).toLowerCase();
            if (!tagsGrupo.includes(tNorm)) return false;
            
            const pts = ptsLookup[tNorm] || 0;
            if (pts < (r.pts_minimos||0)) return false;
        }
        return true;
    });

    const unicas = [];
    const ids = new Set();
    for (const m of medallasValidas) {
        if (!ids.has(m.id)) { ids.add(m.id); unicas.push(m); }
    }
    return unicas.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// ── TUS OTRAS FUNCIONES (INTACTAS) ───────────────────────────
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
