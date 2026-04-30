// ============================================================
// hist-main.js
// ============================================================
import { bnhAuth, currentConfig, supabase } from '../bnh-auth.js';
import { bnhPort } from '../bnh-port-principal.js';
import { initRecon, salvarRescate, restaurarRescate } from '../bnh-recon.js';
import { initScroll } from '../bnh-scroll.js';
import {
    hilosState, postsState, rankingState,
    ptTagState, estadoUI, selPostsState, mapaAliasAGrupo
} from './hist-state.js';
import {
    cargarHilos, cargarPostsDB, cargarRankingDB,
    cargarPTTagDelHilo, scrapearHilo, calcularPTHilo, eliminarPTHilo,
    agregarHilo, eliminarHilo, toggleHiloActivo
} from './hist-data.js';
import {
    renderRanking, renderTimeline, renderHilos,
    renderHeaderInfo, renderOpcionesModal, toast
} from './hist-ui.js';
import { initOpciones, OPCIONES } from '../bnh-opciones-tags.js';

// Referencias globales para hist-ui.js
function _sync() {
    window._histPostsRef     = postsState;
    window._histMapaAlias    = mapaAliasAGrupo;
    window._selPostsStateRef = selPostsState;
    window._histOpciones     = OPCIONES;
}

// Cargar datos del hilo activo
async function cargarHiloActivo() {
    if (!estadoUI.hiloActivo) return;
    const { board, thread_id } = estadoUI.hiloActivo;
    await Promise.all([
        cargarPostsDB(board, thread_id),
        cargarRankingDB(board, thread_id),
        cargarPTTagDelHilo(thread_id)
    ]);
    _sync();
}

// Navegación central — ÚNICO punto de entrada para cambiar vista
function ir(vista) {
    estadoUI.vistaActual = vista;
    document.querySelectorAll('.nav-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.vista === vista);
    });
    renderHeaderInfo();
    if (vista === 'timeline') renderTimeline();
    if (vista === 'ranking')  renderRanking();
    if (vista === 'hilos')    renderHilos();
}

// ── Guardar estado para rescate ───────────────────────────────
function _saveCurrentState() {
    salvarRescate({
        vistaActual:    estadoUI.vistaActual,
        filtroRol:      selPostsState.filtroRol,
        filtroEstado:   selPostsState.filtroEstado,
        pjBusqueda:     document.getElementById('hist-buscar-pj')?.value || '',
        selActivo:      selPostsState.activo,
        // Set no es serializable directamente — convertir a array
        postsSel:       [...selPostsState.postsSel],
    });
}

