// ============================================================
// hist-main.js — Punto de Entrada y Controladores
// ============================================================
import { bnhAuth, currentConfig, supabase } from '../bnh-auth.js';
import {
    hilosState, postsState, rankingState,
    ptTagState, estadoUI, selPostsState
} from './hist-state.js';
import {
    cargarHilos, cargarPostsDB, cargarRankingDB,
    cargarPTTagDelHilo, scrapearHilo, calcularPTHilo, eliminarPTHilo,
    agregarHilo, eliminarHilo, toggleHiloActivo,
    calcularPTExtraParaPosts, revertirPTExtraParaPosts
} from './hist-data.js';
import {
    renderRanking, renderTimeline, renderHilos,
    renderHeaderInfo, renderOpcionesModal, toast,
    actualizarPanelSel
} from './hist-ui.js';
import { initOpciones, OPCIONES } from '../bnh-opciones-tags.js';

// Exponemos las opciones globalmente para que hist-ui pueda leerlas en renderPTBadgesConOrigen
window._histOpciones = null;

// ── Bridge con Tampermonkey ───────────────────────────────────
(function setupExtensionBridge() {
    if (typeof chrome === 'undefined' || !chrome.runtime) return;
    const extId = window.__BNH_EXT_ID__;
    if (!extId) return;
    window.__BNH_EXT_FETCH__ = function(url, callback) {
        chrome.runtime.sendMessage(extId, { type: 'FETCH_8CHAN_JSON', url }, (response) => {
            if (chrome.runtime.lastError) { callback(null); return; }
            callback(response?.text ?? null);
        });
    };
    console.log('[BNH] Extensión de Chrome detectada ✅');
})();

// ── Init ──────────────────────────────────────────────────────
async function init() {
    const favicon = document.getElementById('dynamic-favicon');
    if (favicon && currentConfig) {
        favicon.href = `${currentConfig.storageUrl}/imginterfaz/icon.png?v=${Date.now()}`;
    }

    await bnhAuth.init();
    estadoUI.esAdmin = bnhAuth.esAdmin();

    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();

    // Botón actualizar en header: solo OP
    const btnActualizar = document.getElementById('btn-actualizar-header');
    if (btnActualizar) btnActualizar.style.display = estadoUI.esAdmin ? '' : 'none';

    await initOpciones();
    window._histOpciones = OPCIONES;

    await cargarHilos();

    // Cargar todos los PJs para el selector de personajes extra
    try {
        const { data: pjs } = await supabase
            .from('personajes_refinados')
            .select('id, nombre_refinado, tags')
            .order('nombre_refinado');
        selPostsState.todosPJs = pjs || [];
    } catch(e) { console.warn('[init] No se pudo cargar PJs:', e); }

    // Restaurar hilo activo de sesión anterior
    const guardado = sessionStorage.getItem('hist_hilo_activo');
    if (guardado) {
        try {
            estadoUI.hiloActivo = JSON.parse(guardado);
            await cargarHiloActivo();
        } catch {
            estadoUI.hiloActivo = null;
        }
    }

    mostrarVista('timeline'); // timeline es la vista principal
}

// ── Exponer referencias para el panel de selección ───────────
// hist-ui.js las lee para preseleccionar PJs nativos del post
function _exponerReferencias() {
    window._histPostsRef       = postsState;
    window._histMapaAlias      = mapaAliasAGrupo;
    window._selPostsStateRef   = selPostsState;
}

// ── Cargar datos del hilo activo ──────────────────────────────
async function cargarHiloActivo() {
    if (!estadoUI.hiloActivo) return;
    const { board, thread_id } = estadoUI.hiloActivo;
    await Promise.all([
        cargarPostsDB(board, thread_id),
        cargarRankingDB(board, thread_id),
        cargarPTTagDelHilo(thread_id)
    ]);
    _exponerReferencias();
}

// ── Navegación ────────────────────────────────────────────────
function mostrarVista(vista) {
    estadoUI.vistaActual = vista;
    document.querySelectorAll('.nav-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.vista === vista);
    });
    renderHeaderInfo();
    switch (vista) {
        case 'timeline': renderTimeline(); break;
        case 'ranking':  renderRanking();  break;
        case 'hilos':    renderHilos();    break;
    }
}

// ── Selector de hilo inline ───────────────────────────────────
window._histSelHiloInline = async function(valor) {
    if (!valor) return;
    const [board, threadId] = valor.split('|');
    await window.seleccionarHilo(board, Number(threadId));
};

