// ============================================================
// bnh-port-principal.js — Panel flotante BNH para OPs
// Uso desde cualquier subcarpeta:
//   import { bnhPort } from '../bnh-port-principal.js';
//   bnhPort.init();   ← después de bnhAuth.init()
// ============================================================
import { supabase } from './bnh-auth.js';
import { portState, guardarConv, cargarConv } from './bnh-port-state.js';
import {
    renderBurbuja, renderPanel,
    refreshMsgs, appendMsg, refreshPending,
    switchTab,
    verImagen, showLightboxCarousel,
    abrirYTModal, abrirTikTokModal,
    hidratarPlaylist, videoPiP,
    toast,
} from './bnh-port-ui.js';
import { mountMarkupAC } from './op-markup.js';

const BUCKET = 'imagenes-bnh';
const FOLDER = 'op-chat';

// ─────────────────────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────────────────────
export const bnhPort = {
    async init() {
        const { bnhAuth, currentConfig } = await import('./bnh-auth.js');
        if (!bnhAuth.esAdmin()) return;

        window._STORAGE_URL = currentConfig.storageUrl;

        const user = (await supabase.auth.getUser()).data.user;
        if (!user) return;

        // Perfil propio
        let perfil = await _cargarPerfil(user.id);
        if (!perfil) {
            await _guardarPerfil(user.id, { nombre: 'OP', avatar_path: null });
            perfil = { id: user.id, nombre: 'OP', avatar_path: null };
        }
        portState.perfil = perfil;

        // Todos los perfiles
        const { data: todos } = await supabase.from('op_perfiles').select('id, nombre, avatar_path');
        portState.perfiles = {};
        (todos || []).forEach(p => { portState.perfiles[p.id] = p; });
        portState.perfiles[perfil.id] = perfil;

        // Autocomplete data — cargar tags también para que el AC de @Personaje@ funcione
        const [{ data: grupos }, { data: medallas }] = await Promise.all([
            supabase.from('personajes_refinados').select('nombre_refinado, tags').order('nombre_refinado'),
            supabase.from('medallas_catalogo').select('nombre').order('nombre'),
        ]);
        portState.grupos   = grupos   || [];
        portState.medallas = medallas || [];

        await Promise.all([_cargarConvs(), _cargarGaleria()]);

        renderBurbuja();
        _exponerGlobales();
        _initVisibilityReconnect();
        // Abrir por defecto
        portState.abierto = true;
        renderPanel();

        // ── Montar autocomplete markup en el textarea del port ────
        // mountMarkupAC (de op-markup.js) lee opState.grupos/medallas;
        // sincronizamos portState → opState para reutilizarla sin duplicar código.
        _syncOpState();
        const portTA = document.getElementById('bnh-port-input');
        if (portTA) mountMarkupAC(portTA);
    },
};

// ─────────────────────────────────────────────────────────────
// CONVERSACIONES
// ─────────────────────────────────────────────────────────────
async function _cargarConvs() {
    const { data } = await supabase.from('op_conversaciones')
        .select('*').order('ultimo_msg', { ascending: false });
    portState.conversaciones = data || [];

    if (!portState.conversaciones.length) {
        const { data: nueva } = await supabase.from('op_conversaciones')
            .insert({ titulo: 'General', creado_por: portState.perfil?.id })
            .select('*').single();
        if (nueva) portState.conversaciones = [nueva];
    }

    const savedId    = cargarConv();
    const convInicial = (savedId && portState.conversaciones.find(c => String(c.id) === savedId))
        ? Number(savedId)
        : portState.conversaciones[0]?.id;

    if (convInicial) await _selConv(convInicial);
}

async function _selConv(id) {
    if (portState.realtimeSub) {
        supabase.removeChannel(portState.realtimeSub);
        portState.realtimeSub = null;
    }
    portState.convActual = id;
    guardarConv(id);

    const { data } = await supabase.from('op_mensajes')
        .select('*')
        .eq('conversacion_id', id)
        .order('creado_en', { ascending: false })
        .limit(60);
    portState.mensajes = (data || []).reverse();

    // Actualizar selector si el panel está visible
    const sel = document.getElementById('bnh-port-conv-sel');
    if (sel) sel.value = String(id);
    refreshMsgs();

    // Realtime
    const canal = supabase.channel(`bnh-port-${id}`);
    canal.on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'op_mensajes',
        filter: `conversacion_id=eq.${id}`
    }, payload => {
        const msg = payload.new;
        if (msg.autor_id === portState.perfil?.id) return;
        if (!portState.perfiles[msg.autor_id]) {
            supabase.from('op_perfiles').select('id,nombre,avatar_path')
                .eq('id', msg.autor_id).maybeSingle()
                .then(({ data }) => { if (data) portState.perfiles[data.id] = data; });
        }
        portState.mensajes.push(msg);
        appendMsg(msg);
    }).subscribe();
    portState.realtimeSub = canal;
}

