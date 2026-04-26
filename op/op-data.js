// ============================================================
// op/op-data.js — Queries Supabase para OP Chat
// ============================================================
import { supabase } from '../bnh-auth.js';
import { opState, BUCKET, FOLDER } from './op-state.js';

// Cache de columnas disponibles en op_mensajes (se detecta al primer insert)
// Evita el loop de fallback en cada mensaje
const _colsOk = { video_path: null, audio_path: null, tipo: null };

async function _probarColumna(col) {
    if (_colsOk[col] !== null) return _colsOk[col];
    // Intentar un select de esa columna — si falla con 42703, no existe
    const { error } = await supabase.from('op_mensajes')
        .select(col).limit(1);
    _colsOk[col] = !error || error.code !== '42703';
    return _colsOk[col];
}

// ── Diagnóstico de permisos (se llama desde initOP) ──────────
export async function diagnosticarDB() {
    const checks = {};
    // 1. ¿Puede hacer SELECT en op_mensajes?
    const { error: selErr } = await supabase.from('op_mensajes').select('id').limit(1);
    checks.select = selErr ? `❌ ${selErr.code}: ${selErr.message}` : '✅';

    // 2. ¿Existen las columnas nuevas?
    for (const col of ['video_path', 'audio_path', 'tipo']) {
        const { error } = await supabase.from('op_mensajes').select(col).limit(1);
        checks[col] = error ? `❌ ${error.code}` : '✅';
    }

    // 3. ¿Puede hacer SELECT en op_imagenes?
    const { error: imgErr } = await supabase.from('op_imagenes').select('id').limit(1);
    checks.op_imagenes = imgErr ? `❌ ${imgErr.code}: ${imgErr.message}` : '✅';

    console.table(checks);
    return checks;
}

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
export async function enviarMensaje({ convId, autorId, autorNombre, contenido, imagenPath, imagenPaths, videoPath, audioPath }) {
    let pathValue = null;
    if (imagenPaths && imagenPaths.length > 1) {
        pathValue = JSON.stringify(imagenPaths);
    } else if (imagenPaths && imagenPaths.length === 1) {
        pathValue = imagenPaths[0];
    } else if (imagenPath) {
        pathValue = imagenPath;
    }

    // tipo: se calcula pero solo se incluye si el constraint lo permite
    // (constraint op_mensajes_tipo_check puede no incluir 'video'/'audio' aún)
    const tipo = videoPath  ? (contenido ? 'mixto' : 'video')
               : audioPath  ? (contenido ? 'mixto' : 'audio')
               : contenido && pathValue ? 'mixto'
               : pathValue  ? 'imagen'
               : 'texto';

    // Construir payload base sin tipo por defecto — se agrega solo si el constraint lo soporta
    const payload = {
        conversacion_id: convId,
        autor_id:        autorId,
        autor_nombre:    autorNombre,
        contenido:       contenido   || null,
        imagen_path:     pathValue   || null,
        _tipo:           tipo,
    };
    if (videoPath)  payload.video_path  = videoPath;
    if (audioPath)  payload.audio_path  = audioPath;

    // Construir payload final según columnas que realmente existen
    // _probarColumna() cachea el resultado para no repetir el select
    const [tieneVideo, tieneAudio, tieneTipo] = await Promise.all([
        _probarColumna('video_path'),
        _probarColumna('audio_path'),
        _probarColumna('tipo'),
    ]);

    const payloadFinal = {
        conversacion_id: payload.conversacion_id,
        autor_id:        payload.autor_id,
        autor_nombre:    payload.autor_nombre,
        contenido:       payload.contenido,
        imagen_path:     payload.imagen_path,
    };

    // Agregar tipo directamente — constraint ya soporta todos los valores
    if (tieneTipo) payloadFinal.tipo = payload._tipo;

    if (tieneVideo && payload.video_path) payloadFinal.video_path = payload.video_path;
    if (tieneAudio && payload.audio_path) payloadFinal.audio_path = payload.audio_path;

    // Si video/audio no tienen columna, preservar el path en contenido para no perderlo
    if (!tieneVideo && payload.video_path) {
        payloadFinal.contenido = [payloadFinal.contenido, '📹 ' + payload.video_path].filter(Boolean).join('\n');
    }
    if (!tieneAudio && payload.audio_path) {
        payloadFinal.contenido = [payloadFinal.contenido, '🎵 ' + payload.audio_path].filter(Boolean).join('\n');
    }

    const { data, error } = await supabase.from('op_mensajes').insert(payloadFinal).select('*').single();
    if (error) {
        console.error('[op-data] enviarMensaje error:', error.code, error.message, error.details, error.hint);
        console.error('[op-data] payloadFinal keys:', Object.keys(payloadFinal));
        console.error('[op-data] payloadFinal values:', JSON.stringify(payloadFinal, null, 2));
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

    if (error) console.error('[op-data] subirVideoGaleria insert error:', error.code, error.message);
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