// ── Seleccionar hilo ──────────────────────────────────────────
window.seleccionarHilo = async function(board, threadId) {
    const hilo = hilosState.find(h => h.board === board && h.thread_id == threadId);
    if (!hilo) return;

    estadoUI.hiloActivo = {
        board,
        thread_id:  threadId,
        thread_url: hilo.thread_url,
        titulo:     hilo.titulo
    };
    sessionStorage.setItem('hist_hilo_activo', JSON.stringify(estadoUI.hiloActivo));

    await cargarHiloActivo();
    renderHeaderInfo();
    toast(`Hilo "${hilo.titulo}" seleccionado`, 'ok');
    mostrarVista(estadoUI.vistaActual);
};

// ── Scrape automático ─────────────────────────────────────────
window.scrapeManual = async function(board, threadId) {
    const hilo = hilosState.find(h => h.board === board && h.thread_id == threadId);
    if (!hilo) return;

    toast('⏳ Obteniendo posts…', 'info');
    renderHeaderInfo();

    const resultado = await scrapearHilo(board, threadId, hilo.thread_url, null, false);

    if (!resultado.ok) {
        toast('❌ ' + resultado.error, 'error');
        return;
    }

    if (estadoUI.hiloActivo?.thread_id == threadId) {
        await cargarHiloActivo();
        mostrarVista(estadoUI.vistaActual);
    }

    await cargarHilos();
    toast(resultado.nuevos > 0
        ? `✅ ${resultado.nuevos} post(s) nuevo(s)`
        : '✓ Sin posts nuevos', 'ok');
    renderHeaderInfo();
};

