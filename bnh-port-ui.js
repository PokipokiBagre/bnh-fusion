// ============================================================
// bnh-port-ui.js — Panel flotante BNH · Render completo de media
// ============================================================
import { portState, guardarPos, cargarPos } from './bnh-port-state.js';

const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const $ = id => document.getElementById(id);

const ID_PANEL  = 'bnh-port-panel';
const ID_BUBBLE = 'bnh-port-bubble';

// ─────────────────────────────────────────────────────────────
// RENDER DE MEDIA  (portado 1:1 desde op-ui.js)
// ─────────────────────────────────────────────────────────────

function _imageUrl(path) {
    if (!path) return '';
    return `${window._STORAGE_URL || ''}/${path}`;
}

// ── Grid de imágenes con carrusel ────────────────────────────
function _renderImgGrid(imagen_path, msgId) {
    if (!imagen_path) return '';
    let urls = [];
    try {
        const parsed = JSON.parse(imagen_path);
        urls = Array.isArray(parsed) ? parsed.map(_imageUrl) : [_imageUrl(imagen_path)];
    } catch(_) { urls = [_imageUrl(imagen_path)]; }

    if (!urls.length) return '';

    if (urls.length === 1) {
        return `<img src="${esc(urls[0])}"
            onclick="window._bnhPortVerGaleriaMensaje('${esc(String(msgId))}',0)"
            style="max-width:200px;max-height:160px;border-radius:8px;cursor:pointer;object-fit:cover;display:block;">`;
    }

    const MAX_VISIBLE = 10;
    const showOverlay = urls.length > MAX_VISIBLE;
    const visible     = showOverlay ? urls.slice(0, MAX_VISIBLE) : urls;
    const ocultas     = urls.length - 9;
    const cols        = visible.length <= 2 ? visible.length : visible.length <= 6 ? 3 : 4;
    const allUrlsJson = JSON.stringify(urls).replace(/'/g, '&#39;');

    const items = visible.map((url, i) => {
        const isOverlay = showOverlay && i === MAX_VISIBLE - 1;
        return `<div style="position:relative;aspect-ratio:1;overflow:hidden;cursor:pointer;"
            onclick="window._bnhPortVerGaleriaMensaje('${esc(String(msgId))}',${i})">
            <img src="${esc(url)}" style="width:100%;height:100%;object-fit:cover;">
            ${isOverlay ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.55);
                display:flex;align-items:center;justify-content:center;
                color:white;font-size:1.3em;font-weight:700;">+${ocultas}</div>` : ''}
        </div>`;
    }).join('');

    return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:2px;border-radius:8px;overflow:hidden;max-width:240px;"
        data-port-urls='${allUrlsJson}'>${items}</div>`;
}

// ── Video inline con PiP ─────────────────────────────────────
function _renderVideo(video_path) {
    if (!video_path) return '';
    const url    = _imageUrl(video_path);
    const nombre = video_path.split('/').pop().replace(/_\d{13}(\.\w+)$/, '$1') || 'video';
    const vid    = `bpv_${Math.random().toString(36).slice(2,8)}`;

    return `<div style="display:flex;flex-direction:column;
        background:linear-gradient(135deg,rgba(192,57,43,0.12),rgba(108,52,131,0.08));
        border:1.5px solid rgba(192,57,43,0.22);border-radius:10px;
        width:min(260px,100%);margin-top:4px;overflow:hidden;box-sizing:border-box;">
        <div style="display:flex;align-items:center;gap:6px;padding:5px 8px 3px;background:rgba(0,0,0,0.1);">
            <span style="font-size:0.9em;flex-shrink:0;">🎬</span>
            <span style="font-size:0.68em;color:rgba(255,255,255,0.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;" title="${esc(nombre)}">${esc(nombre)}</span>
            <button onclick="window._bnhPortVideoPiP('${vid}')" title="Picture in Picture"
                style="background:rgba(192,57,43,0.25);border:1px solid rgba(192,57,43,0.4);
                color:rgba(255,255,255,0.75);border-radius:4px;padding:1px 5px;
                cursor:pointer;font-size:0.62em;flex-shrink:0;line-height:1.4;">⧉ PiP</button>
        </div>
        <video id="${vid}" src="${esc(url)}" controls preload="metadata" playsinline
            style="width:100%;display:block;background:#000;max-height:180px;object-fit:contain;"></video>
    </div>`;
}

// ── Audio player ─────────────────────────────────────────────
function _renderAudio(audio_path) {
    if (!audio_path) return '';
    const url    = _imageUrl(audio_path);
    const nombre = audio_path.split('/').pop().replace(/_\d{13}(\.\w+)$/, '$1') || 'audio';

    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;
        background:linear-gradient(135deg,rgba(26,74,128,0.15),rgba(108,52,131,0.1));
        border:1.5px solid rgba(26,74,128,0.25);border-radius:10px;
        width:min(260px,100%);margin-top:4px;box-sizing:border-box;">
        <span style="font-size:1.2em;flex-shrink:0;">🎵</span>
        <div style="flex:1;min-width:0;">
            <div style="font-size:0.66em;color:rgba(255,255,255,0.45);margin-bottom:3px;
                overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(nombre)}">${esc(nombre)}</div>
            <audio controls preload="metadata" style="width:100%;height:26px;accent-color:#6c3483;">
                <source src="${esc(url)}">
            </audio>
        </div>
    </div>`;
}

// ── Detectores de tipo de link ────────────────────────────────
function _esYouTube(url) {
    return /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/playlist)/i.test(url);
}
function _esTikTok(url)      { return /tiktok\.com\//i.test(url); }
function _esSoundCloud(url)  { return /soundcloud\.com\//i.test(url); }

function _youTubeInfo(url) {
    const pl = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    const v  = url.match(/(?:[?&]v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
    return {
        tipo:       pl && !v ? 'playlist' : v ? 'video' : 'unknown',
        videoId:    v  ? v[1]  : null,
        playlistId: pl ? pl[1] : null,
    };
}
function _tiktokVideoId(url) {
    const m = url.match(/video\/([0-9]+)/);
    return m ? m[1] : '';
}

// ── Link genérico ─────────────────────────────────────────────
function _renderLinkGenerico(url) {
    const u = esc(url);
    let dominio = '';
    try { dominio = new URL(url).hostname.replace('www.',''); } catch(_) { dominio = url; }
    return `<a href="${u}" target="_blank" rel="noopener noreferrer"
        style="display:inline-flex;align-items:center;gap:5px;padding:4px 9px;
        background:rgba(26,74,128,0.12);border:1.5px solid rgba(26,74,128,0.3);
        border-radius:7px;color:#5dade2;font-size:0.76em;text-decoration:none;
        max-width:240px;margin-top:3px;word-break:break-all;">
        🔗 <span>${esc(dominio)}</span>
    </a>`;
}

// ── Render de un link (YouTube / TikTok / SoundCloud / genérico) ─
function _renderLink(link_url) {
    if (!link_url) return '';

    // ── YouTube ──────────────────────────────────────────────
    if (_esYouTube(link_url)) {
        const { tipo, videoId, playlistId } = _youTubeInfo(link_url);

        if (tipo === 'playlist') {
            const embedUrl = `https://www.youtube.com/embed/videoseries?list=${playlistId}&autoplay=1`;
            const cardId   = `yt-pl-${playlistId.slice(-8)}-${Math.random().toString(36).slice(2,6)}`;
            // Hidratar en background
            setTimeout(() => window._bnhPortHidratarPlaylist(cardId, playlistId, videoId || null), 0);

            return `<div id="${cardId}"
                style="position:relative;width:min(260px,100%);cursor:pointer;
                border-radius:9px;overflow:hidden;margin-top:5px;
                box-shadow:0 3px 14px rgba(0,0,0,0.4);background:#111;"
                onclick="window._bnhPortAbrirYTModal('${esc(embedUrl)}')">
                <div class="bp-yt-pl-thumb" style="width:100%;aspect-ratio:16/9;
                    background:linear-gradient(135deg,#1a1a2e,#16213e);
                    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;">
                    <div style="width:44px;height:30px;background:#ff0000;border-radius:6px;
                        display:flex;align-items:center;justify-content:center;">
                        <div style="border-left:15px solid white;border-top:8px solid transparent;border-bottom:8px solid transparent;margin-left:3px;"></div>
                    </div>
                    <span style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);
                        color:white;font-size:0.65em;padding:2px 8px;border-radius:10px;font-weight:700;">▶ Lista de reproducción</span>
                </div>
                <div style="padding:6px 8px;background:#0d0d0d;">
                    <div class="bp-yt-pl-title" style="font-size:0.74em;color:rgba(255,255,255,0.85);
                        font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px;">Cargando…</div>
                    <div style="display:flex;align-items:center;gap:5px;">
                        <span style="background:#ff0000;border-radius:3px;padding:1px 4px;font-size:0.58em;color:white;font-weight:700;">▶ YouTube</span>
                        <span class="bp-yt-pl-count" style="font-size:0.62em;color:rgba(255,255,255,0.4);">Lista de reproducción</span>
                    </div>
                </div>
            </div>`;
        }

        if (videoId) {
            const thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
            const embed = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
            return `<div style="position:relative;width:min(260px,100%);cursor:pointer;border-radius:9px;
                       overflow:hidden;margin-top:5px;box-shadow:0 3px 14px rgba(0,0,0,0.4);background:#111;"
                onclick="window._bnhPortAbrirYTModal('${esc(embed)}')">
                <img src="${esc(thumb)}" alt="YouTube" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;">
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.2);">
                    <div style="width:44px;height:30px;background:#ff0000;border-radius:6px;
                        display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.5);">
                        <div style="border-left:15px solid white;border-top:8px solid transparent;border-bottom:8px solid transparent;margin-left:3px;"></div>
                    </div>
                </div>
                <div style="position:absolute;bottom:0;left:0;right:0;padding:4px 7px;
                    background:linear-gradient(transparent,rgba(0,0,0,0.75));
                    font-size:0.62em;color:rgba(255,255,255,0.7);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    ${esc(link_url)}
                </div>
            </div>`;
        }
        return _renderLinkGenerico(link_url);
    }

    // ── TikTok ───────────────────────────────────────────────
    if (_esTikTok(link_url)) {
        const embedUrl = `https://www.tiktok.com/embed/v2/${_tiktokVideoId(link_url)}`;
        return `<div style="position:relative;width:min(180px,100%);cursor:pointer;border-radius:10px;
                   overflow:hidden;margin-top:5px;box-shadow:0 3px 14px rgba(0,0,0,0.4);background:#010101;"
            onclick="window._bnhPortAbrirTikTokModal('${esc(embedUrl)}')">
            <div style="width:100%;aspect-ratio:9/16;max-height:240px;
                background:linear-gradient(135deg,#010101,#161823);
                display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">
                <span style="font-size:2em;">♪</span>
                <div style="width:36px;height:36px;background:#fe2c55;border-radius:50%;
                    display:flex;align-items:center;justify-content:center;">
                    <div style="border-left:12px solid white;border-top:7px solid transparent;border-bottom:7px solid transparent;margin-left:2px;"></div>
                </div>
                <span style="color:rgba(255,255,255,0.55);font-size:0.68em;">TikTok</span>
            </div>
            <div style="position:absolute;bottom:0;left:0;right:0;padding:4px 7px;
                background:linear-gradient(transparent,rgba(0,0,0,0.85));
                font-size:0.58em;color:rgba(255,255,255,0.6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${esc(link_url)}
            </div>
        </div>`;
    }

    // ── SoundCloud ───────────────────────────────────────────
    if (_esSoundCloud(link_url)) {
        const embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(link_url)}&color=%236c3483&auto_play=false&hide_related=true&show_comments=false&show_user=true&visual=false`;
        return `<div style="width:min(260px,100%);margin-top:5px;border-radius:9px;overflow:hidden;">
            <iframe scrolling="no" frameborder="no" allow="autoplay"
                src="${esc(embedUrl)}"
                style="width:100%;height:66px;border-radius:9px;display:block;"></iframe>
        </div>`;
    }

    return _renderLinkGenerico(link_url);
}

// ── Contenido con detección automática de todos los links ─────
const _URL_RE = /https?:\/\/[^\s<>"']+/gi;

function _renderMarkupBasico(texto) {
    if (!texto) return '';
    // ── Tokenizer idéntico a renderMsgMarkup de op-markup.js ──────
    // Evita que los regexes se apliquen sobre HTML ya generado.
    const STORAGE = window._STORAGE_URL || '';

    const partes = texto.split(/(@[^@\n]+?@|#[^\s#\n]+|![^!\n]+?!|\n)/g);

    return partes.map(p => {
        if (!p) return '';
        if (p === '\n') return '<br>';

        // @Personaje@ — con miniatura inline
        if (/^@[^@]+@$/.test(p)) {
            const nombre = p.slice(1, -1);
            const norm   = nombre.toLowerCase()
                .replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e')
                .replace(/[íìïî]/g,'i').replace(/[óòöô]/g,'o')
                .replace(/[úùüû]/g,'u').replace(/ñ/g,'n')
                .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
            const imgSrc = STORAGE ? `${STORAGE}/imgpersonajes/${norm}icon.png` : '';
            const imgTag = imgSrc
                ? `<img src="${esc(imgSrc)}" style="width:14px;height:14px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:2px;" onerror="this.style.display='none'">`
                : '';
            return `<strong style="color:#c39bd3;background:rgba(108,52,131,0.18);padding:0 4px 0 3px;border-radius:3px;display:inline-flex;align-items:center;gap:1px;">${imgTag}@${esc(nombre)}@</strong>`;
        }

        // #Tag
        if (/^#/.test(p)) {
            return `<span style="color:#5dade2;">#${esc(p.slice(1))}</span>`;
        }

        // !Medalla!
        if (/^![^!]+!$/.test(p)) {
            return `<span style="color:#e74c3c;font-weight:700;">⚔ ${esc(p.slice(1, -1))}</span>`;
        }

        // Texto plano
        return esc(p);
    }).join('');
}

