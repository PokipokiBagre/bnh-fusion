// ============================================================
// panel-stats-logic.js
// ============================================================

import { stState } from './panel-stats-state.js';
import { supabase } from '../../bnh-auth.js';

export async function initStatsDev(statsMock, estadosMock) {
    stState.statsDB = statsMock || {};
    stState.estadosDB = estadosMock || [];
    await cargarAgrupaciones();
}

export async function cargarAgrupaciones() {
    // Cargamos los crudos y los agrupados
    const [{ data: raw }, { data: ref }] = await Promise.all([
        supabase.from('personajes').select('id, nombre, refinado_id'),
        supabase.from('personajes_refinados').select('*')
    ]);
    stState.personajesRaw = raw || [];
    stState.personajesRefinados = ref || [];
}

export async function autoRegistrarHuerfanos() {
    const huerfanos = stState.personajesRaw.filter(p => !p.refinado_id);
    if(huerfanos.length === 0) return { ok: false, msg: 'No hay personajes sueltos por registrar.' };

    for (const p of huerfanos) {
        // Upsert crea el grupo refinado con el mismo nombre si no existe
        const { data, error } = await supabase.from('personajes_refinados')
            .upsert({ nombre_refinado: p.nombre }, { onConflict: 'nombre_refinado' })
            .select('id').single();

        if (data && !error) {
            await supabase.from('personajes').update({ refinado_id: data.id }).eq('id', p.id);
        }
    }
    await cargarAgrupaciones();
    return { ok: true, msg: `¡Éxito! ${huerfanos.length} cuentas se auto-registraron como refinadas.` };
}

export async function agruparPersonajes(nombreRefinado, idsRaw) {
    if (!nombreRefinado || idsRaw.length === 0) return;

    let refId;
    const existente = stState.personajesRefinados.find(r => r.nombre_refinado.toLowerCase() === nombreRefinado.toLowerCase());

    if (existente) {
        refId = existente.id;
    } else {
        const { data } = await supabase.from('personajes_refinados')
            .insert({ nombre_refinado: nombreRefinado }).select('id').single();
        refId = data.id;
    }

    await supabase.from('personajes').update({ refinado_id: refId }).in('id', idsRaw);
    await cargarAgrupaciones();
}
