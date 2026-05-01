// ============================================================
// op/op-main.js — Controlador principal del OP Chat
// ============================================================
import { bnhAuth, supabase } from '../bnh-auth.js';
import { opState, STORAGE_URL } from './op-state.js';
import { initRecon, salvarRescate, restaurarRescate } from '../bnh-recon.js';
import {
    cargarPerfil, guardarPerfil, cargarConversaciones,
    crearConversacion, eliminarConversacion, limpiarConversacion,
    cargarMensajes, enviarMensaje, eliminarMensaje,
    cargarImagenesGaleria, subirImagenGaleria, subirVideoGaleria, eliminarImagenGaleria,
    subirAvatarOP, suscribirMensajes, diagnosticarDB
} from './op-data.js';
import {
    renderConvList, renderMensajes, appendMensaje,
    renderGaleria, renderAjustes, renderSelectorImagenes, showLightbox
} from './op-ui.js';
import { mountMarkupAC, renderMsgMarkup } from './op-markup.js';
import { isAudio, isVideo, isImage, clasificarArchivos, safeExt, subirAudio, extraerLinks, esYouTube } from './op-attach.js';

const $ = id => document.getElementById(id);
// Exponer renderMsgMarkup globalmente para los handlers inline de edición
const renderMsgMarkupGlobal = renderMsgMarkup;
let _pendingImgId  = null;
let _pendingFiles  = []; // array of { file, url, source: 'paste'|'file' }
// Exponer para acceso desde onclick inline del preview
Object.defineProperty(window, '_pendingImgId', { get: () => _pendingImgId, set: v => { _pendingImgId = v; } });

// ── Sidebar móvil ────────────────────────────────────────────
window._opToggleSidebar = () => {
    const sb  = document.getElementById('op-sidebar');
    const ov  = document.getElementById('op-sidebar-overlay');
    if (!sb) return;
    const open = sb.classList.toggle('op-sidebar-open');
    if (ov) ov.classList.toggle('visible', open);
    // Bloquear scroll del body cuando el drawer está abierto
    document.body.style.overflow = open ? 'hidden' : '';
};

window._opCloseSidebar = () => {
    const sb = document.getElementById('op-sidebar');
    const ov = document.getElementById('op-sidebar-overlay');
    if (sb) sb.classList.remove('op-sidebar-open');
    if (ov) ov.classList.remove('visible');
    document.body.style.overflow = '';
};

// Cerrar sidebar al seleccionar una conversación en móvil
const _origOpTab = window._opTab;

// Definir _opFileInput globalmente de inmediato (antes de initOP)
// para que el botón del HTML pueda llamarla aunque initOP no haya terminado.
// _fileSelectorActive: compartido entre el menú y _initVisibilityReconnect
// Se declara aquí para que _opFileInputDirect pueda setearlo también.
let _fileSelectorActive = false;

// ── IndexedDB para archivos pendientes entre reloads ─────────
const _IDB_NAME    = 'op-pending-files';
const _IDB_STORE   = 'files';
const _IDB_VERSION = 1;

function _idbOpen() {
    return new Promise((res, rej) => {
        const req = indexedDB.open(_IDB_NAME, _IDB_VERSION);
        req.onupgradeneeded = e => e.target.result.createObjectStore(_IDB_STORE, { keyPath: 'id', autoIncrement: true });
        req.onsuccess = e => res(e.target.result);
        req.onerror   = e => rej(e.target.error);
    });
}

async function _idbSaveFiles(files) {
    const db = await _idbOpen();
    // Esperar tx.oncomplete garantiza flush a disco antes del reload
    await new Promise((resolve, reject) => {
        const tx = db.transaction(_IDB_STORE, 'readwrite');
        const st = tx.objectStore(_IDB_STORE);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = e  => { db.close(); reject(e.target.error); };
        tx.onabort    = e  => { db.close(); reject(new Error('IDB tx aborted')); };
        st.clear();
        for (const file of files) {
            st.add({ name: file.name, type: file.type, blob: file });
        }
    });
}

// Lee y borra en una sola transacción readwrite — sin race condition
async function _idbLoadAndClear() {
    try {
        const db = await _idbOpen();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(_IDB_STORE, 'readwrite');
            const st = tx.objectStore(_IDB_STORE);
            let rows = [];
            tx.oncomplete = () => { db.close(); resolve(rows.map(r => new File([r.blob], r.name, { type: r.type }))); };
            tx.onerror    = e  => { db.close(); reject(e.target.error); };
            const req = st.getAll();
            req.onsuccess = e => { rows = e.target.result || []; st.clear(); };
        });
    } catch { return []; }
}