function _renderContenidoConLinks(msg) {
    const texto = msg.contenido;
    if (!texto) return '';

    // Si tiene video/audio adjunto, suprimir URLs del texto (ya tienen reproductor)
    if (msg.video_path || msg.audio_path) {
        const limpio = texto.replace(new RegExp(_URL_RE.source,'gi'), '').trim();
        return limpio
            ? `<div style="font-size:0.82em;line-height:1.45;word-break:break-word;margin-top:2px;">${_renderMarkupBasico(limpio)}</div>`
            : '';
    }

    const links = [...texto.matchAll(new RegExp(_URL_RE.source,'gi'))].map(m => m[0]).slice(0, 10);

    if (!links.length) {
        return `<div style="font-size:0.82em;line-height:1.45;word-break:break-word;">${_renderMarkupBasico(texto)}</div>`;
    }

    // Quitar todas las URLs del texto visible
    let textoLimpio = texto;
    for (const link of links) {
        textoLimpio = textoLimpio.replace(new RegExp(link.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'), '');
    }
    textoLimpio = textoLimpio.trim();

    const embedsHtml = links.map(l => _renderLink(l)).join('');
    return `<div style="display:flex;flex-direction:column;gap:4px;">
        ${embedsHtml}
        ${textoLimpio ? `<div style="font-size:0.82em;line-height:1.45;word-break:break-word;">${_renderMarkupBasico(textoLimpio)}</div>` : ''}
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// RENDER DE UN MENSAJE INDIVIDUAL
// ─────────────────────────────────────────────────────────────
export function _htmlMensaje(msg, mismoGrupo) {
    const propio = msg.autor_id === portState.perfil?.id;
    const hora   = new Date(msg.creado_en).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' });
    const perfil = portState.perfiles?.[msg.autor_id];
    const avSrc  = perfil?.avatar_path ? _imageUrl(perfil.avatar_path) : '';

    const avatarHtml = mismoGrupo
        ? `<div style="width:26px;flex-shrink:0;"></div>`
        : `<img src="${esc(avSrc)}" style="width:26px;height:26px;border-radius:50%;object-fit:cover;
            flex-shrink:0;align-self:flex-start;margin-top:1px;
            border:1.5px solid rgba(192,57,43,0.2);background:#1a1a2e;"
            onerror="this.style.visibility='hidden'">`;

    const bubbleBg = propio
        ? 'background:rgba(108,52,131,0.22);border-color:rgba(108,52,131,0.32);'
        : 'background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.1);';

    const radius = propio
        ? 'border-radius:10px 2px 10px 10px;'
        : 'border-radius:2px 10px 10px 10px;';

    return `
<div class="bnh-port-msg" data-msg-id="${msg.id}"
    style="display:flex;gap:5px;align-items:flex-end;${propio?'flex-direction:row-reverse;':''}margin-bottom:1px;">
    ${!propio ? avatarHtml : ''}
    <div style="max-width:82%;display:flex;flex-direction:column;gap:2px;${propio?'align-items:flex-end;':''}">
        ${!mismoGrupo ? `<div style="font-size:0.64em;color:rgba(255,255,255,0.32);padding:0 3px;">${esc(msg.autor_nombre)}</div>` : ''}
        <div style="border:1px solid;${radius}padding:6px 9px;${bubbleBg}display:flex;flex-direction:column;gap:4px;">
            ${msg.imagen_path ? _renderImgGrid(msg.imagen_path, msg.id) : ''}
            ${msg.video_path  ? _renderVideo(msg.video_path)            : ''}
            ${msg.audio_path  ? _renderAudio(msg.audio_path)            : ''}
            ${_renderContenidoConLinks(msg)}
        </div>
        <div style="display:flex;align-items:center;gap:4px;${propio?'justify-content:flex-end;':''}">
            ${propio ? `
            <button onclick="window._bnhPortEditarMsg(${msg.id})"
                style="background:none;border:none;color:rgba(255,255,255,0.2);cursor:pointer;
                font-size:0.7em;padding:1px 4px;line-height:1;transition:color 0.15s;"
                onmouseover="this.style.color='rgba(108,52,131,0.8)'"
                onmouseout="this.style.color='rgba(255,255,255,0.2)'"
                title="Editar">✏</button>
            <button onclick="window._bnhPortEliminarMsg(${msg.id})"
                style="background:none;border:none;color:rgba(255,255,255,0.2);cursor:pointer;
                font-size:0.7em;padding:1px 4px;line-height:1;transition:color 0.15s;"
                onmouseover="this.style.color='rgba(192,57,43,0.8)'"
                onmouseout="this.style.color='rgba(255,255,255,0.2)'"
                title="Eliminar">✕</button>
            ` : ''}
            <span style="font-size:0.59em;color:rgba(255,255,255,0.22);">
                ${hora}${msg.editado_en ? ' <em style="opacity:0.7">(editado)</em>' : ''}
            </span>
        </div>
    </div>
    ${propio ? avatarHtml : ''}
</div>`;
}

// ─────────────────────────────────────────────────────────────
// BURBUJA
// ─────────────────────────────────────────────────────────────
export function renderBurbuja() {
    if ($(ID_BUBBLE)) return;

    // Inyectar CSS de ocultamiento móvil (una sola vez)
    if (!document.getElementById('bnh-port-mobile-css')) {
        const style = document.createElement('style');
        style.id = 'bnh-port-mobile-css';
        style.textContent = `
            @media (max-width: 768px) {
                #bnh-port-bubble,
                #bnh-port-panel { display: none !important; }
            }
        `;
        document.head.appendChild(style);
    }

    const el = document.createElement('div');
    el.id = ID_BUBBLE;
    el.title = 'Panel OP';
    el.style.cssText = `position:fixed;bottom:22px;right:22px;
        width:48px;height:48px;border-radius:50%;
        background:linear-gradient(135deg,#c0392b,#6c3483);
        box-shadow:0 4px 18px rgba(192,57,43,0.45);
        cursor:pointer;z-index:89998;
        display:flex;align-items:center;justify-content:center;
        font-size:1.35em;user-select:none;
        transition:transform 0.18s,box-shadow 0.18s;
        border:2px solid rgba(255,255,255,0.12);`;
    el.textContent = '⚔';
    el.onmouseenter = () => { el.style.transform='scale(1.1)'; el.style.boxShadow='0 6px 24px rgba(192,57,43,0.6)'; };
    el.onmouseleave = () => { el.style.transform=''; el.style.boxShadow='0 4px 18px rgba(192,57,43,0.45)'; };
    el.onclick = () => window._bnhPortToggle();
    document.body.appendChild(el);
}

// ─────────────────────────────────────────────────────────────
// PANEL PRINCIPAL
// ─────────────────────────────────────────────────────────────
export function renderPanel() {
    let panel = $(ID_PANEL);
    const esNuevo = !panel;
    if (esNuevo) {
        panel = document.createElement('div');
        panel.id = ID_PANEL;
        document.body.appendChild(panel);
        _initDrag(panel);
    }

    const pos = cargarPos();
    panel.style.cssText = `
        position:fixed;
        ${pos ? `left:${pos.x}px;top:${pos.y}px;` : 'right:80px;bottom:22px;'}
        width:min(370px,96vw);height:min(560px,88vh);
        background:#0d1117;
        border:1.5px solid rgba(192,57,43,0.4);border-radius:16px;
        box-shadow:0 12px 48px rgba(0,0,0,0.65);
        z-index:89999;display:flex;flex-direction:column;
        overflow:hidden;font-family:inherit;font-size:14px;
        color:rgba(255,255,255,0.88);
        resize:both;min-width:280px;min-height:300px;`;

    panel.innerHTML = _htmlShell();
    _bindPasteEvent(panel);
    switchTab(portState.tab);
}

function _htmlShell() {
    const p     = portState.perfil;
    const avSrc = p?.avatar_path ? _imageUrl(p.avatar_path) : '';
    return `
    <div id="bnh-port-titlebar" style="display:flex;align-items:center;gap:7px;
        padding:9px 11px 7px;background:rgba(192,57,43,0.1);
        border-bottom:1px solid rgba(255,255,255,0.06);
        cursor:move;user-select:none;flex-shrink:0;">
        <span style="font-size:0.95em;flex-shrink:0;">⚔</span>
        <span style="font-weight:700;font-size:0.78em;flex:1;color:rgba(255,255,255,0.45);letter-spacing:0.5px;">PANEL OP</span>
        ${p ? `<img src="${esc(avSrc)}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;
            border:1.5px solid rgba(192,57,43,0.35);flex-shrink:0;" onerror="this.style.display='none'">
            <span style="font-size:0.67em;color:rgba(255,255,255,0.38);max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.nombre)}</span>` : ''}
        <button onclick="window._bnhPortToggle()"
            style="background:rgba(192,57,43,0.35);border:none;color:white;
            cursor:pointer;font-size:0.72em;padding:2px 6px;border-radius:4px;line-height:1.5;flex-shrink:0;">✕</button>
    </div>
    <div id="bnh-port-tabs" style="display:flex;border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0;">
        ${['chat','galeria','perfil'].map(t => `
        <button data-tab="${t}" onclick="window._bnhPortTab('${t}')"
            style="flex:1;background:none;border:none;border-bottom:2px solid transparent;
            color:rgba(255,255,255,0.38);cursor:pointer;padding:7px 4px;font-size:0.7em;
            font-weight:700;letter-spacing:0.3px;display:flex;align-items:center;
            justify-content:center;gap:3px;transition:0.15s;text-transform:uppercase;">
            ${t==='chat'?'💬':t==='galeria'?'🖼':'👤'} ${t}
        </button>`).join('')}
    </div>
    <div id="bnh-port-body" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;"></div>`;
}

// ─────────────────────────────────────────────────────────────
// TAB CHAT
// ─────────────────────────────────────────────────────────────
function _renderTabChat() {
    const body = $('bnh-port-body');
    if (!body) return;
    const convs = portState.conversaciones;

    body.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;min-height:0;">
        <div style="display:flex;align-items:center;gap:5px;padding:5px 9px;
            border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;">
            <select id="bnh-port-conv-sel" onchange="window._bnhPortSelConv(this.value)"
                style="flex:1;background:#1a1a2e;color:rgba(255,255,255,0.72);
                border:1px solid rgba(255,255,255,0.1);border-radius:6px;
                padding:4px 7px;font-size:0.73em;outline:none;cursor:pointer;">
                ${convs.map(c => `<option value="${c.id}" ${c.id===portState.convActual?'selected':''}>${esc(c.titulo)}</option>`).join('')}
            </select>
            <button onclick="window._bnhPortNuevaConv()" title="Nueva conversación"
                style="background:rgba(192,57,43,0.2);border:1px solid rgba(192,57,43,0.3);
                color:rgba(255,255,255,0.65);border-radius:6px;padding:3px 8px;
                cursor:pointer;font-size:0.78em;flex-shrink:0;">+</button>
            <button onclick="window._bnhPortMenuConv()" title="Gestionar conversación"
                style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);
                color:rgba(255,255,255,0.4);border-radius:6px;padding:3px 7px;
                cursor:pointer;font-size:0.72em;flex-shrink:0;" title="Opciones">⚙</button>
        </div>
        <div id="bnh-port-msgs" style="flex:1;overflow-y:auto;padding:8px 9px;
            display:flex;flex-direction:column;gap:1px;min-height:0;
            scrollbar-width:thin;scrollbar-color:rgba(192,57,43,0.3) transparent;"></div>
        <div id="bnh-port-pending" style="flex-shrink:0;"></div>
        <div style="padding:7px 9px;border-top:1px solid rgba(255,255,255,0.07);flex-shrink:0;">
            <div style="display:flex;gap:5px;align-items:flex-end;">
                <button onclick="window._bnhPortFileInput()" title="Adjuntar archivo"
                    style="background:none;border:1px solid rgba(255,255,255,0.1);
                    color:rgba(255,255,255,0.38);border-radius:6px;padding:5px 7px;
                    cursor:pointer;font-size:0.82em;flex-shrink:0;line-height:1;">📎</button>
                <button onclick="window._bnhPortToggleMiniGaleria()" title="GIFs e imágenes recientes" id="bnh-port-gal-btn"
                    style="background:none;border:1px solid rgba(255,255,255,0.1);
                    color:rgba(255,255,255,0.38);border-radius:6px;padding:5px 7px;
                    cursor:pointer;font-size:0.82em;flex-shrink:0;line-height:1;">🖼</button>
                <textarea id="bnh-port-input" rows="1"
                    placeholder="Escribe… @Personaje@ #Tag"
                    style="flex:1;background:rgba(255,255,255,0.06);
                    border:1px solid rgba(255,255,255,0.1);border-radius:7px;
                    color:rgba(255,255,255,0.88);padding:6px 9px;
                    font-family:inherit;font-size:0.8em;resize:none;outline:none;
                    max-height:80px;line-height:1.4;scrollbar-width:thin;"
                    oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,80)+'px'"
                    onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window._bnhPortEnviar();}"></textarea>
                <button onclick="window._bnhPortEnviar()"
                    style="background:#c0392b;border:none;color:white;border-radius:6px;
                    padding:6px 10px;cursor:pointer;font-size:0.82em;flex-shrink:0;line-height:1;">▶</button>
            </div>
        </div>
    </div>`;

    refreshMsgs();
    refreshPending();
}

// ─────────────────────────────────────────────────────────────
// TAB GALERÍA
// ─────────────────────────────────────────────────────────────
function _renderTabGaleria() {
    const body = $('bnh-port-body');
    if (!body) return;
    const allItems = Object.values(portState.imagenesGaleria).flat();

    body.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;min-height:0;">
        <div style="display:flex;justify-content:space-between;align-items:center;
            padding:7px 10px;border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0;">
            <span style="font-size:0.7em;color:rgba(255,255,255,0.32);font-weight:700;letter-spacing:0.5px;">GALERÍA</span>
            <button onclick="window._bnhPortSubirGaleria()"
                style="background:rgba(192,57,43,0.2);border:1px solid rgba(192,57,43,0.3);
                color:rgba(255,255,255,0.7);border-radius:6px;padding:3px 9px;cursor:pointer;font-size:0.72em;">+ Subir</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:9px;min-height:0;
            scrollbar-width:thin;scrollbar-color:rgba(192,57,43,0.3) transparent;">
            ${!allItems.length
                ? `<div style="text-align:center;color:rgba(255,255,255,0.2);font-size:0.8em;padding:20px;">Sin archivos en galería</div>`
                : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:5px;">
                    ${allItems.map(item => {
                        const esVid = item.tipo === 'video';
                        return `<div title="${esc(item.nombre)}"
                            style="cursor:pointer;border-radius:7px;overflow:hidden;
                            border:1.5px solid transparent;transition:0.15s;"
                            onmouseover="this.style.borderColor='#6c3483'"
                            onmouseout="this.style.borderColor='transparent'"
                            onclick="window._bnhPortEnviarDesdeGaleria(${item.id})">
                            ${esVid
                                ? `<div style="aspect-ratio:1;background:#1a0a0a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;"><span style="font-size:1.4em;">🎬</span><span style="font-size:0.48em;color:rgba(192,57,43,0.8);font-weight:700;">VIDEO</span></div>`
                                : `<img src="${esc(item.url)}" style="width:100%;aspect-ratio:1;object-fit:cover;display:block;">`
                            }
                            <div style="font-size:0.56em;color:rgba(255,255,255,0.42);padding:2px 4px;
                                overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#0d1117;">
                                ${esc(item.nombre)}</div>
                        </div>`;
                    }).join('')}
                   </div>`
            }
        </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// TAB PERFIL
