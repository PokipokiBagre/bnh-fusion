// ============================================================
// bnh-pac.js — Módulo Compartido de Lógica BNH v4.1 (Base+Delta)
// Importar desde cualquier página: import { calcPVMax, proyectarStats... } from '../bnh-pac.js';
// ============================================================

// ── NUEVO: Motor de parseo de Deltas ──────────────────────────
export function aplicarDelta(base, deltaStr) {
    const valorBase = Number(base) || 0;
    const ds = String(deltaStr || '0').trim().toLowerCase();
    if (ds === '0' || ds === '') return valorBase;

    const op = ds.charAt(0);
    const num = Number(ds.slice(1).replace(',', '.')) || 0;

    switch (op) {
        case '+': return valorBase + num;
        case '-': return valorBase - num;
        case 'x':
        case '*': return valorBase * num;
        case '/': return num !== 0 ? valorBase / num : valorBase;
        default: 
            return !isNaN(Number(ds)) ? valorBase + Number(ds) : valorBase;
    }
}

// ── NUEVO: Función Maestra de Proyección ──────────────────────
// Convierte un personaje "crudo" (con base y deltas) en uno con totales
export function proyectarStats(p) {
    if (!p) return null;
    const potT = aplicarDelta(p.pot || 0, p.delta_pot);
    const agiT = aplicarDelta(p.agi || 0, p.delta_agi);
    const ctlT = aplicarDelta(p.ctl || 0, p.delta_ctl);
    
    return {
        ...p,
        pot_total: potT,
        agi_total: agiT,
        ctl_total: ctlT,
        pv_total: calcPVMax(potT, agiT, ctlT, p.delta_pv),
        cambios_total: calcCambios(agiT, p.delta_cambios),
        pac_total: potT + agiT + ctlT
    };
}

// ── Cálculo de Tier según PAC ─────────────────────────────────
export function calcTier(pot, agi, ctl) {
    const pac = pot + agi + ctl;
    if (pac >= 100) return { tier: 4, bono: 20, label: 'TIER 4' };
    if (pac >= 80)  return { tier: 3, bono: 15, label: 'TIER 3' };
    if (pac >= 60)  return { tier: 2, bono: 10, label: 'TIER 2' };
    return              { tier: 1, bono: 5,  label: 'TIER 1' };
}

// ── Cálculo de PV Máximo (MODIFICADO: Soporta Delta) ──────────
export function calcPVMax(potTotal, agiTotal, ctlTotal, deltaPV = '0') {
    const { bono } = calcTier(potTotal, agiTotal, ctlTotal);
    const basePV = Math.floor(potTotal / 4) + Math.floor(agiTotal / 4) + Math.floor(ctlTotal / 4) + bono;
    return Math.floor(aplicarDelta(basePV, deltaPV));
}

// ── Cambios por turno (MODIFICADO: Soporta Delta) ─────────────
export function calcCambios(agiTotal, deltaCambios = '0') {
    const baseCambios = Math.floor(agiTotal / 4);
    return Math.floor(aplicarDelta(baseCambios, deltaCambios));
}

// ── Slots activos según tirada 1d100 ─────────────────────────
export function calcSlotsActivos(tirada, totalSlots) {
    if (totalSlots === 0 || tirada === 0) return 0;
    const activos = Math.floor((tirada / 100) * totalSlots);
    return Math.max(1, activos); 
}

// ── CTL usado por las medallas equipadas (Base Pura) ─────────
export function calcCTLUsado(medallas) {
    return medallas.reduce((acc, m) => acc + (m.costo_ctl || 0), 0);
}

// ── Verifica si una configuración de medallas es válida ───────
export function esConfigValida(medallas, ctlTotal) {
    return calcCTLUsado(medallas) <= ctlTotal;
}

// ── Tags que NO tiene el personaje A pero SÍ el personaje B ──
export function tagsDeContraste(tagsPropio, tagsCompanero) {
    const propioSet = new Set(tagsPropio.map(t => t.toLowerCase()));
    return tagsCompanero.filter(t => !propioSet.has(t.toLowerCase()));
}

// ── Genera las transacciones de PT para una interacción ───────
export function calcPTInteraccion(tagsPropio, tagsCompanero, tipo = 'interaccion') {
    const contraste = tagsDeContraste(tagsPropio, tagsCompanero);
    if (contraste.length === 0) return [];
    const delta = tipo === 'fusion' ? 5 : 1;
    if (tipo === 'fusion') {
        return contraste.map(tag => ({ tag, delta, motivo: 'fusion' }));
    }
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

// ── Resumen de un personaje (MODIFICADO: Usa proyectarStats) ──
export function resumenPJ(p) {
    const pt = proyectarStats(p) || p; // Proyectamos para usar los totales
    const tier  = calcTier(pt.pot_total, pt.agi_total, pt.ctl_total);
    
    return {
        nombre:   pt.nombre_refinado || pt.nombre,
        pot:      pt.pot_total,
        agi:      pt.agi_total,
        ctl:      pt.ctl_total,
        pac:      pt.pac_total,
        tier:     tier.tier,
        tierLabel: tier.label,
        pvMax:    pt.pv_total,
        pvActual: pt.pv_actual || 0,
        tags:     pt.tags || [],
        cambios:  pt.cambios_total
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

// ── Equipación de personajes (fuente: medallas_inventario) ──────────
const _equipCache = {};
let _supabaseRef = null;

export function setSupabaseRef(sb) {
    _supabaseRef = sb;
}

export async function getEquipacionPJ(nombrePJ, { forzar = false } = {}) {
    if (!_supabaseRef) return [];
    if (!forzar && _equipCache[nombrePJ]) return _equipCache[nombrePJ];

    try {
        const { data, error } = await _supabaseRef
            .from('medallas_inventario')
            .select('medalla_id, equipada, medallas_catalogo!inner(id, nombre, costo_ctl, tipo, efecto_desc, requisitos_base, efectos_condicionales)')
            .eq('personaje_nombre', nombrePJ)
            .eq('equipada', true);

        if (error) { console.warn('[bnh-pac] getEquipacionPJ:', error.message); return []; }

        const medallas = (data || []).map(row => row.medallas_catalogo).filter(Boolean);
        _equipCache[nombrePJ] = medallas;
        return medallas;
    } catch(e) {
        console.warn('[bnh-pac] getEquipacionPJ exception:', e);
        return [];
    }
}

export function invalidarCacheEquipacion(nombrePJ) {
    if (nombrePJ) delete _equipCache[nombrePJ];
    else Object.keys(_equipCache).forEach(k => delete _equipCache[k]);
}

// ── CTL Usado y Libre (MODIFICADO: Soporta Delta en CTL Usado) ──
export async function calcCTLUsadoPJ(nombrePJ, deltaCTLUsado = '0') {
    const medallas = await getEquipacionPJ(nombrePJ);
    const base = calcCTLUsado(medallas);
    return Math.floor(aplicarDelta(base, deltaCTLUsado));
}

export async function calcCTLLibrePJ(nombrePJ, ctlTotal, deltaCTLUsado = '0') {
    const usadoTotal = await calcCTLUsadoPJ(nombrePJ, deltaCTLUsado);
    return Math.max(0, ctlTotal - usadoTotal);
}