// ── Scrape manual (pega JSON) ─────────────────────────────────
window.actualizarManual = async function(board, threadId) {
    const url = `https://8chan.moe/${board}/res/${threadId}.json`;

    const existingModal = document.getElementById('modal-pegar-json');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'modal-pegar-json';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:99999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px);';

    modal.innerHTML = `
        <div style="background:white; padding:24px; border-radius:12px; width:90%; max-width:700px; box-shadow:0 8px 24px rgba(0,0,0,0.2); border: 2px solid var(--orange);">
            <h3 style="color:var(--green-dark); margin-bottom:12px; font-family:'Cinzel',serif; font-size:1.4em;">📥 Bypass de Cloudflare / TOS</h3>
            <p style="font-size:0.9em; color:var(--gray-700); margin-bottom:16px; line-height:1.5;">
                1. Abre: <a href="${url}" target="_blank" style="color:var(--green); word-break:break-all; font-weight:bold;">${url}</a><br>
                2. Si aparece la advertencia de 8chan, acepta.<br>
                3. <b>Ctrl+A</b> → <b>Ctrl+C</b> → pega abajo:
            </p>
            <textarea id="json-textarea" rows="12" placeholder="Pega aquí el JSON..." style="width:100%; box-sizing:border-box; padding:12px; border:1px solid var(--gray-300); border-radius:8px; margin-bottom:16px; font-family:monospace; font-size:0.85em; resize:vertical;"></textarea>
            <div style="display:flex; justify-content:flex-end; gap:12px;">
                <button id="btn-cancelar-json" class="btn btn-outline">Cancelar</button>
                <button id="btn-procesar-json" class="btn btn-green" style="background:var(--orange); border-color:var(--orange);">Procesar JSON</button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    document.getElementById('btn-cancelar-json').onclick = () => modal.remove();

    document.getElementById('btn-procesar-json').onclick = async () => {
        const input = document.getElementById('json-textarea').value.trim();
        if (!input) { toast('El campo está vacío', 'error'); return; }

        try {
            const manualJson = JSON.parse(input);
            modal.remove();

            const hilo = hilosState.find(h => h.board === board && h.thread_id == threadId);
            if (!hilo) return;

            toast('⏳ Procesando JSON y calculando PT…', 'info');
            renderHeaderInfo();

            const resultado = await scrapearHilo(board, threadId, hilo.thread_url, manualJson);

            if (!resultado.ok) { toast('❌ ' + resultado.error, 'error'); return; }

            if (estadoUI.hiloActivo?.thread_id == threadId) {
                await cargarHiloActivo();
                mostrarVista(estadoUI.vistaActual);
            }

            await cargarHilos();
            toast(resultado.nuevos > 0 ? `✅ ${resultado.nuevos} post(s) nuevo(s) · PT calculados` : '✓ Sin posts nuevos', 'ok');
            renderHeaderInfo();
            mostrarVista('hilos');
        } catch (e) {
            toast('❌ JSON inválido o incompleto.', 'error');
            console.error(e);
        }
    };
};

window.actualizarHiloActivo = async function() {
    if (!estadoUI.hiloActivo) { toast('Selecciona un hilo primero', 'error'); return; }
    const { board, thread_id } = estadoUI.hiloActivo;
    await window.scrapeManual(board, thread_id);
};

// ── Calcular PT (con rango de fecha) ─────────────────────────
window.calcularPT = async function(rango) {
    if (!estadoUI.hiloActivo) { toast('Selecciona un hilo primero', 'error'); return; }
    const { board, thread_id } = estadoUI.hiloActivo;

    let desdeFecha = null;
    let label = 'completo';
    if (rango === '1d')  { desdeFecha = new Date(Date.now() - 1  * 86400000); label = 'último día'; }
    if (rango === '3d')  { desdeFecha = new Date(Date.now() - 3  * 86400000); label = 'últimos 3 días'; }
    if (rango === '7d')  { desdeFecha = new Date(Date.now() - 7  * 86400000); label = 'última semana'; }

    toast(`⏳ Calculando PT ${label}…`, 'info');
    renderHeaderInfo();

    const res = await calcularPTHilo(board, thread_id, desdeFecha);
    if (!res.ok) { toast('❌ Error calculando PT', 'error'); return; }

    await cargarHiloActivo();
    mostrarVista(estadoUI.vistaActual);
    toast(`✅ PT calculados (${res.procesados} posts · ${label})`, 'ok');
    renderHeaderInfo();
};

// ── Eliminar PT por rango ────────────────────────────────────
window.eliminarPT = async function(rango) {
    if (!estadoUI.hiloActivo) { toast('Selecciona un hilo primero', 'error'); return; }
    const { board, thread_id } = estadoUI.hiloActivo;

    let desdeFecha = null;
    let label = 'todos';
    if (rango === '1d') { desdeFecha = new Date(Date.now() - 86400000);     label = 'último día'; }
    if (rango === '3d') { desdeFecha = new Date(Date.now() - 3*86400000);   label = 'últimos 3 días'; }
    if (rango === '7d') { desdeFecha = new Date(Date.now() - 7*86400000);   label = 'última semana'; }

    if (!confirm(`¿Eliminar PT de ${label} del hilo activo?\nEsto NO se puede deshacer.`)) return;

    toast(`⏳ Eliminando PT (${label})…`, 'info');
    renderHeaderInfo();

    const res = await eliminarPTHilo(board, thread_id, desdeFecha);
    if (!res.ok) { toast('❌ Error eliminando PT', 'error'); return; }

    await cargarHiloActivo();
    mostrarVista(estadoUI.vistaActual);
    toast(`🗑 PT eliminados (${res.eliminados} posts · ${label})`, 'ok');
    renderHeaderInfo();
};

window.agregarNuevoHilo = async function() {
    const url    = document.getElementById('inp-url')?.value?.trim();
    const titulo = document.getElementById('inp-titulo')?.value?.trim();
    if (!url) { toast('Ingresa la URL del hilo', 'error'); return; }

    toast('⏳ Agregando y scrapeando hilo…', 'info');
    const resultado = await agregarHilo(url, titulo);

    if (!resultado.ok) { toast('❌ ' + resultado.error, 'error'); return; }

    toast('✅ Hilo agregado', 'ok');
    document.getElementById('inp-url').value   = '';
    if (document.getElementById('inp-titulo')) document.getElementById('inp-titulo').value = '';
    mostrarVista('hilos');
};

window.pedirEliminarHilo = async function(board, threadId, titulo) {
    if (!confirm(`¿Eliminar el hilo "${titulo}" y sus posts?\nLos PT ya generados se conservan en los personajes.`)) return;
    await eliminarHilo(board, threadId);
    if (estadoUI.hiloActivo?.thread_id == threadId) {
        estadoUI.hiloActivo = null;
        sessionStorage.removeItem('hist_hilo_activo');
        postsState.length   = 0;
        rankingState.length = 0;
        Object.keys(ptTagState).forEach(k => delete ptTagState[k]);
    }
    toast('🗑 Hilo eliminado (PT conservados)', 'ok');
    mostrarVista('hilos');
};

window.toggleActivo = async function(board, threadId, nuevoEstado) {
    await toggleHiloActivo(board, threadId, nuevoEstado);
    toast(nuevoEstado ? '▶ Hilo activado' : '⏸ Hilo pausado', 'ok');
    mostrarVista('hilos');
};

window.irAHilos     = function() { mostrarVista('hilos'); };
window.mostrarVista = mostrarVista;

document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => mostrarVista(btn.dataset.vista));
});

// ── Panel Opciones Tags ───────────────────────────────────────
window.abrirOpcionesTags = function() {
    const existing = document.getElementById('modal-opciones-tags');
    if (existing) { existing.remove(); return; }

    const overlay = document.createElement('div');
    overlay.id = 'modal-opciones-tags';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);';
    overlay.innerHTML = `
        <div style="background:white;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);
            min-width:320px;max-width:540px;width:90%;border:2px solid var(--green);">
            <div style="display:flex;justify-content:space-between;align-items:center;
                padding:12px 16px;border-bottom:1px solid #e9ecef;">
                <span style="font-weight:700;color:var(--green-dark);font-family:'Cinzel',serif;">Opciones de PT</span>
                <button onclick="document.getElementById('modal-opciones-tags').remove()"
                    style="background:none;border:none;font-size:1.3em;cursor:pointer;color:#aaa;">×</button>
            </div>
            <div id="opciones-tags-body">
                ${renderOpcionesModal(estadoUI.esAdmin)}
            </div>
        </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
};