// ── Recuperar archivos de IndexedDB al arrancar ──────────────
async function _recuperarArchivosPendientesIDB() {
    const files = await _idbLoadAndClear();
    if (!files.length) return;

    // Restaurar texto del input si había
    const textoGuardado = sessionStorage.getItem('op-reload-texto');
    if (textoGuardado) {
        sessionStorage.removeItem('op-reload-texto');
        const ta = document.getElementById('op-msg-input');
        if (ta) {
            ta.value = textoGuardado;
            ta.style.height = 'auto';
            ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
        }
    }

    _agregarArchivosPendientes(files, 'file');

    setTimeout(() => {
        const n = files.length;
        const el = document.getElementById('op-toast');
        if (el) {
            el.textContent = `✅ ${n} archivo${n > 1 ? 's' : ''} recuperado${n > 1 ? 's' : ''} — listo para enviar`;
            el.className = 'op-toast op-toast-ok';
            clearTimeout(el._t);
            el._t = setTimeout(() => el.className = 'op-toast', 4000);
        }
    }, 800);
}

// ── Botón 📎 — selector con recarga limpia en móvil ──────────
window._opFileInput = () => {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
        _opFileInputMovil();
        return;
    }
    _opFileInputDirect();
};

// Móvil: selector nativo directo → guarda en IndexedDB → recarga limpia
function _opFileInputMovil() {
    const input = document.createElement('input');
    input.type    = 'file';
    input.multiple = true;
    input.accept  = 'image/*,video/*,audio/*,.mp3,.ogg,.wav,.flac,.m4a,.aac,.opus,.gif';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = async () => {
        const files = Array.from(input.files || []);
        input.remove();
        if (!files.length) return;

        const textoActual = document.getElementById('op-msg-input')?.value || '';
        if (textoActual) sessionStorage.setItem('op-reload-texto', textoActual);

        await _idbSaveFiles(files);
        window.location.reload();
    };

    input.click();
}
// opts: { capture?: 'environment'|'user', accept?: string }
function _opFileInputDirect(opts = {}) {
    // Marcar flag ANTES de abrir el picker para que visibilitychange lo vea
    _fileSelectorActive = true;
    const input = document.createElement('input');
    input.type     = 'file';
    input.multiple = !opts.capture; // múltiple solo si no es cámara
    input.accept   = opts.accept || 'image/*,video/*,audio/*,.mp3,.ogg,.wav,.flac,.m4a,.aac,.opus,.gif';
    if (opts.capture) input.capture = opts.capture;
    input.style.display = 'none';
    input.onchange = () => {
        const files = Array.from(input.files || []);
        if (files.length) _agregarArchivosPendientes(files, 'file');
        input.remove();
    };
    document.body.appendChild(input);
    input.click();
};

// ── Init ──────────────────────────────────────────────────────
export async function initOP() {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    window._STORAGE_URL = STORAGE_URL;

    // Diagnóstico al inicio — ver en consola del navegador
    diagnosticarDB().then(checks => {
        const fails = Object.entries(checks).filter(([,v]) => v.startsWith('❌'));
        if (fails.length) {
            console.warn('[OP Chat] Problemas de DB detectados:', fails);
        }
    });

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
    _initVisibilityReconnect();

    // Recuperar archivos guardados en IndexedDB antes del reload
    await _recuperarArchivosPendientesIDB();
}

