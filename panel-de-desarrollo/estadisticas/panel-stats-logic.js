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
                const total = p.puntos_total || p.puntos_manual || 0;
                stState.puntosPorPersonaje[nombre] = Number(total);
            });
        }
    } catch (e) {
        console.warn("No se pudo cargar la vista de puntos totales.", e);
    }
}

export async function crearGrupoRefinado(nombre) {
    if (!nombre) return;
    const { data, error } = await supabase.from('personajes_refinados')
        .insert({ nombre_refinado: nombre }).select('id').single();
    
    if (data && !error) {
        stState.grupoActivoId = data.id;
        await cargarAgrupaciones();
        return { ok: true };
    }
    return { ok: false, msg: error?.message };
}

export async function eliminarGrupoRefinado(refId) {
    await supabase.from('personajes_refinados').delete().eq('id', refId);
    if (stState.grupoActivoId === refId) stState.grupoActivoId = null;
    await cargarAgrupaciones();
}

export async function asignarPersonajeAGrupoActivo(personajeId) {
    const refId = stState.grupoActivoId;
    if (!refId) return { ok: false, msg: "Haz clic sobre un grupo a la derecha para seleccionarlo antes de asignar." };

    // Validar límite de 6 slots
    const miembrosActuales = stState.personajesRaw.filter(p => p.refinado_id === refId).length;
    if (miembrosActuales >= 6) {
        return { ok: false, msg: "Este grupo ya está lleno (Límite de 6 personajes)." };
    }

    const { error } = await supabase.from('personajes').update({ refinado_id: refId }).eq('id', personajeId);
    if (error) return { ok: false, msg: "Error al guardar: " + error.message };

    await cargarAgrupaciones();
    return { ok: true };
}

export async function desvincularPersonaje(personajeId) {
    await supabase.from('personajes').update({ refinado_id: null }).eq('id', personajeId);
    await cargarAgrupaciones();
}