// ─────────────────────────────────────────────────────────────
// GALERÍA
// ─────────────────────────────────────────────────────────────
async function _cargarGaleria() {
    const { data } = await supabase.from('op_imagenes')
        .select('*').order('creado_en', { ascending: false });
    portState.imagenesGaleria = {};
    (data || []).forEach(img => {
        if (!portState.imagenesGaleria[img.op_id]) portState.imagenesGaleria[img.op_id] = [];
        portState.imagenesGaleria[img.op_id].push(img);
    });
}

// ─────────────────────────────────────────────────────────────
// ENVÍO DE MENSAJES
// ─────────────────────────────────────────────────────────────
async function _enviar() {
    if (!portState.convActual || !portState.perfil) return;
    const ta       = document.getElementById('bnh-port-input');
    const contenido = ta?.value.trim() || '';

    // Imagen/video desde galería
    if (portState.pendingImgId !== null) {
        const allItems = Object.values(portState.imagenesGaleria).flat();
        const item     = allItems.find(i => i.id === portState.pendingImgId);
        if (item) {
            await _enviarUnMensaje({
                contenido: contenido || null,
                ...(item.tipo === 'video' ? { videoPath: item.path } : { imagenPath: item.path })
            });
        }
        portState.pendingImgId = null;
        document.getElementById('bnh-port-galsel')?.remove();
        if (ta) { ta.value = ''; ta.style.height = 'auto'; }
        return;
    }

    // Archivos pendientes
    if (portState.pendingFiles.length) {
        const archivos = [...portState.pendingFiles];
        portState.pendingFiles = [];
        refreshPending();
        if (ta) { ta.value = ''; ta.style.height = 'auto'; }

        const imgs = archivos.filter(e => e.file.type.startsWith('image/'));
        const vids = archivos.filter(e => e.file.type.startsWith('video/') && !_esAudio(e.file));
        const auds = archivos.filter(e => _esAudio(e.file));

        let textoUsado = false;
        const tomarTexto = () => { if (textoUsado) return null; textoUsado = true; return contenido || null; };

        if (imgs.length) {
            const paths = [];
            for (const e of imgs) {
                const res = await _subirImagen(e.file);
                URL.revokeObjectURL(e.url);
                if (res.ok) paths.push(res.path);
                else toast('❌ Error subiendo imagen', 'error');
            }
            if (paths.length) await _enviarUnMensaje({ contenido: tomarTexto(), imagenPaths: paths });
        }
        for (const e of vids) {
            const res = await _subirVideo(e.file);
            URL.revokeObjectURL(e.url);
            if (res.ok) await _enviarUnMensaje({ contenido: tomarTexto(), videoPath: res.path });
            else toast('❌ Error subiendo video', 'error');
        }
        for (const e of auds) {
            const res = await _subirAudio(e.file);
            URL.revokeObjectURL(e.url);
            if (res.ok) await _enviarUnMensaje({ contenido: tomarTexto(), audioPath: res.path });
            else toast('❌ Error subiendo audio', 'error');
        }

        await _cargarGaleria();
        if (portState.tab === 'galeria') switchTab('galeria');
        return;
    }

    // Solo texto
    if (!contenido) return;
    if (ta) { ta.value = ''; ta.style.height = 'auto'; }
    await _enviarUnMensaje({ contenido });
}

