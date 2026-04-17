// ============================================================
// fichas-data.js
// ============================================================
import { supabase }   from '../bnh-auth.js';
import { db }         from '../bnh-db.js';
import { fichasGlobal, gruposGlobal, ptGlobal, hilosGlobal } from './fichas-state.js';

export async function cargarTodo() {
    const [pjs, grupos, ptRows, hilos] = await Promise.all([
        supabase.from('personajes').select('*').order('nombre'),
        supabase.from('personajes_refinados').select('*').order('nombre_refinado'),
        db.progresion.getPuntosAll(),
        supabase.from('historial_hilos').select('thread_id, titulo').order('creado_en', { ascending: false })
    ]);

    fichasGlobal.length = 0;
    fichasGlobal.push(...(pjs.data || []));

    gruposGlobal.length = 0;
    gruposGlobal.push(...(grupos.data || []));

    hilosGlobal.length = 0;
    hilosGlobal.push(...(hilos.data || []));

    Object.keys(ptGlobal).forEach(k => delete ptGlobal[k]);
    (ptRows || []).forEach(row => {
        if (!ptGlobal[row.personaje_nombre]) ptGlobal[row.personaje_nombre] = {};
        ptGlobal[row.personaje_nombre][row.tag] = row.cantidad;
    });
}

// Devuelve los personajes del hilo filtrando por poster_name
// (solo los que tienen grupo nombre asignado para el público)
export async function getPosterNamesDelHilo(threadId) {
    if (!threadId || threadId === 'todos') return null;
    const { data } = await supabase
        .from('historial_posts')
        .select('poster_name')
        .eq('thread_id', Number(threadId));
    return new Set((data || []).map(p => p.poster_name));
}

export async function crearPersonaje({ nombre, pot, agi, ctl, tags, lore, quirk }) {
    if (!nombre?.trim()) return { ok: false, msg: 'El nombre es obligatorio.' };
    const pv = calcPVSimple(pot, agi, ctl);
    const { error } = await supabase.from('personajes').insert({
        nombre: nombre.trim(), pot: pot||0, agi: agi||0, ctl: ctl||0,
        pv_actual: pv, tags: tags||[], lore: lore||'', quirk: quirk||''
    });
    if (error) return { ok: false, msg: error.message };
    await cargarTodo();
    return { ok: true };
}

export async function guardarStats(nombre, { pot, agi, ctl, pv_actual }) {
    const { error } = await supabase.from('personajes')
        .update({ pot, agi, ctl, pv_actual }).eq('nombre', nombre);
    if (error) return { ok: false, msg: error.message };
    const p = fichasGlobal.find(x => x.nombre === nombre);
    if (p) Object.assign(p, { pot, agi, ctl, pv_actual });
    return { ok: true };
}

export async function guardarLore(nombre, { lore, quirk }) {
    const { error } = await supabase.from('personajes')
        .update({ lore, quirk }).eq('nombre', nombre);
    if (error) return { ok: false, msg: error.message };
    const p = fichasGlobal.find(x => x.nombre === nombre);
    if (p) { p.lore = lore; p.quirk = quirk; }
    return { ok: true };
}

export async function guardarTags(nombre, tags) {
    const { error } = await supabase.from('personajes')
        .update({ tags }).eq('nombre', nombre);
    if (error) return { ok: false, msg: error.message };
    const p = fichasGlobal.find(x => x.nombre === nombre);
    if (p) p.tags = tags;
    return { ok: true };
}

export async function aplicarDeltaPT(personajeNombre, tag, delta, motivo) {
    const res = await db.progresion.aplicarTransacciones([{
        personaje_nombre: personajeNombre, tag, delta, motivo
    }]);
    if (!res.ok) return res;
    if (!ptGlobal[personajeNombre]) ptGlobal[personajeNombre] = {};
    ptGlobal[personajeNombre][tag] = (ptGlobal[personajeNombre][tag] || 0) + delta;
    return { ok: true };
}

export async function eliminarPersonaje(nombre) {
    await supabase.from('personajes').delete().eq('nombre', nombre);
    const idx = fichasGlobal.findIndex(p => p.nombre === nombre);
    if (idx !== -1) fichasGlobal.splice(idx, 1);
}

function calcPVSimple(pot, agi, ctl) {
    const pac = (pot||0)+(agi||0)+(ctl||0);
    const b = pac>=100?20:pac>=80?15:pac>=60?10:5;
    return Math.floor((pot||0)/4)+Math.floor((agi||0)/4)+Math.floor((ctl||0)/4)+b;
}
