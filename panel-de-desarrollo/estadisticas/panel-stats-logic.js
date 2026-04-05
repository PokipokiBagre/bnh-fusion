// ============================================================
// panel-stats-logic.js
// ============================================================

import { stState } from './panel-stats-state.js';
import { supabase } from '../../bnh-auth.js';

export async function initStatsDev() {
    await cargarAgrupaciones();
}

export async function cargarAgrupaciones() {
    const [{ data: raw }, { data: ref }, { data: posts }] = await Promise.all([
        supabase.from('personajes').select('*'),
        supabase.from('personajes_refinados').select('*'),
        supabase.from('historial_posts').select('poster_name, thread_id')
    ]);

    stState.personajesRaw = raw || [];
    stState.personajesRefinados = ref || [];

    stState.hilosPorPersonaje = {};
    if (posts) {
        posts.forEach(p => {
            if (!p.poster_name) return;
            if (!stState.hilosPorPersonaje[p.poster_name]) {
                stState.hilosPorPersonaje[p.poster_name] = new Set();
            }
            stState.hilosPorPersonaje[p.poster_name].add(p.thread_id);
        });
    }

    try {
        const { data: pts } = await supabase.from('personajes_puntos_totales').select('*');
        stState.puntosPorPersonaje = {};
        if (pts) {
            pts.forEach(p => {
                const nombre = p.nombre || p.personaje_nombre;
                // 🌟 CORRECCIÓN: Toma el valor de la columna puntos_total de tu base de datos
                const total = p.puntos_total || p.puntos_manual || 0;
                stState.puntosPorPersonaje[nombre] = Number(total);
            });
        }
    } catch (e) {
        console.warn("No se pudo cargar la vista de puntos totales.", e);
    }
}

export async function crearGrupoRefinado(nombre, slotIndex) {
    if (!nombre) return;
    const { data, error } = await supabase.from('personajes_refinados')
        .insert({ nombre_refinado: nombre }).select('id').single();
    
    if (data && !error) {
        stState.slots[slotIndex] = data.id;
        await cargarAgrupaciones();
    }
}

export async function cargarGrupoEnSlot(refinadoId, slotIndex) {
    stState.slots[slotIndex] = refinadoId;
}

export async function vaciarSlot(slotIndex) {
    stState.slots[slotIndex] = null;
}

export async function asignarPersonajeASlotActivo(personajeId) {
    const refId = stState.slots[stState.slotActivoIndex];
    if (!refId) return { ok: false, msg: "Selecciona o crea un grupo en el slot activo (el del borde verde) primero." };

    const { error } = await supabase.from('personajes').update({ refinado_id: refId }).eq('id', personajeId);
    if (error) return { ok: false, msg: "Error al guardar en base de datos: " + error.message };

    await cargarAgrupaciones();
    return { ok: true };
}

export async function desvincularPersonaje(personajeId) {
    await supabase.from('personajes').update({ refinado_id: null }).eq('id', personajeId);
    await cargarAgrupaciones();
}
