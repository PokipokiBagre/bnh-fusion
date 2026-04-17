// ============================================================
// fichas-data.js — Carga y escritura en Supabase
// ============================================================
import { supabase } from '../bnh-auth.js';
import { db }       from '../bnh-db.js';
import { fichasGlobal, ptGlobal } from './fichas-state.js';

// ── Carga todos los personajes + PT globales ──────────────────
export async function cargarTodo() {
    const [personajes, ptRows] = await Promise.all([
        db.personajes.getAll(),
        db.progresion.getPuntosAll()
    ]);

    fichasGlobal.length = 0;
    fichasGlobal.push(...(personajes || []));

    // Reconstruir ptGlobal
    Object.keys(ptGlobal).forEach(k => delete ptGlobal[k]);
    (ptRows || []).forEach(row => {
        if (!ptGlobal[row.personaje_nombre]) ptGlobal[row.personaje_nombre] = {};
        ptGlobal[row.personaje_nombre][row.tag] = row.cantidad;
    });
}

// ── Crea un personaje nuevo ───────────────────────────────────
export async function crearPersonaje({ nombre, pot, agi, ctl, tags, lore, quirk }) {
    if (!nombre?.trim()) return { ok: false, msg: 'El nombre es obligatorio.' };

    const existe = fichasGlobal.find(p => p.nombre.toLowerCase() === nombre.trim().toLowerCase());
    if (existe) return { ok: false, msg: 'Ya existe un personaje con ese nombre.' };

    const pv = calcPVMaxSimple(pot, agi, ctl);
    const { error } = await supabase.from('personajes').insert({
        nombre:    nombre.trim(),
        pot:       pot   || 0,
        agi:       agi   || 0,
        ctl:       ctl   || 0,
        pv_actual: pv,
        tags:      tags  || [],
        lore:      lore  || '',
        quirk:     quirk || ''
    });
    if (error) return { ok: false, msg: error.message };
    await cargarTodo();
    return { ok: true };
}

// ── Guarda stats PAC y PV de un personaje ────────────────────
export async function guardarStats(nombre, { pot, agi, ctl, pv_actual }) {
    const { error } = await supabase.from('personajes')
        .update({ pot, agi, ctl, pv_actual })
        .eq('nombre', nombre);
    if (error) return { ok: false, msg: error.message };
    // Actualizar en memoria
    const p = fichasGlobal.find(x => x.nombre === nombre);
    if (p) { p.pot = pot; p.agi = agi; p.ctl = ctl; p.pv_actual = pv_actual; }
    return { ok: true };
}

// ── Guarda lore y quirk (texto libre) ────────────────────────
export async function guardarLore(nombre, { lore, quirk }) {
    const { error } = await supabase.from('personajes')
        .update({ lore, quirk })
        .eq('nombre', nombre);
    if (error) return { ok: false, msg: error.message };
    const p = fichasGlobal.find(x => x.nombre === nombre);
    if (p) { p.lore = lore; p.quirk = quirk; }
    return { ok: true };
}

// ── Guarda el array de tags de un personaje ───────────────────
export async function guardarTags(nombre, tags) {
    const { error } = await supabase.from('personajes')
        .update({ tags })
        .eq('nombre', nombre);
    if (error) return { ok: false, msg: error.message };
    const p = fichasGlobal.find(x => x.nombre === nombre);
    if (p) p.tags = tags;
    return { ok: true };
}

// ── Aplica delta de PT (ganancia o gasto) ─────────────────────
export async function aplicarDeltaPT(personajeNombre, tag, delta, motivo) {
    const res = await db.progresion.aplicarTransacciones([{
        personaje_nombre: personajeNombre,
        tag,
        delta,
        motivo
    }]);
    if (!res.ok) return res;

    // Actualizar en memoria
    if (!ptGlobal[personajeNombre]) ptGlobal[personajeNombre] = {};
    ptGlobal[personajeNombre][tag] = (ptGlobal[personajeNombre][tag] || 0) + delta;
    return { ok: true };
}

// ── Elimina un personaje (solo admin) ────────────────────────
export async function eliminarPersonaje(nombre) {
    await supabase.from('personajes').delete().eq('nombre', nombre);
    const idx = fichasGlobal.findIndex(p => p.nombre === nombre);
    if (idx !== -1) fichasGlobal.splice(idx, 1);
}

// Helper local para el cálculo de PV sin importar bnh-pac
function calcPVMaxSimple(pot, agi, ctl) {
    const pac = (pot || 0) + (agi || 0) + (ctl || 0);
    const bono = pac >= 100 ? 20 : pac >= 80 ? 15 : pac >= 60 ? 10 : 5;
    return Math.floor((pot||0)/4) + Math.floor((agi||0)/4) + Math.floor((ctl||0)/4) + bono;
}
