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
    return reglas.find(r => d100 <= r.max) || reglas[reglas.length - 1];
}

// ─── Helpers internos ─────────────────────────────────────────
function _calcStat(valA, valB, modo) {
    if (modo === 'suma')     return valA + valB;
    if (modo === 'promedio') return Math.ceil((valA + valB) / 2);
    if (modo === 'mayor')    return Math.max(valA, valB);
    return valA + valB;
}

function _calcPT(valA, valB, comportamiento) {
    if (comportamiento === 'mayor')    return Math.max(valA, valB);
    if (comportamiento === 'suma')     return valA + valB;
    if (comportamiento === 'promedio') return Math.ceil((valA + valB) / 2);
    if (comportamiento === 'cero')     return 0;
    return Math.max(valA, valB);
}

function _tipoTag(valA, valB, comportamiento) {
    const compartido = valA > 0 && valB > 0;
    if (comportamiento === 'suma')     return compartido ? 'suma'     : 'herencia';
    if (comportamiento === 'promedio') return compartido ? 'sinergia' : 'herencia';
    if (comportamiento === 'mayor')    return compartido ? 'sinergia' : 'base';
    if (comportamiento === 'cero')     return 'cero';
    return 'base';
}

// ─── Cálculo completo ─────────────────────────────────────────
export function calcularResultadoFusion(pjA, pjB, d100, todosLosPTs, opciones = opcionesState) {
    const regla = getRegla(d100, opciones);

    const statsBase = {
        pot: _calcStat(pjA.pot || 0, pjB.pot || 0, opciones.modo_stats),
        agi: _calcStat(pjA.agi || 0, pjB.agi || 0, opciones.modo_stats),
        ctl: _calcStat(pjA.ctl || 0, pjB.ctl || 0, opciones.modo_stats),
    };

    const ptsA = {}, ptsB = {};
    todosLosPTs.forEach(p => {
        if (p.personaje_nombre === pjA.nombre) ptsA[p.tag] = p.cantidad;
        if (p.personaje_nombre === pjB.nombre) ptsB[p.tag] = p.cantidad;
    });

    const todosLosTags = [...new Set([...Object.keys(ptsA), ...Object.keys(ptsB)])];
    const tagsResultantes = {};
    todosLosTags.forEach(tag => {
        const valA = ptsA[tag] || 0;
        const valB = ptsB[tag] || 0;
        tagsResultantes[tag] = {
            pts:     _calcPT(valA, valB, regla.comportamiento),
            tipo:    _tipoTag(valA, valB, regla.comportamiento),
            aportaA: valA,
            aportaB: valB,
        };
    });

    let maxTagCompartido = null, maxPtsCompartidos = 0;
    Object.entries(tagsResultantes).forEach(([tag, d]) => {
        if (d.aportaA > 0 && d.aportaB > 0 && d.pts > maxPtsCompartidos) {
            maxPtsCompartidos = d.pts;
            maxTagCompartido  = tag;
        }
    });

    const tagsA = (pjA.tags || []).map(t => t.startsWith('#') ? t : '#' + t);
    const tagsB = (pjB.tags || []).map(t => t.startsWith('#') ? t : '#' + t);

    return {
        regla,
        opciones:          { ...opciones },
        statsBase,
        statsFinales:      { ...statsBase },
        tags:              tagsResultantes,
        tagsUnion:         [...new Set([...tagsA, ...tagsB])],
        maxTagCompartido,
        maxPtsCompartidos,
        pjA:               pjA.nombre,
        pjB:               pjB.nombre,
        snapshotA:         { pot: pjA.pot, agi: pjA.agi, ctl: pjA.ctl, tags: tagsA },
        snapshotB:         { pot: pjB.pot, agi: pjB.agi, ctl: pjB.ctl, tags: tagsB },
        d100,
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
        tag_fusion_pts:      ptsFusion  || 0,
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
