// fusions/fusions-logic.js
// Lógica pura de cálculo — sin efectos secundarios, sin UI.

import { opcionesState } from './fusions-options.js';

// ─── Reglas dinámicas ─────────────────────────────────────────
export function getReglas(opciones = opcionesState) {
    const o = opciones;
    if (o.num_umbrales === 2) {
        return [
            { max: o.umbral_1, key: 'z1', label: o.desc_z1 || 'Zona 1', comportamiento: o.comportamiento_z1, clase: 'regla-basica' },
            { max: 100,        key: 'z3', label: o.desc_z3 || 'Zona 2', comportamiento: o.comportamiento_z3, clase: 'regla-perfecta' },
        ];
    }
    return [
        { max: o.umbral_1, key: 'z1', label: o.desc_z1 || 'Zona 1', comportamiento: o.comportamiento_z1, clase: 'regla-basica' },
        { max: o.umbral_2, key: 'z2', label: o.desc_z2 || 'Zona 2', comportamiento: o.comportamiento_z2, clase: 'regla-sinergia' },
        { max: 100,        key: 'z3', label: o.desc_z3 || 'Zona 3', comportamiento: o.comportamiento_z3, clase: 'regla-perfecta' },
    ];
}

export function getRegla(d100, opciones = opcionesState) {
    const reglas = getReglas(opciones);
    for (const r of reglas) {
        if (d100 <= r.max) return r;
    }
    return reglas[reglas.length - 1];
}

export function calcCompatibilidadTags(pjA, pjB, bannedTags = []) {
    const tagsA = (pjA.tags || []).map(t => (t.startsWith('#')?t:'#'+t).toLowerCase()).filter(t => !bannedTags.includes(t));
    const tagsB = (pjB.tags || []).map(t => (t.startsWith('#')?t:'#'+t).toLowerCase()).filter(t => !bannedTags.includes(t));
    const setA = new Set(tagsA);
    const compartidos = tagsB.filter(t => setA.has(t));
    return compartidos.length;
}

export function calcularResultadoFusion(pjA, pjB, ptA, ptB, d100, sobreRecarga, bannedTags = [], opciones = opcionesState) {
    const MULT = sobreRecarga ? 1.5 : 1;
    const regla = getRegla(d100, opciones);
    
    const tagsA = (pjA.tags || []).map(t => (t.startsWith('#')?t:'#'+t).toLowerCase()).filter(t => !bannedTags.includes(t));
    const tagsB = (pjB.tags || []).map(t => (t.startsWith('#')?t:'#'+t).toLowerCase()).filter(t => !bannedTags.includes(t));
    
    const tagsUnicos = [...new Set([...tagsA, ...tagsB])];
    const tagsCompartidos = tagsA.filter(t => tagsB.includes(t));

    let maxTagCompartido = null;
    let maxPtsCompartidos = -1;

    if (tagsCompartidos.length > 0) {
        tagsCompartidos.forEach(t => {
            const pts = (ptA[t]||0) + (ptB[t]||0);
            if (pts > maxPtsCompartidos) {
                maxPtsCompartidos = pts;
                maxTagCompartido = t;
            }
        });
    }

    const tagsFinales = {};
    tagsUnicos.forEach(tag => {
        const pA = ptA[tag] || 0;
        const pB = ptB[tag] || 0;
        const esCompartido = tagsCompartidos.includes(tag);
        
        let pts = 0;
        if (regla.comportamiento === 'mayor') pts = Math.max(pA, pB);
        else if (regla.comportamiento === 'suma') pts = pA + pB;
        else if (regla.comportamiento === 'promedio') pts = Math.ceil((pA + pB) / 2);
        else if (regla.comportamiento === 'cero') pts = 0;
        else pts = pA + pB;

        tagsFinales[tag] = {
            pts: Math.round(pts * MULT),
            tipo: esCompartido ? 'compartido' : (tagsA.includes(tag) ? 'soloA' : 'soloB'),
            aportaA: pA, aportaB: pB
        };
    });

    return {
        pjA:               pjA.nombre_refinado,
        pjB:               pjB.nombre_refinado,
        regla,
        tags:              tagsFinales,
        maxTagCompartido,
        maxPtsCompartidos: maxPtsCompartidos > -1 ? Math.round(maxPtsCompartidos * MULT) : 0,
        snapshotA:         { pot: pjA.pot, agi: pjA.agi, ctl: pjA.ctl, tags: tagsA },
        snapshotB:         { pot: pjB.pot, agi: pjB.agi, ctl: pjB.ctl, tags: tagsB },
        d100,
        sobreRecarga,
        multiplicador:     MULT,
    };
}

// ─── Builder para registro_fusiones ──────────────────────────
export function buildRegistroFusion(resultado, statsFinales, tagFusion, ptsFusion, fusionActivaId) {
    const tagsArr = Object.entries(resultado.tags).map(([tag, d]) => ({
        tag, pts: d.pts, tipo: d.tipo, aportaA: d.aportaA, aportaB: d.aportaB,
    }));
    return {
        pj_a:                resultado.pjA,
        pj_b:                resultado.pjB,
        rendimiento:         resultado.d100,
        regla_aplicada:      resultado.regla.key,
        tag_fusion:          tagFusion  || null,
        // ELIMINADO: tag_fusion_pts: ptsFusion || 0 -> Supabase lo estaba rechazando por no existir
        stats_pot:           statsFinales.pot,
        stats_agi:           statsFinales.agi,
        stats_ctl:           statsFinales.ctl,
        snapshot_a:          resultado.snapshotA,
        snapshot_b:          resultado.snapshotB,
        max_tag_compartido:  resultado.maxTagCompartido,
        max_pts_compartidos: resultado.maxPtsCompartidos,
        tags_resultado:      tagsArr,
        fusion_activa_id:    fusionActivaId || null,
    };
}
