// ============================================================
// op/op-ui.js — Renderizado de UI para OP Chat
// ============================================================
import { opState, avatarUrl, imageUrl, STORAGE_URL } from './op-state.js';
import { renderMsgMarkup } from './op-markup.js';
import { esYouTube, youTubeInfo, youTubeId, esTikTok, esSoundCloud, extraerLinks } from './op-attach.js';

const $ = id => document.getElementById(id);
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ── Parse imagen_path: devuelve array de URLs ─────────────────
function _parsePaths(imagen_path) {
    if (!imagen_path) return [];
    try {
        const parsed = JSON.parse(imagen_path);
        if (Array.isArray(parsed)) return parsed.map(p => imageUrl(p));
    } catch (_) {}
    return [imageUrl(imagen_path)];
}

// ── Render grid/carrusel de imágenes ─────────────────────────
function _renderImgGrid(imagen_path, msgId) {
    const urls = _parsePaths(imagen_path);
    if (!urls.length) return '';
    if (urls.length === 1) {
        return `<img src="${esc(urls[0])}" class="op-msg-img"
            onclick="window._opVerImagen('${esc(urls[0])}')" alt="imagen">`;
    }
    // Grid: mostrar máx 10 celdas. Si hay más de 10, la celda 10 muestra +(n-9)
    const MAX_VISIBLE = 10;
    const showOverlay = urls.length > MAX_VISIBLE;
    const visible = showOverlay ? urls.slice(0, MAX_VISIBLE) : urls;
    const ocultas = urls.length - 9;
    const cols = visible.length <= 2 ? visible.length : visible.length <= 6 ? 3 : 4;
    const gridStyle = `display:grid;grid-template-columns:repeat(${cols},1fr);gap:3px;border-radius:8px;overflow:hidden;max-width:300px;`;
    const items = visible.map((url, i) => {
        const isOverlay = showOverlay && i === MAX_VISIBLE - 1;
        return `<div style="position:relative;aspect-ratio:1;overflow:hidden;cursor:pointer;"
            onclick="window._opVerGaleriaMensaje('${esc(msgId)}',${i})">
            <img src="${esc(url)}" style="width:100%;height:100%;object-fit:cover;">
            ${isOverlay ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.55);
                display:flex;align-items:center;justify-content:center;
                color:white;font-size:1.4em;font-weight:700;">+${ocultas}</div>` : ''}
        </div>`;
    }).join('');
    // data-all-urls guarda TODAS las URLs para el carrusel del lightbox
    const allUrlsJson = JSON.stringify(urls).replace(/'/g, '&#39;');
    return `<div style="${gridStyle}" data-all-urls='${allUrlsJson}'>${items}</div>`;
}

// ── Render video inline ───────────────────────────────────────
function _renderVideo(video_path) {
    if (!video_path) return '';
    const url = imageUrl(video_path);
    const nombre = video_path.split('/').pop().replace(/_\d{13}(\.\w+)$/, '$1') || 'video';
    // ID único para poder acceder al <video> desde el botón PiP
    const vid = `vid_${Math.random().toString(36).slice(2,8)}`;
    return `<div style="display:flex;flex-direction:column;
        background:linear-gradient(135deg,rgba(192,57,43,0.12),rgba(108,52,131,0.08));
        border:1.5px solid rgba(192,57,43,0.22);border-radius:12px;
        width:min(340px,100%);min-width:220px;margin-top:4px;overflow:hidden;box-sizing:border-box;">
        <div style="display:flex;align-items:center;gap:8px;padding:7px 10px 4px;
            background:rgba(0,0,0,0.08);">
            <span style="font-size:1em;flex-shrink:0;">🎬</span>
            <span style="font-size:0.72em;color:rgba(255,255,255,0.55);overflow:hidden;
                text-overflow:ellipsis;white-space:nowrap;flex:1;" title="${esc(nombre)}">${esc(nombre)}</span>
            <button onclick="window._opVideoPiP('${vid}')"
                title="Picture in Picture"
                style="background:rgba(192,57,43,0.25);border:1px solid rgba(192,57,43,0.4);
                    color:rgba(255,255,255,0.8);border-radius:5px;padding:2px 6px;
                    cursor:pointer;font-size:0.68em;flex-shrink:0;line-height:1.4;">⧉ PiP</button>
        </div>
        <video id="${vid}" src="${esc(url)}" controls preload="metadata" playsinline
            style="width:100%;display:block;background:#000;max-height:220px;object-fit:contain;">
        </video>
    </div>`;
}

// ── Render audio player ───────────────────────────────────────
function _renderAudio(audio_path) {
    if (!audio_path) return '';
    const url = imageUrl(audio_path);
    // Extraer nombre del archivo del path
    const nombre = audio_path.split('/').pop().replace(/_\d{13}(\.\w+)$/, '$1') || 'audio';
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;
        background:linear-gradient(135deg,rgba(26,74,128,0.15),rgba(108,52,131,0.1));
        border:1.5px solid rgba(26,74,128,0.25);border-radius:12px;
        width:min(320px,100%);min-width:220px;margin-top:4px;box-sizing:border-box;">
        <span style="font-size:1.4em;flex-shrink:0;">🎵</span>
        <div style="flex:1;min-width:0;">
            <div style="font-size:0.72em;color:rgba(255,255,255,0.5);margin-bottom:4px;
                overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(nombre)}">${esc(nombre)}</div>
            <audio controls preload="metadata"
                style="width:100%;height:28px;accent-color:#6c3483;border-radius:4px;">
                <source src="${esc(url)}">
                Tu navegador no soporta audio.
            </audio>
        </div>
    </div>`;
}

// ── Render link embed (YouTube video/playlist, TikTok, SoundCloud, genérico) ─
function _renderLink(link_url) {
    if (!link_url) return '';

    if (esYouTube(link_url)) {
        const { tipo, videoId, playlistId } = youTubeInfo(link_url);

        if (tipo === 'playlist') {
            // Playlist: usar thumbnail del primero disponible + badge cuenta
            const thumb = playlistId
                ? `https://i.ytimg.com/vi/0/hqdefault.jpg` // placeholder; YT no da thumb directo
                : '';
            const embedUrl = `https://www.youtube.com/embed/videoseries?list=${playlistId}&autoplay=1`;
            return `<div style="position:relative;width:min(320px,100%);cursor:pointer;
                       border-radius:10px;overflow:hidden;margin-top:6px;
                       box-shadow:0 3px 16px rgba(0,0,0,0.4);background:#111;"
                onclick="window._opAbrirYTModal('${esc(embedUrl)}','${esc(link_url)}')">
                <div style="width:100%;aspect-ratio:16/9;background:linear-gradient(135deg,#1a1a2e,#16213e);
                    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">
                    <div style="width:52px;height:36px;background:#ff0000;border-radius:8px;
                        display:flex;align-items:center;justify-content:center;
                        box-shadow:0 2px 8px rgba(0,0,0,0.5);">
                        <div style="border-left:18px solid white;border-top:10px solid transparent;
                            border-bottom:10px solid transparent;margin-left:4px;"></div>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);
                            color:white;font-size:0.72em;padding:2px 8px;border-radius:12px;font-weight:700;">
                            ▶ Lista de reproducción
                        </span>
                    </div>
                </div>
                <div style="position:absolute;bottom:0;left:0;right:0;padding:5px 8px;
                    background:linear-gradient(transparent,rgba(0,0,0,0.8));
                    font-size:0.68em;color:rgba(255,255,255,0.75);
                    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    ${esc(link_url)}
                </div>
            </div>`;
        }

        if (videoId) {
            const thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
            const embed = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
            return `<div style="position:relative;width:min(320px,100%);cursor:pointer;border-radius:10px;
                       overflow:hidden;margin-top:6px;box-shadow:0 3px 16px rgba(0,0,0,0.4);background:#111;"
                onclick="window._opAbrirYTModal('${esc(embed)}','${esc(link_url)}')">
                <img src="${esc(thumb)}" alt="YouTube"
                    style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;">
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
                    background:rgba(0,0,0,0.2);transition:background 0.15s;"
                    onmouseover="this.style.background='rgba(0,0,0,0.05)'"
                    onmouseout="this.style.background='rgba(0,0,0,0.2)'">
                    <div style="width:52px;height:36px;background:#ff0000;border-radius:8px;
                        display:flex;align-items:center;justify-content:center;
                        box-shadow:0 2px 8px rgba(0,0,0,0.5);">
                        <div style="border-left:18px solid white;border-top:10px solid transparent;
                            border-bottom:10px solid transparent;margin-left:4px;"></div>
                    </div>
                </div>
                <div style="position:absolute;bottom:0;left:0;right:0;padding:5px 8px;
                    background:linear-gradient(transparent,rgba(0,0,0,0.75));
                    font-size:0.68em;color:rgba(255,255,255,0.8);
                    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    ${esc(link_url)}
                </div>
            </div>`;
        }
        return _renderLinkGenerico(link_url);
    }

    if (esTikTok(link_url)) {
        // TikTok oEmbed thumbnail: usar su API pública (no requiere auth)
        // El embed oficial requiere js SDK; usamos mini-player arrastrable igual que YT
        const embedUrl = `https://www.tiktok.com/embed/v2/${_tiktokVideoId(link_url)}`;
        return `<div style="position:relative;width:min(200px,100%);cursor:pointer;border-radius:12px;
                   overflow:hidden;margin-top:6px;box-shadow:0 3px 16px rgba(0,0,0,0.4);
                   background:#010101;"
            onclick="window._opAbrirTikTokModal('${esc(embedUrl)}','${esc(link_url)}')">
            <div style="width:100%;aspect-ratio:9/16;max-height:300px;
                background:linear-gradient(135deg,#010101,#161823);
                display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;">
                <span style="font-size:2.5em;">♪</span>
                <div style="width:42px;height:42px;background:#fe2c55;border-radius:50%;
                    display:flex;align-items:center;justify-content:center;
                    box-shadow:0 2px 8px rgba(254,44,85,0.5);">
                    <div style="border-left:14px solid white;border-top:8px solid transparent;
                        border-bottom:8px solid transparent;margin-left:3px;"></div>
                </div>
                <span style="color:rgba(255,255,255,0.6);font-size:0.72em;">TikTok</span>
            </div>
            <div style="position:absolute;bottom:0;left:0;right:0;padding:5px 8px;
                background:linear-gradient(transparent,rgba(0,0,0,0.85));
                font-size:0.62em;color:rgba(255,255,255,0.7);
                overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${esc(link_url)}
            </div>
        </div>`;
    }

    if (esSoundCloud(link_url)) {
        const embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(link_url)}&color=%236c3483&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false`;
        return `<div style="width:min(320px,100%);margin-top:6px;border-radius:10px;overflow:hidden;">
            <iframe scrolling="no" frameborder="no" allow="autoplay"
                src="${esc(embedUrl)}"
                style="width:100%;height:66px;border-radius:10px;display:block;"></iframe>
        </div>`;
    }

    return _renderLinkGenerico(link_url);
}

function _tiktokVideoId(url) {
    // Extrae el ID numérico del video de TikTok desde URLs como:
    // https://www.tiktok.com/@user/video/1234567890
    const m = url.match(/video\/([0-9]+)/);
    return m ? m[1] : '';
}

function _renderLinkGenerico(url) {
    const u = esc(url);
    let dominio = '';
    try { dominio = new URL(url).hostname.replace('www.',''); } catch(_) { dominio = url; }
    return `<a href="${u}" target="_blank" rel="noopener noreferrer"
        style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;
               background:rgba(26,74,128,0.12);border:1.5px solid rgba(26,74,128,0.3);
               border-radius:8px;color:#5dade2;font-size:0.82em;text-decoration:none;
               max-width:320px;margin-top:4px;word-break:break-all;transition:background 0.15s;"
        onmouseover="this.style.background='rgba(26,74,128,0.22)'"
        onmouseout="this.style.background='rgba(26,74,128,0.12)'">
        🔗 <span>${esc(dominio)}</span>
    </a>`;
}


// ── Render contenido con detección automática de links ───────────────────────
// Maneja 3 casos:
//   A) msg tiene link_url  → solo texto (embed ya se renderizó arriba)
//   B) msg tiene video/audio_path → suprimir la URL del texto para no duplicar
//   C) msg solo tiene contenido  → detectar link, renderizar embed + texto sin URL
function _renderContenidoConLinks(msg) {
    const texto = msg.contenido;
    if (!texto) return '';

    const URL_RE = /https?:\/\/[^\s<>"']+/gi;

    // Si hay video o audio adjunto, suprimir URLs del texto (ya tienen su reproductor)
    if (msg.video_path || msg.audio_path) {
        const textoLimpio = texto.replace(URL_RE, '').trim();
        return textoLimpio
            ? `<div class="op-msg-texto">${renderMsgMarkup(textoLimpio)}</div>`
            : '';
    }

    // Detectar todos los links en el texto (hasta 10)
    const links = [...texto.matchAll(URL_RE)].map(m => m[0]).slice(0, 10);
    if (!links.length) {
        return `<div class="op-msg-texto">${renderMsgMarkup(texto)}</div>`;
    }

    // Si hay link_url guardado, asegurarse que esté en la lista
    if (msg.link_url && !links.includes(msg.link_url)) {
        links.unshift(msg.link_url);
    }

    // Quitar todas las URLs del texto para mostrarlo limpio
    let textoLimpio = texto;
    for (const link of links) {
        const esc = link.replace(/[.*+?^${}()|[\]\]/g, '\$&');
        textoLimpio = textoLimpio.replace(new RegExp(esc, 'g'), '');
    }
    textoLimpio = textoLimpio.trim();

    // Renderizar: embeds primero, luego texto
    const embedsHtml = links.map(l => _renderLink(l)).join('');
    return `
        <div style="display:flex;flex-direction:column;gap:6px;">
            ${embedsHtml}
            ${textoLimpio ? `<div class="op-msg-texto">${renderMsgMarkup(textoLimpio)}</div>` : ''}
        </div>
    `;
}

export function renderConvList() {
    const wrap = $('op-conv-list');
    if (!wrap) return;
    // Sort: pinned first, then by ultimo_msg
    const convs = [...opState.conversaciones].sort((a, b) => {
        const aMeta = _convMeta(a.id);
        const bMeta = _convMeta(b.id);
        if (aMeta.fijado !== bMeta.fijado) return bMeta.fijado ? 1 : -1;
        return new Date(b.ultimo_msg || 0) - new Date(a.ultimo_msg || 0);
    });
    if (!convs.length) {
        wrap.innerHTML = `<div style="padding:20px;color:var(--gray-500,#adb5bd);font-size:0.82em;text-align:center;">Sin conversaciones</div>`;
        return;
    }
    wrap.innerHTML = convs.map(c => {
        const activa = c.id === opState.convActual;
        const meta   = _convMeta(c.id);
        const color  = meta.color || '#c0392b';
        const fijado = meta.fijado;
        return `
<div class="op-conv-item ${activa?'activa':''}" data-id="${c.id}"
    style="${activa ? `border-left:3px solid ${color};background:${color}18;` : ''}"
    onclick="window._opSelConv(${c.id})">
    <div class="op-conv-title" style="${activa?`color:${color};`:''}">
        ${fijado ? '📌 ' : ''}${esc(c.titulo)}
    </div>
    <div class="op-conv-actions">
        <button class="op-icon-btn" title="Opciones" onclick="event.stopPropagation();window._opMenuConv(event,${c.id})">⚙</button>
    </div>
</div>`;
    }).join('');
}

// ── Helpers de metadatos de conversación (color, fijado) ──────
function _convMeta(id) {
    try { return JSON.parse(localStorage.getItem(`op_conv_meta_${id}`) || '{}'); } catch { return {}; }
}
function _setConvMeta(id, patch) {
    const prev = _convMeta(id);
    localStorage.setItem(`op_conv_meta_${id}`, JSON.stringify({ ...prev, ...patch }));
}

// ── Panel de mensajes ─────────────────────────────────────────
export function renderMensajes() {
    const wrap = $('op-messages-list');
    if (!wrap) return;
    const msgs = opState.mensajes;

    if (!msgs.length) {
        wrap.innerHTML = `<div style="display:flex;flex:1;align-items:center;justify-content:center;
            color:var(--gray-500,#adb5bd);font-size:0.9em;">Sin mensajes aún</div>`;
        return;
    }

    const esPropio = id => id === opState.perfil?.id;
    let html = '';
    let ultimaFecha = '';
    let ultimoAutorId = null;
    let ultimaHora = null;
    const GROUP_GAP_MS = 5 * 60 * 1000; // 5 min

    msgs.forEach((msg, idx) => {
        const fecha = new Date(msg.creado_en);
        const fechaStr = fecha.toLocaleDateString('es', { day:'numeric', month:'short' });
        if (fechaStr !== ultimaFecha) {
            ultimaFecha = fechaStr;
            ultimoAutorId = null;
            html += `<div class="op-date-sep">${fechaStr}</div>`;
        }

        const propio  = esPropio(msg.autor_id);
        const hora    = fecha.toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' });
        const msPrev  = ultimaHora ? fecha - ultimaHora : Infinity;
        const mismoGrupo = msg.autor_id === ultimoAutorId && msPrev < GROUP_GAP_MS;
        const perfil  = opState.perfiles?.[msg.autor_id];
        const avSrc   = perfil?.avatar_path ? `${STORAGE_URL}/${perfil.avatar_path}` : '';

        ultimoAutorId = msg.autor_id;
        ultimaHora    = fecha;

        const avatarHtml = mismoGrupo
            ? `<div style="width:36px;flex-shrink:0;"></div>`
            : `<img src="${esc(avSrc)}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;
                flex-shrink:0;align-self:flex-start;margin-top:2px;border:2px solid rgba(192,57,43,0.2);background:#f8f9fa;"
                onerror="this.style.visibility='hidden'">`;

        html += `
<div class="op-msg ${propio?'propio':'ajeno'}" data-id="${msg.id}">
    ${!propio ? avatarHtml : ''}
    <div class="op-msg-bubble">
        ${!mismoGrupo ? `<div class="op-msg-autor" style="${propio?'text-align:right;':''}">${esc(msg.autor_nombre)}</div>` : ''}
        ${msg.imagen_path ? _renderImgGrid(msg.imagen_path, msg.id) : ''}
        ${msg.video_path  ? _renderVideo(msg.video_path)  : ''}
        ${msg.audio_path  ? _renderAudio(msg.audio_path)  : ''}
        ${msg.link_url    ? _renderLink(msg.link_url)     : ''}
        ${_renderContenidoConLinks(msg)}
        <div class="op-msg-meta">
            <span class="op-msg-hora">${hora}${msg.editado_en ? ' <span style="opacity:0.55;font-style:italic;font-size:0.85em;">(editado)</span>' : ''}</span>
            ${msg.contenido ? `<button class="op-msg-del" onclick="window._opEditarMsg(${msg.id})" title="Editar">✏</button>` : ''}
            <button class="op-msg-del" onclick="window._opEliminarMsg(${msg.id})" title="Eliminar">✕</button>
        </div>
    </div>
    ${propio ? avatarHtml : ''}
</div>`;
    });

    wrap.innerHTML = html;
    requestAnimationFrame(() => { wrap.scrollTop = wrap.scrollHeight; });
}

export function appendMensaje(msg) {
    const wrap = $('op-messages-list');
    if (!wrap) return;
    const propio = msg.autor_id === opState.perfil?.id;
    const hora   = new Date(msg.creado_en).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' });

    // Check if previous message is from same author within 5 min
    const prev = wrap.querySelector('.op-msg:last-child');
    const prevId = prev?.dataset?.id;
    const prevMsg = opState.mensajes.find(m => String(m.id) === String(prevId));
    const GROUP_GAP_MS = 5 * 60 * 1000;
    const mismoGrupo = prevMsg
        && prevMsg.autor_id === msg.autor_id
        && (new Date(msg.creado_en) - new Date(prevMsg.creado_en)) < GROUP_GAP_MS;

    const perfil = opState.perfiles?.[msg.autor_id];
    const avSrc  = perfil?.avatar_path ? `${STORAGE_URL}/${perfil.avatar_path}` : '';

    const avatarHtml = mismoGrupo
        ? `<div style="width:36px;flex-shrink:0;"></div>`
        : `<img src="${esc(avSrc)}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;
            flex-shrink:0;align-self:flex-start;margin-top:2px;border:2px solid rgba(192,57,43,0.2);background:#f8f9fa;"
            onerror="this.style.visibility='hidden'">`;

    const div = document.createElement('div');
    div.className = `op-msg ${propio?'propio':'ajeno'}`;
    div.dataset.id = msg.id;
    div.innerHTML = `
${!propio ? avatarHtml : ''}
<div class="op-msg-bubble">
    ${!mismoGrupo ? `<div class="op-msg-autor" style="${propio?'text-align:right;':''}">${esc(msg.autor_nombre)}</div>` : ''}
    ${msg.imagen_path ? _renderImgGrid(msg.imagen_path, msg.id) : ''}
    ${msg.video_path  ? _renderVideo(msg.video_path)  : ''}
    ${msg.audio_path  ? _renderAudio(msg.audio_path)  : ''}
    ${msg.link_url    ? _renderLink(msg.link_url)     : ''}
    ${_renderContenidoConLinks(msg)}
    <div class="op-msg-meta">
        <span class="op-msg-hora">${hora}${msg.editado_en ? ' <span style="opacity:0.55;font-style:italic;font-size:0.85em;">(editado)</span>' : ''}</span>
        ${msg.contenido ? `<button class="op-msg-del" onclick="window._opEditarMsg(${msg.id})" title="Editar">✏</button>` : ''}
        <button class="op-msg-del" onclick="window._opEliminarMsg(${msg.id})" title="Eliminar">✕</button>
    </div>
</div>
${propio ? avatarHtml : ''}`;
    wrap.appendChild(div);
    wrap.scrollTop = wrap.scrollHeight;
}

// ── Galería ───────────────────────────────────────────────────
export function renderGaleria() {
    const wrap = $('op-galeria-grid');
    if (!wrap) return;
    const allItems = Object.values(opState.imagenesGaleria).flat();

    if (!allItems.length) {
        wrap.innerHTML = `<div style="color:rgba(255,255,255,0.3);font-size:0.85em;grid-column:1/-1;text-align:center;padding:30px;">
            Sin imágenes ni videos guardados</div>`;
        return;
    }

    const imgs = allItems.filter(i => i.tipo !== 'video');
    const vids = allItems.filter(i => i.tipo === 'video');

    // Agrupar imágenes por op_nombre
    const gruposImg = {};
    imgs.forEach(img => {
        if (!gruposImg[img.op_nombre]) gruposImg[img.op_nombre] = [];
        gruposImg[img.op_nombre].push(img);
    });
    const gruposVid = {};
    vids.forEach(v => {
        if (!gruposVid[v.op_nombre]) gruposVid[v.op_nombre] = [];
        gruposVid[v.op_nombre].push(v);
    });

    const renderItem = (item, esVideo) => esVideo ? `
        <div class="op-galeria-item" title="${esc(item.nombre)}">
            <div style="position:relative;background:#000;border-radius:6px;overflow:hidden;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;">
                <video src="${esc(item.url)}" preload="metadata"
                    style="width:100%;height:100%;object-fit:cover;display:block;" muted></video>
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
                    background:rgba(0,0,0,0.3);pointer-events:none;">
                    <span style="font-size:2em;">▶</span>
                </div>
            </div>
            <div class="op-galeria-item-name">${esc(item.nombre)}</div>
            <div class="op-galeria-item-actions">
                <button onclick="window._opEnviarDesdeGaleria(${item.id})" title="Enviar al chat">💬</button>
                <button onclick="window._opEliminarImgGaleria(${item.id},'${esc(item.path)}')" title="Eliminar">🗑</button>
            </div>
        </div>` : `
        <div class="op-galeria-item" title="${esc(item.nombre)}">
            <img src="${esc(item.url)}" alt="${esc(item.nombre)}" onclick="window._opVerImagen('${esc(item.url)}')">
            <div class="op-galeria-item-name">${esc(item.nombre)}</div>
            <div class="op-galeria-item-actions">
                <button onclick="window._opEnviarDesdeGaleria(${item.id})" title="Enviar al chat">💬</button>
                <button onclick="window._opEliminarImgGaleria(${item.id},'${esc(item.path)}')" title="Eliminar">🗑</button>
            </div>
        </div>`;

    let html = '';

    if (Object.keys(gruposImg).length) {
        html += `<div style="grid-column:1/-1;font-size:0.8em;font-weight:700;color:rgba(255,255,255,0.4);
            text-transform:uppercase;letter-spacing:1px;padding:4px 0 8px;">🖼 Imágenes</div>`;
        html += Object.entries(gruposImg).map(([opNombre, items]) => `
<div class="op-galeria-grupo">
    <div class="op-galeria-titulo">📁 ${esc(opNombre)}</div>
    <div class="op-galeria-items">${items.map(i => renderItem(i, false)).join('')}</div>
</div>`).join('');
    }

    if (Object.keys(gruposVid).length) {
        html += `<div style="grid-column:1/-1;font-size:0.8em;font-weight:700;color:rgba(255,255,255,0.4);
            text-transform:uppercase;letter-spacing:1px;padding:12px 0 8px;">🎬 Videos</div>`;
        html += Object.entries(gruposVid).map(([opNombre, items]) => `
<div class="op-galeria-grupo">
    <div class="op-galeria-titulo">📁 ${esc(opNombre)}</div>
    <div class="op-galeria-items">${items.map(i => renderItem(i, true)).join('')}</div>
</div>`).join('');
    }

    wrap.innerHTML = html;
}

// ── Ajustes ───────────────────────────────────────────────────
export function renderAjustes() {
    const wrap = $('op-ajustes-content');
    if (!wrap) return;
    const p = opState.perfil;

    // Catálogo de perfiles
    const todosPerfiles = Object.values(opState.perfiles || {});

    wrap.innerHTML = `
<div class="op-ajustes-card" style="margin-bottom:20px;">
    <h3 class="op-ajustes-title">👤 Perfil activo</h3>
    <div style="display:flex;align-items:center;gap:14px;padding:10px 0;">
        <img src="${avatarUrl(p?.avatar_path)}"
            style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:3px solid #6c3483;flex-shrink:0;">
        <div>
            <div style="font-weight:700;font-size:1.05em;color:#6c3483;">${esc(p?.nombre||'Sin nombre')}</div>
            <div style="font-size:0.72em;color:rgba(255,255,255,0.4);margin-top:2px;">Sesión activa</div>
        </div>
    </div>
</div>

<div class="op-ajustes-card" style="margin-bottom:20px;">
    <h3 class="op-ajustes-title">⚙ Editar perfil actual</h3>

    <div class="op-field-group">
        <label class="op-label">Nombre visible en el chat</label>
        <input id="op-nombre-input" type="text" class="op-input" value="${esc(p?.nombre||'')}" placeholder="Tu nombre de OP…" maxlength="32">
    </div>

    <div class="op-field-group">
        <label class="op-label">Avatar</label>
        <div style="display:flex;align-items:center;gap:16px;margin-top:8px;">
            <img id="op-avatar-preview" src="${avatarUrl(p?.avatar_path)}"
                style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid #6c3483;">
            <div>
                <input type="file" id="op-avatar-file" accept="image/*" style="display:none"
                    onchange="window._opPreviewAvatar(this)">
                <button class="op-btn op-btn-outline" onclick="document.getElementById('op-avatar-file').click()">
                    📷 Cambiar avatar
                </button>
                <div style="font-size:0.72em;color:rgba(255,255,255,0.4);margin-top:4px;">PNG/JPG · máx 2MB</div>
            </div>
        </div>
    </div>

    <button class="op-btn op-btn-primary" onclick="window._opGuardarPerfil()" style="margin-top:8px;">
        💾 Guardar cambios
    </button>
    <div id="op-ajustes-msg" style="margin-top:8px;font-size:0.82em;"></div>
</div>

<div class="op-ajustes-card">
    <h3 class="op-ajustes-title">📋 Catálogo de perfiles OP</h3>
    <div id="op-perfiles-catalogo" style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">
        ${todosPerfiles.length ? todosPerfiles.map(prof => {
            const esActivo = prof.id === p?.id;
            return `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;
            background:${esActivo ? 'rgba(108,52,131,0.15)' : 'rgba(255,255,255,0.04)'};
            border-radius:10px;border:1.5px solid ${esActivo ? '#6c3483' : 'rgba(255,255,255,0.08)'};">
            <img src="${avatarUrl(prof.avatar_path)}"
                style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;
                border:2px solid ${esActivo ? '#6c3483' : 'rgba(255,255,255,0.15)'};">
            <div style="flex:1;min-width:0;">
                <div style="font-weight:700;font-size:0.88em;color:${esActivo ? '#c39bd3' : 'rgba(255,255,255,0.8)'};
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${esc(prof.nombre)}${esActivo ? ' <span style="font-size:0.75em;color:#6c3483;">(tú)</span>' : ''}
                </div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
                <button onclick="window._opRenombrarPerfil('${prof.id}','${esc(prof.nombre)}')"
                    style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);
                    color:rgba(255,255,255,0.6);border-radius:6px;padding:4px 9px;cursor:pointer;font-size:0.75em;"
                    title="Editar nombre">✏ Nombre</button>
                ${!esActivo ? `
                <button onclick="window._opSeleccionarPerfil('${prof.id}')"
                    style="background:rgba(108,52,131,0.2);border:1px solid #6c3483;
                    color:#c39bd3;border-radius:6px;padding:4px 9px;cursor:pointer;font-size:0.75em;"
                    title="Usar este perfil">▶ Usar</button>
                <button onclick="window._opEliminarPerfil('${prof.id}','${esc(prof.nombre)}')"
                    style="background:rgba(192,57,43,0.1);border:1px solid rgba(192,57,43,0.3);
                    color:#e74c3c;border-radius:6px;padding:4px 9px;cursor:pointer;font-size:0.75em;"
                    title="Eliminar perfil">🗑</button>` : ''}
            </div>
        </div>`;
        }).join('') : `<div style="color:rgba(255,255,255,0.3);font-size:0.82em;text-align:center;padding:16px;">Sin perfiles cargados</div>`}
    </div>
</div>`;
}

