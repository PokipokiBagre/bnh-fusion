// ============================================================
// fichas-logic.js
// ============================================================
import { getFusionDe } from '../bnh-fusion.js';
import { aplicarDelta } from '../bnh-pac.js';

// ¡AQUÍ ESTÁ LA MAGIA QUE FALTABA! Restauramos tus variables globales
import { ptGlobal } from './fichas-state.js';
import { opcionesFusion, bannedTags } from './fichas-data.js';

export { 
    calcTier, calcPVMax, calcCambios, fmtTag, normTag, 
    calcCTLUsado, calcCTLUsadoTotal 
} from '../bnh-pac.js';

// ─── Utilidades Visuales y de Datos Originales ──────────────

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
    if (!grupoBase) return null;

    const f = getFusionDe(grupoBase.nombre_refinado);
    // Verificación de seguridad por si ptGlobal aún no ha cargado
    const ptOriginal = ptGlobal ? (ptGlobal[grupoBase.nombre_refinado] || {}) : {};
    const tagsOriginal = grupoBase.tags || [];

    // 1. Aplicar deltas de stats base propios
    const potBase = aplicarDelta(grupoBase.pot || 0, grupoBase.delta_pot);
    const agiBase = aplicarDelta(grupoBase.agi || 0, grupoBase.delta_agi);
    const ctlBase = aplicarDelta(grupoBase.ctl || 0, grupoBase.delta_ctl);

    // 2. Calcular PV y Cambios usando las bases con deltas
    // (Usamos la función interna para no tener dependencias circulares)
    const pacBase = potBase + agiBase + ctlBase;
    const bonoTier = pacBase >= 100 ? 20 : pacBase >= 80 ? 15 : pacBase >= 60 ? 10 : 5;
    
    const pvMaxPuro = Math.floor(potBase/4) + Math.floor(agiBase/4) + Math.floor(ctlBase/4) + bonoTier;
    const pvMaxTotal = aplicarDelta(pvMaxPuro, grupoBase.delta_pv);

    const pvActualPuro = (grupoBase.pv_actual !== null && grupoBase.pv_actual !== undefined) ? grupoBase.pv_actual : pvMaxTotal;
    const pvActualTotal = aplicarDelta(pvActualPuro, grupoBase.delta_pv_actual);

    const cambiosTotal = aplicarDelta(Math.floor(agiBase / 4), grupoBase.delta_cambios);

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

    // Aplicar deltas del compañero también
    const potComp = aplicarDelta(compañero.pot || 0, compañero.delta_pot);
    const agiComp = aplicarDelta(compañero.agi || 0, compañero.delta_agi);
    const ctlComp = aplicarDelta(compañero.ctl || 0, compañero.delta_ctl);

    // --- 1. Lente de STATS ---
    const MULT = f.rendimiento > 100 ? 1.5 : 1;
    const calcStat = (valA, valB) => {
        const modo = opcionesFusion?.modo_stats || 'suma';
        if (modo === 'promedio') return Math.ceil((valA + valB) / 2);
        if (modo === 'mayor') return Math.max(valA, valB);
        return valA + valB; 
    };

    const pot = Math.round(calcStat(potBase, potComp) * MULT);
    const agi = Math.round(calcStat(agiBase, agiComp) * MULT);
    const ctl = Math.round(calcStat(ctlBase, ctlComp) * MULT);

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