// ─────────────────────────────────────────────────────────────
function _renderTabPerfil() {
    const body = $('bnh-port-body');
    if (!body) return;
    const p     = portState.perfil;
    const avSrc = p?.avatar_path ? _imageUrl(p.avatar_path) : '';

    body.innerHTML = `
    <div style="flex:1;overflow-y:auto;padding:13px;display:flex;flex-direction:column;gap:13px;
        scrollbar-width:thin;scrollbar-color:rgba(192,57,43,0.3) transparent;">
        <!-- Activo -->
        <div style="display:flex;align-items:center;gap:11px;padding:11px;
            background:rgba(108,52,131,0.1);border-radius:10px;border:1px solid rgba(108,52,131,0.2);">
            <img src="${esc(avSrc)}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;
                border:2px solid #6c3483;flex-shrink:0;" onerror="this.style.background='#2a1a3e'">
            <div>
                <div style="font-weight:700;font-size:0.9em;color:#c39bd3;">${esc(p?.nombre||'Sin nombre')}</div>
                <div style="font-size:0.65em;color:rgba(255,255,255,0.28);margin-top:2px;">Perfil activo</div>
            </div>
        </div>
        <!-- Nombre -->
        <div>
            <div style="font-size:0.67em;color:rgba(255,255,255,0.32);font-weight:700;letter-spacing:0.5px;margin-bottom:5px;">NOMBRE VISIBLE</div>
            <div style="display:flex;gap:5px;">
                <input id="bnh-port-nombre-inp" type="text" value="${esc(p?.nombre||'')}" maxlength="32"
                    style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
                    border-radius:7px;color:rgba(255,255,255,0.88);padding:6px 9px;font-size:0.8em;font-family:inherit;outline:none;">
                <button onclick="window._bnhPortGuardarNombre()"
                    style="background:#6c3483;border:none;color:white;border-radius:7px;padding:6px 10px;cursor:pointer;font-size:0.75em;flex-shrink:0;">💾</button>
            </div>
        </div>
        <!-- Avatar -->
        <div>
            <div style="font-size:0.67em;color:rgba(255,255,255,0.32);font-weight:700;letter-spacing:0.5px;margin-bottom:5px;">AVATAR</div>
            <div style="display:flex;align-items:center;gap:9px;">
                <img id="bnh-port-avatar-prev" src="${esc(avSrc)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #6c3483;" onerror="this.style.background='#2a1a3e'">
                <div style="display:flex;flex-direction:column;gap:5px;">
                    <button onclick="document.getElementById('bnh-port-avatar-inp').click()"
                        style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border-radius:6px;padding:5px 10px;cursor:pointer;font-size:0.75em;">📷 Elegir imagen</button>
                    <button onclick="window._bnhPortGuardarAvatar()"
                        style="background:#6c3483;border:none;color:white;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:0.75em;">💾 Guardar avatar</button>
                </div>
                <input type="file" id="bnh-port-avatar-inp" accept="image/*" style="display:none" onchange="window._bnhPortPreviewAvatar(this)">
            </div>
            <div id="bnh-port-perfil-msg" style="font-size:0.72em;min-height:14px;margin-top:5px;"></div>
        </div>

    </div>`;
}

