// ============================================================
// medallas/medallas-logic.js
// ============================================================
import { medallas, grupos, puntosAll, opcionesFusion, bannedTags } from './medallas-state.js';
import { getFusionDe } from '../bnh-fusion.js';
import { aplicarDelta } from '../bnh-pac.js'; 

const mTags = m => (m.requisitos_base||[]).map(r => r.tag.startsWith('#') ? r.tag : '#'+r.tag);
export const normTag = t => (t||'').trim().startsWith('#') ? t.trim().toLowerCase() : '#' + t.trim().toLowerCase();

// Calcula el CTL usado por medallas equipadas aplicando los delta_ctl_usado_* del grupo
export function calcCtlUsadoProyectado(medallasEquipadas, grupoRaw) {
    const base = (medallasEquipadas || []).reduce((s, m) => s + (Number(m.costo_ctl) || 0), 0);
    if (!grupoRaw) return { base, total: base };
    let acc = base;
    for (let n = 1; n <= 5; n++) {
        acc = aplicarDelta(acc, grupoRaw[`delta_ctl_usado_${n}`]);
    }
    return { base, total: acc };
}

// Helper interno para aplicar de 1 a 5 deltas en cadena respetando el orden matemático
function aplicarDeltas(base, d1, d2, d3, d4, d5) {
    let acc = base;
    for (const d of [d1, d2, d3, d4, d5]) {
        acc = aplicarDelta(acc, d);
    }
    return acc;
}

export function getPuntosPJ(nombrePJ) {
    const m = {};
    puntosAll.filter(p => p.personaje_nombre === nombrePJ)
             .forEach(p => { 
                const tagNorm = p.tag.startsWith('#') ? p.tag.toLowerCase() : '#' + p.tag.toLowerCase();
                m[tagNorm] = p.cantidad; 
             });
    return m;
}

