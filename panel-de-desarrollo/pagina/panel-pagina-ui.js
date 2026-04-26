// ============================================================
// panel-pagina-ui.js — Editor de Página con preview reactivo
// ============================================================

import { paginaState }    from './panel-pagina-state.js';
import { cargarConfigUI, guardarConfigUI, marcarCambioPagina, haycambiosPagina } from './panel-pagina-logic.js';
import { supabase, currentConfig } from '../../bnh-auth.js';

const BUCKET      = 'imagenes-bnh';
const STORAGE_URL = currentConfig.storageUrl;

// Mapa actualizado (sin Misiones)
const IMAGENES_INDEX = [
    { key: 'icon',         archivo: 'icon.png',         label: 'Icono / Favicon',     zona: 'Favicon del sitio' },
    { key: 'bnh-hero',     archivo: 'bnh-hero.png',     label: 'Fondo del Hero',       zona: 'Imagen de fondo del header principal' },
    { key: 'thread-rol',   archivo: 'thread-rol.png',   label: 'Tarjeta Hilo Rol',     zona: 'Sección "Hilos Activos" → Rol' },
    { key: 'thread-meta',  archivo: 'thread-meta.png',  label: 'Tarjeta Meta',         zona: 'Sección "Hilos Activos" → Meta' },
    { key: 'historial',    archivo: 'historial.png',    label: 'Tarjeta Historial',    zona: 'Grid principal → Historial' },
    { key: 'fichas',       archivo: 'fichas.png',       label: 'Tarjeta Fichas',       zona: 'Grid principal → Fichas' },
    { key: 'tags',         archivo: 'tags.png',         label: 'Tarjeta Tags',         zona: 'Grid principal → Tags' },
    { key: 'medallas',     archivo: 'medallas.png',     label: 'Tarjeta Medallas',     zona: 'Grid principal → Medallas' },
    { key: 'fusion',       archivo: 'fusion.png',       label: 'Tarjeta Fusión',       zona: 'Grid principal → Fusión' },
    { key: 'combate',      archivo: 'combate.png',      label: 'Tarjeta Combate',      zona: 'Grid principal → Combate' },
    { key: 'panel-dev',    archivo: 'panel-dev.png',    label: 'Tarjeta Panel Máster', zona: 'Grid principal → Panel Máster (solo OP)' },
    { key: 'op-chat',    archivo: 'op-chat.png',        label: 'Tarjeta OP Chat',      zona: 'Grid principal → OP Chat (solo OP)' },
    { key: 'no_encontrado',archivo: 'no_encontrado.png',label: 'Imagen "No encontrado"', zona: 'Fallback cuando falta una imagen' },
];