async function _enviarUnMensaje({ contenido, imagenPath, imagenPaths, videoPath, audioPath }) {
    if (!contenido && !imagenPath && !imagenPaths?.length && !videoPath && !audioPath) return;

    let pathValue = null;
    if (imagenPaths?.length > 1)     pathValue = JSON.stringify(imagenPaths);
    else if (imagenPaths?.length===1) pathValue = imagenPaths[0];
    else if (imagenPath)              pathValue = imagenPath;

    const tipo = videoPath ? (contenido ? 'mixto' : 'video')
               : audioPath ? (contenido ? 'mixto' : 'audio')
               : (contenido && pathValue) ? 'mixto'
               : pathValue ? 'imagen' : 'texto';

    const [tieneVideo, tieneAudio, tieneTipo] = await Promise.all([
        _probarColumna('video_path'),
        _probarColumna('audio_path'),
        _probarColumna('tipo'),
    ]);

    const payload = {
        conversacion_id: portState.convActual,
        autor_id:        portState.perfil.id,
        autor_nombre:    portState.perfil.nombre,
        contenido:       contenido  || null,
        imagen_path:     pathValue  || null,
    };
    if (tieneTipo)              payload.tipo       = tipo;
    if (tieneVideo && videoPath) payload.video_path = videoPath;
    if (tieneAudio && audioPath) payload.audio_path = audioPath;
    if (!tieneVideo && videoPath) payload.contenido = [payload.contenido, '📹 '+videoPath].filter(Boolean).join('\n');
    if (!tieneAudio && audioPath) payload.contenido = [payload.contenido, '🎵 '+audioPath].filter(Boolean).join('\n');

    const { data, error } = await supabase.from('op_mensajes').insert(payload).select('*').single();
    if (error) { console.error('[bnh-port] enviar:', error.message); return; }

    portState.mensajes.push(data);
    appendMsg(data);

    const conv = portState.conversaciones.find(c => c.id === portState.convActual);
    if (conv) conv.ultimo_msg = data.creado_en;
}

// ─────────────────────────────────────────────────────────────
// CACHE DE COLUMNAS
// ─────────────────────────────────────────────────────────────
const _colsOk = {};
async function _probarColumna(col) {
    if (_colsOk[col] !== undefined) return _colsOk[col];
    const { error } = await supabase.from('op_mensajes').select(col).limit(1);
    _colsOk[col] = !error || error.code !== '42703';
    return _colsOk[col];
}