// ─────────────────────────────────────────────────────────────
// SWITCH TAB
// ─────────────────────────────────────────────────────────────
export function switchTab(tab) {
    portState.tab = tab;
    const panel = $(ID_PANEL);
    if (panel) {
        panel.querySelectorAll('[data-tab]').forEach(btn => {
            const activo = btn.dataset.tab === tab;
            btn.style.background        = activo ? 'rgba(192,57,43,0.14)' : 'none';
            btn.style.borderBottomColor = activo ? '#c0392b' : 'transparent';
            btn.style.color             = activo ? '#e8b4b8' : 'rgba(255,255,255,0.38)';
        });
    }
    if (tab === 'chat')    _renderTabChat();
    if (tab === 'galeria') _renderTabGaleria();
    if (tab === 'perfil')  _renderTabPerfil();
}

// ─────────────────────────────────────────────────────────────
// REFRESH DE MENSAJES
// ─────────────────────────────────────────────────────────────
export function refreshMsgs() {
    const wrap = $('bnh-port-msgs');
    if (!wrap) return;

    const msgs = portState.mensajes;
    if (!msgs.length) {
        wrap.innerHTML = `<div style="text-align:center;color:rgba(255,255,255,0.18);font-size:0.8em;margin:auto;padding:20px;">Sin mensajes aún</div>`;
        return;
    }

    const GROUP_GAP_MS = 5 * 60 * 1000;
    let html          = '';
    let ultimaFecha   = '';
    let ultimoAutorId = null;
    let ultimaHora    = null;

    msgs.forEach(msg => {
        const fecha    = new Date(msg.creado_en);
        const fechaStr = fecha.toLocaleDateString('es', { day:'numeric', month:'short' });
        if (fechaStr !== ultimaFecha) {
            ultimaFecha = fechaStr; ultimoAutorId = null;
            html += `<div style="text-align:center;font-size:0.63em;color:rgba(255,255,255,0.18);
                margin:5px 0;padding:2px 8px;background:rgba(255,255,255,0.04);
                border-radius:8px;align-self:center;">${fechaStr}</div>`;
        }
        const msPrev     = ultimaHora ? fecha - ultimaHora : Infinity;
        const mismoGrupo = msg.autor_id === ultimoAutorId && msPrev < GROUP_GAP_MS;
        ultimoAutorId = msg.autor_id;
        ultimaHora    = fecha;
        html += _htmlMensaje(msg, mismoGrupo);
    });

    wrap.innerHTML = html;
    wrap.scrollTop = wrap.scrollHeight;
}