// ── Selector de imágenes (galería → chat) ─────────────────────
export function renderSelectorImagenes() {
    const allImgs = Object.values(opState.imagenesGaleria).flat();
    return `
<div id="op-img-selector" style="display:none;position:absolute;bottom:100%;left:0;right:0;
    background:#1a1a2e;border:2px solid #6c3483;border-radius:12px 12px 0 0;
    max-height:260px;overflow-y:auto;padding:12px;z-index:100;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="color:#e2d9f3;font-weight:700;font-size:0.85em;">Galería</span>
        <button onclick="document.getElementById('op-img-selector').style.display='none'"
            style="background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;font-size:1.1em;">✕</button>
    </div>
    ${!allImgs.length ? '<div style="color:rgba(255,255,255,0.3);font-size:0.82em;text-align:center;padding:16px;">Sin imágenes en galería</div>' :
    `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;">
        ${allImgs.map(img => `
        <div onclick="window._opSeleccionarImg(${img.id})"
            style="cursor:pointer;border-radius:8px;overflow:hidden;border:2px solid transparent;
                transition:0.15s;" onmouseover="this.style.borderColor='#6c3483'"
            onmouseout="this.style.borderColor='transparent'" title="${esc(img.nombre)}">
            <img src="${esc(img.url)}" style="width:100%;aspect-ratio:1;object-fit:cover;display:block;">
            <div style="font-size:0.6em;color:rgba(255,255,255,0.6);padding:2px 4px;
                overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#0d1117;">
                ${esc(img.nombre)}
            </div>
        </div>`).join('')}
    </div>`}
</div>`;
}