export async function initPaginaDev() {
    await cargarConfigUI();
    _exponerGlobales();
}

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
                <p style="color:var(--gray-500); font-size:0.85em; margin:0 0 14px 0;">
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
                <span id="pag-status" style="font-weight:600; font-size:0.9em; color:var(--gray-500);"></span>
            </div>
        </div>

        <div style="position:sticky; top:20px; display:flex; flex-direction:column; gap:16px;">

            <div class="pag-card" style="padding:14px;">
                <div class="pag-card-title" style="margin-bottom:12px;">👁 Previsualización en Vivo</div>
                <div style="overflow:hidden; border-radius:8px; height:360px; border: 1.5px solid var(--gray-200);">
                    <div style="transform-origin:top left; transform:scale(0.53); width:188%;">
                        <div id="pag-preview">${_renderPreviewCompleto(c)}</div>
                    </div>
                </div>
            </div>

            <div id="pag-upload-panel" class="oculto">
                <div class="pag-card" style="border-color: var(--green);">
                    <div class="pag-card-title" style="color: var(--green-dark); margin-bottom: 6px;">
                        📤 Subir: <span id="pag-upload-nombre" style="color: var(--gray-900);"></span>
                    </div>
                    <p id="pag-upload-zona-label" style="color: var(--gray-500); font-size: 0.85em; margin: 0 0 12px 0;"></p>
                    
                    <div id="pag-drop-zone" class="pag-drop-zone"
                        onclick="document.getElementById('pag-file-input').click()"
                        ondragover="event.preventDefault(); this.classList.add('drag-over')"
                        ondragleave="this.classList.remove('drag-over')"
                        ondrop="window._paginaHandleDrop(event)">
                        <div style="font-size: 2.5em; margin-bottom: 10px;">🖼️</div>
                        <p style="color: var(--green-dark); font-weight: bold; font-size: 0.95em; margin: 0 0 4px 0;">Arrastra aquí o haz clic</p>
                        <p style="color: var(--gray-500); font-size: 0.8em; margin: 0;">JPG, PNG, WEBP</p>
                    </div>
                    <input type="file" id="pag-file-input" accept="image/*" style="display:none" onchange="window._paginaFileSelect(event)">
                    
                    <div id="pag-upload-progress" class="oculto" style="margin-top: 14px;">
                        <div style="height: 6px; background: var(--gray-200); border-radius: 4px; overflow: hidden;">
                            <div id="pag-prog-fill" style="height: 100%; width: 0%; background: var(--green); transition: width 0.3s;"></div>
                        </div>
                        <p id="pag-prog-msg" style="color: var(--gray-700); font-size: 0.8em; text-align: center; margin: 6px 0 0 0; font-weight: 600;"></p>
                    </div>
                    
                    <button onclick="window._paginaCerrarUpload()" class="btn btn-outline" style="margin-top: 14px; width: 100%; justify-content: center;">
                        Cancelar
                    </button>
                </div>
            </div>

        </div>
    </div>

    <style>
        .pag-card          { background: var(--white); border: 1.5px solid var(--gray-200); border-radius: var(--radius-lg); padding: 20px; box-shadow: var(--shadow-sm); }
        .pag-card-title    { color: var(--green-dark); font-family: inherit; font-size: 1.05em; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 16px 0; font-weight: 700; border-bottom: 2px solid var(--green-pale); padding-bottom: 8px; }
        .pag-label         { display: block; color: var(--gray-700); font-size: 0.8em; font-weight: 600; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 10px; }
        .pag-input, .pag-textarea { width: 100%; box-sizing: border-box; background: var(--white); color: var(--gray-900); border: 1.5px solid var(--gray-300); border-radius: var(--radius); padding: 10px 14px; font-family: inherit; font-size: 0.9em; outline: none; transition: border-color 0.2s; }
        .pag-input:focus, .pag-textarea:focus { border-color: var(--green); box-shadow: 0 0 0 3px var(--green-pale); }
        .pag-textarea      { min-height: 80px; resize: vertical; }
        .pag-btn-guardar   { background: var(--green); color: white; border: 2px solid var(--green); padding: 12px 24px; border-radius: var(--radius); font-family: inherit; font-weight: 700; font-size: 0.95em; cursor: pointer; transition: all 0.2s; }
        .pag-btn-guardar:hover { background: var(--green-dark); border-color: var(--green-dark); transform: translateY(-1px); box-shadow: var(--shadow-md); }
        .pag-img-card      { background: var(--white); border: 1.5px solid var(--gray-200); border-radius: var(--radius); padding: 12px; text-align: center; cursor: pointer; transition: all 0.15s; position: relative; box-shadow: var(--shadow-sm); }
        .pag-img-card:hover{ border-color: var(--green); transform: translateY(-2px); box-shadow: var(--shadow-md); }
        .pag-img-card img  { width: 70px; height: 70px; object-fit: cover; border-radius: 6px; border: 1px solid var(--gray-300); display: block; margin: 0 auto 8px auto; }
        .pag-img-label     { font-size: 0.7em; color: var(--gray-900); font-weight: 600; line-height: 1.3; }
        .pag-img-zona      { font-size: 0.65em; color: var(--gray-500); margin-top: 4px; font-style: italic; }
        .pag-upload-badge  { position: absolute; top: -8px; right: -8px; background: var(--red); color: white; font-size: 0.65em; font-weight: bold; padding: 3px 6px; border-radius: 12px; border: 2px solid white; box-shadow: var(--shadow-sm); }
        .pag-drop-zone     { border: 2px dashed var(--gray-300); border-radius: var(--radius-lg); padding: 30px 10px; text-align: center; cursor: pointer; transition: 0.2s; background: var(--gray-100); }
        .pag-drop-zone:hover, .pag-drop-zone.drag-over { background: var(--green-pale); border-color: var(--green); }
    </style>`;
}

function _renderImgCard(img) {
    const v       = Date.now();
    const keyNorm = _norm(img.key);
    const url     = `${STORAGE_URL}/imginterfaz/${keyNorm}.png?v=${v}`;
    const fbStorage = `${STORAGE_URL}/imginterfaz/no_encontrado.png`;
    const fbSVG     = `data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2270%22 height=%2270%22%3E%3Crect width=%2270%22 height=%2270%22 fill=%22%23f8f9fa%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23adb5bd%22 font-size=%2222%22%3E%3F%3C/text%3E%3C/svg%3E`;

    const safeKey  = img.key.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const safeLbl  = img.label.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const safeZona = img.zona.replace(/'/g, "\\'").replace(/"/g, '&quot;');

    let onErrorScript = `this.onerror=function(){ this.onerror=null; this.src='${fbSVG}'; }; this.src='${fbStorage}';`;
    if (img.key === 'no_encontrado') onErrorScript = `this.onerror=null; this.src='${fbSVG}';`;

    return `
    <div class="pag-img-card" data-imgkey="${img.key}" onclick="window._paginaAbrirUpload('${safeKey}','${img.archivo}','${safeLbl}','${safeZona}')" title="${safeZona}">
        <span class="pag-upload-badge">📤</span>
        <img id="pag-grid-img-${img.key}" src="${url}" onerror="${onErrorScript}">
        <div class="pag-img-label">${img.label}</div>
        <div class="pag-img-zona">${img.zona}</div>
    </div>`;
}

function _renderPreviewCompleto(c) {
    const v        = Date.now();
    const bgUrl    = `${STORAGE_URL}/imginterfaz/bnh-hero.png?v=${v}`;
    const fb       = `${STORAGE_URL}/imginterfaz/no_encontrado.png`;
    const fbSVG    = `data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2270%22 height=%2270%22%3E%3Crect width=%2270%22 height=%2270%22 fill=%22%23f8f9fa%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23adb5bd%22 font-size=%2222%22%3E%3F%3C/text%3E%3C/svg%3E`;

    const gridItems = [
        { key:'historial',  label:'HISTORIAL' },
        { key:'fichas',     label:'FICHAS' },
        { key:'tags',       label:'TAGS' },
        { key:'medallas',   label:'MEDALLAS' },
        { key:'fusion',     label:'FUSIÓN' },
        { key:'combate',    label:'COMBATE' },
        { key:'panel-dev',  label:'PANEL MÁSTER' }
    ];

    const onErrorGeneral = `this.onerror=function(){ this.onerror=null; this.src='${fbSVG}'; }; this.src='${fb}';`;

    return `
    <div style="background:#f8f9fa; font-family:'Inter',sans-serif; color:#212529; border-radius:10px; overflow:hidden; border:1px solid #dee2e6; box-shadow:0 4px 12px rgba(0,0,0,0.1);">

        <div id="prev-header-bg" style="background:linear-gradient(rgba(255,255,255,0.85), rgba(248,249,250,1)), url('${bgUrl}') center/cover; padding:50px 20px 20px; text-align:center;">
            <h1 id="prev-titulo" style="font-family:'Cinzel',serif; font-size:3em; margin:0 0 10px 0; color:#145a32;">
                ${_esc(c.titulo||'BNH')}
            </h1>
            <h3 id="prev-subtitulo" style="color:#27ae60; font-size:0.85em; letter-spacing:2px; text-transform:uppercase; margin:0 0 16px 0; font-weight:700;">
                ${_esc(c.subtitulo||'Sistema de Rol')}
            </h3>
            <p id="prev-lore" style="color:#495057; font-size:0.85em; font-style:italic; max-width:80%; margin:0 auto;">
                ${_esc(c.lore||'Descripción de la campaña...')}
            </p>
        </div>

        <div style="display:flex; justify-content:center; gap:16px; margin:24px 0;">
            <div style="border:1.5px solid #dee2e6; border-radius:8px; padding:8px 30px; font-weight:bold; font-size:0.8em; color:#145a32; background:white; position:relative; overflow:hidden;">
                <img id="prev-img-thread-rol" src="${STORAGE_URL}/imginterfaz/thread-rol.png?v=${v}" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; opacity:0.15;" onerror="${onErrorGeneral}">
                <span id="prev-nombre-rol" style="position:relative; z-index:1; letter-spacing:1px;">${_esc(c.nombre_rol||'ROL ACTUAL')}</span>
            </div>
            <div style="border:1.5px solid #dee2e6; border-radius:8px; padding:8px 30px; font-weight:bold; font-size:0.8em; color:#145a32; background:white; position:relative; overflow:hidden;">
                <img id="prev-img-thread-meta" src="${STORAGE_URL}/imginterfaz/thread-meta.png?v=${v}" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; opacity:0.15;" onerror="${onErrorGeneral}">
                <span id="prev-nombre-meta" style="position:relative; z-index:1; letter-spacing:1px;">${_esc(c.nombre_meta||'META')}</span>
            </div>
        </div>

        <div style="text-align:center; font-family:'Cinzel',serif; font-weight:bold; color:#495057; font-size:1em; margin-bottom:16px; letter-spacing:1px;">SISTEMAS</div>

        <div style="padding:0 24px 40px; display:flex; flex-wrap:wrap; justify-content:center; gap:12px;">
            ${gridItems.map(gi => `
            <div style="background:white; border:1px solid #dee2e6; border-radius:8px; overflow:hidden; width:calc(20% - 10px); min-width:120px; box-shadow:0 2px 5px rgba(0,0,0,0.05); text-align:left;">
                <div style="height:60px; background:#e9ecef; position:relative;">
                    <img id="prev-grid-img-${gi.key}" src="${STORAGE_URL}/imginterfaz/${gi.key}.png?v=${v}" onerror="${onErrorGeneral}" style="width:100%; height:100%; object-fit:cover;">
                </div>
                <div style="padding:10px; font-family:'Cinzel',serif; font-size:0.6em; font-weight:bold; color:#145a32;">
                    ${gi.label}
                </div>
            </div>`).join('')}
        </div>
    </div>`;
}

let _uploadTarget = null;
function _norm(str) {
    return str ? str.toString().trim().toLowerCase().replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e').replace(/[íìïî]/g,'i').replace(/[óòöô]/g,'o').replace(/[úùüû]/g,'u').replace(/[ñ]/g,'n').replace(/\s+/g,'_').replace(/[^a-z0-9_\-]/g,'') : '';
}

function _uploadSeguroPagina(ruta, file, tipoContenido) {
    const solicitud = supabase.storage.from(BUCKET).upload(ruta, file, { upsert: true, contentType: tipoContenido, cacheControl: '3600' });
    let timerId;
    const tiempoLimite = new Promise((_, reject) => { timerId = setTimeout(() => reject(new Error("Conexión interrumpida")), 25000); });
    return Promise.race([solicitud, tiempoLimite]).finally(() => clearTimeout(timerId));
}

async function _ejecutarSubidaPagina(file) {
    if (!_uploadTarget) return;
    const { key } = _uploadTarget;
    const keyNorm = _norm(key);

    const progDiv  = document.getElementById('pag-upload-progress');
    const progFill = document.getElementById('pag-prog-fill');
    const progMsg  = document.getElementById('pag-prog-msg');

    const setP = (pct, msg, color = 'var(--gray-700)') => {
        progDiv.classList.remove('oculto');
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

        setP(100, '✅ ¡Imagen actualizada!', 'var(--green-dark)');

        const v = Date.now();
        const nuevaUrl = `${STORAGE_URL}/imginterfaz/${keyNorm}.png?v=${v}`;

        const gridImg = document.getElementById(`pag-grid-img-${key}`);
        if (gridImg) gridImg.src = nuevaUrl;

        const prevGridImg = document.getElementById(`prev-grid-img-${key}`);
        if (prevGridImg) prevGridImg.src = nuevaUrl;

        if (key === 'bnh-hero') {
            const hdr = document.getElementById('prev-header-bg');
            if (hdr) hdr.style.backgroundImage = `linear-gradient(rgba(255,255,255,0.85), rgba(248,249,250,1)),url('${nuevaUrl}')`;
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
        setP(0, '❌ ' + (e.message || 'Error al subir'), 'var(--red)');
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
                    ctx2.fillStyle = '#f8f9fa';
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

function _esc(str) { return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function _exponerGlobales() {
    window._paginaMod = (campo, valor) => {
        marcarCambioPagina(campo, valor);
        const mapa = { titulo: 'prev-titulo', subtitulo: 'prev-subtitulo', lore: 'prev-lore', nombre_rol: 'prev-nombre-rol', nombre_meta: 'prev-nombre-meta' };
        const el = document.getElementById(mapa[campo]);
        if (el) el.textContent = valor;
        const status = document.getElementById('pag-status');
        if (status) { status.textContent = '● Cambios sin guardar'; status.style.color = 'var(--orange)'; }
    };

    window._paginaGuardar = async () => {
        const btn    = document.getElementById('btn-guardar-pagina');
        const status = document.getElementById('pag-status');
        if (!haycambiosPagina()) {
            if (status) { status.textContent = '✓ Sin cambios'; status.style.color = 'var(--gray-500)'; }
            return;
        }
        if (btn) { btn.textContent = '⏳ Guardando...'; btn.disabled = true; }
        const res = await guardarConfigUI();
        if (res.ok) {
            if (status) { status.style.color = 'var(--green-dark)'; status.textContent = '✅ Guardado'; }
            setTimeout(() => { if (status) { status.style.color = 'var(--gray-500)'; status.textContent = ''; } }, 3000);
        } else {
            if (status) { status.style.color = 'var(--red)'; status.textContent = `❌ ${res.msg}`; }
        }
        if (btn) { btn.textContent = '💾 GUARDAR TEXTOS EN LA BD'; btn.disabled = false; }
    };

    window._paginaAbrirUpload = (key, archivo, label, zona) => {
        _uploadTarget = { key, archivo };
        document.getElementById('pag-upload-nombre').textContent     = label;
        document.getElementById('pag-upload-zona-label').textContent = zona;
        document.getElementById('pag-upload-panel').classList.remove('oculto');
        document.getElementById('pag-upload-progress').classList.add('oculto');
        document.getElementById('pag-prog-fill').style.width         = '0%';
        document.getElementById('pag-prog-msg').textContent          = '';
        const contenedor = document.getElementById('content-pagina');
        if (contenedor) contenedor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window._paginaCerrarUpload = () => {
        _uploadTarget = null;
        document.getElementById('pag-upload-panel').classList.add('oculto');
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
