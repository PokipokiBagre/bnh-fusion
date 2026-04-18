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
    if (!nombre) return { ok: false, msg: "Escribe un nombre." };
    try {
        const { data, error } = await supabase.from('personajes_refinados')
            .insert({ nombre_refinado: nombre }).select('id').single();
        
        if (error) {
            if (error.message.includes('Failed to fetch')) return { ok: false, msg: "Conexión bloqueada por tu navegador. Desactiva tu AdBlocker o los Escudos de Brave." };
            return { ok: false, msg: error.message };
        }
        if (data) {
            stState.grupoActivoId = data.id;
            // Auto-crear alias con el mismo nombre del grupo
            await supabase.from('personajes')
                .insert({ nombre: nombre, refinado_id: data.id });
            await cargarAgrupaciones();
            return { ok: true };
        }
    } catch (e) {
        return { ok: false, msg: "Error crítico: " + e.message };
    }
}

export async function eliminarGrupoRefinado(refId) {
    try {
        await supabase.from('personajes_refinados').delete().eq('id', refId);
        if (stState.grupoActivoId === refId) stState.grupoActivoId = null;
        await cargarAgrupaciones();
    } catch(e) { console.error(e); }
}

export async function asignarPersonajeAGrupoActivo(personajeId) {
    const refId = stState.grupoActivoId;
    if (!refId) return { ok: false, msg: "Haz clic sobre un grupo a la derecha para seleccionarlo antes de asignar." };

    try {
        const { error } = await supabase.from('personajes').update({ refinado_id: refId }).eq('id', personajeId);
        
        if (error) {
            // Aquí atrapamos a los bloqueadores de anuncios
            if (error.message.includes('Failed to fetch')) return { ok: false, msg: "Conexión bloqueada por tu navegador. Desactiva tu AdBlocker o los Escudos de Brave." };
            return { ok: false, msg: "Error al guardar: " + error.message };
        }
        
        await cargarAgrupaciones();
        return { ok: true };
    } catch (e) {
        return { ok: false, msg: "Error crítico: " + e.message };
    }
}

export async function desvincularPersonaje(personajeId) {
    try {
        const { error } = await supabase.from('personajes').update({ refinado_id: null }).eq('id', personajeId);
        if (error && error.message.includes('Failed to fetch')) {
            alert("Conexión bloqueada por AdBlocker.");
        }
        await cargarAgrupaciones();
    } catch(e) { console.error(e); }
}