// ── Lightbox con navegación (para grids multi-imagen) ────────
export function showLightboxCarousel(urls, startIdx = 0) {
    let current = startIdx;
    let lb = document.getElementById('op-lightbox');
    if (!lb) {
        lb = document.createElement('div');
        lb.id = 'op-lightbox';
        lb.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:99999;
            display:flex;align-items:center;justify-content:center;
            backdrop-filter:blur(4px);`;
        document.body.appendChild(lb);
    }

    function render() {
        const hasPrev = current > 0;
        const hasNext = current < urls.length - 1;
        lb.innerHTML = `
            <button onclick="document.getElementById('op-lightbox').remove()"
                style="position:absolute;top:16px;right:20px;background:none;border:none;
                color:white;font-size:1.8em;cursor:pointer;z-index:2;opacity:0.7;">✕</button>
            ${hasPrev ? `<button id="op-lb-prev"
                style="position:absolute;left:16px;background:rgba(255,255,255,0.1);border:none;
                color:white;font-size:2em;cursor:pointer;border-radius:50%;width:48px;height:48px;
                display:flex;align-items:center;justify-content:center;z-index:2;">‹</button>` : ''}
            <img src="${esc(urls[current])}" style="max-width:90vw;max-height:88vh;
                border-radius:8px;box-shadow:0 0 60px rgba(108,52,131,0.5);object-fit:contain;">
            ${hasNext ? `<button id="op-lb-next"
                style="position:absolute;right:16px;background:rgba(255,255,255,0.1);border:none;
                color:white;font-size:2em;cursor:pointer;border-radius:50%;width:48px;height:48px;
                display:flex;align-items:center;justify-content:center;z-index:2;">›</button>` : ''}
            <div style="position:absolute;bottom:16px;color:rgba(255,255,255,0.5);font-size:0.82em;">
                ${current + 1} / ${urls.length}
            </div>`;
        lb.querySelector('#op-lb-prev')?.addEventListener('click', e => { e.stopPropagation(); current--; render(); });
        lb.querySelector('#op-lb-next')?.addEventListener('click', e => { e.stopPropagation(); current++; render(); });
    }

    lb.onclick = e => { if (e.target === lb) lb.remove(); };
    render();
}

// Exponer globalmente para los onclick del grid
window._opVerGaleriaMensaje = (msgId, idx) => {
    const gridEl = document.querySelector(`.op-msg[data-id="${msgId}"] [data-all-urls]`);
    if (!gridEl) return;
    try {
        const urls = JSON.parse(gridEl.dataset.allUrls);
        showLightboxCarousel(urls, idx);
    } catch(_) {}
};

// ── Lightbox simple (imagen única) ───────────────────────────
export function showLightbox(url) {
    showLightboxCarousel([url], 0);
}

// ── YouTube: abre en Picture-in-Picture directamente ─────────
// Crea un <video> oculto cargando el embed de YT, espera que reproduzca,
// y solicita PiP. Como YT iframes no exponen el <video> interno al padre,
// usamos un iframe visible mínimo + requestPictureInPicture en el propio iframe.
// La forma más confiable: abrir el iframe en un mini-player flotante arrastrable
// que el usuario puede minimizar o mover mientras escribe.
window._opAbrirYTModal = (embedUrl, linkUrl) => {
    // Si ya hay un mini-player para este video, traerlo al frente
    const existing = document.getElementById('op-yt-pip');
    if (existing) { existing.style.display = 'flex'; return; }

    const pip = document.createElement('div');
    pip.id = 'op-yt-pip';
    pip.style.cssText = `position:fixed;bottom:80px;right:20px;
        width:min(420px,90vw);z-index:99990;
        border-radius:14px;overflow:hidden;
        box-shadow:0 8px 40px rgba(0,0,0,0.7);
        display:flex;flex-direction:column;
        background:#0d0d0d;border:1.5px solid rgba(192,57,43,0.4);
        resize:both;`;

    // Barra de título arrastrable
    const bar = document.createElement('div');
    bar.style.cssText = `display:flex;align-items:center;justify-content:space-between;
        padding:6px 10px;background:rgba(192,57,43,0.2);cursor:move;user-select:none;
        border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;`;
    bar.innerHTML = `<span style="font-size:0.72em;color:rgba(255,255,255,0.6);overflow:hidden;
        text-overflow:ellipsis;white-space:nowrap;flex:1;">▶ YouTube</span>
        <div style="display:flex;gap:6px;">
            <button id="op-yt-pip-min" title="Minimizar"
                style="background:rgba(255,255,255,0.1);border:none;color:rgba(255,255,255,0.7);
                border-radius:4px;width:22px;height:22px;cursor:pointer;font-size:0.8em;">─</button>
            <button id="op-yt-pip-close" title="Cerrar"
                style="background:rgba(192,57,43,0.5);border:none;color:white;
                border-radius:4px;width:22px;height:22px;cursor:pointer;font-size:0.8em;">✕</button>
        </div>`;

    const iframe = document.createElement('iframe');
    iframe.src = embedUrl;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.style.cssText = `width:100%;aspect-ratio:16/9;border:none;display:block;`;

    pip.appendChild(bar);
    pip.appendChild(iframe);
    document.body.appendChild(pip);

    // Botones
    pip.querySelector('#op-yt-pip-close').onclick = () => pip.remove();
    let minimized = false;
    pip.querySelector('#op-yt-pip-min').onclick = () => {
        minimized = !minimized;
        iframe.style.display = minimized ? 'none' : 'block';
        pip.querySelector('#op-yt-pip-min').textContent = minimized ? '□' : '─';
    };

    // Drag
    let ox = 0, oy = 0, dragging = false;
    bar.onmousedown = e => {
        dragging = true;
        ox = e.clientX - pip.getBoundingClientRect().left;
        oy = e.clientY - pip.getBoundingClientRect().top;
        e.preventDefault();
    };
    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        pip.style.right  = 'auto';
        pip.style.bottom = 'auto';
        pip.style.left   = (e.clientX - ox) + 'px';
        pip.style.top    = (e.clientY - oy) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
};

// Alias legacy
window._opExpandirYT = (_card, embedUrl) => window._opAbrirYTModal(embedUrl, embedUrl);

// PiP nativo para videos subidos (op-chat storage)
window._opVideoPiP = async (videoId) => {
    const vid = document.getElementById(videoId);
    if (!vid) return;
    try {
        await vid.play();
        await vid.requestPictureInPicture();
    } catch(e) {
        // Fallback: si PiP no está soportado, solo reproducir
        vid.play();
    }
};

// ── Mini-player TikTok (arrastrable, igual que YT) ───────────
window._opAbrirTikTokModal = (embedUrl, linkUrl) => {
    const existing = document.getElementById('op-tt-pip');
    if (existing) { existing.style.display = 'flex'; return; }

    const pip = document.createElement('div');
    pip.id = 'op-tt-pip';
    pip.style.cssText = `position:fixed;bottom:80px;right:20px;
        width:min(340px,90vw);z-index:99990;border-radius:14px;overflow:hidden;
        box-shadow:0 8px 40px rgba(0,0,0,0.7);display:flex;flex-direction:column;
        background:#010101;border:1.5px solid rgba(254,44,85,0.4);resize:both;`;

    const bar = document.createElement('div');
    bar.style.cssText = `display:flex;align-items:center;justify-content:space-between;
        padding:6px 10px;background:rgba(254,44,85,0.2);cursor:move;user-select:none;
        border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;`;
    bar.innerHTML = `<span style="font-size:0.72em;color:rgba(255,255,255,0.6);">♪ TikTok</span>
        <div style="display:flex;gap:6px;">
            <button id="op-tt-pip-min" style="background:rgba(255,255,255,0.1);border:none;
                color:rgba(255,255,255,0.7);border-radius:4px;width:22px;height:22px;cursor:pointer;font-size:0.8em;">─</button>
            <button id="op-tt-pip-close" style="background:rgba(254,44,85,0.5);border:none;
                color:white;border-radius:4px;width:22px;height:22px;cursor:pointer;font-size:0.8em;">✕</button>
        </div>`;

    // TikTok embed oficial (iframe)
    const iframe = document.createElement('iframe');
    iframe.src = embedUrl;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    // TikTok embed tiene aspecto 9:16 pero con controles ocupa más alto
    iframe.style.cssText = `width:100%;height:700px;max-height:80vh;border:none;display:block;`;

    pip.appendChild(bar);
    pip.appendChild(iframe);
    document.body.appendChild(pip);

    pip.querySelector('#op-tt-pip-close').onclick = () => pip.remove();
    let minimized = false;
    pip.querySelector('#op-tt-pip-min').onclick = () => {
        minimized = !minimized;
        iframe.style.display = minimized ? 'none' : 'block';
        pip.querySelector('#op-tt-pip-min').textContent = minimized ? '□' : '─';
    };

    // Drag
    let ox = 0, oy = 0, dragging = false;
    bar.onmousedown = e => {
        dragging = true;
        ox = e.clientX - pip.getBoundingClientRect().left;
        oy = e.clientY - pip.getBoundingClientRect().top;
        e.preventDefault();
    };
    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        pip.style.right  = 'auto'; pip.style.bottom = 'auto';
        pip.style.left   = (e.clientX - ox) + 'px';
        pip.style.top    = (e.clientY - oy) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
};