// ── Conversaciones ────────────────────────────────────────────
async function _cargarConvs() {
    opState.conversaciones = await cargarConversaciones();
    if (!opState.conversaciones.length) {
        const conv = await crearConversacion('General');
        if (conv) opState.conversaciones = [conv];
    }
    // Leer conv de la URL — si existe y es válida, abrirla; si no, la primera
    const urlConvId = new URLSearchParams(window.location.search).get('conv');
    // Comparar como string para que funcione tanto con IDs integer como UUID
    const convInicial = (urlConvId && opState.conversaciones.find(c => String(c.id) === String(urlConvId)))
        ? opState.conversaciones.find(c => String(c.id) === String(urlConvId)).id
        : opState.conversaciones[0]?.id;
    if (convInicial) await _selConv(convInicial);
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
    // Actualizar URL sin recargar la página
    const url = new URL(window.location.href);
    url.searchParams.set('conv', id);
    window.history.replaceState(null, '', url.toString());
    // Cerrar sidebar móvil al abrir conversación
    window._opCloseSidebar?.();
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

// ── Reconexión automática al volver a la pestaña ──────────────
// Usa bnh-recon para uniformidad con el resto del sistema.
// El estado de la conv ya viaja en la URL (?conv=), por lo que
// el reload de emergencia la restaura automáticamente.
// Lo único que necesitamos salvar explícitamente es el texto
// que el OP estaba escribiendo en el input.
function _initVisibilityReconnect() {

    // ── Salvar: texto del input + tab activa ──────────────────
    function _saveOPState() {
        salvarRescate({
            opTab:      opState.tab,
            opMsgInput: document.getElementById('op-msg-input')?.value || '',
        });
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) _saveOPState();
    });
    window.addEventListener('pagehide', () => _saveOPState(), { once: false });

    // ── Reconexión suave: sin recargar, solo refrescar auth + mensajes ──
    async function _reconectarSuave() {
        try {
            // 1. Refrescar sesión de Supabase
            await supabase.auth.refreshSession();
        } catch(_) {}
        try {
            // 2. Reconectar canal realtime
            if (opState.realtimeSub) {
                try { supabase.removeChannel(opState.realtimeSub); } catch(_) {}
                opState.realtimeSub = null;
            }
            if (opState.convActual) {
                opState.mensajes = await cargarMensajes(opState.convActual);
                renderMensajes();
                opState.realtimeSub = suscribirMensajes(opState.convActual, msg => {
                    if (opState.mensajes.some(m => m.id === msg.id)) return;
                    opState.mensajes.push(msg);
                    if (msg.autor_id !== opState.perfil?.id) appendMensaje(msg);
                });
            }
        } catch(_) {}
    }

    // ── Reconexión al volver a la pestaña / de un file picker ──
    // _fileSelectorActive se define en el scope del módulo (junto a _opFileInputDirect)
    // para que el picker la active incluso antes de que _initVisibilityReconnect corra.
    // Aquí solo leemos / reseteamos esa variable externa.

    document.addEventListener('visibilitychange', async () => {
        if (!document.hidden) {
            // La página volvió a primer plano — siempre reconectar
            // (cubre: volver del selector de archivos, volver de otra app, volver de otra pestaña)
            _fileSelectorActive = false;
            await _reconectarSuave();
        }
    });

    // ── Restaurar: texto del input + tab ──────────────────────
    restaurarRescate({
        toastElId: 'op-toast',
        maxEsperas: 60,
        onRestaurado: (saved) => {
            const extra = saved?.extra || {};

            if (extra.opTab && extra.opTab !== 'chat') {
                _renderTab(extra.opTab);
            }

            if (extra.opMsgInput) {
                const ta = document.getElementById('op-msg-input');
                if (ta) {
                    ta.value = extra.opMsgInput;
                    ta.style.height = 'auto';
                    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        },
    });

    // ── initRecon: dot de estado + reconexión agresiva ────────
    initRecon({
        supabaseClient: supabase,
        // Umbral más largo en móvil para no disparar la emergencia al seleccionar archivos
        umbralMs: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 30000 : 3000,

        onReconectar: async () => {
            await _reconectarSuave();
        },

        onEmergencia: () => {
            // Solo recargar si NO hay archivos pendientes (evita perderlos en móvil)
            if (_pendingFiles.length > 0) {
                // Reconexión suave en lugar de reload
                _reconectarSuave();
                return;
            }
            _saveOPState();
            // El reload lo hace initRecon internamente
        },
    });
}

// ── Tabs ──────────────────────────────────────────────────────
function _renderTab(tab) {
    opState.tab = tab;
    // Cerrar sidebar móvil al cambiar de tab
    if (window.innerWidth <= 768) window._opCloseSidebar();
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

    // Paste: Ctrl+V con imagen(es) en portapapeles
    const _handlePaste = e => {
        const items = Array.from(e.clipboardData?.items || []);
        const imgItems = items.filter(it => it.type.startsWith('image/'));
        if (!imgItems.length) return;
        e.preventDefault();
        imgItems.forEach(it => {
            const file = it.getAsFile();
            if (file) _agregarArchivosPendientes([file], 'paste');
        });
    };
    ta.addEventListener('paste', _handlePaste);
    document.addEventListener('paste', e => { if (e.target !== ta) _handlePaste(e); });
}

// ── Sistema unificado de archivos pendientes ──────────────────
function _agregarArchivosPendientes(files, source = 'file') {
    files.forEach(file => {
        const url = URL.createObjectURL(file);
        _pendingFiles.push({ file, url, source, id: Date.now() + Math.random() });
    });
    _renderPendingPreview();
    $('op-msg-input')?.focus();
}

function _renderPendingPreview() {
    let panel = $('op-pending-panel');

    if (!_pendingFiles.length) { panel?.remove(); return; }

    const wrap = $('op-input-wrap');
    if (!wrap) return;

    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'op-pending-panel';
        panel.style.cssText = `display:flex;flex-wrap:wrap;gap:8px;padding:10px 12px;
            background:rgba(108,52,131,0.08);border-radius:10px;margin-bottom:6px;
            border:1.5px dashed rgba(108,52,131,0.35);align-items:flex-start;`;
        wrap.insertAdjacentElement('beforebegin', panel);
    }

    panel.innerHTML = '';

    _pendingFiles.forEach((entry) => {
        const isImg = isImage(entry.file);
        const isVid = isVideo(entry.file);
        const isAud = isAudio(entry.file);
        const kb    = (entry.file.size / 1024).toFixed(0);
        const label = entry.source === 'paste' ? 'Portapapeles' : (entry.file.name || 'archivo');
        const sizeLabel = kb > 1024 ? `${(kb/1024).toFixed(1)} MB` : `${kb} KB`;
        const accentColor = isVid ? '#c0392b' : isAud ? '#1a4a80' : '#6c3483';
        const icon = entry.source === 'paste' ? '📋 ' : isVid ? '🎬 ' : isAud ? '🎵 ' : '📎 ';

        let thumb = '';
        if (isImg) {
            thumb = `<img src="${entry.url}" style="width:76px;height:60px;object-fit:cover;border-radius:5px;">`;
        } else if (isVid) {
            thumb = `<div style="width:76px;height:60px;display:flex;flex-direction:column;align-items:center;
                justify-content:center;font-size:1.8em;background:#fdecea;border-radius:5px;gap:2px;">
                🎬<span style="font-size:0.3em;color:#c0392b;font-weight:700;">VIDEO</span></div>`;
        } else if (isAud) {
            thumb = `<div style="width:76px;height:60px;display:flex;flex-direction:column;align-items:center;
                justify-content:center;font-size:1.8em;background:#e8f4f8;border-radius:5px;gap:2px;">
                🎵<span style="font-size:0.3em;color:#1a4a80;font-weight:700;">AUDIO</span></div>`;
        } else {
            thumb = `<div style="width:76px;height:60px;display:flex;align-items:center;justify-content:center;font-size:2em;background:#f5eeff;border-radius:5px;">📄</div>`;
        }

        const card = document.createElement('div');
        card.style.cssText = `position:relative;display:flex;flex-direction:column;align-items:center;
            gap:4px;background:white;border-radius:8px;padding:6px;
            border:1px solid ${isVid ? 'rgba(192,57,43,0.35)' : isAud ? 'rgba(26,74,128,0.3)' : 'rgba(108,52,131,0.25)'};
            width:88px;box-sizing:border-box;`;
        card.innerHTML = `
            ${thumb}
            <div style="font-size:0.6em;color:${accentColor};text-align:center;line-height:1.3;
                width:76px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                title="${label}">${icon}${label}</div>
            <div style="font-size:0.58em;color:rgba(108,52,131,0.5);">${sizeLabel}</div>
            <button data-uid="${entry.id}" style="position:absolute;top:-6px;right:-6px;
                width:18px;height:18px;border-radius:50%;background:#c0392b;border:none;
                color:white;font-size:0.65em;cursor:pointer;line-height:18px;text-align:center;padding:0;"
                title="Quitar">✕</button>`;

        card.querySelector('button').onclick = () => {
            URL.revokeObjectURL(entry.url);
            _pendingFiles = _pendingFiles.filter(f => f.id !== entry.id);
            _renderPendingPreview();
        };
        panel.appendChild(card);
    });

    // Footer resumen
    const footer = document.createElement('div');
    footer.style.cssText = `width:100%;font-size:0.7em;color:rgba(108,52,131,0.7);
        margin-top:4px;display:flex;justify-content:space-between;align-items:center;`;
    const nImgs = _pendingFiles.filter(f => isImage(f.file)).length;
    const nVids = _pendingFiles.filter(f => isVideo(f.file)).length;
    const nAuds = _pendingFiles.filter(f => isAudio(f.file)).length;
    const partes = [
        nImgs ? `${nImgs} imagen${nImgs > 1 ? 'es' : ''}` : '',
        nVids ? `${nVids} video${nVids > 1 ? 's' : ''}` : '',
        nAuds ? `${nAuds} audio${nAuds > 1 ? 's' : ''}` : '',
    ].filter(Boolean).join(' + ');
    footer.innerHTML = `
        <span>${partes}</span>
        <button style="background:none;border:none;color:#c0392b;cursor:pointer;font-size:1em;padding:0;"
            onclick="window._opLimpiarPendientes()">Limpiar todo</button>`;
    panel.appendChild(footer);
}

