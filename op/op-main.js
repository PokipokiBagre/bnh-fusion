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
let _pendingImgId = null;

// ── Init ──────────────────────────────────────────────────────
export async function initOP() {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    window._STORAGE_URL = STORAGE_URL;

    // Cargar perfil propio (crear si no existe)
    let perfil = await cargarPerfil(user.id);
    if (!perfil) {
        await guardarPerfil(user.id, { nombre: 'OP', avatar_path: null });
        perfil = { id: user.id, nombre: 'OP', avatar_path: null };
    }
    opState.perfil = perfil;

    // Mostrar pill en sidebar
    _renderPerfilPill();

    // Cargar todos los perfiles de OPs (para avatares en mensajes)
    const { data: todosPerfiles } = await supabase
        .from('op_perfiles').select('id, nombre, avatar_path');
    opState.perfiles = {};
    (todosPerfiles || []).forEach(p => { opState.perfiles[p.id] = p; });
    // Asegurar que el perfil propio esté en el mapa
    opState.perfiles[perfil.id] = perfil;

    // Cargar personajes para autocomplete @Personaje@ (con tags para autocomplete #tag)
    const { data: grupos } = await supabase
        .from('personajes_refinados')
        .select('nombre_refinado, tags')
        .order('nombre_refinado');
    opState.grupos = grupos || [];

    // Cargar medallas para autocomplete !Medalla!
    const { data: medallas } = await supabase
        .from('medallas_catalogo')
        .select('nombre')
        .order('nombre');
    opState.medallas = medallas || [];

    // Cargar datos principales
    await Promise.all([_cargarConvs(), _cargarGaleria()]);

    _renderTab('chat');
    _exponerGlobales();
    _mountInput();
}

