// medallas/medallas-data.js
import { supabase } from '../bnh-auth.js';
import { setMedallas, setGrupos, setPuntosAll } from './medallas-state.js';

export async function cargarTodo() {
    const [{ data: med }, { data: gr }, { data: pts }] = await Promise.all([
        supabase.from('medallas_catalogo').select('*').order('nombre'),
        supabase.from('personajes_refinados').select('*').order('nombre_refinado'),
        supabase.from('puntos_tag').select('personaje_nombre, tag, cantidad'),
    ]);
    setMedallas(med || []);
    setGrupos(gr  || []);
    setPuntosAll(pts || []);
}

export async function guardarMedalla(datos) {
    // datos = { id?, nombre, tag_requerido, costo_ctl, efecto_base,
    //           tipo, quirk_tag, tags,
    //           requisitos_base, efectos_condicionales, pos_x, pos_y }
    const payload = {
        nombre:                datos.nombre,
        tags:                  datos.tags || [],
        costo_ctl:             Number(datos.costo_ctl) || 0,
        efecto_desc:           datos.efecto_base || '',
        tipo:                  datos.tipo || 'ofensiva',
        quirk_tag:             datos.quirk_tag || '',
        requisitos_base:       datos.requisitos_base       || [],
        efectos_condicionales: datos.efectos_condicionales || [],
        pos_x:                 datos.pos_x || 0,
        pos_y:                 datos.pos_y || 0,
    };
    if (datos.id) payload.id = datos.id;
    const { data, error } = await supabase.from('medallas_catalogo')
        .upsert(payload, { onConflict: 'id' }).select('id').single();
    return error ? { ok: false, msg: error.message } : { ok: true, id: data.id };
}

export async function eliminarMedalla(id) {
    const { error } = await supabase.from('medallas_catalogo').delete().eq('id', id);
    return !error;
}

export async function guardarPosicionesGrafo(posiciones) {
    // posiciones = [{ id, pos_x, pos_y }]
    for (const p of posiciones) {
        await supabase.from('medallas_catalogo')
            .update({ pos_x: p.pos_x, pos_y: p.pos_y }).eq('id', p.id);
    }
}