export function appendMsg(msg) {
    const wrap = $('bnh-port-msgs');
    if (!wrap) return;

    const empty = wrap.querySelector('[style*="margin:auto"]');
    if (empty) empty.remove();

    const GROUP_GAP_MS = 5 * 60 * 1000;
    const msgs   = portState.mensajes;
    const previo = msgs[msgs.length - 2];
    const mismoGrupo = previo
        && previo.autor_id === msg.autor_id
        && (new Date(msg.creado_en) - new Date(previo.creado_en)) < GROUP_GAP_MS;

    const tmp = document.createElement('div');
    tmp.innerHTML = _htmlMensaje(msg, mismoGrupo);
    const node = tmp.firstElementChild;
    if (node) wrap.appendChild(node);
    wrap.scrollTop = wrap.scrollHeight;
}

// ─────────────────────────────────────────────────────────────
// PENDING FILES
// ─────────────────────────────────────────────────────────────
export function refreshPending() {
    const wrap = $('bnh-port-pending');
    if (!wrap) return;
    const files = portState.pendingFiles;
    if (!files.length) { wrap.innerHTML = ''; return; }

    const items = files.map(e => {
        const isImg = e.file.type.startsWith('image/');
        const isVid = e.file.type.startsWith('video/');
        const thumb = isImg
            ? `<img src="${e.url}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;">`
            : isVid
            ? `<div style="width:40px;height:40px;background:#1a0a0a;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:1.1em;">🎬</div>`
            : `<div style="width:40px;height:40px;background:#0a1a2e;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:1.1em;">🎵</div>`;
        return `<div style="position:relative;flex-shrink:0;">${thumb}
            <button data-uid="${e.id}" style="position:absolute;top:-4px;right:-4px;
                width:13px;height:13px;border-radius:50%;background:#c0392b;border:none;
                color:white;font-size:0.5em;cursor:pointer;line-height:13px;text-align:center;padding:0;">✕</button>
        </div>`;
    }).join('');

    wrap.innerHTML = `<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;
        padding:5px 9px 3px;border-top:1px solid rgba(255,255,255,0.07);">
        ${items}
        <button onclick="window._bnhPortLimpiarPendientes()"
            style="font-size:0.62em;color:rgba(192,57,43,0.65);background:none;
            border:none;cursor:pointer;margin-left:auto;padding:0;">Limpiar</button>
    </div>`;

    wrap.querySelectorAll('button[data-uid]').forEach(btn => {
        btn.onclick = () => {
            const uid   = parseFloat(btn.dataset.uid);
            const entry = portState.pendingFiles.find(f => f.id === uid);
            if (entry) URL.revokeObjectURL(entry.url);
            portState.pendingFiles = portState.pendingFiles.filter(f => f.id !== uid);
            refreshPending();
        };
    });
}

