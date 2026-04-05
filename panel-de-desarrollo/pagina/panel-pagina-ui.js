// ============================================================
// panel-pagina-ui.js — Editor de Página con preview reactivo
// ============================================================

import { paginaState }    from './panel-pagina-state.js';
import { cargarConfigUI, guardarConfigUI, marcarCambioPagina, haycambiosPagina } from './panel-pagina-logic.js';
import { supabase, currentConfig } from '../bnh-auth.js';

const BUCKET      = 'imagenes-bnh';
const STORAGE_URL = currentConfig.storageUrl;

// Mapa de imágenes del index principal con sus descripciones
const IMAGENES_INDEX = [
    { key: 'icon',         archivo: 'icon.png',         label: 'Icono / Favicon',       zona: 'Favicon del sitio' },
    { key: 'bnh-hero',     archivo: 'bnh-hero.png',     label: 'Fondo del Hero',         zona: 'Imagen de fondo del header principal' },
    { key: 'thread-rol',   archivo: 'thread-rol.png',   label: 'Tarjeta Hilo Rol',       zona: 'Sección "Hilos Activos" → Rol' },
    { key: 'thread-meta',  archivo: 'thread-meta.png',  label: 'Tarjeta Meta',           zona: 'Sección "Hilos Activos" → Meta' },
    { key: 'historial',    archivo: 'historial.png',    label: 'Tarjeta Historial',      zona: 'Grid principal → Historial de Posts' },
    { key: 'personajes',   archivo: 'personajes.png',   label: 'Tarjeta Personajes',     zona: 'Grid principal → Personajes' },
    { key: 'misiones',     archivo: 'misiones.png',     label: 'Tarjeta Misiones',       zona: 'Grid principal → Misiones' },
    { key: 'estadisticas', archivo: 'estadisticas.png', label: 'Tarjeta Estadísticas',   zona: 'Grid principal → Estadísticas' },
    { key: 'extra',        archivo: 'extra.png',        label: 'Tarjeta Imágenes',       zona: 'Grid principal → Imágenes' },
    { key: 'panel-dev',    archivo: 'panel-dev.png',    label: 'Tarjeta Panel Máster',   zona: 'Grid principal → Panel Máster (solo OP)' },
    { key: 'no_encontrado',archivo: 'no_encontrado.png',label: 'Imagen "No encontrado"', zona: 'Fallback cuando falta una imagen' },
];

// ── Punto de entrada ─────────────────────────────────────────
export async function initPaginaDev() {
    await cargarConfigUI();
    _exponerGlobales();
}

