// ============================================================
// op/op-data.js — Queries Supabase para OP Chat
// ============================================================
import { supabase } from '../bnh-auth.js';
import { opState, BUCKET, FOLDER } from './op-state.js';

// ── Perfil ────────────────────────────────────────────────────
export async function cargarPerfil(userId) {
    const { data } = await supabase.from('op_perfiles')
        .select('*').eq('id', userId).maybeSingle();
    return data;
}

export async function guardarPerfil(userId, { nombre, avatar_path }) {
    const payload = { id: userId, nombre, actualizado_en: new Date().toISOString() };
    if (avatar_path !== undefined) payload.avatar_path = avatar_path;
    const { error } = await supabase.from('op_perfiles')
        .upsert(payload, { onConflict: 'id' });
    return !error;
}

// ── Conversaciones ────────────────────────────────────────────
export async function cargarConversaciones() {
    const { data } = await supabase.from('op_conversaciones')
        .select('*').order('ultimo_msg', { ascending: false });
    return data || [];
}

export async function crearConversacion(titulo) {
    const { data, error } = await supabase.from('op_conversaciones')
        .insert({ titulo, creado_por: (await supabase.auth.getUser()).data.user?.id })
        .select('*').single();
    return error ? null : data;
}

export async function eliminarConversacion(id) {
    await supabase.from('op_mensajes').delete().eq('conversacion_id', id);
    const { error } = await supabase.from('op_conversaciones').delete().eq('id', id);
    return !error;
}

export async function limpiarConversacion(id) {
    const { error } = await supabase.from('op_mensajes').delete().eq('conversacion_id', id);
    return !error;
}

// ── Mensajes ──────────────────────────────────────────────────
export async function cargarMensajes(convId, limit = 60) {
    const { data } = await supabase.from('op_mensajes')
        .select('*')
        .eq('conversacion_id', convId)
        .order('creado_en', { ascending: false })
        .limit(limit);
    return (data || []).reverse();
}

// BUG FIX: se agregó videoPath al signature y al insert.
// También se corrigió el cálculo de `tipo` para cubrir el caso 'video' y 'mixto' con video.
export async function enviarMensaje({ convId, autorId, autorNombre, contenido, imagenPath, imagenPaths, videoPath }) {
    // imagenPaths: string[] para múltiples imágenes
    // imagenPath:  string   para compatibilidad con mensajes existentes
    // videoPath:   string   para un video
    let pathValue = null;
    if (imagenPaths && imagenPaths.length > 1) {
        pathValue = JSON.stringify(imagenPaths);
    } else if (imagenPaths && imagenPaths.length === 1) {
        pathValue = imagenPaths[0];
    } else if (imagenPath) {
        pathValue = imagenPath;
    }

    const tipo = videoPath
        ? (contenido ? 'mixto' : 'video')
        : (contenido && pathValue ? 'mixto' : pathValue ? 'imagen' : 'texto');

    const { data, error } = await supabase.from('op_mensajes').insert({
        conversacion_id: convId,
        autor_id:        autorId,
        autor_nombre:    autorNombre,
        contenido:       contenido  || null,
        imagen_path:     pathValue  || null,
        video_path:      videoPath  || null,   // BUG FIX: antes nunca se insertaba
        tipo,
    }).select('*').single();
    return error ? null : data;
}

// BUG FIX: al eliminar un mensaje también se limpia video_path del storage.
export async function eliminarMensaje(id) {
    const { data: msg } = await supabase.from('op_mensajes')
        .select('imagen_path, video_path').eq('id', id).maybeSingle();

    if (msg?.imagen_path) {
        let paths = [];
        try { paths = JSON.parse(msg.imagen_path); if (!Array.isArray(paths)) paths = [msg.imagen_path]; }
        catch { paths = [msg.imagen_path]; }
        if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    }

    // BUG FIX: antes no se eliminaba el archivo de video del storage
    if (msg?.video_path) {
        await supabase.storage.from(BUCKET).remove([msg.video_path]);
    }

    await supabase.from('op_mensajes').delete().eq('id', id);
}

// ── Galería de imágenes ───────────────────────────────────────
export async function cargarImagenesGaleria() {
    const { data } = await supabase.from('op_imagenes')
        .select('*').order('creado_en', { ascending: false });
    return data || [];
}

export async function subirImagenGaleria(file, opId, opNombre, nombre) {
    const ext  = file.name.split('.').pop().toLowerCase();
    const safe = nombre.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const path = `${FOLDER}/${opNombre.toLowerCase().replace(/\s+/g,'_')}/${safe}_${Date.now()}.${ext}`;

    const { error: errUp } = await supabase.storage.from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type, cacheControl: '3600' });
    if (errUp) return { ok: false, msg: errUp.message };

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

    const { data, error } = await supabase.from('op_imagenes').insert({
        op_id:     opId,
        op_nombre: opNombre,
        nombre,
        path,
        url:       publicUrl,
        tipo:      'imagen',
        tamaño_kb: Math.round(file.size / 1024),
    }).select('*').single();

    return error ? { ok: false, msg: error.message } : { ok: true, imagen: data };
}

// BUG FIX: función faltante — op-main.js la importaba pero no existía en este archivo.
export async function subirVideoGaleria(file, opId, opNombre, nombre) {
    const ext  = file.name.split('.').pop().toLowerCase();
    const safe = nombre.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const path = `${FOLDER}/${opNombre.toLowerCase().replace(/\s+/g,'_')}/${safe}_${Date.now()}.${ext}`;

    const { error: errUp } = await supabase.storage.from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type, cacheControl: '3600' });
    if (errUp) return { ok: false, msg: errUp.message };

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

    const { data, error } = await supabase.from('op_imagenes').insert({
        op_id:     opId,
        op_nombre: opNombre,
        nombre,
        path,
        url:       publicUrl,
        tipo:      'video',          // distingue videos de imágenes en renderGaleria()
        tamaño_kb: Math.round(file.size / 1024),
    }).select('*').single();

    return error ? { ok: false, msg: error.message } : { ok: true, imagen: data };
}

export async function eliminarImagenGaleria(imagenId, path) {
    await supabase.storage.from(BUCKET).remove([path]);
    await supabase.from('op_imagenes').delete().eq('id', imagenId);
}

export async function subirAvatarOP(file, opId) {
    const ext  = file.name.split('.').pop().toLowerCase();
    const path = `${FOLDER}/_avatars/${opId}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
    return error ? null : path;
}

// ── Realtime ──────────────────────────────────────────────────
export function suscribirMensajes(convId, onNuevo) {
    return supabase.channel(`op-msgs-${convId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'op_mensajes',
            filter: `conversacion_id=eq.${convId}`
        }, payload => onNuevo(payload.new))
        .subscribe();
}