// ─────────────────────────────────────────────────────────────
// LIGHTBOX CARRUSEL (portado 1:1 desde showLightboxCarousel)
// ─────────────────────────────────────────────────────────────
export function showLightboxCarousel(urls, startIdx = 0) {
    let current = startIdx;
    let lb = $('bnh-port-lb');
    if (!lb) {
        lb = document.createElement('div');
        lb.id = 'bnh-port-lb';
        lb.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:999999;
            display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);`;
        document.body.appendChild(lb);
    }
    function render() {
        const hasPrev = current > 0;
        const hasNext = current < urls.length - 1;
        lb.innerHTML = `
            <button onclick="document.getElementById('bnh-port-lb').remove()"
                style="position:absolute;top:16px;right:18px;background:none;border:none;
                color:white;font-size:1.7em;cursor:pointer;opacity:0.7;">✕</button>
            ${hasPrev ? `<button id="bp-lb-prev" style="position:absolute;left:14px;background:rgba(255,255,255,0.1);
                border:none;color:white;font-size:1.9em;cursor:pointer;border-radius:50%;
                width:44px;height:44px;display:flex;align-items:center;justify-content:center;">‹</button>` : ''}
            <img src="${esc(urls[current])}" style="max-width:90vw;max-height:88vh;
                border-radius:8px;box-shadow:0 0 50px rgba(108,52,131,0.5);object-fit:contain;">
            ${hasNext ? `<button id="bp-lb-next" style="position:absolute;right:14px;background:rgba(255,255,255,0.1);
                border:none;color:white;font-size:1.9em;cursor:pointer;border-radius:50%;
                width:44px;height:44px;display:flex;align-items:center;justify-content:center;">›</button>` : ''}
            <div style="position:absolute;bottom:14px;color:rgba(255,255,255,0.4);font-size:0.8em;">
                ${current+1} / ${urls.length}</div>`;
        lb.querySelector('#bp-lb-prev')?.addEventListener('click', e => { e.stopPropagation(); current--; render(); });
        lb.querySelector('#bp-lb-next')?.addEventListener('click', e => { e.stopPropagation(); current++; render(); });
    }
    lb.onclick = e => { if (e.target === lb) lb.remove(); };
    render();
}

export function verImagen(url) { showLightboxCarousel([url], 0); }

// ─────────────────────────────────────────────────────────────
// MINI-PLAYER YOUTUBE (portado 1:1)
// ─────────────────────────────────────────────────────────────
export function abrirYTModal(embedUrl) {
    const existing = $('bnh-port-yt');
    if (existing) { existing.style.display = 'flex'; return; }

    const pip = document.createElement('div');
    pip.id = 'bnh-port-yt';
    pip.style.cssText = `position:fixed;bottom:90px;right:20px;width:min(380px,90vw);
        z-index:99990;border-radius:13px;overflow:hidden;
        box-shadow:0 8px 36px rgba(0,0,0,0.7);display:flex;flex-direction:column;
        background:#0d0d0d;border:1.5px solid rgba(192,57,43,0.35);resize:both;`;
    const bar = document.createElement('div');
    bar.style.cssText = `display:flex;align-items:center;justify-content:space-between;
        padding:5px 9px;background:rgba(192,57,43,0.16);cursor:move;user-select:none;
        border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0;`;
    bar.innerHTML = `<span style="font-size:0.68em;color:rgba(255,255,255,0.5);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">▶ YouTube</span>
        <div style="display:flex;gap:5px;">
            <button id="bp-yt-min" style="background:rgba(255,255,255,0.08);border:none;color:rgba(255,255,255,0.6);border-radius:4px;width:20px;height:20px;cursor:pointer;font-size:0.72em;">─</button>
            <button id="bp-yt-close" style="background:rgba(192,57,43,0.5);border:none;color:white;border-radius:4px;width:20px;height:20px;cursor:pointer;font-size:0.72em;">✕</button>
        </div>`;
    const iframe = document.createElement('iframe');
    iframe.src = embedUrl;
    iframe.allow = 'autoplay;encrypted-media;picture-in-picture;fullscreen';
    iframe.allowFullscreen = true;
    iframe.style.cssText = 'width:100%;aspect-ratio:16/9;border:none;display:block;';
    pip.appendChild(bar); pip.appendChild(iframe);
    document.body.appendChild(pip);
    pip.querySelector('#bp-yt-close').onclick = () => pip.remove();
    let minimized = false;
    pip.querySelector('#bp-yt-min').onclick = () => {
        minimized = !minimized;
        iframe.style.display = minimized ? 'none' : 'block';
        pip.querySelector('#bp-yt-min').textContent = minimized ? '□' : '─';
    };
    _makeDraggable(pip, bar);
}

