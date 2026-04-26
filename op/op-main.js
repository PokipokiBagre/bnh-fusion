// ============================================================
// op/op-main.js — Controlador principal del OP Chat
// ============================================================
import { bnhAuth, supabase } from '../bnh-auth.js';
import { opState, STORAGE_URL } from './op-state.js';
import {
    cargarPerfil, guardarPerfil, cargarConversaciones,
    crearConversacion, eliminarConversacion, limpiarConversacion,
    cargarMensajes, enviarMensaje, eliminarMensaje,
    cargarImagenesGaleria, subirImagenGaleria, eliminarImagenGaleria,
    subirAvatarOP, suscribirMensajes
} from './op-data.js';
import {
    renderConvList, renderMensajes, appendMensaje,
    renderGaleria, renderAjustes, renderSelectorImagenes, showLightbox
} from './op-ui.js';
import { mountMarkupAC } from './op-markup.js';

const $ = id => document.getElementById(id);
let _pendingImgId = null; // imagen de galería seleccionada para enviar

// ── Init ──────────────────────────────────────────────────────
export async function initOP() {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    window._STORAGE_URL = STORAGE_URL;

    // Cargar perfil (crear si no existe)
    let perfil = await cargarPerfil(user.id);
    if (!perfil) {
        await guardarPerfil(user.id, { nombre: 'OP', avatar_path: null });
        perfil = { id: user.id, nombre: 'OP', avatar_path: null };
    }
    opState.perfil = perfil;

    // Mostrar avatar + nombre en el sidebar header
    _renderPerfilPill();

    // Cargar PJs para autocomplete
    const { data: grupos } = await supabase.from('personajes_refinados')
        .select('nombre_refinado').order('nombre_refinado');
    opState.grupos = grupos || [];

    // Cargar datos
    await Promise.all([
        _cargarConvs(),
        _cargarGaleria(),
    ]);

    // Tab inicial
    _renderTab('chat');
    _exponerGlobales();
    _mountInput();
}

// ── Cargar conversaciones y seleccionar la primera ────────────
async function _cargarConvs() {
    opState.conversaciones = await cargarConversaciones();
    if (!opState.conversaciones.length) {
        // Crear "General" si no existe
        const conv = await crearConversacion('General');
        if (conv) opState.conversaciones = [conv];
    }
    const firstId = opState.conversaciones[0]?.id;
    if (firstId) await _selConv(firstId);
    renderConvList();
}

async function _cargarGaleria() {
    const imgs = await cargarImagenesGaleria();
    opState.imagenesGaleria = {};
    imgs.forEach(img => {
        if (!opState.imagenesGaleria[img.op_id]) opState.imagenesGaleria[img.op_id] = [];
        opState.imagenesGaleria[img.op_id].push(img);
    });
}

// ── Seleccionar conversación ──────────────────────────────────
async function _selConv(id) {
    // Desuscribir anterior
    if (opState.realtimeSub) {
        supabase.removeChannel(opState.realtimeSub);
        opState.realtimeSub = null;
    }
    opState.convActual = id;
    opState.mensajes   = await cargarMensajes(id);
    renderMensajes();

    // Suscripción realtime
    opState.realtimeSub = suscribirMensajes(id, msg => {
        // Solo agregar si no es nuestro (el nuestro ya se agregó al enviar)
        if (msg.autor_id !== opState.perfil?.id) {
            appendMensaje(msg);
        }
    });

    // Actualizar título del panel
    const conv = opState.conversaciones.find(c => c.id === id);
    const el = $('op-chat-titulo');
    if (el && conv) el.textContent = conv.titulo;
}

// ── Tabs ──────────────────────────────────────────────────────
function _renderTab(tab) {
    opState.tab = tab;
    ['chat','galeria','ajustes'].forEach(t => {
        const btn = $(`op-tab-${t}`);
        if (btn) btn.classList.toggle('active', t === tab);
        const pnl = $(`op-panel-${t}`);
        if (pnl) pnl.style.display = t === tab ? 'flex' : 'none';
    });
    if (tab === 'ajustes')  renderAjustes();
    if (tab === 'galeria')  renderGaleria();
}

// ── Montar input + autocomplete ───────────────────────────────
function _mountInput() {
    const ta = $('op-msg-input');
    if (!ta) return;
    mountMarkupAC(ta);
    ta.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            window._opEnviar();
        }
    });
}