// ── Controles de selección de posts ──────────────────────────

window._histToggleSelPosts = function() {
    selPostsState.activo = !selPostsState.activo;
    if (!selPostsState.activo) {
        selPostsState.postsSel.clear();
        selPostsState.personajesExtra = [];
        mostrarVista('timeline'); // rebuild completo al cerrar (para quitar el panel)
    } else {
        mostrarVista('timeline'); // rebuild completo al abrir (para mostrar el panel)
    }
};

window._histCancelarSel = function() {
    selPostsState.activo = false;
    selPostsState.postsSel.clear();
    selPostsState.personajesExtra = [];
    mostrarVista('timeline');
};

window._histLimpiarPosts = function() {
    selPostsState.postsSel.clear();
    _exponerReferencias();
    renderTimeline();
};

window._histTogglePostSel = function(postNo) {
    if (selPostsState.postsSel.has(postNo)) selPostsState.postsSel.delete(postNo);
    else selPostsState.postsSel.add(postNo);
    _exponerReferencias();
    renderTimeline();
};

window._histFiltroRol = function(v) {
    selPostsState.filtroRol = v;
    _exponerReferencias();
    renderTimeline();
};

window._histFiltroEst = function(v) {
    selPostsState.filtroEstado = v;
    _exponerReferencias();
    renderTimeline();
};