// ─────────────────────────────────────────────────────────────
// MINI-PLAYER TIKTOK (portado 1:1)
// ─────────────────────────────────────────────────────────────
export function abrirTikTokModal(embedUrl) {
    const existing = $('bnh-port-tt');
    if (existing) { existing.style.display = 'flex'; return; }

    const pip = document.createElement('div');
    pip.id = 'bnh-port-tt';
    pip.style.cssText = `position:fixed;bottom:90px;right:20px;width:min(320px,90vw);
        z-index:99990;border-radius:13px;overflow:hidden;
        box-shadow:0 8px 36px rgba(0,0,0,0.7);display:flex;flex-direction:column;
        background:#010101;border:1.5px solid rgba(254,44,85,0.35);resize:both;`;
    const bar = document.createElement('div');
    bar.style.cssText = `display:flex;align-items:center;justify-content:space-between;
        padding:5px 9px;background:rgba(254,44,85,0.18);cursor:move;user-select:none;
        border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0;`;
    bar.innerHTML = `<span style="font-size:0.68em;color:rgba(255,255,255,0.5);">♪ TikTok</span>
        <div style="display:flex;gap:5px;">
            <button id="bp-tt-min" style="background:rgba(255,255,255,0.08);border:none;color:rgba(255,255,255,0.6);border-radius:4px;width:20px;height:20px;cursor:pointer;font-size:0.72em;">─</button>
            <button id="bp-tt-close" style="background:rgba(254,44,85,0.5);border:none;color:white;border-radius:4px;width:20px;height:20px;cursor:pointer;font-size:0.72em;">✕</button>
        </div>`;
    const iframe = document.createElement('iframe');
    iframe.src = embedUrl;
    iframe.allow = 'autoplay;encrypted-media;picture-in-picture;fullscreen';
    iframe.allowFullscreen = true;
    iframe.style.cssText = 'width:100%;height:680px;max-height:80vh;border:none;display:block;';
    pip.appendChild(bar); pip.appendChild(iframe);
    document.body.appendChild(pip);
    pip.querySelector('#bp-tt-close').onclick = () => pip.remove();
    let minimized = false;
    pip.querySelector('#bp-tt-min').onclick = () => {
        minimized = !minimized;
        iframe.style.display = minimized ? 'none' : 'block';
        pip.querySelector('#bp-tt-min').textContent = minimized ? '□' : '─';
    };
    _makeDraggable(pip, bar);
}

