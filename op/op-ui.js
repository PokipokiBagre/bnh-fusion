// ============================================================
// op/op-ui.js — Renderizado de UI para OP Chat
// ============================================================
import { opState, avatarUrl, imageUrl, STORAGE_URL } from './op-state.js';
import { renderMsgMarkup } from './op-markup.js';

const $ = id => document.getElementById(id);
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ── Sidebar: lista de conversaciones ─────────────────────────
export function renderConvList() {
    const wrap = $('op-conv-list');
    if (!wrap) return;
    const convs = opState.conversaciones;
    if (!convs.length) {
        wrap.innerHTML = `<div style="padding:20px;color:var(--gray-500,#adb5bd);font-size:0.82em;text-align:center;padding:20px;">Sin conversaciones</div>`;
        return;
    }
    wrap.innerHTML = convs.map(c => {
        const activa = c.id === opState.convActual;
        return `
<div class="op-conv-item ${activa?'activa':''}" data-id="${c.id}" onclick="window._opSelConv(${c.id})">
    <div class="op-conv-title">${esc(c.titulo)}</div>
    <div class="op-conv-actions">
        <button class="op-icon-btn" title="Limpiar" onclick="event.stopPropagation();window._opLimpiarConv(${c.id})">🧹</button>
        ${c.id !== 1 ? `<button class="op-icon-btn danger" title="Eliminar" onclick="event.stopPropagation();window._opEliminarConv(${c.id})">🗑</button>` : ''}
    </div>
</div>`;
    }).join('');
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

    msgs.forEach(msg => {
        const fecha = new Date(msg.creado_en);
        const fechaStr = fecha.toLocaleDateString('es', { day:'numeric', month:'short' });
        if (fechaStr !== ultimaFecha) {
            ultimaFecha = fechaStr;
            html += `<div class="op-date-sep">${fechaStr}</div>`;
        }

        const propio = esPropio(msg.autor_id);
        const hora   = fecha.toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' });

        html += `
<div class="op-msg ${propio?'propio':'ajeno'}" data-id="${msg.id}">
    <div class="op-msg-bubble">
        ${!propio ? `<div class="op-msg-autor">${esc(msg.autor_nombre)}</div>` : ''}
        ${msg.imagen_path ? `<img src="${imageUrl(msg.imagen_path)}" class="op-msg-img"
            onclick="window._opVerImagen('${imageUrl(msg.imagen_path)}')" alt="imagen">` : ''}
        ${msg.contenido ? `<div class="op-msg-texto">${renderMsgMarkup(msg.contenido)}</div>` : ''}
        <div class="op-msg-meta">
            <span class="op-msg-hora">${hora}</span>
            <button class="op-msg-del" onclick="window._opEliminarMsg(${msg.id})" title="Eliminar">✕</button>
        </div>
    </div>
</div>`;
    });

    wrap.innerHTML = html;
    // Scroll al fondo
    requestAnimationFrame(() => { wrap.scrollTop = wrap.scrollHeight; });
}

export function appendMensaje(msg) {
    const wrap = $('op-messages-list');
    if (!wrap) return;
    const propio = msg.autor_id === opState.perfil?.id;
    const hora   = new Date(msg.creado_en).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' });

    const div = document.createElement('div');
    div.className = `op-msg ${propio?'propio':'ajeno'}`;
    div.dataset.id = msg.id;
    div.innerHTML = `
<div class="op-msg-bubble">
    ${!propio ? `<div class="op-msg-autor">${esc(msg.autor_nombre)}</div>` : ''}
    ${msg.imagen_path ? `<img src="${imageUrl(msg.imagen_path)}" class="op-msg-img"
        onclick="window._opVerImagen('${imageUrl(msg.imagen_path)}')" alt="imagen">` : ''}
    ${msg.contenido ? `<div class="op-msg-texto">${renderMsgMarkup(msg.contenido)}</div>` : ''}
    <div class="op-msg-meta">
        <span class="op-msg-hora">${hora}</span>
        <button class="op-msg-del" onclick="window._opEliminarMsg(${msg.id})" title="Eliminar">✕</button>
    </div>
</div>`;
    wrap.appendChild(div);
    wrap.scrollTop = wrap.scrollHeight;
}

// ── Galería ───────────────────────────────────────────────────
export function renderGaleria() {
    const wrap = $('op-galeria-grid');
    if (!wrap) return;
    const allImgs = Object.values(opState.imagenesGaleria).flat();

    if (!allImgs.length) {
        wrap.innerHTML = `<div style="color:rgba(255,255,255,0.3);font-size:0.85em;grid-column:1/-1;text-align:center;padding:30px;">
            Sin imágenes guardadas</div>`;
        return;
    }

    // Agrupar por op_nombre
    const grupos = {};
    allImgs.forEach(img => {
        if (!grupos[img.op_nombre]) grupos[img.op_nombre] = [];
        grupos[img.op_nombre].push(img);
    });

    wrap.innerHTML = Object.entries(grupos).map(([opNombre, imgs]) => `
<div class="op-galeria-grupo">
    <div class="op-galeria-titulo">📁 ${esc(opNombre)}</div>
    <div class="op-galeria-items">
        ${imgs.map(img => `
        <div class="op-galeria-item" title="${esc(img.nombre)}">
            <img src="${esc(img.url)}" alt="${esc(img.nombre)}" onclick="window._opVerImagen('${esc(img.url)}')">
            <div class="op-galeria-item-name">${esc(img.nombre)}</div>
            <div class="op-galeria-item-actions">
                <button onclick="window._opEnviarDesdeGaleria(${img.id})" title="Enviar al chat">💬</button>
                <button onclick="window._opEliminarImgGaleria(${img.id},'${esc(img.path)}')" title="Eliminar">🗑</button>
            </div>
        </div>`).join('')}
    </div>
</div>`).join('');
}

// ── Ajustes ───────────────────────────────────────────────────
export function renderAjustes() {
    const wrap = $('op-ajustes-content');
    if (!wrap) return;
    const p = opState.perfil;
    wrap.innerHTML = `
<div class="op-ajustes-card">
    <h3 class="op-ajustes-title">⚙ Perfil OP</h3>

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

// ── Lightbox ──────────────────────────────────────────────────
export function showLightbox(url) {
    let lb = $('op-lightbox');
    if (!lb) {
        lb = document.createElement('div');
        lb.id = 'op-lightbox';
        lb.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:99999;
            display:flex;align-items:center;justify-content:center;cursor:zoom-out;
            backdrop-filter:blur(4px);`;
        lb.onclick = () => lb.remove();
        document.body.appendChild(lb);
    }
    lb.innerHTML = `<img src="${esc(url)}" style="max-width:90vw;max-height:90vh;
        border-radius:8px;box-shadow:0 0 60px rgba(108,52,131,0.5);">`;
}