window._histTogglePJExtra = async function(nombre) {
    const idx = selPostsState.personajesExtra.findIndex(e => e.nombre_refinado === nombre);
    if (idx >= 0) {
        // Quitar personaje extra: revertir sus PT en posts seleccionados Y en posts hijos
        const pjExtra = selPostsState.personajesExtra[idx];
        selPostsState.personajesExtra.splice(idx, 1);

        if (estadoUI.hiloActivo && selPostsState.postsSel.size > 0) {
            toast('⏳ Revirtiendo PT de ' + nombre + '…', 'info');
            const { board, thread_id } = estadoUI.hiloActivo;
            const postNos = [...selPostsState.postsSel];

            // Posts hijos: posts del hilo que citan a alguno de los seleccionados
            const { postsState } = await import('./hist-state.js');
            const postNosHijos = postsState.filter(p => {
                const refs = []; let m; const re = />>(\d+)/g; const txt = p.contenido || '';
                while ((m = re.exec(txt)) !== null) refs.push(Number(m[1]));
                return refs.some(r => postNos.includes(r));
            }).map(p => p.post_no);

            const todosLosPostsAfectados = [...new Set([...postNos, ...postNosHijos])];
            await revertirPTExtraParaPosts(thread_id, nombre, todosLosPostsAfectados);
            await cargarPTTagDelHilo(thread_id);
            toast('✅ PT de ' + nombre + ' revertidos (' + todosLosPostsAfectados.length + ' posts)', 'ok');
        }
    } else {
        const pj = selPostsState.todosPJs.find(g => g.nombre_refinado === nombre);
        if (pj) {
            selPostsState.personajesExtra.push({ nombre_refinado: pj.nombre_refinado, tags: pj.tags || [] });

            // Actualizar poster_name en DB para cada post seleccionado
            // para que el PJ extra aparezca en el nombre y en los avatares
            if (estadoUI.hiloActivo && selPostsState.postsSel.size > 0) {
                const { board, thread_id } = estadoUI.hiloActivo;
                for (const postNo of selPostsState.postsSel) {
                    const postLocal = postsState.find(p => p.post_no === postNo);
                    if (!postLocal) continue;
                    // Verificar que el PJ no esté ya en el poster_name
                    const partesActuales = postLocal.poster_name.split(',').map(s => s.trim());
                    const yaApareceComoAlias = partesActuales.some(p => {
                        const grupo = mapaAliasAGrupo[p] || mapaAliasAGrupo[p.replace(/##?\S+/, '').trim()];
                        return grupo === nombre;
                    });
                    if (yaApareceComoAlias) continue;
                    // Añadir el nombre_refinado al poster_name
                    const nuevoPosterName = postLocal.poster_name + ', ' + nombre;
                    try {
                        await supabase.from('historial_posts')
                            .update({ poster_name: nuevoPosterName })
                            .eq('board', board)
                            .eq('thread_id', thread_id)
                            .eq('post_no', postNo);
                        // Actualizar en memoria también
                        postLocal.poster_name = nuevoPosterName;
                        // Asegurar que el alias está en el mapa
                        mapaAliasAGrupo[nombre] = nombre;
                    } catch(e) {
                        console.warn('[togglePJExtra] Error actualizando poster_name:', e);
                    }
                }
                _exponerReferencias();
            }
        }
    }
    _exponerReferencias();
    renderTimeline();
};

// ── Calcular PT extra para posts seleccionados ────────────────
window._histCalcPTExtra = async function() {
    if (!estadoUI.hiloActivo) { toast('Selecciona un hilo primero', 'error'); return; }
    if (!selPostsState.postsSel.size) { toast('Selecciona al menos un post', 'error'); return; }
    if (!selPostsState.personajesExtra.length) { toast('Añade al menos un personaje extra', 'error'); return; }

    const { board, thread_id } = estadoUI.hiloActivo;
    const postNos = [...selPostsState.postsSel];
    const pjsExtra = selPostsState.personajesExtra;

    toast('⏳ Calculando PT para posts seleccionados…', 'info');

    const res = await calcularPTExtraParaPosts(board, thread_id, postNos, pjsExtra, false);
    if (!res.ok) { toast('❌ ' + res.msg, 'error'); return; }

    await cargarPTTagDelHilo(thread_id);
    mostrarVista('timeline');
    toast(`✅ PT calculados: ${res.transacciones} transacciones para ${pjsExtra.map(p=>p.nombre_refinado).join(', ')}`, 'ok');
};

// ── Calcular PT para posts que citan los seleccionados ────────
window._histCalcPTCitas = async function() {
    if (!estadoUI.hiloActivo) { toast('Selecciona un hilo primero', 'error'); return; }
    if (!selPostsState.postsSel.size) { toast('Selecciona al menos un post', 'error'); return; }
    if (!selPostsState.personajesExtra.length) { toast('Añade al menos un personaje extra', 'error'); return; }

    const { board, thread_id } = estadoUI.hiloActivo;
    const postNosReferenciados = [...selPostsState.postsSel];

    // Encontrar posts que citan a los seleccionados
    const postsCitadores = postsState.filter(p => {
        const refs = []; let m; const re = />>(\d+)/g; const txt = p.contenido || '';
        while ((m = re.exec(txt)) !== null) refs.push(Number(m[1]));
        return refs.some(r => postNosReferenciados.includes(r));
    }).map(p => p.post_no);

    if (!postsCitadores.length) { toast('Ningún post cita a los seleccionados', 'info'); return; }

    const pjsExtra = selPostsState.personajesExtra;
    toast(`⏳ Calculando PT para ${postsCitadores.length} posts citadores…`, 'info');

    const res = await calcularPTExtraParaPosts(board, thread_id, postsCitadores, pjsExtra, true);
    if (!res.ok) { toast('❌ ' + res.msg, 'error'); return; }

    await cargarPTTagDelHilo(thread_id);
    mostrarVista('timeline');
    toast(`✅ PT calculados para ${postsCitadores.length} posts citadores · ${res.transacciones} transacciones`, 'ok');
};

init().catch(console.error);