// ─────────────────────────────────────────────────────────────
// PLAYLIST HYDRATION (portado 1:1 desde _opHidratarPlaylist)
// ─────────────────────────────────────────────────────────────
export async function hidratarPlaylist(cardId, playlistId, videoId) {
    const card = $(cardId);
    if (!card) return;
    const thumbEl = card.querySelector('.bp-yt-pl-thumb');
    const titleEl = card.querySelector('.bp-yt-pl-title');
    const countEl = card.querySelector('.bp-yt-pl-count');

    if (videoId && thumbEl) {
        _setPlaylistThumb(thumbEl, videoId);
        if (titleEl) titleEl.textContent = 'Lista de reproducción';
        if (countEl) countEl.textContent = '';
        return;
    }

    const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent('https://www.youtube.com/feeds/videos.xml?playlist_id='+playlistId)}`,
        `https://corsproxy.io/?${encodeURIComponent('https://www.youtube.com/feeds/videos.xml?playlist_id='+playlistId)}`,
    ];
    for (const proxyUrl of proxies) {
        try {
            const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) continue;
            const text = await res.text();
            if (!text || text.length < 100) continue;
            const xml     = new DOMParser().parseFromString(text, 'text/xml');
            const title   = xml.querySelector('feed > title')?.textContent?.trim() || 'Lista de reproducción';
            const entries = xml.querySelectorAll('entry');
            const count   = entries.length;
            const fve     = entries[0]?.getElementsByTagNameNS('http://www.youtube.com/xml/schemas/2015','videoId')[0]
                         || entries[0]?.querySelector('videoId');
            const fv      = fve?.textContent;
            if (titleEl) titleEl.textContent = title;
            if (countEl) countEl.textContent = count > 0 ? `${count}${count>=15?'+':''} video${count!==1?'s':''}` : '';
            if (fv && thumbEl) _setPlaylistThumb(thumbEl, fv);
            return;
        } catch(_) {}
    }
    if (titleEl) titleEl.textContent = 'Lista de reproducción';
}

function _setPlaylistThumb(thumbEl, videoId) {
    thumbEl.style.backgroundImage    = `url(https://i.ytimg.com/vi/${videoId}/hqdefault.jpg)`;
    thumbEl.style.backgroundSize     = 'cover';
    thumbEl.style.backgroundPosition = 'center';
    thumbEl.style.position           = 'relative';
    thumbEl.innerHTML = `
        <div style="position:absolute;inset:0;background:rgba(0,0,0,0.3);"></div>
        <div style="position:relative;width:44px;height:30px;background:#ff0000;border-radius:7px;
            display:flex;align-items:center;justify-content:center;z-index:1;box-shadow:0 2px 8px rgba(0,0,0,0.5);">
            <div style="border-left:15px solid white;border-top:8px solid transparent;border-bottom:8px solid transparent;margin-left:3px;"></div>
        </div>
        <span style="position:relative;z-index:1;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.18);
            color:white;font-size:0.65em;padding:2px 8px;border-radius:10px;font-weight:700;margin-top:4px;">
            ▶ Lista de reproducción</span>`;
}

// ─────────────────────────────────────────────────────────────
// PiP NATIVO para videos subidos
// ─────────────────────────────────────────────────────────────
export async function videoPiP(videoId) {
    const vid = document.getElementById(videoId);
    if (!vid) return;
    try { await vid.play(); await vid.requestPictureInPicture(); }
    catch(_) { vid.play(); }
}

// ─────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────
export function toast(msg, tipo = 'info') {
    let el = $('bnh-port-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'bnh-port-toast';
        el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
            padding:6px 15px;border-radius:8px;font-size:0.8em;font-weight:700;
            z-index:99997;pointer-events:none;transition:opacity 0.3s;white-space:nowrap;`;
        document.body.appendChild(el);
    }
    el.textContent   = msg;
    el.style.background = tipo==='ok'?'#1e8449':tipo==='error'?'#c0392b':'#1a4a80';
    el.style.color   = 'white';
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity='0'; }, 2800);
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function _initDrag(panel) {
    let ox=0, oy=0, dragging=false;
    panel.addEventListener('mousedown', e => {
        if (!e.target.closest('#bnh-port-titlebar')) return;
        dragging = true;
        const r  = panel.getBoundingClientRect();
        ox = e.clientX - r.left; oy = e.clientY - r.top;
        e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        const x = Math.max(0, e.clientX - ox);
        const y = Math.max(0, e.clientY - oy);
        panel.style.right='auto'; panel.style.bottom='auto';
        panel.style.left=x+'px'; panel.style.top=y+'px';
        guardarPos(x, y);
    });
    document.addEventListener('mouseup', () => { dragging=false; });
}

function _makeDraggable(pip, bar) {
    let ox=0, oy=0, drag=false;
    bar.onmousedown = e => {
        drag=true;
        const r=pip.getBoundingClientRect();
        ox=e.clientX-r.left; oy=e.clientY-r.top; e.preventDefault();
    };
    document.addEventListener('mousemove', e => {
        if (!drag) return;
        pip.style.right='auto'; pip.style.bottom='auto';
        pip.style.left=(e.clientX-ox)+'px'; pip.style.top=(e.clientY-oy)+'px';
    });
    document.addEventListener('mouseup', ()=>{drag=false;});
}

function _bindPasteEvent(panel) {
    panel.addEventListener('paste', e => {
        const items = Array.from(e.clipboardData?.items||[]);
        const imgs  = items.filter(it => it.type.startsWith('image/'));
        if (!imgs.length) return;
        e.preventDefault();
        imgs.forEach(it => { const f=it.getAsFile(); if(f) window._bnhPortAddFile(f,'paste'); });
    });
}
