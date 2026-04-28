// ============================================================
// fichas-logic.js
// ============================================================
import { getFusionDe } from '../bnh-fusion.js';
import { aplicarDelta, aplicarDeltas } from '../bnh-pac.js';

import { ptGlobal } from './fichas-state.js';
import { opcionesFusion, bannedTags } from './fichas-data.js';

export { 
    calcTier, calcPVMax, calcCambios, fmtTag, normTag, 
    calcCTLUsado 
} from '../bnh-pac.js';

// ─── Utilidades Visuales y de Datos Originales ──────────────

export function colorTier(tier) {
    const t = {
        5: { bg:'#1a0533', border:'#9b59b6', text:'#d7bde2', label:'TIER 5' },
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
    if (!grupoBase) return null;

    const f = getFusionDe(grupoBase.nombre_refinado);
    // Verificación de seguridad por si ptGlobal aún no ha cargado
    const ptOriginal = ptGlobal ? (ptGlobal[grupoBase.nombre_refinado] || {}) : {};
    const tagsOriginal = grupoBase.tags || [];

    // ⚡ 0. Extraer progresión estructural (50 PT = +1 Stat)
    // Normalizamos claves de stats por seguridad
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

    // ⚡ Base Real = Base DB + Bonos de PT
    const potBaseReal = (grupoBase.pot || 0) + bonoPot;
    const agiBaseReal = (grupoBase.agi || 0) + bonoAgi;
    const ctlBaseReal = (grupoBase.ctl || 0) + bonoCtl;

    // 1. Aplicar deltas encadenados sobre la Base Real (hasta 5 por stat)
    const potBase = aplicarDeltas(potBaseReal, grupoBase.delta_pot_1, grupoBase.delta_pot_2, grupoBase.delta_pot_3, grupoBase.delta_pot_4, grupoBase.delta_pot_5);
    const agiBase = aplicarDeltas(agiBaseReal, grupoBase.delta_agi_1, grupoBase.delta_agi_2, grupoBase.delta_agi_3, grupoBase.delta_agi_4, grupoBase.delta_agi_5);
    const ctlBase = aplicarDeltas(ctlBaseReal, grupoBase.delta_ctl_1, grupoBase.delta_ctl_2, grupoBase.delta_ctl_3, grupoBase.delta_ctl_4, grupoBase.delta_ctl_5);

    // 2. Calcular PV y Cambios usando las bases con deltas
    // (Usamos la función interna para no tener dependencias circulares)
    const pacBase = potBase + agiBase + ctlBase;
    const bonoTier = pacBase >= 150 ? 30 : pacBase >= 100 ? 20 : pacBase >= 80 ? 15 : pacBase >= 60 ? 10 : 5;
    
    const pvMaxPuro = Math.floor(potBase/4) + Math.floor(agiBase/4) + Math.floor(ctlBase/4) + bonoTier;
    const pvMaxTotal     = aplicarDeltas(pvMaxPuro,        grupoBase.delta_pv_1,        grupoBase.delta_pv_2,        grupoBase.delta_pv_3,        grupoBase.delta_pv_4,        grupoBase.delta_pv_5);
    const pvActualPuro   = (grupoBase.pv_actual !== null && grupoBase.pv_actual !== undefined) ? grupoBase.pv_actual : pvMaxTotal;
    const pvActualTotal  = aplicarDeltas(pvActualPuro,    grupoBase.delta_pv_actual_1, grupoBase.delta_pv_actual_2, grupoBase.delta_pv_actual_3, grupoBase.delta_pv_actual_4, grupoBase.delta_pv_actual_5);
    const cambiosTotal   = aplicarDeltas(Math.floor(agiBase/4), grupoBase.delta_cambios_1, grupoBase.delta_cambios_2, grupoBase.delta_cambios_3, grupoBase.delta_cambios_4, grupoBase.delta_cambios_5);

    // 3. Si no está en fusión, devolver los datos con TODAS las variables listas para la UI
    if (!f) {
        return {
            ...grupoBase, // Mantiene todas las propiedades originales (lore, quirk, etc)
            esFusion: false,
            // Mantiene tu estructura original:
            pot: potBase,
            agi: agiBase,
            ctl: ctlBase,
            tags: tagsOriginal,
            ptsMapa: ptOriginal,
            // Añade las variables _total para que renderCatalogo y el Detalle funcionen:
            pot_total: potBase,
            agi_total: agiBase,
            ctl_total: ctlBase,
            pv_total: pvMaxTotal,
            pv_actual_total: pvActualTotal,
            cambios_total: cambiosTotal,
            pac_total: pacBase
        };
    }

    const nombreCompañero = f.pj_a === grupoBase.nombre_refinado ? f.pj_b : f.pj_a;
    const compañero = gruposGlobal.find(g => g.nombre_refinado === nombreCompañero) || {};
    const ptCompañero = ptGlobal[nombreCompañero] || {};

    // ⚡ Bonos PT del Compañero
    let ptPotC = 0, ptAgiC = 0, ptCtlC = 0;
    Object.keys(ptCompañero).forEach(k => {
        const norm = k.toLowerCase().replace(/^#/, '');
        if (norm === 'stat_pot') ptPotC = ptCompañero[k];
        if (norm === 'stat_agi') ptAgiC = ptCompañero[k];
        if (norm === 'stat_ctl') ptCtlC = ptCompañero[k];
    });

    const potBaseRealC = (compañero.pot || 0) + Math.floor(ptPotC / 50);
    const agiBaseRealC = (compañero.agi || 0) + Math.floor(ptAgiC / 50);
    const ctlBaseRealC = (compañero.ctl || 0) + Math.floor(ptCtlC / 50);

    // --- 1. Lente de STATS ---
    // Fusionar los RAWs reales primero (sin deltas, pero con bonos de PT)
    const MULT = f.rendimiento > 100 ? 1.5 : 1;
    const calcStat = (valA, valB) => {
        const modo = opcionesFusion?.modo_stats || 'suma';
        if (modo === 'promedio') return Math.ceil((valA + valB) / 2);
        if (modo === 'mayor') return Math.max(valA, valB);
        return valA + valB;
    };

    // Paso 1: combinar raws reales y aplicar multiplicador
    const potFusionRaw = Math.round(calcStat(potBaseReal, potBaseRealC) * MULT);
    const agiFusionRaw = Math.round(calcStat(agiBaseReal, agiBaseRealC) * MULT);
    const ctlFusionRaw = Math.round(calcStat(ctlBaseReal, ctlBaseRealC) * MULT);

    // Paso 2: aplicar deltas propios sobre el raw fusionado → valor final
    const pot = aplicarDeltas(potFusionRaw, grupoBase.delta_pot_1, grupoBase.delta_pot_2, grupoBase.delta_pot_3, grupoBase.delta_pot_4, grupoBase.delta_pot_5);
    const agi = aplicarDeltas(agiFusionRaw, grupoBase.delta_agi_1, grupoBase.delta_agi_2, grupoBase.delta_agi_3, grupoBase.delta_agi_4, grupoBase.delta_agi_5);
    const ctl = aplicarDeltas(ctlFusionRaw, grupoBase.delta_ctl_1, grupoBase.delta_ctl_2, grupoBase.delta_ctl_3, grupoBase.delta_ctl_4, grupoBase.delta_ctl_5);

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

    // --- 4. NUEVO: Lente de Totales para la UI (Basado en la fusión resultante) ---
    const pacFusion = pot + agi + ctl;
    const bonoTierFusion = pacFusion >= 150 ? 30 : pacFusion >= 100 ? 20 : pacFusion >= 80 ? 15 : pacFusion >= 60 ? 10 : 5;
    const pvMaxPuroFusion = Math.floor(pot/4) + Math.floor(agi/4) + Math.floor(ctl/4) + bonoTierFusion;
    
    // Aplicamos los deltas del PJ base a su nuevo estado fusionado
    const pvMaxTotalFusion    = aplicarDeltas(pvMaxPuroFusion,   grupoBase.delta_pv_1,        grupoBase.delta_pv_2,        grupoBase.delta_pv_3,        grupoBase.delta_pv_4,        grupoBase.delta_pv_5);
    const pvActualPuroFusion  = (grupoBase.pv_actual !== null && grupoBase.pv_actual !== undefined) ? grupoBase.pv_actual : pvMaxTotalFusion;
    const pvActualTotalFusion = aplicarDeltas(pvActualPuroFusion, grupoBase.delta_pv_actual_1, grupoBase.delta_pv_actual_2, grupoBase.delta_pv_actual_3, grupoBase.delta_pv_actual_4, grupoBase.delta_pv_actual_5);
    const cambiosTotalFusion  = aplicarDeltas(Math.floor(agi/4), grupoBase.delta_cambios_1,   grupoBase.delta_cambios_2,   grupoBase.delta_cambios_3,   grupoBase.delta_cambios_4,   grupoBase.delta_cambios_5);

    return {
        ...grupoBase, // Mantiene el Lore, Quirks, IDs...
        esFusion: true,
        compañero: nombreCompañero,
        rendimiento: f.rendimiento,
        pot, agi, ctl,
        tags: [...tagsUnionSet],
        ptsMapa,
        tagFusion: f.tag_fusion,
        // Variables requeridas por la nueva UI:
        pot_total: pot,
        agi_total: agi,
        ctl_total: ctl,
        pac_total: pacFusion,
        // Base pre-delta de la cadena: el raw ya fusionado (para _fmtDChain en la UI)
        pot_fusion_raw: potFusionRaw,
        agi_fusion_raw: agiFusionRaw,
        ctl_fusion_raw: ctlFusionRaw,
        pv_total: pvMaxTotalFusion,
        pv_actual_total: pvActualTotalFusion,
        cambios_total: cambiosTotalFusion
    };
}
