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

// Soporta: texto, imágenes (una o múltiples), video, audio, link embed
export async function enviarMensaje({ convId, autorId, autorNombre, contenido, imagenPath, imagenPaths, videoPath, audioPath, linkUrl }) {
    let pathValue = null;
    if (imagenPaths && imagenPaths.length > 1) {
        pathValue = JSON.stringify(imagenPaths);
    } else if (imagenPaths && imagenPaths.length === 1) {
        pathValue = imagenPaths[0];
    } else if (imagenPath) {
        pathValue = imagenPath;
    }

    const hasMedia = !!(pathValue || videoPath || audioPath || linkUrl);
    const tipo = videoPath  ? (contenido ? 'mixto' : 'video')
               : audioPath  ? (contenido ? 'mixto' : 'audio')
               : linkUrl    ? (contenido ? 'mixto' : 'link')
               : contenido && pathValue ? 'mixto'
               : pathValue  ? 'imagen'
               : 'texto';

    // Construir payload base; campos opcionales sólo si tienen valor
    const payload = {
        conversacion_id: convId,
        autor_id:        autorId,
        autor_nombre:    autorNombre,
        contenido:       contenido   || null,
        imagen_path:     pathValue   || null,
        tipo,
    };
    if (videoPath)  payload.video_path  = videoPath;
    if (audioPath)  payload.audio_path  = audioPath;
    if (linkUrl)    payload.link_url    = linkUrl;

    // Insert progresivo: si falla por columna inexistente (42703) va quitando
    // campos nuevos hasta llegar al payload mínimo que siempre funciona.
    // Orden de intentos: completo → sin link_url → sin audio_path → sin video_path → sin tipo
    const intentos = [
        payload,
        (({ link_url, ...r }) => r)(payload),
        (({ link_url, audio_path, ...r }) => r)(payload),
        (({ link_url, audio_path, video_path, ...r }) => r)(payload),
        (({ link_url, audio_path, video_path, tipo, ...r }) => r)(payload),
    ];
    let data = null, error = null;
    for (const intento of intentos) {
        ({ data, error } = await supabase.from('op_mensajes').insert(intento).select('*').single());
        if (!error || error.code !== '42703') break;
    }
    return error ? null : data;
}

// Limpia imagen, video y audio del storage al eliminar un mensaje
export async function eliminarMensaje(id) {
    // Intentar seleccionar todos los campos de media; si alguno no existe, caer a mínimo
    let { data: msg } = await supabase.from('op_mensajes')
        .select('imagen_path, video_path, audio_path').eq('id', id).maybeSingle();
    if (!msg) {
        const { data: msgMin } = await supabase.from('op_mensajes')
            .select('imagen_path').eq('id', id).maybeSingle();
        msg = msgMin;
    }

    if (msg?.imagen_path) {
        let paths = [];
        try { paths = JSON.parse(msg.imagen_path); if (!Array.isArray(paths)) paths = [msg.imagen_path]; }
        catch { paths = [msg.imagen_path]; }
        if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    }
    if (msg?.video_path) await supabase.storage.from(BUCKET).remove([msg.video_path]);
    if (msg?.audio_path) await supabase.storage.from(BUCKET).remove([msg.audio_path]);

    await supabase.from('op_mensajes').delete().eq('id', id);
}

// ── Galería de imágenes ───────────────────────────────────────
export async function cargarImagenesGaleria() {
    const { data } = await supabase.from('op_imagenes')
        .select('*').order('creado_en', { ascending: false });
    return data || [];
}

export async function subirImagenGaleria(file, opId, opNombre, nombre) {
    // BUG FIX: usar file.type como fallback de extensión (cubre GIFs pegados sin extensión en nombre)
    const extFromName = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : null;
    const extFromType = (file.type.split('/')[1] || 'png').replace('jpeg','jpg');
    const ext  = extFromName || extFromType;
    const nombreBase = nombre.replace(/\.[^.]+$/, '');
    const safe = nombreBase.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const path = `${FOLDER}/${opNombre.toLowerCase().replace(/\s+/g,'_')}/${safe}_${Date.now()}.${ext}`;

    const { error: errUp } = await supabase.storage.from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type, cacheControl: '3600' });
    if (errUp) return { ok: false, msg: errUp.message };

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

    // BUG FIX: si la columna `tipo` no existe en la tabla, reintentar sin ella (error 42703)
    const payload = { op_id: opId, op_nombre: opNombre, nombre: nombreBase, path, url: publicUrl, tipo: 'imagen', tamaño_kb: Math.round(file.size / 1024) };
    let { data, error } = await supabase.from('op_imagenes').insert(payload).select('*').single();
    if (error?.code === '42703') {
        const { tipo: _drop, ...payloadSinTipo } = payload;
        ({ data, error } = await supabase.from('op_imagenes').insert(payloadSinTipo).select('*').single());
    }

    return error ? { ok: false, msg: error.message } : { ok: true, imagen: data };
}

// BUG FIX: función faltante — op-main.js la importaba pero no existía en este archivo.
export async function subirVideoGaleria(file, opId, opNombre, nombre) {
    // BUG FIX: extensión desde file.type como fallback
    const extFromName = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : null;
    const extFromType = file.type.split('/')[1] || 'mp4';
    const ext  = extFromName || extFromType;
    const nombreBase = nombre.replace(/\.[^.]+$/, '');
    const safe = nombreBase.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const path = `${FOLDER}/${opNombre.toLowerCase().replace(/\s+/g,'_')}/${safe}_${Date.now()}.${ext}`;

    const { error: errUp } = await supabase.storage.from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type, cacheControl: '3600' });
    if (errUp) return { ok: false, msg: errUp.message };

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

    // BUG FIX: defensivo ante columna `tipo` inexistente (error 42703)
    const payload = { op_id: opId, op_nombre: opNombre, nombre: nombreBase, path, url: publicUrl, tipo: 'video', tamaño_kb: Math.round(file.size / 1024) };
    let { data, error } = await supabase.from('op_imagenes').insert(payload).select('*').single();
    if (error?.code === '42703') {
        const { tipo: _drop, ...payloadSinTipo } = payload;
        ({ data, error } = await supabase.from('op_imagenes').insert(payloadSinTipo).select('*').single());
    }

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