// Init
async function init() {
    const fav = document.getElementById('dynamic-favicon');
    if (fav && currentConfig)
        fav.href = `${currentConfig.storageUrl}/imginterfaz/icon.png?v=${Date.now()}`;

    await bnhAuth.init();
    estadoUI.esAdmin = bnhAuth.esAdmin();
    bnhPort.init().catch(console.error);
    if (estadoUI.esAdmin) window.dispatchEvent(new Event('_bnhAdminReady'));

    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();

    const btnAct = document.getElementById('btn-actualizar-header');
    if (btnAct) btnAct.style.display = estadoUI.esAdmin ? '' : 'none';

    await initOpciones();
    await cargarHilos();

    try {
        const { data: pjs } = await supabase
            .from('personajes_refinados')
            .select('id, nombre_refinado, tags')
            .order('nombre_refinado');
        selPostsState.todosPJs = pjs || [];
    } catch(e) { console.warn('[init] PJs:', e); }

    const guardado = sessionStorage.getItem('hist_hilo_activo');
    if (guardado) {
        try {
            estadoUI.hiloActivo = JSON.parse(guardado);
            // Verificar que el hilo guardado sigue existiendo
            const aun = hilosState.find(h =>
                h.board === estadoUI.hiloActivo.board &&
                h.thread_id == estadoUI.hiloActivo.thread_id
            );
            if (aun) {
                await cargarHiloActivo();
            } else {
                estadoUI.hiloActivo = null;
                sessionStorage.removeItem('hist_hilo_activo');
            }
        } catch { estadoUI.hiloActivo = null; }
    }

    // Si no hay hilo activo (primera visita o hilo eliminado),
    // preseleccionar el más reciente automáticamente
    if (!estadoUI.hiloActivo && hilosState.length) {
        const primero = hilosState[0]; // ya viene ordenado por creado_en DESC
        estadoUI.hiloActivo = {
            board:      primero.board,
            thread_id:  primero.thread_id,
            thread_url: primero.thread_url || '',
            titulo:     primero.titulo     || '',
        };
        sessionStorage.setItem('hist_hilo_activo', JSON.stringify(estadoUI.hiloActivo));
        await cargarHiloActivo();
    }

    _sync();

    // ── GUARDAR ESTADO AL SALIR / CAMBIAR PESTAÑA ────────────────
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) _saveCurrentState();
    });
    window.addEventListener('pagehide', () => _saveCurrentState(), { once: false });

    // ── RESTAURAR RESCATE ────────────────────────────────────────
    restaurarRescate({
        toastElId:  'toast-msg',
        maxEsperas: 60,
        onRestaurado: (saved) => {
            const extra = saved?.extra || {};

            // A. Restaurar filtros del panel de selección
            if (extra.filtroRol)    selPostsState.filtroRol    = extra.filtroRol;
            if (extra.filtroEstado) selPostsState.filtroEstado = extra.filtroEstado;

            // B. Restaurar modo selección y posts seleccionados
            if (extra.selActivo) {
                selPostsState.activo = true;
                if (Array.isArray(extra.postsSel) && extra.postsSel.length) {
                    extra.postsSel.forEach(no => selPostsState.postsSel.add(Number(no)));
                }
            }

            // C. Restaurar búsqueda de PJ (el input puede no existir aún,
            //    el filtrado en vivo se aplica al montar el panel)
            if (extra.pjBusqueda) {
                const inp = document.getElementById('hist-buscar-pj');
                if (inp) {
                    inp.value = extra.pjBusqueda;
                    window._histBuscarPJ?.(extra.pjBusqueda);
                }
            }

            // D. Navegar a la vista guardada
            const vista = extra.vistaActual || 'timeline';
            _sync();
            ir(vista);
        },
    });

    // ── RECONEXIÓN PROFUNDA ───────────────────────────────────────
    initRecon({
        supabaseClient: supabase,
        umbralMs:       3000,
        onReconectar: async () => {
            await cargarHilos();
            if (estadoUI.hiloActivo) await cargarHiloActivo();
            _sync();
            ir(estadoUI.vistaActual);
        },
        onEmergencia: () => _saveCurrentState(),
    });

    // ── BFCACHE ───────────────────────────────────────────────────
    window.addEventListener('pageshow', async (e) => {
        if (!e.persisted) return;
        try {
            await cargarHilos();
            if (estadoUI.hiloActivo) await cargarHiloActivo();
            _sync();
            ir(estadoUI.vistaActual);
        } catch(err) { console.error('[hist] pageshow refresh error:', err); }
    });

    ir('timeline');
    initScroll();
}
window.seleccionarHilo = async function(board, threadId) {
    const hilo = hilosState.find(h => h.board === board && h.thread_id == threadId);
    if (!hilo) return;
    estadoUI.hiloActivo = {
        board, thread_id: threadId,
        thread_url: hilo.thread_url, titulo: hilo.titulo
    };
    sessionStorage.setItem('hist_hilo_activo', JSON.stringify(estadoUI.hiloActivo));
    await cargarHiloActivo();
    renderHeaderInfo();
    toast(`Hilo "${hilo.titulo}" seleccionado`, 'ok');
    ir('timeline');
};

window._histSelHiloInline = async function(valor) {
    if (!valor) return;
    const [board, threadId] = valor.split('|');
    await window.seleccionarHilo(board, threadId);
};

