// ============================================================
// tags/tags-data.js
// ============================================================
import { supabase } from '../bnh-auth.js';
import { setGrupos, setPuntosAll, setCatalogoTags, setMedallasCat, setSolicitudes, catalogoTags } from './tags-state.js';

export async function cargarTodo() {
    const [
        { data: gr },
        { data: pts },
        { data: cat },
        { data: med },
        { data: sol },
    ] = await Promise.all([
        supabase.from('personajes_refinados').select('*').order('nombre_refinado'),
        supabase.from('puntos_tag').select('personaje_nombre, tag, cantidad'),
        supabase.from('tags_catalogo').select('nombre, descripcion, baneado, tipo').order('nombre'),
        supabase.from('medallas_catalogo').select('id, nombre, costo_ctl, efecto_desc, tipo, requisitos_base, efectos_condicionales, propuesta').order('nombre'),
        supabase.from('solicitudes_tag').select('*').order('creado_en'),
    ]);
    setGrupos(gr || []);
    setPuntosAll(pts || []);
    setCatalogoTags(cat || []);
    setMedallasCat(med || []);
    setSolicitudes(sol || []);
}

export async function guardarDescripcionTag(nombre, descripcion, tipo) {
    const payload = { nombre, descripcion };
    if (tipo) payload.tipo = tipo;
    const { error } = await supabase.from('tags_catalogo').upsert(payload, { onConflict: 'nombre' });
    return error ? { ok: false, msg: error.message } : { ok: true };
}

// ── SISTEMA DE SOLICITUDES ──────────────────────────────────────────
export async function enviarSolicitud(pj, tagSource, tipo, costo, datos = {}) {
    const { data: ptRow } = await supabase.from('puntos_tag')
        .select('cantidad').eq('personaje_nombre', pj).ilike('tag', tagSource).maybeSingle();
    
    if (!ptRow || ptRow.cantidad < costo) return { ok: false, msg: 'PT insuficientes.' };

    if (tipo === 'tres_tags') {
        const { data: exist } = await supabase.from('solicitudes_tag')
            .select('id').eq('personaje_nombre', pj).eq('tipo', 'tres_tags').maybeSingle();
        if (exist) return { ok: false, msg: 'Solo puede haber una solicitud de canje de tags pendiente por personaje.' };
    }

    const nuevaCantidad = ptRow.cantidad - costo;
    const { error: ePT } = await supabase.from('puntos_tag')
        .update({ cantidad: nuevaCantidad }).eq('personaje_nombre', pj).ilike('tag', tagSource);
    
    if (ePT) return { ok: false, msg: 'Error al descontar PT.' };

    const { error: eReq } = await supabase.from('solicitudes_tag').insert({
        personaje_nombre: pj, tag_origen: tagSource, tipo, costo_pt: costo, datos
    });

    if (eReq) {
        await supabase.from('puntos_tag').update({ cantidad: ptRow.cantidad }).eq('personaje_nombre', pj).ilike('tag', tagSource);
        return { ok: false, msg: 'Error al registrar la solicitud.' };
    }
    return { ok: true, nueva: nuevaCantidad };
}

export async function aprobarSolicitud(reqId) {
    const { data: req } = await supabase.from('solicitudes_tag').select('*').eq('id', reqId).maybeSingle();
    if (!req) return { ok: false, msg: 'Solicitud no encontrada.' };

    const pj = req.personaje_nombre;

    if (req.tipo.startsWith('stat_')) {
        const statField = req.tipo.split('_')[1]; 
        const { data: pData } = await supabase.from('personajes_refinados').select(statField).eq('nombre_refinado', pj).single();
        const newVal = (pData[statField] || 0) + 1;
        await supabase.from('personajes_refinados').update({ [statField]: newVal }).eq('nombre_refinado', pj);
    }
    else if (req.tipo === 'tres_tags') {
        const cambios = req.datos.cambios || [];
        const { data: gData } = await supabase.from('personajes_refinados').select('tags').eq('nombre_refinado', pj).single();
        let tagsFinal = [...(gData?.tags || [])];

        for (const cam of cambios) {
            const tagNorm = cam.tag.startsWith('#') ? cam.tag : '#' + cam.tag;
            if (cam.tipo === 'remover') {
                tagsFinal = tagsFinal.filter(t => (t.startsWith('#')?t:'#'+t).toLowerCase() !== tagNorm.toLowerCase());
            } else {
                if (!tagsFinal.some(t => (t.startsWith('#')?t:'#'+t).toLowerCase() === tagNorm.toLowerCase())) {
                    tagsFinal.push(tagNorm);
                }
                if (cam.tipo === 'nuevo') {
                    const tagKey = tagNorm.slice(1);
                    await supabase.from('tags_catalogo').upsert({ nombre: tagKey }, { onConflict: 'nombre', ignoreDuplicates: true });
                }
            }
        }
        await supabase.from('personajes_refinados').update({ tags: tagsFinal }).eq('nombre_refinado', pj);
    }
    else if (req.tipo === 'medalla') {
        const medId = req.datos.medalla_id;
        if (medId) await supabase.from('medallas_catalogo').update({ propuesta: false, propuesta_por: '' }).eq('id', medId);
    }

    await supabase.from('solicitudes_tag').delete().eq('id', reqId);
    return { ok: true };
}

