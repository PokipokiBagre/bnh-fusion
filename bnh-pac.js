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

// ── Aplica un delta string a un valor base ────────────────────
// Soporta: "+20" | "-10" | "x1.5" | "*2" | "/2" | "^2" | "^0.5" | "0" | ""
// Devuelve siempre un número entero redondeado.
export function aplicarDelta(base, deltaStr) {
    const s = String(deltaStr || '0').trim();
    if (!s || s === '0') return base;
    
    // Potencia: ^2 ó ^0.5
    const powM = s.match(/^\^([+-]?\d+(?:\.\d+)?)$/);
    if (powM) return Math.round(Math.pow(base, parseFloat(powM[1])));
    
    // Multiplicación: x1.5 ó *1.5
    const multM = s.match(/^[xX\*]([+-]?\d+(?:\.\d+)?)$/);
    if (multM) return Math.round(base * parseFloat(multM[1]));
    
    // División: /2 ó /0.5
    const divM = s.match(/^\/([+-]?\d+(?:\.\d+)?)$/);
    if (divM) return Math.round(base / parseFloat(divM[1]));
    
    // Suma/Resta: +20 ó -10 ó simplemente 20
    const addM = s.match(/^([+-]?\d+(?:\.\d+)?)$/);
    if (addM) return Math.round(base + parseFloat(addM[1]));
    
    // Fallback: ignorar delta inválido
    return base;
}

// ── Aplica hasta 5 deltas encadenados: (((base Δ1) Δ2) Δ3)… ──
// Uso: aplicarDeltas(base, d1, d2, d3, d4, d5)
// Los deltas vacíos o "0" se ignoran sin romper la cadena.
export function aplicarDeltas(base, ...deltaStrs) {
    return deltaStrs.reduce((acc, d) => aplicarDelta(acc, d), base);
}

// ── Equipación de personajes (fuente: medallas_inventario) ──────────
// Cache en memoria para la sesión actual
const _equipCache = {};
let _supabaseRef = null;

/**
 * Inyectar la referencia de supabase (llamar una vez al init de cada página).
 * import { setSupabaseRef } from '../bnh-pac.js';
 * setSupabaseRef(supabase);
 */
export function setSupabaseRef(sb) {
    _supabaseRef = sb;
}

/**
 * Obtiene las medallas equipadas de un personaje desde medallas_inventario.
 * Devuelve array de objetos medalla: [{ id, nombre, costo_ctl, tipo, ... }]
 * Usa cache por personaje para evitar queries repetidas.
 */
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

/**
 * Invalida el cache de equipación de un personaje (llamar tras guardar equipación).
 */
export function invalidarCacheEquipacion(nombrePJ) {
    if (nombrePJ) delete _equipCache[nombrePJ];
    else Object.keys(_equipCache).forEach(k => delete _equipCache[k]);
}

/**
 * Calcula el CTL usado por la equipación actual de un personaje.
 * Async: hace query si no está en cache.
 */
export async function calcCTLUsadoPJ(nombrePJ) {
    const medallas = await getEquipacionPJ(nombrePJ);
    return calcCTLUsado(medallas);
}

/**
 * Calcula el CTL libre (disponible) de un personaje.
 * ctlTotal: el stat CTL base del personaje.
 */
export async function calcCTLLibrePJ(nombrePJ, ctlTotal) {
    const usado = await calcCTLUsadoPJ(nombrePJ);
    return Math.max(0, ctlTotal - usado);
}