// ── Render principal ─────────────────────────────────────────
export function renderColumnaPagina() {
    const contenedor = document.getElementById('content-pagina');
    if (!contenedor) return;
    const c = paginaState.config || {};

    contenedor.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 420px; gap:28px; max-width:1400px; margin:0 auto; align-items:start;">

        <div style="display:flex; flex-direction:column; gap:20px;">

            <div class="pag-card">
                <div class="pag-card-title">🏷️ Encabezado de la Campaña</div>
                <label class="pag-label">Título principal</label>
                <input class="pag-input" id="pag-titulo" value="${_esc(c.titulo||'')}"
                    oninput="window._paginaMod('titulo', this.value)"
                    placeholder="BNH">

                <label class="pag-label" style="margin-top:14px;">Subtítulo</label>
                <input class="pag-input" id="pag-subtitulo" value="${_esc(c.subtitulo||'')}"
                    oninput="window._paginaMod('subtitulo', this.value)"
                    placeholder="Sistema de rol...">

                <label class="pag-label" style="margin-top:14px;">Texto de lore</label>
                <textarea class="pag-textarea" id="pag-lore"
                    oninput="window._paginaMod('lore', this.value)"
                    placeholder="Descripción de la campaña...">${_esc(c.lore||'')}</textarea>
            </div>

            <div class="pag-card">
                <div class="pag-card-title">🔗 Hilos Activos</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                    <div>
                        <label class="pag-label">Etiqueta Rol</label>
                        <input class="pag-input" id="pag-nombre-rol" value="${_esc(c.nombre_rol||'')}"
                            oninput="window._paginaMod('nombre_rol', this.value)" placeholder="ROL ACTUAL">
                        <label class="pag-label" style="margin-top:10px;">URL Rol</label>
                        <input class="pag-input" id="pag-link-rol" value="${_esc(c.link_rol||'')}"
                            oninput="window._paginaMod('link_rol', this.value)" placeholder="https://...">
                    </div>
                    <div>
                        <label class="pag-label">Etiqueta Meta</label>
                        <input class="pag-input" id="pag-nombre-meta" value="${_esc(c.nombre_meta||'')}"
                            oninput="window._paginaMod('nombre_meta', this.value)" placeholder="META">
                        <label class="pag-label" style="margin-top:10px;">URL Meta</label>
                        <input class="pag-input" id="pag-link-meta" value="${_esc(c.link_meta||'')}"
                            oninput="window._paginaMod('link_meta', this.value)" placeholder="https://...">
                    </div>
                </div>
            </div>

            <div class="pag-card">
                <div class="pag-card-title">🖼️ Imágenes del Index Principal</div>
                <p style="color:#666; font-size:0.78em; font-family:sans-serif; margin:0 0 14px 0;">
                    Haz clic en cualquier imagen para reemplazarla. Los cambios se suben directamente al Storage.
                </p>
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px,1fr)); gap:10px;">
                    ${IMAGENES_INDEX.map(img => _renderImgCard(img)).join('')}
                </div>
            </div>

            <div style="display:flex; align-items:center; gap:16px; padding-bottom:10px;">
                <button id="btn-guardar-pagina" onclick="window._paginaGuardar()" class="pag-btn-guardar">
                    💾 GUARDAR TEXTOS EN LA BD
                </button>
                <span id="pag-status" style="font-family:monospace; font-size:0.9em; color:#888;"></span>
            </div>
        </div>

        <div style="position:sticky; top:20px; display:flex; flex-direction:column; gap:16px;">

            <div class="pag-card" style="padding:14px;">
                <div class="pag-card-title" style="margin-bottom:12px;">👁 Previsualización en Vivo</div>
                <div style="overflow:hidden; border-radius:6px; height:340px;">
                    <div style="transform-origin:top left; transform:scale(0.55); width:182%;">
                        <div id="pag-preview">${_renderPreviewCompleto(c)}</div>
                    </div>
                </div>
            </div>

            <div id="pag-upload-panel" style="display:none;">
                <div class="pag-card" style="border-color:#00b4d8;">
                    <div class="pag-card-title" style="color:#60d8f8; margin-bottom:6px;">
                        📤 Subir: <span id="pag-upload-nombre" style="color:#fff;"></span>
                    </div>
                    <p id="pag-upload-zona-label"
                       style="color:#555; font-size:0.72em; font-family:sans-serif; margin:0 0 12px 0;"></p>
                    <div id="pag-drop-zone" class="pag-drop-zone"
                        onclick="document.getElementById('pag-file-input').click()"
                        ondragover="event.preventDefault(); this.classList.add('drag-over')"
                        ondragleave="this.classList.remove('drag-over')"
                        ondrop="window._paginaHandleDrop(event)">
                        <div style="font-size:2em; margin-bottom:6px;">🖼️</div>
                        <p style="color:#60d8f8; font-family:'Rajdhani','Segoe UI',sans-serif; font-weight:bold; font-size:0.85em; margin:0 0 4px 0;">Arrastra aquí o haz clic</p>
                        <p style="color:#555; font-size:0.75em; font-family:sans-serif; margin:0;">JPG, PNG, WEBP</p>
                    </div>
                    <input type="file" id="pag-file-input" accept="image/*" style="display:none"
                        onchange="window._paginaFileSelect(event)">
                    <div id="pag-upload-progress" style="display:none; margin-top:10px;">
                        <div style="height:5px; background:#111; border-radius:3px; overflow:hidden;">
                            <div id="pag-prog-fill" style="height:100%; width:0%; background:#00b4d8; transition:width 0.3s;"></div>
                        </div>
                        <p id="pag-prog-msg" style="color:#888; font-size:0.75em; font-family:sans-serif; text-align:center; margin:5px 0 0 0;"></p>
                    </div>
                    <button onclick="window._paginaCerrarUpload()"
                        style="margin-top:10px; background:#001a1a; border:1px solid #003a3a;
                               color:#006060; padding:6px 14px; border-radius:4px;
                               cursor:pointer; font-family:'Rajdhani',sans-serif; font-size:0.75em;">
                        Cancelar
                    </button>
                </div>
            </div>

        </div>
    </div>

    <style>
        .pag-card          { background:#050a14; border:1px solid #0d2035; border-radius:10px; padding:20px; }
        .pag-card-title    { color:#e8c940; font-family:'Rajdhani','Segoe UI',sans-serif; font-size:0.9em; text-transform:uppercase; letter-spacing:2px; margin:0 0 16px 0; font-weight:bold; }
        .pag-label         { display:block; color:#888; font-size:0.73em; font-family:sans-serif; margin-bottom:5px; text-transform:uppercase; letter-spacing:1px; margin-top:4px; }
        .pag-input         { width:100%; box-sizing:border-box; background:#000; color:#c8d8e8; border:1px solid #0d3050; border-radius:6px; padding:9px 12px; font-family:'Rajdhani','Segoe UI',sans-serif; font-size:0.9em; outline:none; transition:border-color 0.2s; }
        .pag-input:focus   { border-color:#00b4d8; }
        .pag-textarea      { width:100%; box-sizing:border-box; background:#000; color:#c8d8e8; border:1px solid #0d3050; border-radius:6px; padding:9px 12px; font-family:sans-serif; font-size:0.85em; outline:none; min-height:80px; resize:vertical; transition:border-color 0.2s; }
        .pag-textarea:focus{ border-color:#00b4d8; }
        .pag-btn-guardar   { background:linear-gradient(135deg,#003a50,#006080); color:#fff; border:1px solid #00b4d8; padding:13px 28px; border-radius:8px; font-family:'Rajdhani','Segoe UI',sans-serif; font-weight:bold; font-size:0.95em; cursor:pointer; transition:filter 0.2s; }
        .pag-btn-guardar:hover { filter:brightness(1.2); }
        .pag-img-card      { background:#050a14; border:1px solid #0a1828; border-radius:8px; padding:8px; text-align:center; cursor:pointer; transition:border-color 0.2s, transform 0.15s; position:relative; }
        .pag-img-card:hover{ border-color:#00b4d8; transform:translateY(-2px); }
        .pag-img-card img  { width:70px; height:70px; object-fit:cover; border-radius:5px; border:1px solid #333; display:block; margin:0 auto 6px auto; }
        .pag-img-label     { font-size:0.62em; color:#aaa; font-family:sans-serif; line-height:1.3; word-break:break-word; }
        .pag-img-zona      { font-size:0.58em; color:#555; font-family:sans-serif; margin-top:3px; font-style:italic; }
        .pag-upload-badge  { position:absolute; top:4px; right:4px; background:#00b4d8; color:#000; font-size:0.55em; padding:1px 5px; border-radius:3px; font-family:sans-serif; }
        .pag-drop-zone     { border:2px dashed #0d3050; border-radius:8px; padding:20px 10px; text-align:center; cursor:pointer; transition:0.2s; background:rgba(0,0,0,0.3); }
        .pag-drop-zone:hover, .pag-drop-zone.drag-over { background:rgba(0,180,216,0.07); border-color:#00b4d8; }
    </style>`;
}

// ── Card de cada imagen ──────────────────────────────────────
function _renderImgCard(img) {
    const v       = Date.now();
    const keyNorm = _norm(img.key);
    const url     = `${STORAGE_URL}/imginterfaz/${keyNorm}.png?v=${v}`;
    const fbStorage = `${STORAGE_URL}/imginterfaz/no_encontrado.png`;
    const fbSVG     = `data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2270%22 height=%2270%22%3E%3Crect width=%2270%22 height=%2270%22 fill=%22%23050a14%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%230d3050%22 font-size=%2222%22%3E%3F%3C/text%3E%3C/svg%3E`;

    const safeKey  = img.key.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const safeLbl  = img.label.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const safeZona = img.zona.replace(/'/g, "\\'").replace(/"/g, '&quot;');

    let onErrorScript = `this.onerror=function(){ this.onerror=null; this.src='${fbSVG}'; }; this.src='${fbStorage}';`;
    if (img.key === 'no_encontrado') {
        onErrorScript = `this.onerror=null; this.src='${fbSVG}';`;
    }

    return `
    <div class="pag-img-card" data-imgkey="${img.key}"
         onclick="window._paginaAbrirUpload('${safeKey}','${img.archivo}','${safeLbl}','${safeZona}')"
         title="${safeZona}">
        <span class="pag-upload-badge">📤</span>
        <img id="pag-grid-img-${img.key}" src="${url}" onerror="${onErrorScript}">
        <div class="pag-img-label">${img.label}</div>
        <div class="pag-img-zona">${img.zona}</div>
    </div>`;
}

// ── Preview completo escalado ────────────────────────────────
function _renderPreviewCompleto(c) {
    const v        = Date.now();
    const bgUrl    = `${STORAGE_URL}/imginterfaz/bnh-hero.png?v=${v}`;
    const iconUrl  = `${STORAGE_URL}/imginterfaz/icon.png?v=${v}`;
    const fb       = `${STORAGE_URL}/imginterfaz/no_encontrado.png`;
    const fbSVG    = `data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2270%22 height=%2270%22%3E%3Crect width=%2270%22 height=%2270%22 fill=%22%23050a14%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%230d3050%22 font-size=%2222%22%3E%3F%3C/text%3E%3C/svg%3E`;

    const gridItems = [
        { key:'historial',    label:'HISTORIAL' },
        { key:'personajes',   label:'PERSONAJES' },
        { key:'misiones',     label:'MISIONES' },
        { key:'estadisticas', label:'ESTADÍSTICAS' },
        { key:'extra',        label:'IMÁGENES' },
        { key:'panel-dev',    label:'PANEL OP' },
    ];

    const onErrorGeneral = `this.onerror=function(){ this.onerror=null; this.src='${fbSVG}'; }; this.src='${fb}';`;

    return `
    <div style="background:#050a14; font-family:'Rajdhani','Segoe UI',sans-serif; color:#e8c940; border-radius:10px; overflow:hidden; border:1px solid #0d2035;">

        <div style="background:#080f1c; border-bottom:1px solid #0d2035; padding:8px 16px; display:flex; justify-content:space-between; align-items:center;">
            <img id="prev-icon" src="${iconUrl}" onerror="${onErrorGeneral}"
                 style="width:24px; height:24px; border-radius:4px;">
            <span style="font-size:0.55em; color:#1a3050; font-family:sans-serif;">🔄 Cambiar Campaña</span>
            <span style="background:#001a2c; color:#00b4d8; border:1px dashed #00b4d8; padding:3px 8px; border-radius:3px; font-size:0.55em;">⚡ OP</span>
        </div>

        <div id="prev-header-bg"
             style="background:linear-gradient(rgba(5,10,20,.75),rgba(5,10,20,.75)),url('${bgUrl}') center/cover;
                    padding:28px 16px 20px 16px; text-align:center;">
            <h1 id="prev-titulo" style="font-size:1.5em; margin:0 0 6px 0; color:#00b4d8; letter-spacing:6px; text-shadow:0 0 20px rgba(0,180,216,0.4);">
                ${_esc(c.titulo||'BNH')}
            </h1>
            <p id="prev-subtitulo" style="color:#6a9ab8; letter-spacing:3px; font-size:0.5em; text-transform:uppercase; margin:0;">
                ${_esc(c.subtitulo||'Sistema de Rol')}
            </p>
        </div>

        <div style="background:rgba(8,15,28,.7); border:1px solid #0d2035; border-radius:6px;
                    padding:10px 14px; margin:10px 14px; font-size:0.5em; color:#6a9ab8;
                    font-family:sans-serif; font-style:italic; line-height:1.5;">
            <span id="prev-lore">${_esc(c.lore||'Descripción de la campaña...')}</span>
        </div>

        <div style="display:flex; gap:6px; padding:0 14px 10px; justify-content:center;">
            <div style="background:rgba(8,15,28,.8); border:1px solid #0d2035; border-radius:5px; overflow:hidden; position:relative; height:36px; width:120px;">
                <img id="prev-img-thread-rol" src="${STORAGE_URL}/imginterfaz/thread-rol.png?v=${v}" onerror="${onErrorGeneral}" style="width:100%;height:100%;object-fit:cover;opacity:0.4;">
                <div id="prev-nombre-rol" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:0.42em;color:#e8c940;text-shadow:0 0 6px #000;letter-spacing:1px;">
                    ${_esc(c.nombre_rol||'ROL ACTUAL')}
                </div>
            </div>
            <div style="background:rgba(8,15,28,.8); border:1px solid #0d2035; border-radius:5px; overflow:hidden; position:relative; height:36px; width:120px;">
                <img id="prev-img-thread-meta" src="${STORAGE_URL}/imginterfaz/thread-meta.png?v=${v}" onerror="${onErrorGeneral}" style="width:100%;height:100%;object-fit:cover;opacity:0.4;">
                <div id="prev-nombre-meta" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:0.42em;color:#e8c940;text-shadow:0 0 6px #000;letter-spacing:1px;">
                    ${_esc(c.nombre_meta||'META')}
                </div>
            </div>
        </div>

        <p style="font-size:0.55em; color:#3a6080; margin:4px 14px 6px 14px; text-align:center; letter-spacing:3px;">SISTEMAS</p>
        <div style="padding:0 14px 14px 14px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:5px;">
            ${gridItems.map(gi => `
            <div style="background:rgba(8,15,28,.9); border:1px solid #0d2035; border-radius:5px; overflow:hidden; text-align:center; padding:5px;">
                <img id="prev-grid-img-${gi.key}"
                     src="${STORAGE_URL}/imginterfaz/${gi.key}.png?v=${v}"
                     onerror="${onErrorGeneral}"
                     style="width:32px; height:32px; object-fit:cover; border-radius:50%; border:1px solid #0d2035; margin-bottom:2px;">
                <div style="font-size:0.4em; color:#3a6080; letter-spacing:1px;">${gi.label}</div>
            </div>`).join('')}
        </div>

    </div>`;
}

// ── Upload ───────────────────────────────────────────────────
let _uploadTarget = null;

function _norm(str) {
    return str ? str.toString().trim().toLowerCase()
        .replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e').replace(/[íìïî]/g,'i')
        .replace(/[óòöô]/g,'o').replace(/[úùüû]/g,'u').replace(/[ñ]/g,'n')
        .replace(/\s+/g,'_').replace(/[^a-z0-9_\-]/g,'') : '';
}

function _uploadSeguroPagina(ruta, file, tipoContenido) {
    const solicitud = supabase.storage.from(BUCKET)
        .upload(ruta, file, { upsert: true, contentType: tipoContenido, cacheControl: '3600' });

    let timerId;
    const tiempoLimite = new Promise((_, reject) => {
        timerId = setTimeout(() => reject(new Error("Conexión interrumpida por suspensión de pestaña.")), 25000);
    });

    return Promise.race([solicitud, tiempoLimite]).finally(() => clearTimeout(timerId));
}

async function _ejecutarSubidaPagina(file) {
    if (!_uploadTarget) return;
    const { key } = _uploadTarget;
    const keyNorm = _norm(key);

    const progDiv  = document.getElementById('pag-upload-progress');
    const progFill = document.getElementById('pag-prog-fill');
    const progMsg  = document.getElementById('pag-prog-msg');

    const setP = (pct, msg, color = '#888') => {
        progDiv.style.display = 'block';
        progFill.style.width  = pct + '%';
        progMsg.textContent   = msg;
        progMsg.style.color   = color;
    };

    try {
        setP(20, 'Procesando imagen...');
        const { blobPNG, blobJPG } = await _convertirFormatos(file);
        const filePNG = new File([blobPNG], `${keyNorm}.png`, { type: 'image/png' });
        const fileJPG = new File([blobJPG], `${keyNorm}.jpg`, { type: 'image/jpeg' });

        setP(50, 'Subiendo PNG...');
        const { error: e1 } = await _uploadSeguroPagina(`imginterfaz/${keyNorm}.png`, filePNG, 'image/png');
        if (e1) throw new Error(e1.message);

        setP(80, 'Subiendo JPG...');
        const { error: e2 } = await _uploadSeguroPagina(`imginterfaz/${keyNorm}.jpg`, fileJPG, 'image/jpeg');
        if (e2) throw new Error(e2.message);

        setP(100, '✅ ¡Imagen actualizada!', '#00ff88');

        // ── Refrescar todas las referencias a esta imagen ──
        const v        = Date.now();
        const nuevaUrl = `${STORAGE_URL}/imginterfaz/${keyNorm}.png?v=${v}`;

        const gridImg = document.getElementById(`pag-grid-img-${key}`);
        if (gridImg) gridImg.src = nuevaUrl;

        const prevGridImg = document.getElementById(`prev-grid-img-${key}`);
        if (prevGridImg) prevGridImg.src = nuevaUrl;

        if (key === 'icon') {
            const prevIcon = document.getElementById('prev-icon');
            if (prevIcon) prevIcon.src = nuevaUrl;
        }
        if (key === 'bnh-hero') {
            const hdr = document.getElementById('prev-header-bg');
            if (hdr) hdr.style.backgroundImage = `linear-gradient(rgba(5,10,20,.75),rgba(5,10,20,.75)),url('${nuevaUrl}')`;
        }
        if (key === 'thread-rol') {
            const el = document.getElementById('prev-img-thread-rol');
            if (el) el.src = nuevaUrl;
        }
        if (key === 'thread-meta') {
            const el = document.getElementById('prev-img-thread-meta');
            if (el) el.src = nuevaUrl;
        }

        setTimeout(() => window._paginaCerrarUpload(), 1800);

    } catch (e) {
        setP(0, '❌ ' + (e.message || 'Error al subir'), '#ff4444');
        setTimeout(() => window._paginaCerrarUpload(), 3500);
    }
}

function _convertirFormatos(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            try {
                const MAX = 512;
                let w = img.naturalWidth, h = img.naturalHeight;
                if (w > MAX || h > MAX) { const r = Math.min(MAX/w, MAX/h); w = Math.round(w*r); h = Math.round(h*r); }

                const c1 = document.createElement('canvas');
                c1.width = w; c1.height = h;
                c1.getContext('2d').drawImage(img, 0, 0, w, h);

                c1.toBlob(blobPNG => {
                    const c2 = document.createElement('canvas');
                    c2.width = w; c2.height = h;
                    const ctx2 = c2.getContext('2d');
                    ctx2.fillStyle = '#050a14';
                    ctx2.fillRect(0, 0, w, h);
                    ctx2.drawImage(img, 0, 0, w, h);
                    c2.toBlob(blobJPG => {
                        URL.revokeObjectURL(url);
                        resolve({ blobPNG, blobJPG });
                    }, 'image/jpeg', 0.9);
                }, 'image/png');
            } catch (e) { reject(new Error('Error procesando imagen.')); }
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagen inválida.')); };
        img.src = url;
    });
}

// ── Helpers ──────────────────────────────────────────────────
function _esc(str) {
    return String(str)
        .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
        .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Globales expuestas al HTML ────────────────────────────────
function _exponerGlobales() {

    window._paginaMod = (campo, valor) => {
        marcarCambioPagina(campo, valor);

        const mapa = {
            titulo:      'prev-titulo',
            subtitulo:   'prev-subtitulo',
            lore:        'prev-lore',
            nombre_rol:  'prev-nombre-rol',
            nombre_meta: 'prev-nombre-meta',
        };
        const el = document.getElementById(mapa[campo]);
        if (el) el.textContent = valor;

        const status = document.getElementById('pag-status');
        if (status) status.textContent = '● Cambios sin guardar';
        window.dispatchEvent(new Event('devDataChanged'));
    };

    window._paginaGuardar = async () => {
        const btn    = document.getElementById('btn-guardar-pagina');
        const status = document.getElementById('pag-status');
        if (!haycambiosPagina()) {
            if (status) status.textContent = '✓ Sin cambios';
            return;
        }
        if (btn) { btn.textContent = '⏳ Guardando...'; btn.disabled = true; }
        const res = await guardarConfigUI();
        if (res.ok) {
            if (status) { status.style.color = '#00ff88'; status.textContent = '✅ Guardado'; }
            setTimeout(() => { if (status) { status.style.color = '#888'; status.textContent = ''; } }, 3000);
        } else {
            if (status) { status.style.color = '#ff4444'; status.textContent = `❌ ${res.msg}`; }
        }
        if (btn) { btn.textContent = '💾 GUARDAR TEXTOS EN LA BD'; btn.disabled = false; }
    };

    window._paginaAbrirUpload = (key, archivo, label, zona) => {
        _uploadTarget = { key, archivo };
        document.getElementById('pag-upload-nombre').textContent     = label;
        document.getElementById('pag-upload-zona-label').textContent = zona;
        document.getElementById('pag-upload-panel').style.display    = 'block';
        document.getElementById('pag-upload-progress').style.display = 'none';
        document.getElementById('pag-prog-fill').style.width         = '0%';
        document.getElementById('pag-prog-msg').textContent          = '';
        const contenedor = document.getElementById('content-pagina');
        if (contenedor) contenedor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window._paginaCerrarUpload = () => {
        _uploadTarget = null;
        document.getElementById('pag-upload-panel').style.display = 'none';
        const fi = document.getElementById('pag-file-input');
        if (fi) fi.value = '';
    };

    window._paginaHandleDrop = async (e) => {
        e.preventDefault();
        document.getElementById('pag-drop-zone').classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) await _ejecutarSubidaPagina(file);
    };

    window._paginaFileSelect = async (e) => {
        const file = e.target.files[0];
        if (file) await _ejecutarSubidaPagina(file);
        e.target.value = '';
    };
}
