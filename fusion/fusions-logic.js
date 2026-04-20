// fusions/fusions-logic.js
export function calcularResultadoFusion(pjA, pjB, d100, todosLosPTs) {
    // 1. Suma de stats base
    const stats = {
        pot: pjA.pot + pjB.pot,
        agi: pjA.agi + pjB.agi,
        ctl: pjA.ctl + pjB.ctl
    };

    // 2. Extraer PTs de cada uno
    const ptsA = {};
    const ptsB = {};
    todosLosPTs.forEach(p => {
        if (p.personaje_nombre === pjA.nombre) ptsA[p.tag] = p.cantidad;
        if (p.personaje_nombre === pjB.nombre) ptsB[p.tag] = p.cantidad;
    });

    // 3. Evaluar tags y PTs según el D100
    const tagsResultantes = {};
    const todosLosTags = [...new Set([...Object.keys(ptsA), ...Object.keys(ptsB)])];

    todosLosTags.forEach(tag => {
        const valA = ptsA[tag] || 0;
        const valB = ptsB[tag] || 0;

        if (d100 <= 33) {
            // Stats se fusionan, pero los tags se quedan con el mayor valor
            // (Ojo: podrías ponerlo en 0 si quieres penalizar fuerte)
            tagsResultantes[tag] = { pts: Math.max(valA, valB), tipo: 'base' };
        } 
        else if (d100 <= 66) {
            // Se adopta el PT más alto compartido
            tagsResultantes[tag] = { pts: Math.max(valA, valB), tipo: 'sinergia' };
        } 
        else {
            // Fusión perfecta: suma de PT
            tagsResultantes[tag] = { pts: valA + valB, tipo: valA > 0 && valB > 0 ? 'suma' : 'herencia' };
        }
    });

    return {
        stats,
        tags: tagsResultantes,
        reglaAplicada: d100 <= 33 ? "Asimilación Básica (Solo Stats)" 
                     : d100 <= 66 ? "Sinergia Media (PT Mayor)" 
                     : "Fusión Perfecta (Suma de PT compartidos)"
    };
}
