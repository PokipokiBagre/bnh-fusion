// ============================================================
// bnh-pac.js — Módulo Compartido de Lógica BNH v4
// Importar desde cualquier página: import { calcPVMax, ... } from '../bnh-pac.js';
// ============================================================

// ── Cálculo de Tier según PAC ─────────────────────────────────
export function calcTier(pot, agi, ctl) {
    const pac = pot + agi + ctl;
    if (pac >= 100) return { tier: 4, bono: 20, label: 'TIER 4' };
    if (pac >= 80)  return { tier: 3, bono: 15, label: 'TIER 3' };
    if (pac >= 60)  return { tier: 2, bono: 10, label: 'TIER 2' };
    return              { tier: 1, bono: 5,  label: 'TIER 1' };
}

// ── Cálculo de PV Máximo ──────────────────────────────────────
export function calcPVMax(pot, agi, ctl) {
    const { bono } = calcTier(pot, agi, ctl);
    return Math.floor(pot / 4) + Math.floor(agi / 4) + Math.floor(ctl / 4) + bono;
}

// ── Cambios por turno (AGI) ───────────────────────────────────
export function calcCambios(agi) {
    return Math.floor(agi / 4);
}

// ── Slots activos según tirada 1d100 ─────────────────────────
// totalSlots = número total de medallas equipadas (suma de costos <= CTL)
export function calcSlotsActivos(tirada, totalSlots) {
    if (totalSlots === 0 || tirada === 0) return 0;
    const activos = Math.floor((tirada / 100) * totalSlots);
    return Math.max(1, activos); // mínimo 1 si tirada > 0 y hay medallas
}

// ── CTL usado por las medallas equipadas ─────────────────────
export function calcCTLUsado(medallas) {
    return medallas.reduce((acc, m) => acc + (m.costo_ctl || 0), 0);
}

// ── Verifica si una configuración de medallas es válida ───────
export function esConfigValida(medallas, ctl) {
    return calcCTLUsado(medallas) <= ctl;
}

// ── Tags que NO tiene el personaje A pero SÍ el personaje B ──
// Regla de interacción: se otorgan PT de los tags del compañero
// que el propio personaje NO posee (Contraste)
export function tagsDeContraste(tagsPropio, tagsCompanero) {
    const propioSet = new Set(tagsPropio.map(t => t.toLowerCase()));
    return tagsCompanero.filter(t => !propioSet.has(t.toLowerCase()));
}

// ── Genera las transacciones de PT para una interacción ───────
// Devuelve array de { tag, delta, motivo }
// tipo: 'interaccion' (+1 PT por tag de contraste) | 'fusion' (+5 PT por tag de contraste)
export function calcPTInteraccion(tagsPropio, tagsCompanero, tipo = 'interaccion') {
    const contraste = tagsDeContraste(tagsPropio, tagsCompanero);
    if (contraste.length === 0) return [];
    const delta = tipo === 'fusion' ? 5 : 1;
    // Solo 1 tag aleatorio en interacción normal; todos en fusión
    if (tipo === 'fusion') {
        return contraste.map(tag => ({ tag, delta, motivo: 'fusion' }));
    }
    // Interacción normal: 1 PT a 1 tag aleatorio de los de contraste
    const tagElegido = contraste[Math.floor(Math.random() * contraste.length)];
    return [{ tag: tagElegido, delta: 1, motivo: 'interaccion' }];
}

// ── Costos de canje (Regla de Pureza: mismo tag) ─────────────
export const COSTOS_CANJE = {
    stat:     50,   // +1 a POT, AGI o CTL
    medalla:  75,   // codificar medalla nueva
    mutacion: 100   // mutar un tag del personaje
};

// ── Valida si hay suficientes PT de un tag para un canje ──────
export function puedeCanjearse(ptDelTag, tipoCanje) {
    return ptDelTag >= (COSTOS_CANJE[tipoCanje] ?? Infinity);
}

// ── Genera el delta negativo de un gasto ─────────────────────
export function calcDeltaGasto(tipoCanje) {
    return -(COSTOS_CANJE[tipoCanje] ?? 0);
}

// ── Resumen de un personaje (objeto compacto para UI) ─────────
export function resumenPJ(p) {
    const pac   = (p.pot || 0) + (p.agi || 0) + (p.ctl || 0);
    const tier  = calcTier(p.pot || 0, p.agi || 0, p.ctl || 0);
    const pvMax = calcPVMax(p.pot || 0, p.agi || 0, p.ctl || 0);
    return {
        nombre:   p.nombre,
        pot:      p.pot || 0,
        agi:      p.agi || 0,
        ctl:      p.ctl || 0,
        pac,
        tier:     tier.tier,
        tierLabel: tier.label,
        pvMax,
        pvActual: p.pv_actual || 0,
        tags:     p.tags || [],
        cambios:  calcCambios(p.agi || 0)
    };
}

// ── Normaliza un nombre de tag (sin # ni espacios extra) ──────
export function normTag(tag) {
    return tag.trim().toLowerCase().replace(/^#/, '');
}

// ── Formatea un tag para display con # ───────────────────────
export function fmtTag(tag) {
    const t = tag.trim();
    return t.startsWith('#') ? t : '#' + t;
}
