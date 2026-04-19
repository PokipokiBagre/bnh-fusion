// ============================================================
// tags/tags-data.js
// ============================================================
import { supabase } from '../bnh-auth.js';
import { setGrupos, setPuntosAll, setCatalogoTags, setMedallasCat, catalogoTags } from './tags-state.js';

export async function cargarTodo() {
    const [
        { data: gr },
        { data: pts },
        { data: cat },
        { data: med },
    ] = await Promise.all([
        supabase.from('personajes_refinados').select('*').order('nombre_refinado'),
        supabase.from('puntos_tag').select('personaje_nombre, tag, cantidad'),
        supabase.from('tags_catalogo').select('nombre, descripcion, baneado, tipo').order('nombre'),
        supabase.from('medallas_catalogo').select('nombre, costo_ctl, efecto_desc, tipo, requisitos_base').order('nombre'),
    ]);
    setGrupos(gr || []);
    setPuntosAll(pts || []);
    setCatalogoTags(cat || []);
    setMedallasCat(med || []);
}

// Guarda o actualiza la descripción de un tag en tags_catalogo
export async function guardarDescripcionTag(nombre, descripcion, tipo) {
    const payload = { nombre, descripcion };
    if (tipo) payload.tipo = tipo;
    const { error } = await supabase.from('tags_catalogo')
        .upsert(payload, { onConflict: 'nombre' });
    return error ? { ok: false, msg: error.message } : { ok: true };
}

// Canje: gasta PT de un tag y aplica el efecto
// tipo: 'stat_pot' | 'stat_agi' | 'stat_ctl' | 'tres_tags'
// Banear/desbanear un tag
export async function guardarBaneoTag(nombre, baneado) {
    const { error } = await supabase.from('tags_catalogo')
        .upsert({ nombre, baneado }, { onConflict: 'nombre' });
    return error ? { ok: false, msg: error.message } : { ok: true };
}

export async function canjearPT(personajeNombre, tag, tipo) {
    // Importar catalogoTags para verificar si está baneado
    const { catalogoTags } = await import('./tags-state.js');
    const tagKey = tag.startsWith('#') ? tag.slice(1) : tag;
    const catEntry = catalogoTags.find(t => t.nombre.toLowerCase() === tagKey.toLowerCase());
    if (catEntry?.baneado) return { ok: false, msg: `El tag ${tag} está baneado y no permite canjes.` };

    const COSTOS = { stat_pot: 50, stat_agi: 50, stat_ctl: 50, tres_tags: 100 };
    const costo = COSTOS[tipo];
    if (!costo) return { ok: false, msg: 'Tipo de canje desconocido.' };

    // Registrar gasto en log_puntos_tag y descontar de puntos_tag
    const { error: eLog } = await supabase.from('log_puntos_tag').insert({
        personaje_nombre: personajeNombre,
        tag,
        delta:  -costo,
        motivo: 'canje_' + tipo,
    });
    if (eLog) return { ok: false, msg: eLog.message };

    // Descontar de puntos_tag
    const { data: actual } = await supabase.from('puntos_tag')
        .select('cantidad').eq('personaje_nombre', personajeNombre).eq('tag', tag).maybeSingle();
    const nueva = (actual?.cantidad || 0) - costo;
    const { error: ePts } = await supabase.from('puntos_tag')
        .upsert({ personaje_nombre: personajeNombre, tag, cantidad: nueva, actualizado_en: new Date().toISOString() },
                 { onConflict: 'personaje_nombre,tag' });
    if (ePts) return { ok: false, msg: ePts.message };

    // Aplicar efecto en personaje
    if (tipo.startsWith('stat_')) {
        const statKey = tipo.replace('stat_', ''); // pot | agi | ctl
        const { data: pj } = await supabase.from('personajes_refinados')
            .select('pot, agi, ctl').eq('nombre_refinado', personajeNombre).maybeSingle();
        if (pj) {
            const update = { [statKey]: (pj[statKey] || 0) + 1 };
            await supabase.from('personajes_refinados').update(update).eq('nombre_refinado', personajeNombre);
        }
    }
    // Para 'tres_tags' el OP asigna los tags manualmente después del canje

    return { ok: true, nueva };
}

// ── Renombrar un tag en TODOS los personajes + catálogo ───────
export async function renameTag(nombreViejo, nombreNuevo) {
    nombreNuevo = nombreNuevo.trim();
    if (!nombreNuevo) return { ok: false, msg: 'El nuevo nombre no puede estar vacío.' };
    const viejoNorm = nombreViejo.startsWith('#') ? nombreViejo : '#' + nombreViejo;
    const nuevoNorm = nombreNuevo.startsWith('#') ? nombreNuevo : '#' + nombreNuevo;
    const viejoKey  = viejoNorm.slice(1);
    const nuevoKey  = nuevoNorm.slice(1);
    if (viejoNorm === nuevoNorm) return { ok: true, afectados: 0 };
    try {
        const { data: pjs } = await supabase.from('personajes_refinados').select('id, tags');
        const updates = (pjs||[]).filter(p =>
            (p.tags||[]).some(t => (t.startsWith('#')?t:'#'+t).toLowerCase() === viejoNorm.toLowerCase())
        ).map(p => ({
            id: p.id,
            tags: p.tags.map(t => (t.startsWith('#')?t:'#'+t).toLowerCase() === viejoNorm.toLowerCase() ? nuevoNorm : t)
        }));
        for (const u of updates)
            await supabase.from('personajes_refinados').update({ tags: u.tags }).eq('id', u.id);
        await supabase.from('puntos_tag').update({ tag: nuevoNorm }).ilike('tag', viejoNorm);
        await supabase.from('log_puntos_tag').update({ tag: nuevoNorm }).ilike('tag', viejoNorm);
        const { data: catOld } = await supabase.from('tags_catalogo')
            .select('descripcion, baneado, tipo').ilike('nombre', viejoKey).maybeSingle();
        if (catOld) {
            await supabase.from('tags_catalogo').delete().ilike('nombre', viejoKey);
            await supabase.from('tags_catalogo').upsert(
                { nombre: nuevoKey, descripcion: catOld.descripcion, baneado: catOld.baneado, tipo: catOld.tipo },
                { onConflict: 'nombre' }
            );
        }
        return { ok: true, afectados: updates.length };
    } catch(e) { return { ok: false, msg: e.message }; }
}

// ── Eliminar un tag de TODOS los personajes + catálogo ────────
export async function deleteTag(nombre) {
    const tagNorm = nombre.startsWith('#') ? nombre : '#' + nombre;
    const tagKey  = tagNorm.slice(1);
    try {
        const { data: pjs } = await supabase.from('personajes_refinados').select('id, tags');
        const updates = (pjs||[]).filter(p =>
            (p.tags||[]).some(t => (t.startsWith('#')?t:'#'+t).toLowerCase() === tagNorm.toLowerCase())
        ).map(p => ({
            id: p.id,
            tags: p.tags.filter(t => (t.startsWith('#')?t:'#'+t).toLowerCase() !== tagNorm.toLowerCase())
        }));
        for (const u of updates)
            await supabase.from('personajes_refinados').update({ tags: u.tags }).eq('id', u.id);
        await supabase.from('puntos_tag').delete().ilike('tag', tagNorm);
        await supabase.from('log_puntos_tag').delete().ilike('tag', tagNorm);
        await supabase.from('tags_catalogo').delete().ilike('nombre', tagKey);
        return { ok: true, afectados: updates.length };
    } catch(e) { return { ok: false, msg: e.message }; }
}