export async function cancelarSolicitud(reqId) {
    const { data: req } = await supabase.from('solicitudes_tag').select('*').eq('id', reqId).maybeSingle();
    if (!req) return { ok: false, msg: 'Solicitud no encontrada.' };

    if (req.tipo === 'medalla' && req.datos.medalla_id) {
        await supabase.from('medallas_catalogo').delete().eq('id', req.datos.medalla_id);
    }

    const { data: ptRow } = await supabase.from('puntos_tag')
        .select('cantidad').eq('personaje_nombre', req.personaje_nombre).ilike('tag', req.tag_origen).maybeSingle();
    
    if (ptRow) {
        await supabase.from('puntos_tag').update({ cantidad: ptRow.cantidad + req.costo_pt })
            .eq('personaje_nombre', req.personaje_nombre).ilike('tag', req.tag_origen);
    } else {
        await supabase.from('puntos_tag').insert({
            personaje_nombre: req.personaje_nombre, tag: req.tag_origen, cantidad: req.costo_pt, actualizado_en: new Date().toISOString()
        });
    }

    await supabase.from('solicitudes_tag').delete().eq('id', reqId);
    return { ok: true };
}

export async function editarSolicitudTresTags(reqId, nuevosCambios) {
    const { error } = await supabase.from('solicitudes_tag').update({ datos: { cambios: nuevosCambios } }).eq('id', reqId);
    return error ? { ok: false, msg: error.message } : { ok: true };
}

// ─────────────────────────────────────────────────────────────────
export async function guardarBaneoTag(nombre, baneado) {
    const { data: cat } = await supabase.from('tags_catalogo').select('descripcion').eq('nombre', nombre).maybeSingle();
    const desc = cat ? cat.descripcion : '';
    const { error } = await supabase.from('tags_catalogo').upsert({ nombre, baneado, descripcion: desc }, { onConflict: 'nombre' });
    return error ? { ok: false, msg: error.message } : { ok: true };
}

export async function renameTag(viejoNombre, nuevoNombre) {
    const viejoKey = viejoNombre.startsWith('#') ? viejoNombre.slice(1) : viejoNombre;
    const nuevoKey = nuevoNombre.startsWith('#') ? nuevoNombre.slice(1) : nuevoNombre;
    const viejoTag = '#' + viejoKey;
    const nuevoTag = '#' + nuevoKey;

    try {
        const { data: pjs } = await supabase.from('personajes_refinados').select('id, tags');
        const updates = (pjs||[]).filter(p => 
            (p.tags||[]).some(t => (t.startsWith('#')?t:'#'+t).toLowerCase() === viejoTag.toLowerCase())
        ).map(p => {
            const arr = p.tags.filter(t => (t.startsWith('#')?t:'#'+t).toLowerCase() !== viejoTag.toLowerCase());
            if (!arr.some(t => (t.startsWith('#')?t:'#'+t).toLowerCase() === nuevoTag.toLowerCase())) arr.push(nuevoTag);
            return { id: p.id, tags: arr };
        });

        for (const u of updates) await supabase.from('personajes_refinados').update({ tags: u.tags }).eq('id', u.id);

        const { data: ptRows } = await supabase.from('puntos_tag').select('*').ilike('tag', viejoTag);
        for (const row of (ptRows||[])) {
            const { data: exist } = await supabase.from('puntos_tag')
                .select('*').eq('personaje_nombre', row.personaje_nombre).ilike('tag', nuevoTag).maybeSingle();
            if (exist) {
                await supabase.from('puntos_tag').update({ cantidad: exist.cantidad + row.cantidad }).eq('id', exist.id);
                await supabase.from('puntos_tag').delete().eq('id', row.id);
            } else {
                await supabase.from('puntos_tag').update({ tag: nuevoTag }).eq('id', row.id);
            }
        }

        const { data: catOld } = await supabase.from('tags_catalogo').select('*').ilike('nombre', viejoKey).maybeSingle();
        if (catOld) {
            await supabase.from('tags_catalogo').delete().ilike('nombre', viejoKey);
            await supabase.from('tags_catalogo').upsert({ nombre: nuevoKey, descripcion: catOld.descripcion, baneado: catOld.baneado, tipo: catOld.tipo }, { onConflict: 'nombre' });
        }
        return { ok: true, afectados: updates.length };
    } catch(e) { return { ok: false, msg: e.message }; }
}

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
        for (const u of updates) await supabase.from('personajes_refinados').update({ tags: u.tags }).eq('id', u.id);
        
        await supabase.from('puntos_tag').delete().ilike('tag', tagNorm);
        await supabase.from('log_puntos_tag').delete().ilike('tag', tagNorm);
        await supabase.from('tags_catalogo').delete().ilike('nombre', tagKey);
        
        return { ok: true, afectados: updates.length };
    } catch(e) { return { ok: false, msg: e.message }; }
}