// Scrape
window.scrapeManual = async function(board, threadId) {
    if (!estadoUI.esAdmin) { toast('⛔ Solo los OPs pueden actualizar hilos', 'error'); return; }
    const hilo = hilosState.find(h => h.board === board && h.thread_id == threadId);
    if (!hilo) return;
    toast('⏳ Obteniendo posts…', 'info');
    const r = await scrapearHilo(board, threadId, hilo.thread_url, null, false);
    if (!r.ok) { toast('❌ ' + r.error, 'error'); return; }
    if (estadoUI.hiloActivo?.thread_id == threadId) { await cargarHiloActivo(); ir(estadoUI.vistaActual); }
    await cargarHilos();
    toast(r.nuevos > 0 ? `✅ ${r.nuevos} post(s) nuevo(s)` : '✓ Sin posts nuevos', 'ok');
    renderHeaderInfo();
};

window.actualizarHiloActivo = async function() {
    if (!estadoUI.hiloActivo) { toast('Selecciona un hilo primero', 'error'); return; }
    await window.scrapeManual(estadoUI.hiloActivo.board, estadoUI.hiloActivo.thread_id);
};

window.actualizarManual = async function(board, threadId) {
    const url = `https://8chan.moe/${board}/res/${threadId}.json`;
    document.getElementById('modal-pegar-json')?.remove();
    const modal = document.createElement('div');
    modal.id = 'modal-pegar-json';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
    modal.innerHTML = `
        <div style="background:white;padding:24px;border-radius:12px;width:90%;max-width:700px;border:2px solid var(--orange);">
            <h3 style="color:var(--green-dark);margin-bottom:12px;font-family:'Cinzel',serif;">📥 Bypass de Cloudflare / TOS</h3>
            <p style="font-size:0.9em;color:#555;margin-bottom:16px;line-height:1.5;">
                1. Abre: <a href="${url}" target="_blank" style="color:var(--green);">${url}</a><br>
                2. Acepta la advertencia si aparece.<br>
                3. <b>Ctrl+A → Ctrl+C</b> → pega abajo:
            </p>
            <textarea id="json-textarea" rows="12" placeholder="Pega aquí el JSON..." style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #ddd;border-radius:8px;margin-bottom:16px;font-family:monospace;font-size:0.85em;resize:vertical;"></textarea>
            <div style="display:flex;justify-content:flex-end;gap:12px;">
                <button id="btn-cancelar-json" class="btn btn-outline">Cancelar</button>
                <button id="btn-procesar-json" class="btn btn-green" style="background:var(--orange);border-color:var(--orange);">Procesar JSON</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('btn-cancelar-json').onclick = () => modal.remove();
    document.getElementById('btn-procesar-json').onclick = async () => {
        const input = document.getElementById('json-textarea').value.trim();
        if (!input) { toast('Campo vacío', 'error'); return; }
        try {
            const json = JSON.parse(input); modal.remove();
            const hilo = hilosState.find(h => h.board === board && h.thread_id == threadId);
            if (!hilo) return;
            toast('⏳ Procesando JSON…', 'info');
            const r = await scrapearHilo(board, threadId, hilo.thread_url, json);
            if (!r.ok) { toast('❌ ' + r.error, 'error'); return; }
            if (estadoUI.hiloActivo?.thread_id == threadId) { await cargarHiloActivo(); ir(estadoUI.vistaActual); }
            await cargarHilos();
            toast(r.nuevos > 0 ? `✅ ${r.nuevos} post(s) · PT calculados` : '✓ Sin posts nuevos', 'ok');
        } catch(e) { toast('❌ JSON inválido.', 'error'); }
    };
};

// Calcular / Eliminar PT
window.calcularPT = async function(rango) {
    if (!estadoUI.esAdmin) { toast('⛔ Solo los OPs pueden calcular PT', 'error'); return; }
    if (!estadoUI.hiloActivo) { toast('Selecciona un hilo primero', 'error'); return; }
    const { board, thread_id } = estadoUI.hiloActivo;
    let df = null, lbl = 'completo';
    if (rango === '1d') { df = new Date(Date.now()-86400000);   lbl = 'último día'; }
    if (rango === '3d') { df = new Date(Date.now()-3*86400000); lbl = 'últimos 3 días'; }
    if (rango === '7d') { df = new Date(Date.now()-7*86400000); lbl = 'última semana'; }
    toast(`⏳ Calculando PT ${lbl}…`, 'info');
    const r = await calcularPTHilo(board, thread_id, df);
    if (!r.ok) { toast('❌ Error calculando PT', 'error'); return; }
    await cargarHiloActivo();
    ir(estadoUI.vistaActual);
    toast(`✅ PT calculados (${r.procesados} posts · ${lbl})`, 'ok');
};

window.eliminarPT = async function(rango) {
    if (!estadoUI.esAdmin) { toast('⛔ Solo los OPs pueden eliminar PT', 'error'); return; }
    if (!estadoUI.hiloActivo) { toast('Selecciona un hilo primero', 'error'); return; }
    const { board, thread_id } = estadoUI.hiloActivo;
    let df = null, lbl = 'todos';
    if (rango === '1d') { df = new Date(Date.now()-86400000);   lbl = 'último día'; }
    if (rango === '3d') { df = new Date(Date.now()-3*86400000); lbl = 'últimos 3 días'; }
    if (rango === '7d') { df = new Date(Date.now()-7*86400000); lbl = 'última semana'; }
    if (!confirm(`¿Eliminar PT de ${lbl}?\nNo se puede deshacer.`)) return;
    toast(`⏳ Eliminando PT (${lbl})…`, 'info');
    const r = await eliminarPTHilo(board, thread_id, df);
    if (!r.ok) { toast('❌ Error eliminando PT', 'error'); return; }
    await cargarHiloActivo();
    ir(estadoUI.vistaActual);
    toast(`🗑 PT eliminados (${r.eliminados} posts · ${lbl})`, 'ok');
};

// CRUD Hilos
window.agregarNuevoHilo = async function() {
    const url   = document.getElementById('inp-url')?.value?.trim();
    const titulo = document.getElementById('inp-titulo')?.value?.trim();
    if (!url) { toast('Ingresa la URL del hilo', 'error'); return; }
    toast('⏳ Agregando hilo…', 'info');
    const r = await agregarHilo(url, titulo);
    if (!r.ok) { toast('❌ ' + r.error, 'error'); return; }
    toast('✅ Hilo agregado', 'ok');
    document.getElementById('inp-url').value = '';
    if (document.getElementById('inp-titulo')) document.getElementById('inp-titulo').value = '';
    ir('hilos');
};

window.pedirEliminarHilo = async function(board, threadId, titulo) {
    if (!confirm(`¿Eliminar "${titulo}" y sus posts?\nLos PT se conservan.`)) return;
    await eliminarHilo(board, threadId);
    if (estadoUI.hiloActivo?.thread_id == threadId) {
        estadoUI.hiloActivo = null;
        sessionStorage.removeItem('hist_hilo_activo');
        postsState.length = 0; rankingState.length = 0;
        Object.keys(ptTagState).forEach(k => delete ptTagState[k]);
    }
    toast('🗑 Hilo eliminado (PT conservados)', 'ok');
    ir('hilos');
};

window.toggleActivo = async function(board, threadId, estado) {
    await toggleHiloActivo(board, threadId, estado);
    toast(estado ? '▶ Activado' : '⏸ Pausado', 'ok');
    ir('hilos');
};

// Opciones PT
window.abrirOpcionesTags = function() {
    const ex = document.getElementById('modal-opciones-tags');
    if (ex) { ex.remove(); return; }
    const ov = document.createElement('div');
    ov.id = 'modal-opciones-tags';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);';
    ov.innerHTML = `
        <div style="background:white;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);min-width:320px;max-width:540px;width:90%;border:2px solid var(--green);">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #e9ecef;">
                <span style="font-weight:700;color:var(--green-dark);font-family:'Cinzel',serif;">Opciones de PT</span>
                <button onclick="document.getElementById('modal-opciones-tags').remove()" style="background:none;border:none;font-size:1.3em;cursor:pointer;color:#aaa;">×</button>
            </div>
            <div id="opciones-tags-body">${renderOpcionesModal(estadoUI.esAdmin)}</div>
        </div>`;
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
};

// Selección de posts (solo OP)
window._histToggleSelPosts = function() {
    selPostsState.activo = !selPostsState.activo;
    if (!selPostsState.activo) { selPostsState.postsSel.clear(); selPostsState.personajesExtra = []; }
    _sync(); ir('timeline');
};

window._histCancelarSel = function() {
    selPostsState.activo = false;
    selPostsState.postsSel.clear();
    selPostsState.personajesExtra = [];
    _sync(); ir('timeline');
};

window._histLimpiarPosts  = function()   { selPostsState.postsSel.clear(); _sync(); ir('timeline'); };
window._histFiltroRol     = function(v)  { selPostsState.filtroRol = v;    _sync(); ir('timeline'); };
window._histFiltroEst     = function(v)  { selPostsState.filtroEstado = v; _sync(); ir('timeline'); };

window._histTogglePostSel = function(postNo) {
    if (selPostsState.postsSel.has(postNo)) selPostsState.postsSel.delete(postNo);
    else selPostsState.postsSel.add(postNo);
    _sync(); ir('timeline');
};

window._histTogglePJExtra = async function(nombre) {
    if (!estadoUI.hiloActivo || selPostsState.postsSel.size === 0) return;
    const { board, thread_id } = estadoUI.hiloActivo;
    const postNos = [...selPostsState.postsSel];

    let presentes = 0;
    postNos.forEach(postNo => {
        const post = postsState.find(p => p.post_no === postNo);
        if (post) {
            const partes = post.poster_name.split(',').map(s => s.trim());
            if (partes.some(p => {
                const g = mapaAliasAGrupo[p] || mapaAliasAGrupo[p.replace(/##?\S+/,'').trim()];
                return g === nombre;
            })) presentes++;
        }
    });

    const accionAgregar = presentes < postNos.length;
    toast(`⏳ ${accionAgregar ? 'Agregando' : 'Quitando'} personaje…`, 'info');

    for (const postNo of postNos) {
        const postLocal = postsState.find(p => p.post_no === postNo);
        if (!postLocal) continue;
        const partes = postLocal.poster_name.split(',').map(s => s.trim()).filter(Boolean);
        
        let nuevasPartes;
        if (accionAgregar) {
            const yaEsta = partes.some(p => {
                const g = mapaAliasAGrupo[p] || mapaAliasAGrupo[p.replace(/##?\S+/,'').trim()];
                return g === nombre;
            });
            if (yaEsta) continue; 
            nuevasPartes = [...partes, nombre];
        } else {
            nuevasPartes = partes.filter(p => {
                if (p === nombre) return false;
                const g = mapaAliasAGrupo[p] || mapaAliasAGrupo[p.replace(/##?\S+/,'').trim()];
                return g !== nombre;
            });
        }

        if (nuevasPartes.length === partes.length) continue;
        const nuevoPosterName = nuevasPartes.join(', ');

        try {
            await supabase.from('historial_posts')
                .update({ poster_name: nuevoPosterName })
                .eq('board', board).eq('thread_id', thread_id).eq('post_no', postNo);
            postLocal.poster_name = nuevoPosterName;
        } catch(e) { console.warn('[togglePJExtra]', e); }
    }

    _sync(); ir('timeline');
    toast(`✅ Personaje ${accionAgregar ? 'agregado' : 'quitado'} de la DB.`, 'ok');
};

window._histEliminarPT = async function() {
    if (!estadoUI.hiloActivo || !selPostsState.postsSel.size) return;
    if (!confirm('¿Eliminar todos los PT de los posts seleccionados?')) return;
    const { thread_id } = estadoUI.hiloActivo;
    
    // Importación dinámica para llamar la nueva función limpia de hist-data.js
    const { eliminarPTPorPosts } = await import('./hist-data.js');
    
    toast('⏳ Eliminando PT…', 'info');
    const r = await eliminarPTPorPosts(thread_id, [...selPostsState.postsSel]);
    if (!r.ok) { toast('❌ Error', 'error'); return; }
    await cargarPTTagDelHilo(thread_id);
    _sync(); ir('timeline');
    toast('🗑 PT eliminados', 'ok');
};

window._histCalcPT = async function(modo) {
    if (!estadoUI.hiloActivo || !selPostsState.postsSel.size) return;
    const { board, thread_id } = estadoUI.hiloActivo;
    const postNos = [...selPostsState.postsSel];
    toast('⏳ Calculando PT…', 'info');

    const { eliminarPTPorPosts, procesarPTSeleccion } = await import('./hist-data.js');

    if (modo === 'completo') {
        await eliminarPTPorPosts(thread_id, postNos);
    }
    
    const r = await procesarPTSeleccion(board, thread_id, postNos, modo === 'faltantes');
    if (!r.ok) { toast('❌ ' + r.msg, 'error'); return; }

    await cargarPTTagDelHilo(thread_id);
    _sync(); ir('timeline');
    toast(`✅ PT calculados: ${r.transacciones} transacciones`, 'ok');
};

window._histCalcPTHijos = async function(modo) {
    if (!estadoUI.hiloActivo || !selPostsState.postsSel.size) return;
    const { board, thread_id } = estadoUI.hiloActivo;
    const selNos = [...selPostsState.postsSel];
    
    const citadores = postsState.filter(p => {
        const refs = []; let m; const re = />>(\d+)/g; const txt = p.contenido || '';
        while ((m = re.exec(txt)) !== null) refs.push(Number(m[1]));
        return refs.some(r => selNos.includes(r));
    }).map(p => p.post_no);

    if (!citadores.length) { toast('Ningún post cita a los seleccionados', 'info'); return; }
    toast(`⏳ Calculando PT para ${citadores.length} posts citadores…`, 'info');

    const { eliminarPTPorPosts, procesarPTSeleccion } = await import('./hist-data.js');

    if (modo === 'completo') {
        await eliminarPTPorPosts(thread_id, citadores);
    }

    const r = await procesarPTSeleccion(board, thread_id, citadores, modo === 'faltantes');
    if (!r.ok) { toast('❌ ' + r.msg, 'error'); return; }

    await cargarPTTagDelHilo(thread_id);
    _sync(); ir('timeline');
    toast(`✅ ${citadores.length} posts · ${r.transacciones} transacciones`, 'ok');
};

// Buscador de personajes en el panel (filtra en vivo sin re-render completo)
window._histBuscarPJ = function(q) {
    const pool = document.getElementById('hist-pj-pool');
    if (!pool) return;
    const termino = q.trim().toLowerCase();
    pool.querySelectorAll('[data-pj-nombre]').forEach(el => {
        const nombre = el.dataset.pjNombre || '';
        el.style.display = (!termino || nombre.toLowerCase().includes(termino)) ? '' : 'none';
    });
    // Ocultar/mostrar separadores si todos sus siguientes están ocultos
    pool.querySelectorAll('[data-sep]').forEach(sep => {
        let siguiente = sep.nextElementSibling;
        let algunoVisible = false;
        while (siguiente && !siguiente.dataset.sep) {
            if (siguiente.style.display !== 'none') { algunoVisible = true; break; }
            siguiente = siguiente.nextElementSibling;
        }
        sep.style.display = algunoVisible ? '' : 'none';
    });
};

// Nav
window.irAHilos     = () => ir('hilos');
window.mostrarVista = ir;
document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => ir(btn.dataset.vista));
});

init().catch(console.error);
