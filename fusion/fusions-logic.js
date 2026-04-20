// fusions/fusions-logic.js
// Lógica pura de cálculo — sin dependencias de UI ni estado global.

export const REGLAS = [
    { max: 33,  key: 'basica',   label: 'Asimilación Básica',   desc: 'Solo stats. PTs: el mayor de cada tag.',         clase: 'regla-basica'   },
    { max: 66,  key: 'sinergia', label: 'Sinergia',             desc: 'PTs: adopta el valor más alto compartido.',       clase: 'regla-sinergia' },
    { max: 100, key: 'perfecta', label: 'Fusión Perfecta',      desc: 'PTs: suma completa. Máxima compatibilidad.',      clase: 'regla-perfecta' },
];

export function getRegla(d100) {
    return REGLAS.find(r => d100 <= r.max) || REGLAS[REGLAS.length - 1];
}

/**
 * Calcula el resultado completo de una fusión.
 * @param {Object} pjA  - objeto personaje A (con pot, agi, ctl, tags, nombre)
 * @param {Object} pjB  - objeto personaje B
 * @param {number} d100 - rendimiento 1-100
 * @param {Array}  todosLosPTs - array de { personaje_nombre, tag, cantidad }
 * @returns {Object} resultado
 */
export function calcularResultadoFusion(pjA, pjB, d100, todosLosPTs) {
    const regla = getRegla(d100);

    // Stats base combinados
    const statsBase = {
        pot: pjA.pot + pjB.pot,
        agi: pjA.agi + pjB.agi,
        ctl: pjA.ctl + pjB.ctl,
    };

    // PTs por personaje
    const ptsA = {}, ptsB = {};
    todosLosPTs.forEach(p => {
        if (p.personaje_nombre === pjA.nombre) ptsA[p.tag] = p.cantidad;
        if (p.personaje_nombre === pjB.nombre) ptsB[p.tag] = p.cantidad;
    });

    // Tags resultantes
    const todosLosTags = [...new Set([...Object.keys(ptsA), ...Object.keys(ptsB)])];
    const tagsResultantes = {};

    todosLosTags.forEach(tag => {
        const valA = ptsA[tag] || 0;
        const valB = ptsB[tag] || 0;
        const compartido = valA > 0 && valB > 0;

        let pts, tipo;
        if (regla.key === 'basica') {
            pts  = Math.max(valA, valB);
            tipo = 'base';
        } else if (regla.key === 'sinergia') {
            pts  = Math.max(valA, valB);
            tipo = compartido ? 'sinergia' : 'base';
        } else {
            pts  = valA + valB;
            tipo = compartido ? 'suma' : 'herencia';
        }

        tagsResultantes[tag] = { pts, tipo, aportaA: valA, aportaB: valB };
    });

    // Tags de cada pj (para la fusión)
    const tagsA = (pjA.tags || []).map(t => t.startsWith('#') ? t : '#' + t);
    const tagsB = (pjB.tags || []).map(t => t.startsWith('#') ? t : '#' + t);
    const tagsUnion = [...new Set([...tagsA, ...tagsB])];

    return {
        regla,
        statsBase,
        // statsFinales empieza igual a base; el OP puede editar en UI
        statsFinales: { ...statsBase },
        tags: tagsResultantes,
        tagsUnion,
        pjA: pjA.nombre,
        pjB: pjB.nombre,
        d100,
    };
}