// ── Enviar mensaje ────────────────────────────────────────────
async function _enviar() {
    if (!opState.convActual || !opState.perfil) return;
    const ta       = $('op-msg-input');
    const contenido = ta?.value.trim() || '';

    // Imagen adjunta desde galería
    let imagenPath = null;
    if (_pendingImgId !== null) {
        const allImgs = Object.values(opState.imagenesGaleria).flat();
        const img = allImgs.find(i => i.id === _pendingImgId);
        imagenPath = img?.path || null;
        _pendingImgId = null;
        $('op-img-preview')?.remove();
    }

    // Imagen adjunta desde archivo
    const fileInput = $('op-file-input');
    if (fileInput?.files?.length) {
        const file = fileInput.files[0];
        const res = await subirImagenGaleria(
            file, opState.perfil.id, opState.perfil.nombre,
            file.name.replace(/\.[^.]+$/, '')
        );
        if (res.ok) {
            imagenPath = res.imagen.path;
            // Refrescar galería
            await _cargarGaleria();
            renderGaleria();
        }
        fileInput.value = '';
        $('op-file-preview')?.remove();
    }

    if (!contenido && !imagenPath) return;

    const msg = await enviarMensaje({
        convId:      opState.convActual,
        autorId:     opState.perfil.id,
        autorNombre: opState.perfil.nombre,
        contenido:   contenido || null,
        imagenPath,
    });

    if (msg) {
        if (ta) ta.value = '';
        appendMensaje(msg);
        // Actualizar ultimo_msg en sidebar
        const conv = opState.conversaciones.find(c => c.id === opState.convActual);
        if (conv) conv.ultimo_msg = msg.creado_en;
        opState.conversaciones.sort((a, b) => new Date(b.ultimo_msg) - new Date(a.ultimo_msg));
        renderConvList();
    }
}