// ── Conversaciones ────────────────────────────────────────────
async function _cargarConvs() {
    opState.conversaciones = await cargarConversaciones();
    if (!opState.conversaciones.length) {
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
    if (opState.realtimeSub) {
        supabase.removeChannel(opState.realtimeSub);
        opState.realtimeSub = null;
    }
    opState.convActual = id;
    opState.mensajes   = await cargarMensajes(id);
    renderMensajes();

    opState.realtimeSub = suscribirMensajes(id, msg => {
        if (msg.autor_id !== opState.perfil?.id) {
            // Actualizar perfiles si llegó uno nuevo
            if (!opState.perfiles[msg.autor_id]) {
                supabase.from('op_perfiles').select('id, nombre, avatar_path')
                    .eq('id', msg.autor_id).maybeSingle()
                    .then(({ data }) => { if (data) opState.perfiles[data.id] = data; });
            }
            appendMensaje(msg);
        }
    });

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
    if (tab === 'ajustes') renderAjustes();
    if (tab === 'galeria') renderGaleria();
}

// ── Input + autocomplete ──────────────────────────────────────
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
    const ta        = $('op-msg-input');
    const contenido = ta?.value.trim() || '';

    let imagenPath = null;

    // Imagen desde galería
    if (_pendingImgId !== null) {
        const allImgs = Object.values(opState.imagenesGaleria).flat();
        const img = allImgs.find(i => i.id === _pendingImgId);
        imagenPath = img?.path || null;
        _pendingImgId = null;
        $('op-img-preview')?.remove();
    }

    // Imagen desde archivo
    const fileInput = $('op-file-input');
    if (fileInput?.files?.length) {
        const file = fileInput.files[0];
        const res = await subirImagenGaleria(
            file, opState.perfil.id, opState.perfil.nombre,
            file.name.replace(/\.[^.]+$/, '')
        );
        if (res.ok) {
            imagenPath = res.imagen.path;
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
        if (ta) { ta.value = ''; ta.style.height = 'auto'; }
        appendMensaje(msg);
        const conv = opState.conversaciones.find(c => c.id === opState.convActual);
        if (conv) conv.ultimo_msg = msg.creado_en;
        opState.conversaciones.sort((a, b) => new Date(b.ultimo_msg) - new Date(a.ultimo_msg));
        renderConvList();
    }
}

// ── Globales ──────────────────────────────────────────────────
function _exponerGlobales() {
    window._opTab        = t => _renderTab(t);
    window._opSelConv    = async id => { await _selConv(id); renderConvList(); };
    window._opEnviar     = _enviar;
    window._opGetPerfil  = () => opState.perfil;

    window._opNuevaConv = async () => {
        // Auto-name: "Nuevo chat N"
        const existing = opState.conversaciones.map(c => c.titulo);
        let n = 1;
        while (existing.includes(`Nuevo chat ${n}`)) n++;
        const conv = await crearConversacion(`Nuevo chat ${n}`);
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

    window._opMenuConv = (e, id) => {
        // Remove any existing menu
        document.getElementById('op-conv-menu')?.remove();

        const conv = opState.conversaciones.find(c => c.id === id);
        if (!conv) return;

        const meta    = _getConvMeta(id);
        const fijado  = meta.fijado || false;
        const color   = meta.color  || '#c0392b';

        const COLORS = [
            { hex: '#c0392b', label: 'Rojo'     },
            { hex: '#1a4a80', label: 'Azul'     },
            { hex: '#1e8449', label: 'Verde'     },
            { hex: '#6c3483', label: 'Morado'   },
            { hex: '#b7770d', label: 'Dorado'   },
            { hex: '#2e4053', label: 'Marino'   },
        ];

        const menu = document.createElement('div');
        menu.id = 'op-conv-menu';
        menu.style.cssText = [
            'position:fixed','z-index:99999','background:white',
            'border:1.5px solid #dee2e6','border-radius:10px',
            'box-shadow:0 4px 20px rgba(0,0,0,0.15)',
            'min-width:200px','padding:6px 0','font-family:inherit',
            'font-size:0.85em',
        ].join(';');

        // Position near the button
        const rect = e.currentTarget?.getBoundingClientRect?.() || { right: e.clientX + 20, top: e.clientY };
        menu.style.left = (rect.right - 200) + 'px';
        menu.style.top  = (rect.bottom || e.clientY) + 'px';

        const item = (icon, label, fn, danger) => {
            const el = document.createElement('div');
            el.style.cssText = `padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;
                color:${danger ? '#c0392b' : '#212529'};transition:0.1s;`;
            el.innerHTML = `<span>${icon}</span><span>${label}</span>`;
            el.onmouseenter = () => el.style.background = danger ? '#fdecea' : '#f8f9fa';
            el.onmouseleave = () => el.style.background = '';
            el.onclick = () => { menu.remove(); fn(); };
            return el;
        };

        // Rename
        menu.appendChild(item('✏️', 'Cambiar nombre', () => {
            const nuevo = prompt('Nuevo nombre:', conv.titulo);
            if (!nuevo?.trim()) return;
            window._opRenombrarConv(id, nuevo.trim());
        }));

        // Color picker row
        const colorRow = document.createElement('div');
        colorRow.style.cssText = 'padding:8px 14px;display:flex;gap:6px;align-items:center;border-top:1px solid #f1f3f4;border-bottom:1px solid #f1f3f4;';
        colorRow.innerHTML = '<span style="color:#666;font-size:0.8em;margin-right:2px;">Color:</span>';
        COLORS.forEach(c => {
            const dot = document.createElement('div');
            dot.title = c.label;
            dot.style.cssText = `width:18px;height:18px;border-radius:50%;background:${c.hex};cursor:pointer;
                border:2px solid ${color === c.hex ? '#222' : 'transparent'};transition:0.1s;`;
            dot.onclick = () => {
                _setConvMeta(id, { color: c.hex });
                menu.remove();
                renderConvList();
            };
            colorRow.appendChild(dot);
        });
        menu.appendChild(colorRow);

        // Pin/unpin
        menu.appendChild(item(fijado ? '📌' : '📌', fijado ? 'Desfijar' : 'Fijar', () => {
            _setConvMeta(id, { fijado: !fijado });
            renderConvList();
        }));

        // Clean
        menu.appendChild(item('🧹', 'Limpiar mensajes', async () => {
            if (!confirm('¿Limpiar todos los mensajes?')) return;
            await limpiarConversacion(id);
            if (id === opState.convActual) { opState.mensajes = []; renderMensajes(); }
        }));

        // Delete
        if (opState.conversaciones.length > 1) {
            menu.appendChild(item('🗑', 'Eliminar conversación', async () => {
                if (!confirm(`¿Eliminar "${conv.titulo}"?`)) return;
                await eliminarConversacion(id);
                opState.conversaciones = opState.conversaciones.filter(c => c.id !== id);
                if (id === opState.convActual) {
                    const next = opState.conversaciones[0];
                    if (next) await _selConv(next.id);
                    else { opState.convActual = null; opState.mensajes = []; renderMensajes(); }
                }
                renderConvList();
            }, true));
        }

        document.body.appendChild(menu);

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('mousedown', function _close(ev) {
                if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', _close); }
            });
        }, 10);
    };

    window._opRenombrarConv = async (id, titulo) => {
        const { error } = await supabase.from('op_conversaciones')
            .update({ titulo }).eq('id', id);
        if (!error) {
            const conv = opState.conversaciones.find(c => c.id === id);
            if (conv) conv.titulo = titulo;
            renderConvList();
            if (id === opState.convActual) {
                const el = $('op-chat-titulo');
                if (el) el.textContent = titulo;
            }
        }
    };

    // Local meta helpers (color, pin)
    function _getConvMeta(id) {
        try { return JSON.parse(localStorage.getItem(`op_conv_meta_${id}`) || '{}'); } catch { return {}; }
    }
    function _setConvMeta(id, patch) {
        const prev = _getConvMeta(id);
        localStorage.setItem(`op_conv_meta_${id}`, JSON.stringify({ ...prev, ...patch }));
    }

    window._opEliminarMsg = async id => {
        await eliminarMensaje(id);
        opState.mensajes = opState.mensajes.filter(m => m.id !== id);
        const el = document.querySelector(`.op-msg[data-id="${id}"]`);
        if (el) el.remove();
    };

    window._opVerImagen = url => showLightbox(url);

    window._opSeleccionarImg = id => {
        _pendingImgId = id;
        const allImgs = Object.values(opState.imagenesGaleria).flat();
        const img = allImgs.find(i => i.id === id);
        if (!img) return;
        $('op-img-selector').style.display = 'none';
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
        const sel = $('op-img-selector');
        if (sel?.style.display !== 'none') sel.outerHTML = renderSelectorImagenes();
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
            if (res.ok) { await _cargarGaleria(); renderGaleria(); toast('✅ Imagen guardada en galería', 'ok'); }
            else toast('❌ ' + res.msg, 'error');
        };
        input.click();
    };

    window._opFileInput = () => {
        const fi = $('op-file-input');
        if (fi) { fi.value = ''; fi.click(); }
    };

    window._opPreviewAvatar = input => {
        const file = input.files[0];
        if (!file) return;
        const prev = $('op-avatar-preview');
        if (prev) prev.src = URL.createObjectURL(file);
    };

    window._opGuardarPerfil = async () => {
        const nombre    = $('op-nombre-input')?.value.trim();
        const fileInput = $('op-avatar-file');
        const msgEl     = $('op-ajustes-msg');
        if (!nombre) {
            if (msgEl) { msgEl.style.color = '#e74c3c'; msgEl.textContent = 'El nombre no puede estar vacío.'; }
            return;
        }
        let avatarPath = opState.perfil?.avatar_path;
        if (fileInput?.files?.length) {
            const path = await subirAvatarOP(fileInput.files[0], opState.perfil.id);
            if (path) avatarPath = path;
        }
        const ok = await guardarPerfil(opState.perfil.id, { nombre, avatar_path: avatarPath });
        if (ok) {
            opState.perfil.nombre      = nombre;
            opState.perfil.avatar_path = avatarPath;
            opState.perfiles[opState.perfil.id] = { ...opState.perfil };
            if (msgEl) { msgEl.style.color = '#27ae60'; msgEl.textContent = '✅ Perfil actualizado'; }
            _renderPerfilPill();
        } else {
            if (msgEl) { msgEl.style.color = '#e74c3c'; msgEl.textContent = 'Error al guardar.'; }
        }
    };
}

function _renderPerfilPill() {
    const pill = document.getElementById('op-perfil-pill');
    if (!pill || !opState.perfil) return;
    const p = opState.perfil;
    const av = p.avatar_path ? `${window._STORAGE_URL || STORAGE_URL}/${p.avatar_path}` : '';
    pill.innerHTML = `
        <img src="${av}" id="op-pill-avatar"
            style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:2px solid rgba(192,57,43,0.3);background:#f8f9fa;"
            onerror="this.style.display='none'">
        <span style="font-size:0.75em;font-weight:700;color:#922b21;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.nombre}</span>`;
    const img = pill.querySelector('#op-pill-avatar');
    if (img && p.avatar_path) {
        import('./op-state.js').then(({ avatarUrl: av }) => { img.src = av(p.avatar_path); });
    }
}

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
