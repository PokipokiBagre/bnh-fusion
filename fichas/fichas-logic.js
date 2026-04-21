// ============================================================
// fichas-logic.js
// ============================================================
import { getFusionDe } from '../bnh-fusion.js';

export { 
    calcTier, calcPVMax, calcCambios, fmtTag, normTag, 
    proyectarStats, calcCTLUsadoTotal 
} from '../bnh-pac.js';


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


// ─── LENTE DINÁMICO DE FUSIONES ─────────────────────────────

export function proyectarFicha(grupoBase, gruposGlobal, ptGlobal, opcionesFusion, bannedTags) {
    const f = getFusionDe(grupoBase.nombre_refinado);
    const ptOriginal = ptGlobal[grupoBase.nombre_refinado] || {};
    const tagsOriginal = grupoBase.tags || [];

    // Si no está en fusión, devolver los datos limpios sin alterar
    if (!f) return {
        esFusion: false,
        pot: grupoBase.pot || 0,
        agi: grupoBase.agi || 0,
        ctl: grupoBase.ctl || 0,
        tags: tagsOriginal,
        ptsMapa: ptOriginal
    };

    const nombreCompañero = f.pj_a === grupoBase.nombre_refinado ? f.pj_b : f.pj_a;
    const compañero = gruposGlobal.find(g => g.nombre_refinado === nombreCompañero) || {};
    const ptCompañero = ptGlobal[nombreCompañero] || {};

    // --- 1. Lente de STATS ---
    const MULT = f.rendimiento > 100 ? 1.5 : 1;
    const calcStat = (valA, valB) => {
        const modo = opcionesFusion?.modo_stats || 'suma';
        if (modo === 'promedio') return Math.ceil((valA + valB) / 2);
        if (modo === 'mayor') return Math.max(valA, valB);
        return valA + valB; 
    };

    const pot = Math.round(calcStat(grupoBase.pot || 0, compañero.pot || 0) * MULT);
    const agi = Math.round(calcStat(grupoBase.agi || 0, compañero.agi || 0) * MULT);
    const ctl = Math.round(calcStat(grupoBase.ctl || 0, compañero.ctl || 0) * MULT);

    // --- 2. Lente de TAGS ---
    const norm = t => (t.startsWith('#') ? t : '#' + t).toLowerCase();
    const tagsA = tagsOriginal.filter(t => !bannedTags.includes(norm(t)));
    const tagsB = (compañero.tags || []).filter(t => !bannedTags.includes(norm(t)));
    
    const tagsUnionSet = new Set([...tagsA, ...tagsB]);
    
    // Devolverle al PJ sus propios tags baneados para que no los "pierda" visualmente,
    // pero no hereda los baneados de su compañero.
    tagsOriginal.filter(t => bannedTags.includes(norm(t))).forEach(t => tagsUnionSet.add(t));
    if (f.tag_fusion) tagsUnionSet.add(f.tag_fusion);

    // --- 3. Lente de PTs ---
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
    const todosTags = [...new Set([...Object.keys(ptOriginal), ...Object.keys(ptCompañero)])];
    
    todosTags.forEach(tag => {
        if (bannedTags.includes(norm(tag))) {
            if (ptOriginal[tag]) ptsMapa[tag] = ptOriginal[tag]; // Mantiene solo sus PT originales de tags baneados
        } else {
            const valA = ptOriginal[tag] || 0;
            const valB = ptCompañero[tag] || 0;
            ptsMapa[tag] = Math.round(calcPT(valA, valB) * MULT);
        }
    });

    if (f.tag_fusion && !ptsMapa[f.tag_fusion]) {
        ptsMapa[f.tag_fusion] = opcionesFusion?.pts_tag_fusion || 0;
    }

    return {
        esFusion: true,
        compañero: nombreCompañero,
        rendimiento: f.rendimiento,
        pot, agi, ctl,
        tags: [...tagsUnionSet],
        ptsMapa,
        tagFusion: f.tag_fusion
    };
}