// ── Exponer funciones globales ─────────────────────────────────
function _exponerGlobales() {
    window._opTab        = t => _renderTab(t);
    window._opSelConv    = async id => { await _selConv(id); renderConvList(); };
    window._opEnviar     = _enviar;
    window._opGetPerfil  = () => opState.perfil;

    window._opNuevaConv  = async () => {
        const titulo = prompt('Nombre de la conversación:');
        if (!titulo?.trim()) return;
        const conv = await crearConversacion(titulo.trim());
        if (conv) {
            opState.conversaciones.unshift(conv);
            renderConvList();
            await _selConv(conv.id);
        }
    };

    window._opLimpiarConv = async id => {
        if (!confirm('¿Limpiar todos los mensajes?')) return;
        await limpiarConversacion(id);
        if (id === opState.convActual) { opState.mensajes = []; renderMensajes(); }
    };

    window._opEliminarConv = async id => {
        if (!confirm('¿Eliminar esta conversación?')) return;
        await eliminarConversacion(id);
        opState.conversaciones = opState.conversaciones.filter(c => c.id !== id);
        if (id === opState.convActual) {
            const next = opState.conversaciones[0];
            if (next) await _selConv(next.id);
            else { opState.convActual = null; opState.mensajes = []; renderMensajes(); }
        }
        renderConvList();
    };

    window._opEliminarMsg = async id => {
        await eliminarMensaje(id);
        opState.mensajes = opState.mensajes.filter(m => m.id !== id);
        const el = document.querySelector(`.op-msg[data-id="${id}"]`);
        if (el) el.remove();
    };

    window._opVerImagen = url => showLightbox(url);

    // Galería
    window._opSeleccionarImg = id => {
        _pendingImgId = id;
        const allImgs = Object.values(opState.imagenesGaleria).flat();
        const img = allImgs.find(i => i.id === id);
        if (!img) return;
        $('op-img-selector').style.display = 'none';
        // Mostrar preview
        document.getElementById('op-img-preview')?.remove();
        const prev = document.createElement('div');
        prev.id = 'op-img-preview';
        prev.style.cssText = `display:flex;align-items:center;gap:8px;padding:6px 10px;
            background:rgba(108,52,131,0.2);border-radius:8px;margin-bottom:4px;`;
        prev.innerHTML = `<img src="${img.url}" style="height:48px;border-radius:6px;object-fit:cover;">
            <span style="font-size:0.78em;color:#e2d9f3;flex:1;">${img.nombre}</span>
            <button onclick="_pendingImgId=null;this.closest('#op-img-preview').remove()"
                style="background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;">✕</button>`;
        $('op-input-wrap')?.insertAdjacentElement('beforebegin', prev);
    };

    window._opEnviarDesdeGaleria = id => {
        _pendingImgId = id;
        _renderTab('chat');
        window._opSeleccionarImg(id);
    };

    window._opEliminarImgGaleria = async (id, path) => {
        if (!confirm('¿Eliminar esta imagen de la galería?')) return;
        await eliminarImagenGaleria(id, path);
        await _cargarGaleria();
        renderGaleria();
        // Actualizar selector si está abierto
        const sel = $('op-img-selector');
        if (sel?.style.display !== 'none') {
            sel.outerHTML = renderSelectorImagenes();
        }
    };

    window._opMostrarGaleria = () => {
        const sel = $('op-img-selector');
        if (!sel) return;
        sel.innerHTML = renderSelectorImagenes().replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '');
        sel.style.display = sel.style.display === 'none' ? 'block' : 'none';
    };

    window._opSubirAGaleria = async () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = async () => {
            const file = input.files[0]; if (!file) return;
            const nombre = prompt('Nombre para esta imagen:', file.name.replace(/\.[^.]+$/, '')) || file.name;
            const res = await subirImagenGaleria(file, opState.perfil.id, opState.perfil.nombre, nombre);
            if (res.ok) {
                await _cargarGaleria();
                renderGaleria();
                toast('✅ Imagen guardada en galería', 'ok');
            } else toast('❌ ' + res.msg, 'error');
        };
        input.click();
    };

    window._opFileInput = () => {
        const fi = $('op-file-input');
        if (fi) { fi.value = ''; fi.click(); }
    };

    // Ajustes
    window._opPreviewAvatar = input => {
        const file = input.files[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        const prev = $('op-avatar-preview');
        if (prev) prev.src = url;
    };

    window._opGuardarPerfil = async () => {
        const nombre    = $('op-nombre-input')?.value.trim();
        const fileInput = $('op-avatar-file');
        const msgEl     = $('op-ajustes-msg');
        if (!nombre) { if (msgEl) { msgEl.style.color='#e74c3c'; msgEl.textContent='El nombre no puede estar vacío.'; } return; }

        let avatarPath = opState.perfil?.avatar_path;
        if (fileInput?.files?.length) {
            const path = await subirAvatarOP(fileInput.files[0], opState.perfil.id);
            if (path) avatarPath = path;
        }

        const ok = await guardarPerfil(opState.perfil.id, { nombre, avatar_path: avatarPath });
        if (ok) {
            opState.perfil.nombre      = nombre;
            opState.perfil.avatar_path = avatarPath;
            if (msgEl) { msgEl.style.color='#27ae60'; msgEl.textContent='✅ Perfil actualizado'; }
        } else {
            if (msgEl) { msgEl.style.color='#e74c3c'; msgEl.textContent='Error al guardar.'; }
        }
    };
}

function _renderPerfilPill() {
    const pill = document.getElementById('op-perfil-pill');
    if (!pill || !opState.perfil) return;
    const p = opState.perfil;
    pill.innerHTML = `
        <img src="${p.avatar_path ? (window._STORAGE_URL || '') + '/' + p.avatar_path : ''}"
            id="op-pill-avatar"
            style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:2px solid rgba(192,57,43,0.3);background:#f8f9fa;"
            onerror="this.style.display='none'">
        <span style="font-size:0.75em;font-weight:700;color:#922b21;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.nombre}</span>`;
    // Set real avatar URL
    const img = pill.querySelector('#op-pill-avatar');
    if (img && p.avatar_path) {
        import('./op-state.js').then(({ avatarUrl: av }) => { img.src = av(p.avatar_path); });
    }
}

// Keep reference for index.html
window._opRenderPerfilPill = _renderPerfilPill;

// ── Toast ──────────────────────────────────────────────────────
function toast(msg, tipo = 'info') {
    const el = document.getElementById('op-toast');
    if (!el) return;
    el.textContent = msg;
    el.className = `op-toast op-toast-${tipo}`;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.className = 'op-toast', 3000);
}
window._opToast = toast;
