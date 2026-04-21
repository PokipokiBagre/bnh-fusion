// ============================================================
// medallas/medallas-data.js
// ============================================================
import { supabase } from '../bnh-auth.js';
import { setMedallas, setGrupos, setPuntosAll, setOpcionesFusion, setBannedTags } from './medallas-state.js';
import { cargarFusiones } from '../bnh-fusion.js'; 
import { registrarTagEnDB, TAGS_CANONICOS } from '../bnh-tags.js';

export async function cargarTodo() {
    const [
        { data: med }, 
        { data: gr }, 
        { data: pts },
        { data: opts },
        { data: baneados }
    ] = await Promise.all([
        supabase.from('medallas_catalogo').select('*').order('nombre'),
        supabase.from('personajes_refinados').select('*').order('nombre_refinado'),
        supabase.from('puntos_tag').select('personaje_nombre, tag, cantidad'),
        supabase.from('opciones_fusion').select('*').eq('id', 1).maybeSingle(),
        supabase.from('tags_catalogo').select('nombre').eq('baneado', true)
    ]);
    
    await cargarFusiones(); // <-- Carga las fusiones activas
    
    setMedallas(med || []);
    setGrupos(gr   || []);
    setPuntosAll(pts || []);
    
    setOpcionesFusion(opts || {});
    setBannedTags((baneados || []).map(t => (t.nombre.startsWith('#') ? t.nombre : '#' + t.nombre).toLowerCase()));
}

// Comprueba si un tag existe en el catálogo canónico y lo crea si no.
async function _asegurarTag(tag) {
    if (!tag) return;
    const nombre = tag.startsWith('#') ? tag : '#' + tag;
    const existe = TAGS_CANONICOS.some(t => t.toLowerCase() === nombre.toLowerCase());
    if (!existe) {
        await registrarTagEnDB(nombre);
    }
}

export async function guardarMedalla(datos) {
    const tipo = ['activa','pasiva'].includes(datos.tipo) ? datos.tipo : 'activa';

    // Asegurar que todos los tags referenciados existen en el catálogo
    // tags se derivan de requisitos_base (fuente única de verdad)
    const tagsDerivados = (datos.requisitos_base || []).map(r => r.tag.startsWith('#') ? r.tag : '#'+r.tag);
    const todosLosTags = [
        ...tagsDerivados,
        ...(datos.efectos_condicionales || []).map(ec => ec.tag),
    ].filter(Boolean);

    await Promise.all(todosLosTags.map(t => _asegurarTag(t)));

    const payload = {
        nombre:                datos.nombre,
        costo_ctl:             Number(datos.costo_ctl) || 0,
        efecto_desc:           datos.efecto_base || '',
        tipo,
        quirk_tag:             datos.quirk_tag || '',
        requisitos_base:       datos.requisitos_base       || [],
        efectos_condicionales: datos.efectos_condicionales || [],
        pos_x:                 datos.pos_x || 0,
        pos_y:                 datos.pos_y || 0,
        propuesta:             datos.propuesta     ?? false,
        propuesta_por:         datos.propuesta_por ?? '',
    };
    if (datos.id) payload.id = datos.id;

    const { data, error } = await supabase
        .from('medallas_catalogo')
        .upsert(payload, { onConflict: 'id' })
        .select('id')
        .single();

    return error ? { ok: false, msg: error.message } : { ok: true, id: data.id };
}

export async function eliminarMedalla(id) {
    const { error } = await supabase.from('medallas_catalogo').delete().eq('id', id);
    return !error;
}

export async function guardarPosicionesGrafo(posiciones) {
    for (const p of posiciones) {
        await supabase.from('medallas_catalogo')
            .update({ pos_x: p.pos_x, pos_y: p.pos_y }).eq('id', p.id);
    }
}

// ============================================================
// ── FUNCIONES DE GESTIÓN DE INVENTARIO Y CTL ────────────────
// ============================================================

/**
 * Guarda el inventario de medallas equipadas.
 * Recibe un array de IDs que ya han sido filtrados por el Main
 * para asegurar que NO superen el CTL proyectado.
 */
export async function guardarEquipacionDB(pjNombre, idsValidos) {
    // 1. Borrar la equipación actual de este PJ
    await supabase.from('medallas_inventario').delete().eq('personaje_nombre', pjNombre);
    
    // 2. Insertar los nuevos IDs
    if (idsValidos && idsValidos.length > 0) {
        const inserts = idsValidos.map(mId => ({ 
            personaje_nombre: pjNombre, 
            medalla_id: mId, 
            equipada: true 
        }));
        
        const { error } = await supabase.from('medallas_inventario').insert(inserts);
        if (error) return { ok: false, msg: error.message };
    }
    return { ok: true };
}

/**
 * Limpia totalmente el inventario de un personaje (Desequipar todo)
 */
export async function limpiarEquipacionDB(pjNombre) {
    const { error } = await supabase.from('medallas_inventario').delete().eq('personaje_nombre', pjNombre);
    return !error ? { ok: true } : { ok: false, msg: error.message };
}

/**
 * Guarda una propuesta de equipación en la base de datos para que el OP la revise.
 */
export async function proponerEquipacionDB(pjNombre, idsPropuestos) {
    // Borramos la propuesta anterior si existiera
    await supabase.from('medallas_propuestas_equipacion').delete().eq('personaje_nombre', pjNombre);
    
    if (idsPropuestos && idsPropuestos.length > 0) {
        const inserts = idsPropuestos.map(mId => ({ 
            personaje_nombre: pjNombre, 
            medalla_id: mId 
        }));
        const { error } = await supabase.from('medallas_propuestas_equipacion').insert(inserts);
        if (error) return { ok: false, msg: error.message };
    }
    return { ok: true };
}

/**
 * Rechaza o retira una propuesta de equipación existente.
 */
export async function rechazarPropuestaEqDB(pjNombre) {
    const { error } = await supabase.from('medallas_propuestas_equipacion').delete().eq('personaje_nombre', pjNombre);
    return !error ? { ok: true } : { ok: false, msg: error.message };
}