window._opLimpiarPendientes = () => {
    _pendingFiles.forEach(f => URL.revokeObjectURL(f.url));
    _pendingFiles = [];
    _renderPendingPreview();
};

// ── Enviar mensaje ────────────────────────────────────────────
async function _enviar() {
    if (!opState.convActual || !opState.perfil) return;
    const ta        = $('op-msg-input');
    let contenido = ta?.value.trim() || '';

    // Si hay cita pendiente, prefijarla al contenido
    const citaId = window._opCitaPendienteId;
    if (citaId) {
        const msgCitado = opState.mensajes.find(m => String(m.id) === String(citaId));
        if (msgCitado) {
            let citaPreview = '';
            if (msgCitado.contenido) {
                const lineas = msgCitado.contenido.split('\n').filter(l => !l.startsWith('> '));
                citaPreview = lineas.join(' ').slice(0, 80);
            } else if (msgCitado.imagen_path) citaPreview = '📷 imagen';
            else if (msgCitado.video_path)   citaPreview = '🎬 video';
            else if (msgCitado.audio_path)   citaPreview = '🎵 audio';
            else                             citaPreview = '📎 adjunto';
            const prefix = `> [${citaId}] ${msgCitado.autor_nombre}: ${citaPreview}\n`;
            contenido = prefix + (contenido ? contenido : '');
        }
        window._opCitaPendienteId = null;
        $('op-cita-bar')?.remove();
    }

    // Imagen/video de galería pendiente
    if (_pendingImgId !== null) {
        const isVideoRef = typeof _pendingImgId === 'object' && _pendingImgId?.tipo === 'video';
        if (isVideoRef) {
            await _enviarUnMensaje({ contenido: contenido || null, videoPath: _pendingImgId.path });
            if (ta && contenido) { ta.value = ''; ta.style.height = 'auto'; }
        } else {
            const allImgs = Object.values(opState.imagenesGaleria).flat();
            const img = allImgs.find(i => i.id === _pendingImgId);
            if (img) await _enviarUnMensaje({ contenido: contenido || null, imagenPath: img.path });
            if (ta && contenido) { ta.value = ''; ta.style.height = 'auto'; }
        }
        _pendingImgId = null;
        $('op-img-preview')?.remove();
    }

    // Archivos pendientes: imágenes, videos, audios
    if (_pendingFiles.length) {
        const filesToSend = [..._pendingFiles];
        _pendingFiles = [];
        _renderPendingPreview();
        if (ta) { ta.value = ''; ta.style.height = 'auto'; }

        const imgEntries = filesToSend.filter(e => isImage(e.file));
        const vidEntries = filesToSend.filter(e => isVideo(e.file));
        const audEntries = filesToSend.filter(e => isAudio(e.file));

        // El texto y el link embed van SOLO con el primer medio del lote.
        // Los demás mensajes se envían sin texto/link para no duplicarlos.
        // Nota: los links múltiples se detectan al renderizar desde contenido,
        //       aquí solo pasamos el contenido completo (con los links incluidos).
        let textoUsado = false;
        const tomarTexto = () => { if (textoUsado) return null; textoUsado = true; return contenido || null; };

        // Imágenes → un solo mensaje agrupado
        if (imgEntries.length) {
            const paths = [];
            for (const entry of imgEntries) {
                const ext = safeExt(entry.file, 'png');
                const safeName = entry.source === 'paste'
                    ? `paste_${Date.now()}_${Math.random().toString(36).slice(2,6)}.${ext}`
                    : entry.file.name.replace(/\.[^.]+$/, '');
                const res = await subirImagenGaleria(entry.file, opState.perfil.id, opState.perfil.nombre, safeName);
                URL.revokeObjectURL(entry.url);
                if (res.ok) paths.push(res.imagen.path);
                else toast(`❌ Error subiendo ${safeName}`, 'error');
            }
            if (paths.length) await _enviarUnMensaje({ contenido: tomarTexto(), imagenPaths: paths });
        }

        // Videos → un mensaje por video
        for (const entry of vidEntries) {
            const ext = safeExt(entry.file, 'mp4');
            const base = entry.file.name.replace(/\.[^.]+$/, '') || `video_${Date.now()}`;
            const res = await subirVideoGaleria(entry.file, opState.perfil.id, opState.perfil.nombre, `${base}.${ext}`);
            URL.revokeObjectURL(entry.url);
            if (res.ok) await _enviarUnMensaje({ contenido: tomarTexto(), videoPath: res.imagen.path });
            else toast(`❌ Error subiendo ${base}`, 'error');
        }

        // Audios → un mensaje por audio
        for (const entry of audEntries) {
            const res = await subirAudio(entry.file, opState.perfil.id, opState.perfil.nombre);
            URL.revokeObjectURL(entry.url);
            if (res.ok) await _enviarUnMensaje({ contenido: tomarTexto(), audioPath: res.path });
            else toast(`❌ Error subiendo audio`, 'error');
        }

        await _cargarGaleria();
        renderGaleria();
        return;
    }

    // Solo texto — links se detectan al renderizar, solo guardamos el contenido completo
    if (!contenido) return;
    if (ta) { ta.value = ''; ta.style.height = 'auto'; }
    await _enviarUnMensaje({ contenido });
}


