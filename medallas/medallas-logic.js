// medallas/medallas-logic.js
import { medallas, grupos, puntosAll, opcionesFusion, bannedTags } from './medallas-state.js';
import { getFusionDe } from '../bnh-fusion.js';

const mTags = m => (m.requisitos_base||[]).map(r => r.tag.startsWith('#') ? r.tag : '#'+r.tag);
const normTag = t => (t||'').trim().startsWith('#') ? t.trim().toLowerCase() : '#' + t.trim().toLowerCase();
const normKey = t => (t||'').trim().startsWith('#') ? t.trim() : '#' + t.trim();

export function getPuntosPJ(nombrePJ) {
    const m = {};
    puntosAll.filter(p => p.personaje_nombre === nombrePJ)
             .forEach(p => { m[p.tag] = p.cantidad; });
    return m;
}

// ── LENTE DE FUSIÓN PARA MEDALLAS ────────────────────────────
export function proyectarPJ(nombrePJ) {
    const g = grupos.find(x => x.nombre_refinado === nombrePJ);
    if (!g) return null;
    
    const f = getFusionDe(nombrePJ);
    const ptOriginal = getPuntosPJ(nombrePJ);
    const tagsOriginal = g.tags || [];

    if (!f) return {
        esFusion: false, pot: g.pot||0, agi: g.agi||0, ctl: g.ctl||0,
        tags: tagsOriginal, ptsMapa: ptOriginal, ptOriginal, gOriginal: g
    };

    const compNombre = f.pj_a === nombrePJ ? f.pj_b : f.pj_a;
    const compG = grupos.find(x => x.nombre_refinado === compNombre) || {};
    const compPt = getPuntosPJ(compNombre);

    const MULT = f.rendimiento > 100 ? 1.5 : 1;
    const calcStat = (valA, valB) => {
        const modo = opcionesFusion?.modo_stats || 'suma';
        if (modo === 'promedio') return Math.ceil((valA + valB) / 2);
        if (modo === 'mayor') return Math.max(valA, valB);
        return valA + valB; 
    };

    const pot = Math.round(calcStat(g.pot || 0, compG.pot || 0) * MULT);
    const agi = Math.round(calcStat(g.agi || 0, compG.agi || 0) * MULT);
    const ctl = Math.round(calcStat(g.ctl || 0, compG.ctl || 0) * MULT);

    const tagsA = tagsOriginal.filter(t => !(bannedTags||[]).includes(normTag(t)));
    const tagsB = (compG.tags || []).filter(t => !(bannedTags||[]).includes(normTag(t)));
    
    const tagsUnionSet = new Set([...tagsA, ...tagsB]);
    tagsOriginal.filter(t => (bannedTags||[]).includes(normTag(t))).forEach(t => tagsUnionSet.add(normKey(t)));
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
        if ((bannedTags||[]).includes(normTag(tag))) {
            if (ptOriginal[tag]) ptsMapa[normKey(tag)] = ptOriginal[tag]; 
        } else {
            const valA = ptOriginal[tag] || 0;
            const valB = compPt[tag] || 0;
            ptsMapa[normKey(tag)] = Math.round(calcPT(valA, valB) * MULT);
        }
    });

    if (f.tag_fusion && !ptsMapa[f.tag_fusion]) {
        ptsMapa[f.tag_fusion] = opcionesFusion?.pts_tag_fusion || 0;
    }

    return {
        esFusion: true, compañero: compNombre, rendimiento: f.rendimiento,
        pot, agi, ctl, tags: [...tagsUnionSet], ptsMapa, 
        tagFusion: f.tag_fusion, ptOriginal, gOriginal: g
    };
}

// ── GETTERS REESCRITOS PARA USAR EL LENTE ────────────────────
export function estadoMedallaPJ(medalla, nombrePJ) {
    const proy = proyectarPJ(nombrePJ);
    if (!proy) return 'bloqueada';

    const tagsGrupo = proy.tags.map(t => normTag(t));
    const ptsMapa = {};
    Object.keys(proy.ptsMapa).forEach(k => ptsMapa[normTag(k)] = proy.ptsMapa[k]);

    const reqs = medalla.requisitos_base || [];
    for (const req of reqs) {
        const tNorm = normTag(req.tag);
        if (!tagsGrupo.includes(tNorm)) return 'bloqueada';
        const pts = ptsMapa[tNorm] || 0;
        if (pts < (req.pts_minimos || 0)) return 'bloqueada';
    }
    return 'activable';
}

export function efectosActivosPJ(medalla, nombrePJ) {
    const proy = proyectarPJ(nombrePJ);
    if (!proy) return [];
    
    const tagsGrupo = proy.tags.map(t => normTag(t));
    const ptsMapa = {};
    Object.keys(proy.ptsMapa).forEach(k => ptsMapa[normTag(k)] = proy.ptsMapa[k]);

    return (medalla.efectos_condicionales || []).map(ec => {
        const tNorm = normTag(ec.tag);
        const tieneTag = tagsGrupo.includes(tNorm);
        const pts = ptsMapa[tNorm] || 0;
        const cumple = tieneTag && pts >= (ec.pts_minimos || 0);
        return { ...ec, activo: cumple, pts_actuales: pts };
    });
}

export function getTagsClusters() {
    const map = {};
    medallas.forEach(m => {
        mTags(m).forEach(t => {
            const k = normTag(t);
            if (!map[k]) map[k] = { tag: k, medallas: [] };
            map[k].medallas.push(m);
        });
    });
    return Object.values(map);
}

export function filtrarMedallas({ busqueda = '', tag = '' } = {}) {
    return medallas.filter(m => {
        const q = busqueda.toLowerCase();
        const matchBusq = !q || m.nombre.toLowerCase().includes(q) || (m.efecto_desc||'').toLowerCase().includes(q);
        const matchTag = !tag || mTags(m).map(t=>normTag(t)).includes(normTag(tag));
        return matchBusq && matchTag;
    });
}