// ─────────────────────────────────────────────────────────────
// STORAGE HELPERS
// ─────────────────────────────────────────────────────────────
async function _subirImagen(file) {
    const ext  = (file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : null)
              || (file.type.split('/')[1]||'png').replace('jpeg','jpg');
    const base = file.name.replace(/\.[^.]+$/,'').toLowerCase().replace(/[^a-z0-9]/g,'_') || 'img';
    const path = `${FOLDER}/${_safeName()}/${base}_${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from(BUCKET)
        .upload(path, file, { upsert:false, contentType:file.type, cacheControl:'3600' });
    if (error) return { ok:false };

    const { data:{ publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const row = { op_id:portState.perfil.id, op_nombre:portState.perfil.nombre,
        nombre:base, path, url:publicUrl, tipo:'imagen', tamaño_kb:Math.round(file.size/1024) };
    let { error:ie } = await supabase.from('op_imagenes').insert(row);
    if (ie?.code==='42703') { const {tipo:_,...sin}=row; await supabase.from('op_imagenes').insert(sin); }
    return { ok:true, path };
}

async function _subirVideo(file) {
    const ext  = (file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : null)
              || file.type.split('/')[1] || 'mp4';
    const base = file.name.replace(/\.[^.]+$/,'').toLowerCase().replace(/[^a-z0-9]/g,'_') || 'video';
    const path = `${FOLDER}/${_safeName()}/${base}_${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from(BUCKET)
        .upload(path, file, { upsert:false, contentType:file.type, cacheControl:'3600' });
    if (error) return { ok:false };

    const { data:{ publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const row = { op_id:portState.perfil.id, op_nombre:portState.perfil.nombre,
        nombre:base, path, url:publicUrl, tipo:'video', tamaño_kb:Math.round(file.size/1024) };
    let { error:ie } = await supabase.from('op_imagenes').insert(row);
    if (ie?.code==='42703') { const {tipo:_,...sin}=row; await supabase.from('op_imagenes').insert(sin); }
    return { ok:true, path };
}

async function _subirAudio(file) {
    const AUDIO_EXTS = /\.(mp3|ogg|wav|flac|aac|m4a|opus|weba|wma)$/i;
    const extN = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : null;
    const extT = (file.type.split('/')[1]||'mp3').replace('x-m4a','m4a').replace('mpeg','mp3');
    const ext  = extN || extT;
    const base = file.name.replace(/\.[^.]+$/,'').toLowerCase().replace(/[^a-z0-9]/g,'_') || 'audio';
    const path = `${FOLDER}/${_safeName()}/_audio/${base}_${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from(BUCKET)
        .upload(path, file, { upsert:false, contentType:file.type, cacheControl:'3600' });
    if (error) return { ok:false };
    return { ok:true, path };
}

function _esAudio(file) {
    return /^audio\//.test(file.type)
        || /\.(mp3|ogg|wav|flac|aac|m4a|opus|weba|wma)$/i.test(file.name)
        || (file.type==='video/mp4' && /\.m4a$/i.test(file.name));
}

function _safeName() {
    return (portState.perfil?.nombre || 'op').toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
}

// ─────────────────────────────────────────────────────────────
// PERFIL
// ─────────────────────────────────────────────────────────────
async function _cargarPerfil(userId) {
    const { data } = await supabase.from('op_perfiles')
        .select('*').eq('id', userId).maybeSingle();
    return data;
}
async function _guardarPerfil(userId, { nombre, avatar_path }) {
    const p = { id:userId, nombre, actualizado_en: new Date().toISOString() };
    if (avatar_path !== undefined) p.avatar_path = avatar_path;
    await supabase.from('op_perfiles').upsert(p, { onConflict:'id' });
}
async function _subirAvatar(file, userId) {
    const ext  = file.name.split('.').pop().toLowerCase();
    const path = `${FOLDER}/_avatars/${userId}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET)
        .upload(path, file, { upsert:true, contentType:file.type, cacheControl:'3600' });
    return error ? null : path;
}

// ─────────────────────────────────────────────────────────────
// SYNC portState → opState (para reutilizar mountMarkupAC)
// ─────────────────────────────────────────────────────────────
async function _syncOpState() {
    // op-markup.js lee opState.grupos y opState.medallas — lo importamos
    // de op-state.js y lo sincronizamos una sola vez.
    try {
        const { opState } = await import('./op/op-state.js');
        opState.grupos   = portState.grupos;
        opState.medallas = portState.medallas;
    } catch (_) {
        // Si no está disponible (otras páginas), no importa
    }
}

// ─────────────────────────────────────────────────────────────
// RECONEXIÓN AUTOMÁTICA
// ─────────────────────────────────────────────────────────────
function _initVisibilityReconnect() {
    let _lastVisible = Date.now(), _reconectando = false;
    document.addEventListener('visibilitychange', async () => {
        if (document.hidden) { _lastVisible = Date.now(); return; }
        if (_reconectando) return;
        _reconectando = true;
        try {
            const { bnhAuth } = await import('./bnh-auth.js');
            if (!bnhAuth.estaLogueado()) { window.location.reload(); return; }
            if (Date.now() - _lastVisible >= 3000 && portState.convActual) {
                await new Promise(r => setTimeout(r, 200));
                // Recargar mensajes nuevos sin recargar la página
                const { data } = await supabase.from('op_mensajes')
                    .select('*').eq('conversacion_id', portState.convActual)
                    .order('creado_en', { ascending: false }).limit(60);
                portState.mensajes = (data || []).reverse();
                refreshMsgs();
                // Re-suscribir canal
                if (portState.realtimeSub) {
                    try { supabase.removeChannel(portState.realtimeSub); } catch(_) {}
                    portState.realtimeSub = null;
                }
                await _selConv(portState.convActual);
            }
        } catch(e) { console.warn('[bnh-port] reconexión:', e); }
        finally { _reconectando = false; }
    });
}

// ─────────────────────────────────────────────────────────────
// GLOBALES  window._bnhPort*
// ─────────────────────────────────────────────────────────────
function _exponerGlobales() {

    window._bnhPortToggle = () => {
        portState.abierto = !portState.abierto;
        if (portState.abierto) {
            renderPanel();
            // Re-montar el AC en el nuevo textarea tras renderPanel
            requestAnimationFrame(() => {
                const ta = document.getElementById('bnh-port-input');
                if (ta) mountMarkupAC(ta);
            });
        }
        else { document.getElementById('bnh-port-panel')?.remove(); }
    };

    window._bnhPortTab = (tab) => switchTab(tab);

    window._bnhPortSelConv = async (id) => {
        await _selConv(Number(id));
    };

    window._bnhPortNuevaConv = async () => {
        const titles = portState.conversaciones.map(c => c.titulo);
        let n = 1;
        while (titles.includes(`Chat ${n}`)) n++;
        const user = (await supabase.auth.getUser()).data.user;
        const { data } = await supabase.from('op_conversaciones')
            .insert({ titulo:`Chat ${n}`, creado_por:user?.id })
            .select('*').single();
        if (!data) return;
        portState.conversaciones.unshift(data);
        await _selConv(data.id);
        // Refrescar selector
        const sel = document.getElementById('bnh-port-conv-sel');
        if (sel) {
            const opt = new Option(data.titulo, data.id, true, true);
            sel.insertBefore(opt, sel.firstChild);
            sel.value = String(data.id);
        }
    };

    // ── Menú ⚙ de la conversación ────────────────────────────
    window._bnhPortMenuConv = () => {
        document.getElementById('bnh-port-conv-menu')?.remove();
        const conv = portState.conversaciones.find(c => c.id === portState.convActual);
        if (!conv) return;

        const menu = document.createElement('div');
        menu.id = 'bnh-port-conv-menu';
        menu.style.cssText = `position:fixed;z-index:99999;background:#1a1a2e;
            border:1.5px solid rgba(192,57,43,0.4);border-radius:10px;
            box-shadow:0 4px 20px rgba(0,0,0,0.5);min-width:190px;
            padding:5px 0;font-size:0.82em;`;

        const panel = document.getElementById('bnh-port-panel');
        const gear  = panel?.querySelector('button[title="Gestionar conversación"], button[title="Opciones"]');
        if (gear) {
            const r = gear.getBoundingClientRect();
            menu.style.top   = (r.bottom + 4) + 'px';
            menu.style.left  = Math.max(4, r.left - 130) + 'px';
        } else {
            menu.style.top='100px'; menu.style.right='90px';
        }

        const item = (icon, label, fn, danger) => {
            const el = document.createElement('div');
            el.style.cssText = `padding:8px 13px;cursor:pointer;display:flex;align-items:center;gap:8px;
                color:${danger?'#e74c3c':'rgba(255,255,255,0.75)'};transition:0.1s;`;
            el.innerHTML = `<span>${icon}</span><span>${label}</span>`;
            el.onmouseenter = () => el.style.background = danger ? 'rgba(231,76,60,0.12)' : 'rgba(255,255,255,0.06)';
            el.onmouseleave = () => el.style.background = '';
            el.onclick = () => { menu.remove(); fn(); };
            return el;
        };

        // Renombrar
        menu.appendChild(item('✏️', 'Renombrar', async () => {
            const nuevo = prompt('Nuevo nombre:', conv.titulo);
            if (!nuevo?.trim()) return;
            const { error } = await supabase.from('op_conversaciones')
                .update({ titulo: nuevo.trim() }).eq('id', conv.id);
            if (!error) {
                conv.titulo = nuevo.trim();
                const sel = document.getElementById('bnh-port-conv-sel');
                if (sel) {
                    const opt = [...sel.options].find(o => Number(o.value) === conv.id);
                    if (opt) opt.textContent = nuevo.trim();
                }
                toast('✅ Conversación renombrada', 'ok');
            }
        }));

        // Limpiar mensajes
        menu.appendChild(item('🧹', 'Limpiar mensajes', async () => {
            if (!confirm('¿Borrar todos los mensajes de esta conversación?')) return;
            await supabase.from('op_mensajes').delete().eq('conversacion_id', conv.id);
            portState.mensajes = [];
            refreshMsgs();
            toast('🧹 Mensajes eliminados', 'ok');
        }));

        // Eliminar conversación (solo si hay más de una)
        if (portState.conversaciones.length > 1) {
            menu.appendChild(item('🗑', 'Eliminar conversación', async () => {
                if (!confirm(`¿Eliminar "${conv.titulo}"?`)) return;
                await supabase.from('op_mensajes').delete().eq('conversacion_id', conv.id);
                await supabase.from('op_conversaciones').delete().eq('id', conv.id);
                portState.conversaciones = portState.conversaciones.filter(c => c.id !== conv.id);
                const siguiente = portState.conversaciones[0];
                if (siguiente) {
                    await _selConv(siguiente.id);
                    // Refrescar select completo
                    switchTab('chat');
                }
                toast('🗑 Conversación eliminada', 'ok');
            }, true));
        }

        document.body.appendChild(menu);
        setTimeout(() => {
            document.addEventListener('mousedown', function _close(e) {
                if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', _close); }
            });
        }, 10);
    };

    window._bnhPortEnviar    = _enviar;
    window._bnhPortLimpiarGalSel = () => {
        portState.pendingImgId = null;
        document.getElementById('bnh-port-galsel')?.remove();
    };

    window._bnhPortLimpiarPendientes = () => {
        portState.pendingFiles.forEach(f => URL.revokeObjectURL(f.url));
        portState.pendingFiles = [];
        refreshPending();
    };

    window._bnhPortFileInput = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.multiple = true;
        inp.accept = 'image/*,video/*,audio/*,.mp3,.ogg,.wav,.flac,.m4a,.aac,.opus,.gif';
        inp.style.display = 'none';
        inp.onchange = () => {
            Array.from(inp.files||[]).forEach(f => window._bnhPortAddFile(f,'file'));
            inp.remove();
        };
        document.body.appendChild(inp);
        inp.click();
    };

    window._bnhPortAddFile = (file, source='file') => {
        const url = URL.createObjectURL(file);
        portState.pendingFiles.push({ file, url, source, id: Date.now()+Math.random() });
        if (portState.tab !== 'chat') switchTab('chat');
        else refreshPending();
    };

    // Media viewers
    window._bnhPortVerImg = (url) => verImagen(url);

    window._bnhPortVerGaleriaMensaje = (msgId, idx) => {
        // Buscar el grid con data-port-urls en el mensaje
        const msgEl = document.querySelector(`.bnh-port-msg[data-msg-id="${msgId}"]`);
        if (!msgEl) return;
        const grid = msgEl.querySelector('[data-port-urls]');
        if (!grid) return;
        try {
            const urls = JSON.parse(grid.dataset.portUrls);
            showLightboxCarousel(urls, idx);
        } catch(_) {}
    };

    window._bnhPortAbrirYTModal    = (embedUrl) => abrirYTModal(embedUrl);
    window._bnhPortAbrirTikTokModal = (embedUrl) => abrirTikTokModal(embedUrl);
    window._bnhPortHidratarPlaylist = (cardId, plId, vidId) => hidratarPlaylist(cardId, plId, vidId);
    window._bnhPortVideoPiP        = (videoId) => videoPiP(videoId);

    // Galería
    window._bnhPortEnviarDesdeGaleria = (id) => {
        portState.pendingImgId = id;
        switchTab('chat');
        toast('📎 Archivo listo · pulsa ▶ para enviar', 'info');
    };

    // ── Mini-galería rápida (GIFs e imágenes recientes) ─────────
    window._bnhPortToggleMiniGaleria = () => {
        const existing = document.getElementById('bnh-port-minigal');
        if (existing) { existing.remove(); return; }

        const allItems = Object.values(portState.imagenesGaleria).flat()
            .filter(i => i.tipo !== 'video')   // solo imágenes/GIFs
            .slice(0, 30);                      // máx 30 recientes

        const wrap = document.getElementById('bnh-port-input')?.closest('div[style*="padding:7px"]');
        if (!wrap) return;

        const dd = document.createElement('div');
        dd.id = 'bnh-port-minigal';
        dd.style.cssText = `position:absolute;bottom:calc(100% + 6px);left:0;right:0;
            background:#0d1117;border:1.5px solid rgba(108,52,131,0.5);border-radius:12px;
            max-height:220px;overflow-y:auto;padding:10px;z-index:100;
            box-shadow:0 -4px 20px rgba(0,0,0,0.5);scrollbar-width:thin;
            scrollbar-color:rgba(108,52,131,0.4) transparent;`;

        if (!allItems.length) {
            dd.innerHTML = `<div style="color:rgba(255,255,255,0.25);font-size:0.78em;text-align:center;padding:14px;">
                Sin imágenes en galería</div>`;
        } else {
            const header = document.createElement('div');
            header.style.cssText = 'font-size:0.66em;color:rgba(255,255,255,0.3);font-weight:700;letter-spacing:0.5px;margin-bottom:8px;';
            header.textContent = 'RECIENTES';
            dd.appendChild(header);

            const grid = document.createElement('div');
            grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:5px;';

            allItems.forEach(item => {
                const cell = document.createElement('div');
                cell.style.cssText = `cursor:pointer;border-radius:7px;overflow:hidden;
                    border:1.5px solid transparent;transition:0.15s;`;
                cell.onmouseover = () => cell.style.borderColor = '#6c3483';
                cell.onmouseout  = () => cell.style.borderColor = 'transparent';
                cell.title = item.nombre;
                cell.innerHTML = `<img src="${item.url}" style="width:100%;aspect-ratio:1;object-fit:cover;display:block;">`;
                cell.onclick = () => {
                    // Seleccionar imagen para enviar
                    portState.pendingImgId = item.id;
                    dd.remove();
                    // Mostrar preview compacto sobre el input
                    document.getElementById('bnh-port-galsel')?.remove();
                    const prev = document.createElement('div');
                    prev.id = 'bnh-port-galsel';
                    prev.style.cssText = `display:flex;align-items:center;gap:7px;padding:5px 9px;
                        background:rgba(108,52,131,0.15);border-top:1px solid rgba(108,52,131,0.3);flex-shrink:0;`;
                    prev.innerHTML = `<img src="${item.url}" style="width:32px;height:32px;object-fit:cover;border-radius:4px;">
                        <span style="font-size:0.72em;color:rgba(255,255,255,0.55);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.nombre}</span>
                        <button onclick="window._bnhPortLimpiarGalSel()"
                            style="background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;font-size:0.9em;padding:0;">✕</button>`;
                    const pending = document.getElementById('bnh-port-pending');
                    if (pending) pending.insertAdjacentElement('beforebegin', prev);
                    document.getElementById('bnh-port-input')?.focus();
                    toast('📎 Imagen lista · pulsa ▶ para enviar', 'info');
                };
                grid.appendChild(cell);
            });
            dd.appendChild(grid);
        }

        // Posicionar relativo al área de input
        const inputArea = document.getElementById('bnh-port-input')?.closest('div[style*="padding:7px"]');
        if (inputArea) {
            inputArea.style.position = 'relative';
            inputArea.appendChild(dd);
        }

        // Cerrar al click fuera
        setTimeout(() => {
            document.addEventListener('mousedown', function _close(e) {
                if (!dd.contains(e.target) && e.target.id !== 'bnh-port-gal-btn') {
                    dd.remove();
                    document.removeEventListener('mousedown', _close);
                }
            });
        }, 10);
    };

    // ── Eliminar mensaje propio ───────────────────────────────
    window._bnhPortEliminarMsg = async (id) => {
        const { supabase } = await import('./bnh-auth.js');
        // Obtener paths de media para limpiar storage
        const msg = portState.mensajes.find(m => m.id === id);
        if (!msg) return;

        // Borrar del DOM inmediatamente (optimista)
        document.querySelector(`.bnh-port-msg[data-msg-id="${id}"]`)?.remove();
        portState.mensajes = portState.mensajes.filter(m => m.id !== id);

        // Limpiar storage si tiene media
        if (msg.imagen_path) {
            let paths = [];
            try { paths = JSON.parse(msg.imagen_path); if (!Array.isArray(paths)) paths = [msg.imagen_path]; }
            catch(_) { paths = [msg.imagen_path]; }
            if (paths.length) await supabase.storage.from('imagenes-bnh').remove(paths);
        }
        if (msg.video_path)  await supabase.storage.from('imagenes-bnh').remove([msg.video_path]);
        if (msg.audio_path)  await supabase.storage.from('imagenes-bnh').remove([msg.audio_path]);

        await supabase.from('op_mensajes').delete().eq('id', id);
    };

    // ── Editar mensaje propio (inline) ────────────────────────
    window._bnhPortEditarMsg = (id) => {
        const msg = portState.mensajes.find(m => m.id === id);
        if (!msg || !msg.contenido) return;

        const msgEl  = document.querySelector(`.bnh-port-msg[data-msg-id="${id}"]`);
        if (!msgEl) return;

        // Buscar el div de contenido de texto dentro de la burbuja
        // Es el último div con font-size:0.82em dentro del bubble
        const bubble  = msgEl.querySelector('[style*="border:1px solid"]');
        if (!bubble) return;

        // Reemplazar la parte de texto por un textarea inline
        // Guardar el contenido original en el bubble como data attr
        bubble.dataset.originalContenido = msg.contenido;

        // Buscar y ocultar el div de texto (último hijo del bubble si tiene texto)
        const textoDiv = bubble.querySelector('div[style*="0.82em"]');
        const originalHTML = textoDiv ? textoDiv.outerHTML : '';
        if (textoDiv) textoDiv.remove();

        const ta = document.createElement('textarea');
        ta.value = msg.contenido;
        ta.style.cssText = `width:100%;min-height:54px;background:rgba(255,255,255,0.08);
            border:1.5px solid rgba(108,52,131,0.6);border-radius:6px;
            color:rgba(255,255,255,0.88);font:inherit;font-size:0.8em;
            padding:5px 7px;resize:vertical;box-sizing:border-box;outline:none;`;

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:5px;justify-content:flex-end;margin-top:4px;';

        const btnCancelar = document.createElement('button');
        btnCancelar.textContent = 'Cancelar';
        btnCancelar.style.cssText = `background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);
            color:rgba(255,255,255,0.55);border-radius:5px;padding:3px 9px;cursor:pointer;font-size:0.72em;`;
        btnCancelar.onclick = () => {
            ta.remove(); btnRow.remove();
            // Restaurar div de texto original
            const restored = document.createElement('div');
            restored.innerHTML = originalHTML;
            const node = restored.firstElementChild;
            if (node) bubble.appendChild(node);
        };

        const btnGuardar = document.createElement('button');
        btnGuardar.textContent = '💾 Guardar';
        btnGuardar.style.cssText = `background:#6c3483;border:none;color:white;
            border-radius:5px;padding:3px 9px;cursor:pointer;font-size:0.72em;font-weight:700;`;
        btnGuardar.onclick = async () => {
            const nuevo = ta.value.trim();
            if (!nuevo) return;
            const { supabase } = await import('./bnh-auth.js');
            let { error } = await supabase.from('op_mensajes')
                .update({ contenido: nuevo, editado_en: new Date().toISOString() }).eq('id', id);
            if (error?.code === '42703' || error?.code === 'PGRST204') {
                ({ error } = await supabase.from('op_mensajes').update({ contenido: nuevo }).eq('id', id));
            }
            if (error) { toast('❌ Error al guardar', 'error'); return; }

            // Actualizar estado local
            const m = portState.mensajes.find(m => m.id === id);
            if (m) { m.contenido = nuevo; m.editado_en = new Date().toISOString(); }

            ta.remove(); btnRow.remove();
            // Re-renderizar solo el bubble text
            const newTexto = document.createElement('div');
            newTexto.style.cssText = 'font-size:0.82em;line-height:1.45;word-break:break-word;';
            // Markup básico
            newTexto.innerHTML = String(nuevo)
                .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                .replace(/@([^@\n]+)@/g,'<strong style="color:#c39bd3;">@$1@</strong>')
                .replace(/#(\S+)/g,'<span style="color:#5dade2;">#$1</span>');
            bubble.appendChild(newTexto);

            // Actualizar la línea de hora para mostrar (editado)
            const horaDiv = msgEl.querySelector('div[style*="0.59em"]') || msgEl.querySelector('div[style*="flex;align-items"]');
            if (horaDiv && !horaDiv.querySelector('em')) {
                horaDiv.insertAdjacentHTML('beforeend', ' <em style="font-size:0.85em;opacity:0.6;">(editado)</em>');
            }
            toast('✅ Mensaje editado', 'ok');
        };

        btnRow.appendChild(btnCancelar);
        btnRow.appendChild(btnGuardar);
        bubble.appendChild(ta);
        bubble.appendChild(btnRow);
        ta.focus();
    };

    window._bnhPortSubirGaleria = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*,video/*';
        inp.onchange = async () => {
            const file = inp.files[0]; if (!file) return;
            const isVid = file.type.startsWith('video/');
            toast('⬆️ Subiendo…', 'info');
            const res = isVid ? await _subirVideo(file) : await _subirImagen(file);
            if (res.ok) {
                await _cargarGaleria();
                switchTab('galeria');
                toast('✅ Subido a galería', 'ok');
            } else toast('❌ Error al subir', 'error');
        };
        inp.click();
    };

    // Perfil
    window._bnhPortGuardarNombre = async () => {
        const inp    = document.getElementById('bnh-port-nombre-inp');
        const nombre = inp?.value.trim();
        if (!nombre) { toast('El nombre no puede estar vacío', 'error'); return; }
        await _guardarPerfil(portState.perfil.id, { nombre, avatar_path: portState.perfil.avatar_path });
        portState.perfil.nombre = nombre;
        portState.perfiles[portState.perfil.id] = { ...portState.perfil };
        // Actualizar nombre en titlebar
        const span = document.querySelector('#bnh-port-titlebar span:last-of-type');
        if (span) span.textContent = nombre;
        const msg = document.getElementById('bnh-port-perfil-msg');
        if (msg) { msg.style.color='#27ae60'; msg.textContent='✅ Nombre actualizado'; }
        toast('✅ Nombre actualizado', 'ok');
    };

    window._bnhPortPreviewAvatar = (input) => {
        const file = input.files[0]; if (!file) return;
        const prev = document.getElementById('bnh-port-avatar-prev');
        if (prev) prev.src = URL.createObjectURL(file);
    };

    window._bnhPortGuardarAvatar = async () => {
        const inp = document.getElementById('bnh-port-avatar-inp');
        if (!inp?.files?.length) { toast('Selecciona una imagen primero', 'error'); return; }
        const path = await _subirAvatar(inp.files[0], portState.perfil.id);
        if (!path) { toast('❌ Error subiendo avatar', 'error'); return; }
        await _guardarPerfil(portState.perfil.id, { nombre: portState.perfil.nombre, avatar_path: path });
        portState.perfil.avatar_path = path;
        portState.perfiles[portState.perfil.id] = { ...portState.perfil };
        const msg = document.getElementById('bnh-port-perfil-msg');
        if (msg) { msg.style.color='#27ae60'; msg.textContent='✅ Avatar actualizado'; }
        toast('✅ Avatar actualizado', 'ok');
    };

}