async function _enviarUnMensaje({ contenido, imagenPath, imagenPaths, videoPath, audioPath }) {
    if (!contenido && !imagenPath && (!imagenPaths || !imagenPaths.length) && !videoPath && !audioPath) return;
    const msg = await enviarMensaje({
        convId:      opState.convActual,
        autorId:     opState.perfil.id,
        autorNombre: opState.perfil.nombre,
        contenido:   contenido  || null,
        imagenPath:  imagenPath || null,
        imagenPaths: imagenPaths || null,
        videoPath:   videoPath  || null,
        audioPath:   audioPath  || null,
    });
    if (msg) {
        appendMensaje(msg);
        opState.mensajes.push(msg);
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

    // ── Citar mensaje ───────────────────────────────────────────
    window._opCitaPendienteId = null;
    window._opCitar = (msgId) => {
        const msg = opState.mensajes.find(m => String(m.id) === String(msgId));
        if (!msg) return;
        window._opCitaPendienteId = msgId;

        // Determinar preview del contenido citado (texto, o descripción del adjunto)
        let preview = '';
        if (msg.contenido) {
            // Si empieza con "> " es una cita anidada — mostrar solo la última línea no-cita
            const lineas = msg.contenido.split('\n').filter(l => !l.startsWith('> '));
            preview = lineas.join(' ').slice(0, 60);
        } else if (msg.imagen_path) {
            preview = '📷 imagen';
        } else if (msg.video_path) {
            preview = '🎬 video';
        } else if (msg.audio_path) {
            preview = '🎵 audio';
        } else {
            preview = '📎 adjunto';
        }

        // Barra de cita visual encima del input
        $('op-cita-bar')?.remove();
        const bar = document.createElement('div');
        bar.id = 'op-cita-bar';
        bar.style.cssText = `display:flex;align-items:center;gap:8px;padding:6px 12px;
            background:rgba(108,52,131,0.18);border-top:2px solid rgba(108,52,131,0.5);
            font-size:0.78em;color:rgba(255,255,255,0.7);flex-shrink:0;`;
        bar.innerHTML = `<div style="width:3px;height:28px;background:#9b59b6;border-radius:2px;flex-shrink:0;"></div>
            <div style="flex:1;overflow:hidden;">
                <div style="font-weight:700;color:#c39bd3;font-size:0.85em;">${msg.autor_nombre}</div>
                <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:0.7;">${preview}</div>
            </div>
            <button onclick="window._opCancelarCita()"
                style="background:none;border:none;color:rgba(255,255,255,0.45);cursor:pointer;font-size:1.1em;padding:0 4px;">✕</button>`;
        const inputArea = document.querySelector('.op-input-area');
        if (inputArea) inputArea.insertAdjacentElement('beforebegin', bar);
        $('op-msg-input')?.focus();
    };
    window._opCancelarCita = () => {
        window._opCitaPendienteId = null;
        $('op-cita-bar')?.remove();
    };
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

    window._opEditarMsg = id => {
        const msg = opState.mensajes.find(m => m.id === id);
        if (!msg || !msg.contenido) return;

        const msgEl = document.querySelector(`.op-msg[data-id="${id}"]`);
        if (!msgEl) return;
        const textoEl = msgEl.querySelector('.op-msg-texto');
        if (!textoEl) return;

        // Guardar el original en un atributo data para no depender de escape en onclick inline
        const original = msg.contenido;
        textoEl.dataset.originalTexto = original;

        // Crear textarea y botones via DOM (sin onclick inline) para evitar bugs con
        // comillas, saltos de línea y caracteres especiales en el texto original
        textoEl.innerHTML = '';

        const ta = document.createElement('textarea');
        ta.id = `op-edit-ta-${id}`;
        ta.value = original;
        ta.style.cssText = 'width:100%;min-height:60px;background:rgba(255,255,255,0.1);' +
            'border:1.5px solid #6c3483;border-radius:6px;color:inherit;font:inherit;' +
            'padding:6px 8px;resize:vertical;box-sizing:border-box;';
        textoEl.appendChild(ta);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;justify-content:flex-end;';

        const btnCancelar = document.createElement('button');
        btnCancelar.textContent = 'Cancelar';
        btnCancelar.style.cssText = 'background:#f0e6f6;border:1.5px solid #c39bd3;' +
            'color:#6c3483;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:0.8em;font-weight:600;';
        btnCancelar.addEventListener('click', () => {
            textoEl.innerHTML = renderMsgMarkupGlobal(original);
        });

        const btnGuardar = document.createElement('button');
        btnGuardar.textContent = '💾 Guardar';
        btnGuardar.style.cssText = 'background:#6c3483;border:none;color:white;border-radius:6px;' +
            'padding:4px 10px;cursor:pointer;font-size:0.8em;font-weight:700;';
        btnGuardar.addEventListener('click', () => window._opGuardarEdicion(id));

        btnRow.appendChild(btnCancelar);
        btnRow.appendChild(btnGuardar);
        textoEl.appendChild(btnRow);

        ta.focus();
    };

    // _opCancelarEdicion mantenido por compatibilidad, pero ya no se usa en el flujo nuevo
    window._opCancelarEdicion = (id) => {
        const msgEl = document.querySelector(`.op-msg[data-id="${id}"]`);
        if (!msgEl) return;
        const textoEl = msgEl.querySelector('.op-msg-texto');
        if (!textoEl) return;
        const original = textoEl.dataset.originalTexto
            ?? opState.mensajes.find(m => m.id === id)?.contenido ?? '';
        textoEl.innerHTML = renderMsgMarkupGlobal(original);
    };

    window._opGuardarEdicion = async id => {
        const ta = document.getElementById(`op-edit-ta-${id}`);
        if (!ta) return;
        const nuevoContenido = ta.value.trim();
        if (!nuevoContenido) return;

        // Intentar con editado_en; si la columna no existe reintentar sin ella
        let { error } = await supabase.from('op_mensajes')
            .update({ contenido: nuevoContenido, editado_en: new Date().toISOString() })
            .eq('id', id);
        if (error?.code === '42703' || error?.code === 'PGRST204') {
            ({ error } = await supabase.from('op_mensajes')
                .update({ contenido: nuevoContenido })
                .eq('id', id));
        }
        if (error) { toast('❌ Error al guardar edición', 'error'); console.error(error); return; }

        // Actualizar state
        const msg = opState.mensajes.find(m => m.id === id);
        if (msg) { msg.contenido = nuevoContenido; }

        // Actualizar DOM
        const msgEl = document.querySelector(`.op-msg[data-id="${id}"]`);
        if (!msgEl) return;
        const textoEl = msgEl.querySelector('.op-msg-texto');
        if (textoEl) textoEl.innerHTML = renderMsgMarkupGlobal(nuevoContenido);
        // Marcar como editado en la hora
        const horaEl = msgEl.querySelector('.op-msg-hora');
        if (horaEl && !horaEl.querySelector('.op-editado-badge')) {
            horaEl.insertAdjacentHTML('beforeend', ' <span class="op-editado-badge" style="opacity:0.55;font-style:italic;font-size:0.85em;">(editado)</span>');
        }
    };

    // ── Catálogo de perfiles ──────────────────────────────────
    window._opRenombrarPerfil = async (id, nombreActual) => {
        const nuevo = prompt('Nuevo nombre para este perfil:', nombreActual);
        if (!nuevo?.trim() || nuevo.trim() === nombreActual) return;
        const { error } = await supabase.from('op_perfiles')
            .update({ nombre: nuevo.trim(), actualizado_en: new Date().toISOString() })
            .eq('id', id);
        if (error) { toast('❌ Error al renombrar', 'error'); return; }
        if (opState.perfiles[id]) opState.perfiles[id].nombre = nuevo.trim();
        if (opState.perfil?.id === id) opState.perfil.nombre = nuevo.trim();
        renderAjustes();
        toast('✅ Nombre actualizado', 'ok');
    };

    window._opSeleccionarPerfil = async (id) => {
        const perfil = opState.perfiles[id];
        if (!perfil) return;
        opState.perfil = { ...perfil };
        renderAjustes();
        renderMensajes();
        _renderPerfilPill();
        toast(`✅ Perfil activo: ${perfil.nombre}`, 'ok');
    };

    window._opEliminarPerfil = async (id, nombre) => {
        if (!confirm(`¿Eliminar el perfil "${nombre}"? Esto no elimina sus mensajes.`)) return;
        const { error } = await supabase.from('op_perfiles').delete().eq('id', id);
        if (error) { toast('❌ Error al eliminar perfil', 'error'); return; }
        delete opState.perfiles[id];
        renderAjustes();
        toast('🗑 Perfil eliminado', 'ok');
    };

    window._opVerImagen = url => showLightbox(url);

    window._opSeleccionarImg = id => {
        const allItems = Object.values(opState.imagenesGaleria).flat();
        const item = allItems.find(i => i.id === id);
        if (!item) return;

        const esVideo = item.tipo === 'video';
        // Guardar referencia con tipo para que _enviar lo enrute correctamente
        _pendingImgId = esVideo ? { id, tipo: 'video', path: item.path } : id;

        document.getElementById('op-img-selector-dropdown')?.remove();
        document.getElementById('op-img-preview')?.remove();

        const prev = document.createElement('div');
        prev.id = 'op-img-preview';
        prev.style.cssText = `display:flex;align-items:center;gap:8px;padding:6px 10px;
            background:${esVideo ? 'rgba(192,57,43,0.15)' : 'rgba(108,52,131,0.2)'};
            border-radius:8px;margin-bottom:4px;`;

        const thumb = esVideo
            ? `<span style="font-size:1.6em;flex-shrink:0;">🎬</span>`
            : `<img src="${item.url}" style="height:48px;border-radius:6px;object-fit:cover;flex-shrink:0;">`;

        prev.innerHTML = `${thumb}
            <span style="font-size:0.78em;color:#e2d9f3;flex:1;">${item.nombre}</span>
            <button onclick="window._pendingImgId=null;document.getElementById('op-img-preview')?.remove()"
                style="background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;font-size:1.1em;">✕</button>`;
        $('op-input-wrap')?.insertAdjacentElement('beforebegin', prev);
        $('op-msg-input')?.focus();
    };

    window._opEnviarDesdeGaleria = id => {
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
        // Si ya existe el dropdown lo toggling
        let dd = $('op-img-selector-dropdown');
        if (dd) { dd.remove(); return; }

        const allImgs = Object.values(opState.imagenesGaleria).flat();
        const wrap = $('op-input-wrap');
        if (!wrap) return;

        dd = document.createElement('div');
        dd.id = 'op-img-selector-dropdown';
        dd.style.cssText = `position:absolute;bottom:calc(100% + 8px);left:0;right:0;
            background:#1a1a2e;border:2px solid #6c3483;border-radius:12px;
            max-height:260px;overflow-y:auto;padding:12px;z-index:100;
            box-shadow:0 -4px 20px rgba(0,0,0,0.4);`;

        if (!allImgs.length) {
            dd.innerHTML = `<div style="color:rgba(255,255,255,0.3);font-size:0.82em;text-align:center;padding:16px;">Sin imágenes en galería</div>`;
        } else {
            const header = document.createElement('div');
            header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;';
            header.innerHTML = `<span style="color:#e2d9f3;font-weight:700;font-size:0.85em;">Galería</span>
                <button id="op-img-selector-close" style="background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;font-size:1.1em;">✕</button>`;
            dd.appendChild(header);

            const grid = document.createElement('div');
            grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;';
            allImgs.forEach(item => {
                const esVideo = item.tipo === 'video';
                const cell = document.createElement('div');
                cell.style.cssText = `cursor:pointer;border-radius:8px;overflow:hidden;
                    border:2px solid transparent;transition:0.15s;position:relative;`;
                cell.onmouseover = () => cell.style.borderColor = esVideo ? '#c0392b' : '#6c3483';
                cell.onmouseout  = () => cell.style.borderColor = 'transparent';
                cell.title = item.nombre;

                if (esVideo) {
                    cell.innerHTML = `
                        <div style="width:100%;aspect-ratio:1;background:#1a0a0a;display:flex;
                            flex-direction:column;align-items:center;justify-content:center;gap:3px;">
                            <span style="font-size:1.6em;">🎬</span>
                            <span style="font-size:0.5em;color:rgba(192,57,43,0.9);font-weight:700;">VIDEO</span>
                        </div>
                        <div style="font-size:0.6em;color:rgba(255,255,255,0.6);padding:2px 4px;
                            overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#0d1117;">
                            ${item.nombre}
                        </div>`;
                } else {
                    cell.innerHTML = `
                        <img src="${item.url}" style="width:100%;aspect-ratio:1;object-fit:cover;display:block;">
                        <div style="font-size:0.6em;color:rgba(255,255,255,0.6);padding:2px 4px;
                            overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#0d1117;">
                            ${item.nombre}
                        </div>`;
                }
                cell.onclick = () => { window._opSeleccionarImg(item.id); dd.remove(); };
                grid.appendChild(cell);
            });
            dd.appendChild(grid);
        }

        // Posicionar relativo al wrap del input
        const wrapParent = wrap.parentElement;
        wrapParent.style.position = 'relative';
        wrapParent.appendChild(dd);

        // Cerrar al hacer click fuera
        dd.querySelector('#op-img-selector-close')?.addEventListener('click', () => dd.remove());
        setTimeout(() => {
            document.addEventListener('mousedown', function _close(e) {
                if (!dd.contains(e.target) && e.target.getAttribute('onclick') !== 'window._opMostrarGaleria()') {
                    dd.remove();
                    document.removeEventListener('mousedown', _close);
                }
            });
        }, 10);
    };

    window._opSubirAGaleria = async () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*,video/*,audio/*,.mp3,.ogg,.wav,.flac,.m4a,.aac';
        input.onchange = async () => {
            const file = input.files[0]; if (!file) return;
            const isVid = file.type.startsWith('video/');
            const nombre = prompt(`Nombre para este ${isVid ? 'video' : 'imagen'}:`, file.name.replace(/\.[^.]+$/, '')) || file.name;
            const fn = isVid ? subirVideoGaleria : subirImagenGaleria;
            const res = await fn(file, opState.perfil.id, opState.perfil.nombre, nombre);
            if (res.ok) { await _cargarGaleria(); renderGaleria(); toast(`✅ ${isVid ? 'Video' : 'Imagen'} guardado/a en galería`, 'ok'); }
            else toast('❌ ' + res.msg, 'error');
        };
        input.click();
    };

    // Handler legacy para el <input> estático del HTML (paste, etc.)
    window._opOnFileInput = (inputEl) => {
        const files = Array.from(inputEl.files || []);
        if (!files.length) return;
        _agregarArchivosPendientes(files, 'file');
        inputEl.value = '';
        document.getElementById('op-file-preview')?.remove();
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

// ── Scroll al mensaje citado ──────────────────────────────────
window._opScrollACita = (el) => {
    const id = el.dataset.citaId;
    if (!id) return;
    const target = document.querySelector(`.op-msg[data-id="${id}"]`);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.style.transition = 'background 0.3s';
        target.style.background = 'rgba(108,52,131,0.22)';
        setTimeout(() => { target.style.background = ''; }, 1400);
    }
};
