// ============================================================
// op/op-attach.js — Gestión de archivos adjuntos y links para OP Chat
// Maneja: imágenes, GIFs, videos, audios, links (YouTube/genéricos)
// ============================================================
import { opState, BUCKET, FOLDER } from './op-state.js';
import { supabase } from '../bnh-auth.js';
import { subirImagenGaleria, subirVideoGaleria } from './op-data.js';

// ── Tipos de archivo ──────────────────────────────────────────
export const isImage = f => f.type.startsWith('image/');

// isAudio primero para que .m4a / audio/x-m4a no sea capturado por isVideo
const AUDIO_EXTS = /\.(mp3|ogg|wav|flac|aac|m4a|opus|weba|wma)$/i;
const AUDIO_MIME = /^audio\//;
export const isAudio = f =>
    AUDIO_MIME.test(f.type) ||
    AUDIO_EXTS.test(f.name) ||
    // Algunos browsers reportan m4a como video/mp4 — detectar por extensión
    (f.type === 'video/mp4' && /\.m4a$/i.test(f.name));

// isVideo solo si NO es audio
export const isVideo = f =>
    f.type.startsWith('video/') && !isAudio(f);

// ── Subir audio a Supabase Storage ───────────────────────────
export async function subirAudio(file, opId, opNombre) {
    const extFromName = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : null;
    const extFromType = (file.type.split('/')[1] || 'mp3').replace('x-m4a','m4a').replace('mpeg','mp3').replace('ogg; codecs=opus','opus');
    const ext  = extFromName || extFromType;
    const base = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g,'_') || 'audio';
    const path = `${FOLDER}/${opNombre.toLowerCase().replace(/\s+/g,'_')}/_audio/${base}_${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type, cacheControl: '3600' });
    if (error) return { ok: false, msg: error.message };
    return { ok: true, path };
}

// ── Detectar y parsear links en el texto ─────────────────────
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

export function extraerLinks(texto) {
    if (!texto) return [];
    return [...texto.matchAll(URL_RE)].map(m => m[0]);
}

export function esYouTube(url) {
    return /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/playlist)/i.test(url);
}

// Devuelve { tipo, videoId, playlistId, shortId }
export function youTubeInfo(url) {
    // Playlist
    const pl = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    const v  = url.match(/(?:[?&]v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
    return {
        tipo:       pl && !v ? 'playlist' : v ? 'video' : 'unknown',
        videoId:    v  ? v[1]  : null,
        playlistId: pl ? pl[1] : null,
    };
}

// Compat alias
export function youTubeId(url) {
    return youTubeInfo(url).videoId;
}

export function esTikTok(url) {
    return /tiktok\.com\//i.test(url);
}

export function esSoundCloud(url) {
    return /soundcloud\.com\//i.test(url);
}

// ── Extensión segura desde File ───────────────────────────────
export function safeExt(file, fallback = 'bin') {
    const fromName = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : null;
    const fromType = file.type.split('/')[1]?.replace('jpeg','jpg') || null;
    return fromName || fromType || fallback;
}

// ── Clasificar lista de File en grupos ────────────────────────
export function clasificarArchivos(files) {
    return {
        imagenes: files.filter(f => isImage(f)),
        videos:   files.filter(f => isVideo(f)),
        audios:   files.filter(f => isAudio(f)),
    };
}

// ── Preview card HTML para el panel de pendientes ─────────────
export function pendingCardHTML(entry) {
    const { file, url } = entry;
    const kb    = (file.size / 1024).toFixed(0);
    const label = entry.source === 'paste' ? 'Portapapeles' : (file.name || 'archivo');
    const sizeLabel = kb > 1024 ? `${(kb/1024).toFixed(1)} MB` : `${kb} KB`;

    const isImg = isImage(file);
    const isVid = isVideo(file);
    const isAud = isAudio(file);

    let thumb = '';
    if (isImg) {
        thumb = `<img src="${url}" style="width:76px;height:60px;object-fit:cover;border-radius:5px;">`;
    } else if (isVid) {
        thumb = `<div style="width:76px;height:60px;display:flex;flex-direction:column;align-items:center;
            justify-content:center;font-size:1.8em;background:#fdecea;border-radius:5px;gap:2px;">
            🎬<span style="font-size:0.3em;color:#c0392b;font-weight:700;">VIDEO</span></div>`;
    } else if (isAud) {
        thumb = `<div style="width:76px;height:60px;display:flex;flex-direction:column;align-items:center;
            justify-content:center;font-size:1.8em;background:#e8f4f8;border-radius:5px;gap:2px;">
            🎵<span style="font-size:0.3em;color:#1a4a80;font-weight:700;">AUDIO</span></div>`;
    } else {
        thumb = `<div style="width:76px;height:60px;display:flex;align-items:center;justify-content:center;
            font-size:2em;background:#f5eeff;border-radius:5px;">📄</div>`;
    }

    const accentColor = isVid ? '#c0392b' : isAud ? '#1a4a80' : '#6c3483';
    const icon        = entry.source === 'paste' ? '📋 ' : isVid ? '🎬 ' : isAud ? '🎵 ' : '📎 ';

    return { thumb, label, sizeLabel, accentColor, icon };
}
