// ============================================================
// panel-stats-logic.js
// ============================================================

import { stState } from './panel-stats-state.js';
import { supabase } from '../../bnh-auth.js';
import { renderPanelStats } from './panel-stats-ui.js';

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
                const total = p.total || p.puntos_totales || p.puntos_manual || 0;
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
        renderPanelStats();
    }
}

export async function cargarGrupoEnSlot(refinadoId, slotIndex) {
    stState.slots[slotIndex] = refinadoId;
    renderPanelStats();
}

export async function vaciarSlot(slotIndex) {
    stState.slots[slotIndex] = null;
    renderPanelStats();
}

export async function asignarPersonajeASlotActivo(personajeId) {
    const refId = stState.slots[stState.slotActivoIndex];
    if (!refId) return { ok: false, msg: "Selecciona o crea un grupo en el slot activo primero." };

    await supabase.from('personajes').update({ refinado_id: refId }).eq('id', personajeId);
    await cargarAgrupaciones();
    return { ok: true };
}

export async function desvincularPersonaje(personajeId) {
    await supabase.from('personajes').update({ refinado_id: null }).eq('id', personajeId);
    await cargarAgrupaciones();
}