// ── LENTE DE FUSIÓN PARA MEDALLAS (CON PTs Y DELTAS ACTIVOS) ───────────
export function proyectarPJ(nombrePJ) {
    const g = grupos.find(x => x.nombre_refinado === nombrePJ);
    if (!g) return null;

    const f = getFusionDe(nombrePJ);
    const ptOriginal = getPuntosPJ(nombrePJ); // Ahora viene normalizado
    const tagsOriginal = g.tags || [];

    // 1. Extraer progresión estructural (50 PT = +1 Stat)
    // Usamos las claves en minúscula que definimos en getPuntosPJ
    const bonoPot = Math.floor((ptOriginal['#stat_pot'] || 0) / 50);
    const bonoAgi = Math.floor((ptOriginal['#stat_agi'] || 0) / 50);
    const bonoCtl = Math.floor((ptOriginal['#stat_ctl'] || 0) / 50);

    // 2. Base Real = Base de BD + Bonos de PT
    const potBaseReal = (g.pot || 0) + bonoPot;
    const agiBaseReal = (g.agi || 0) + bonoAgi;
    const ctlBaseReal = (g.ctl || 0) + bonoCtl;

    if (!f) {
        // Sin fusión: Aplicar deltas sobre la Base Real (Base + PT)
        const finalPot = aplicarDeltas(potBaseReal, g.delta_pot_1, g.delta_pot_2, g.delta_pot_3, g.delta_pot_4, g.delta_pot_5);
        const finalAgi = aplicarDeltas(agiBaseReal, g.delta_agi_1, g.delta_agi_2, g.delta_agi_3, g.delta_agi_4, g.delta_agi_5);
        const finalCtl = aplicarDeltas(ctlBaseReal, g.delta_ctl_1, g.delta_ctl_2, g.delta_ctl_3, g.delta_ctl_4, g.delta_ctl_5);

        return {
            esFusion: false,
            pot: finalPot, agi: finalAgi, ctl: finalCtl,
            pot_chain_base: potBaseReal, agi_chain_base: agiBaseReal, ctl_chain_base: ctlBaseReal,
            tags: tagsOriginal,
            ptsMapa: ptOriginal,
            ptOriginal,
            gOriginal: g
        };
    }

    // --- LÓGICA DE FUSIÓN ACTIVA ---
    const compNombre = f.pj_a === nombrePJ ? f.pj_b : f.pj_a;
    const comp = grupos.find(x => x.nombre_refinado === compNombre);
    if (!comp) return { /* fallback si falta el compañero */ };

    const ptComp = getPuntosPJ(compNombre);
    const bonoPotC = Math.floor((ptComp['#stat_pot'] || 0) / 50);
    const bonoAgiC = Math.floor((ptComp['#stat_agi'] || 0) / 50);
    const bonoCtlC = Math.floor((ptComp['#stat_ctl'] || 0) / 50);

    const potPuraC = (comp.pot || 0) + bonoPotC;
    const agiPuraC = (comp.agi || 0) + bonoAgiC;
    const ctlPuraC = (comp.ctl || 0) + bonoCtlC;

    const mult = f.rendimiento > 100 ? 1.5 : 1;
    const modo = opcionesFusion?.modo_stats || 'suma';

    let rawPot, rawAgi, rawCtl;
if (modo === 'mayor') {
    rawPot = Math.max(potBaseReal, potPuraC) * mult;
    rawAgi = Math.max(agiBaseReal, agiPuraC) * mult;
    rawCtl = Math.max(ctlBaseReal, ctlPuraC) * mult;
} else if (modo === 'promedio') {
    rawPot = ((potBaseReal + potPuraC) / 2) * mult;
    rawAgi = ((agiBaseReal + agiPuraC) / 2) * mult;
    rawCtl = ((ctlBaseReal + ctlPuraC) / 2) * mult;
} else { // suma
    rawPot = (potBaseReal + potPuraC) * mult;
    rawAgi = (agiBaseReal + agiPuraC) * mult;
    rawCtl = (ctlBaseReal + ctlPuraC) * mult;
}

    rawPot = Math.round(rawPot);
    rawAgi = Math.round(rawAgi);
    rawCtl = Math.round(rawCtl);

    // Se aplican los deltas PROPIOS del personaje principal sobre los stats crudos fusionados
    const finalPotF = aplicarDeltas(rawPot, g.delta_pot_1, g.delta_pot_2, g.delta_pot_3, g.delta_pot_4, g.delta_pot_5);
    const finalAgiF = aplicarDeltas(rawAgi, g.delta_agi_1, g.delta_agi_2, g.delta_agi_3, g.delta_agi_4, g.delta_agi_5);
    const finalCtlF = aplicarDeltas(rawCtl, g.delta_ctl_1, g.delta_ctl_2, g.delta_ctl_3, g.delta_ctl_4, g.delta_ctl_5);

    // Fusión de Tags (Ignorando los tags baneados del compañero)
    const bans = (bannedTags || []).map(t => normTag(t));
    const tagsCompValidos = (comp.tags || []).filter(t => !bans.includes(normTag(t)));
    const tagsUnionSet = new Set([...tagsOriginal.map(t => normTag(t)), ...tagsCompValidos.map(t => normTag(t))]);

    // Fusión de Puntos de Tag (PT)
    const modoPt = opcionesFusion?.comportamiento_pt || 'sumar';
    const ptsMapaF = { ...ptOriginal };
    if (modoPt === 'sumar') {
        tagsCompValidos.forEach(t => {
            const k = normTag(t);
            ptsMapaF[k] = (ptsMapaF[k] || 0) + (ptComp[k] || 0);
        });
    }

    return {
        esFusion: true,
        pot: finalPotF, agi: finalAgiF, ctl: finalCtlF,
        pot_chain_base: rawPot, agi_chain_base: rawAgi, ctl_chain_base: rawCtl,
        tags: [...tagsUnionSet],
        ptsMapa: ptsMapaF,
        ptOriginal,
        gOriginal: g,
        compañero: compNombre,
        rendimiento: f.rendimiento
    };
}

export function estadoMedallaPJ(medalla, nombrePJ) {
    const proy = proyectarPJ(nombrePJ);
    if (!proy) return 'bloqueada';
    
    const tagsGrupo = proy.tags.map(t => normTag(t));
    const ptsMapa = proy.ptsMapa;
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
    const ptsMapa = proy.ptsMapa;

    return (medalla.efectos_condicionales || []).map(ec => {
        const tNorm = normTag(ec.tag);
        const tieneTag = tagsGrupo.includes(tNorm);
        const pts = ptsMapa[tNorm] || 0;
        const cumple = tieneTag && pts >= (ec.pts_minimos || 0);
        return { ...ec, activo: cumple, pts_actuales: pts };
    });
}

export function filtrarMedallas({ busqueda = '', tag = '' }) {
    let res = [...medallas];
    if (busqueda) {
        const b = busqueda.toLowerCase();
        res = res.filter(m => m.nombre.toLowerCase().includes(b) || (m.efecto_desc||'').toLowerCase().includes(b) || mTags(m).some(t => t.toLowerCase().includes(b)));
    }
    if (tag) {
        const tNorm = normTag(tag);
        res = res.filter(m => mTags(m).some(t => normTag(t) === tNorm));
    }
    return res;
}
