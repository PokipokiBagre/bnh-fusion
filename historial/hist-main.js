// ============================================================
// hist-main.js — Punto de Entrada y Controladores
// ============================================================
import { bnhAuth, supabase } from '../bnh-auth.js';
import {
    hilosState, postsState, puntosState, rankingState,
    estadoUI, CONFIG_PUNTOS
} from './hist-state.js';
import {
    cargarHilos, cargarPostsDB, cargarPuntosDB, cargarRankingDB,
    scrapearHilo, agregarHilo, eliminarHilo, toggleHiloActivo,
    recalcularPuntos
} from './hist-data.js';
import {
    renderRanking, renderTimeline, renderHilos, renderConfig,
    renderHeaderInfo, toast
} from './hist-ui.js';

// ── Bridge con extensión de Chrome (si está instalada) ────────
// La extensión inyecta window.__BNH_EXT_ID__ con su chrome.runtime ID.
// Aquí creamos el puente window.__BNH_EXT_FETCH__ que hist-data.js usará.
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


async function init() {
    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();

    await bnhAuth.init();
    estadoUI.esAdmin = bnhAuth.esAdmin();

    const btnCfg = document.getElementById('btn-config');
    if (btnCfg) btnCfg.style.display = estadoUI.esAdmin ? 'inline-block' : 'none';

    await cargarHilos();

    const guardado = sessionStorage.getItem('hist_hilo_activo');
    if (guardado) {
        try {
            estadoUI.hiloActivo = JSON.parse(guardado);
            await cargarHiloActivo();
        } catch { estadoUI.hiloActivo = null; }
    }

    mostrarVista('ranking');
}

// ── Cargar datos del hilo activo ──────────────────────────────
async function cargarHiloActivo() {
    if (!estadoUI.hiloActivo) return;
    const { board, thread_id } = estadoUI.hiloActivo;
    await Promise.all([
        cargarPostsDB(board, thread_id),
        cargarPuntosDB(board, thread_id),
        cargarRankingDB(board, thread_id)
    ]);
}

// ── Navegación entre vistas ───────────────────────────────────
function mostrarVista(vista) {
    estadoUI.vistaActual = vista;
    document.querySelectorAll('.nav-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.vista === vista);
    });
    renderHeaderInfo();
    switch (vista) {
        case 'ranking':  renderRanking();  break;
        case 'timeline': renderTimeline(); break;
        case 'hilos':    renderHilos();    break;
        case 'config':   renderConfig();   break;
    }
}

// ── Seleccionar hilo activo ───────────────────────────────────
window.seleccionarHilo = async function(board, threadId) {
    const hilo = hilosState.find(h => h.board === board && h.thread_id == threadId);
    if (!hilo) return;

    estadoUI.hiloActivo = {
        board,
        thread_id: threadId,
        thread_url: hilo.thread_url,
        titulo:     hilo.titulo
    };
    sessionStorage.setItem('hist_hilo_activo', JSON.stringify(estadoUI.hiloActivo));

    await cargarHiloActivo();
    renderHeaderInfo();
    toast(`Hilo "${hilo.titulo}" seleccionado`, 'ok');
    mostrarVista('ranking');
};

// ── Scrape manual de un hilo (Automático) ─────────────────────
window.scrapeManual = async function(board, threadId) {
    const hilo = hilosState.find(h => h.board === board && h.thread_id == threadId);
    if (!hilo) return;

    toast('⏳ Obteniendo posts…', 'info');
    renderHeaderInfo();

    const resultado = await scrapearHilo(board, threadId, hilo.thread_url);

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
        ? `✅ ${resultado.nuevos} post(s) nuevo(s)!`
        : '✓ Sin posts nuevos', 'ok');
    renderHeaderInfo();
};

// ── Actualización Manual (Bypass definitivo de Cloudflare/TOS) 
// ── Actualización Manual (Bypass definitivo con Modal Personalizado) ──
window.actualizarManual = async function(board, threadId) {
    const url = `https://8chan.moe/${board}/res/${threadId}.json`;
    
    // 1. Eliminar modal anterior si existe
    const existingModal = document.getElementById('modal-pegar-json');
    if (existingModal) existingModal.remove();

    // 2. Crear el nuevo modal
    const modal = document.createElement('div');
    modal.id = 'modal-pegar-json';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:99999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px);';

    modal.innerHTML = `
        <div style="background:white; padding:24px; border-radius:12px; width:90%; max-width:700px; box-shadow:0 8px 24px rgba(0,0,0,0.2); border: 2px solid var(--orange);">
            <h3 style="color:var(--green-dark); margin-bottom:12px; font-family:'Cinzel',serif; font-size:1.4em;">📥 Bypass de Cloudflare / TOS</h3>
            <p style="font-size:0.9em; color:var(--gray-700); margin-bottom:16px; line-height:1.5;">
                1. Abre una nueva pestaña y entra a: <br>
                <a href="${url}" target="_blank" style="color:var(--green); word-break:break-all; font-weight:bold;">${url}</a><br>
                2. Si te sale la advertencia de 8chan, dale a "I AGREE AND WISH TO PROCEED".<br>
                3. Presiona <b>Ctrl+A</b> para seleccionar todo, <b>Ctrl+C</b> para copiar y pega aquí abajo:
            </p>
            <textarea id="json-textarea" rows="12" placeholder="Pega aquí todo el código JSON..." style="width:100%; box-sizing:border-box; padding:12px; border:1px solid var(--gray-300); border-radius:8px; margin-bottom:16px; font-family:monospace; font-size:0.85em; resize:vertical;"></textarea>
            <div style="display:flex; justify-content:flex-end; gap:12px;">
                <button id="btn-cancelar-json" class="btn btn-outline">Cancelar</button>
                <button id="btn-procesar-json" class="btn btn-green" style="background:var(--orange); border-color:var(--orange);">Procesar JSON</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // 3. Funciones de los botones del modal
    document.getElementById('btn-cancelar-json').onclick = () => modal.remove();

    document.getElementById('btn-procesar-json').onclick = async () => {
        const input = document.getElementById('json-textarea').value.trim();
        if (!input) {
            toast('El campo está vacío', 'error');
            return;
        }

        try {
            const manualJson = JSON.parse(input);
            modal.remove(); // Cerramos la ventana si se pudo parsear bien

            const hilo = hilosState.find(h => h.board === board && h.thread_id == threadId);
            if (!hilo) return;

            toast('⏳ Procesando JSON manual…', 'info');
            renderHeaderInfo();

            const resultado = await scrapearHilo(board, threadId, hilo.thread_url, manualJson);

            if (!resultado.ok) {
                toast('❌ ' + resultado.error, 'error');
                return;
            }

            if (estadoUI.hiloActivo?.thread_id == threadId) {
                await cargarHiloActivo();
                mostrarVista(estadoUI.vistaActual);
            }

            await cargarHilos();
            toast(resultado.nuevos > 0 ? `✅ ${resultado.nuevos} post(s) nuevo(s)!` : '✓ Sin posts nuevos', 'ok');
            renderHeaderInfo();
            mostrarVista('hilos');
        } catch (e) {
            toast('❌ Error: El texto pegado no está completo o no es un JSON válido.', 'error');
            console.error(e);
        }
    };
};

// ── Actualizar hilo activo ────────────────────────────────────
window.actualizarHiloActivo = async function() {
    if (!estadoUI.hiloActivo) { toast('Selecciona un hilo primero', 'error'); return; }
    const { board, thread_id } = estadoUI.hiloActivo;
    await window.scrapeManual(board, thread_id);
};

// ── Agregar nuevo hilo ────────────────────────────────────────
window.agregarNuevoHilo = async function() {
    const url    = document.getElementById('inp-url')?.value?.trim();
    const titulo = document.getElementById('inp-titulo')?.value?.trim();
    if (!url) { toast('Ingresa la URL del hilo', 'error'); return; }

    toast('⏳ Agregando y scrapeando hilo…', 'info');
    const resultado = await agregarHilo(url, titulo);

    if (!resultado.ok) {
        toast('❌ ' + resultado.error, 'error');
        return;
    }

    toast('✅ Hilo agregado correctamente', 'ok');
    if (document.getElementById('inp-url'))   document.getElementById('inp-url').value   = '';
    if (document.getElementById('inp-titulo')) document.getElementById('inp-titulo').value = '';
    mostrarVista('hilos');
};

// ── Eliminar hilo ─────────────────────────────────────────────
window.pedirEliminarHilo = async function(board, threadId, titulo) {
    if (!confirm(`¿Eliminar el hilo "${titulo}" y todos sus datos?\nEsta acción no se puede deshacer.`)) return;
    await eliminarHilo(board, threadId);
    if (estadoUI.hiloActivo?.thread_id == threadId) {
        estadoUI.hiloActivo = null;
        sessionStorage.removeItem('hist_hilo_activo');
        postsState.length = 0;
        puntosState.length = 0;
        rankingState.length = 0;
    }
    toast('🗑 Hilo eliminado', 'ok');
    mostrarVista('hilos');
};

// ── Toggle activo/inactivo ────────────────────────────────────
window.toggleActivo = async function(board, threadId, nuevoEstado) {
    await toggleHiloActivo(board, threadId, nuevoEstado);
    toast(nuevoEstado ? '▶ Hilo activado' : '⏸ Hilo pausado', 'ok');
    mostrarVista('hilos');
};

// ── Auto-Refresh ──────────────────────────────────────────────
window.toggleAutoRefresh = function() {
    if (estadoUI.autoRefresh) {
        clearInterval(estadoUI.refreshInterval);
        estadoUI.refreshInterval = null;
        estadoUI.autoRefresh     = false;
        toast('⏹ Auto-refresh detenido', 'info');
    } else {
        if (!estadoUI.hiloActivo) { toast('Selecciona un hilo primero', 'error'); return; }

        const rateInput = document.getElementById('cfg-refresh-rate');
        if (rateInput) estadoUI.refreshRate = parseInt(rateInput.value) * 1000 || 10000;

        estadoUI.autoRefresh    = true;
        estadoUI.refreshInterval = setInterval(async () => {
            if (!estadoUI.hiloActivo) return;
            const { board, thread_id, thread_url } = estadoUI.hiloActivo;
            const r = await scrapearHilo(board, thread_id, thread_url);
            if (r.ok && r.nuevos > 0) {
                await cargarHiloActivo();
                mostrarVista(estadoUI.vistaActual);
                toast(`🆕 ${r.nuevos} post(s) nuevo(s)!`, 'ok');
            }
            renderHeaderInfo();
        }, estadoUI.refreshRate);

        toast(`▶ Auto-refresh cada ${estadoUI.refreshRate / 1000}s`, 'ok');
    }
    renderHeaderInfo();
    renderConfig();
};

// ── Guardar configuración de puntos ──────────────────────────
window.guardarConfig = async function() {
    CONFIG_PUNTOS.rapido         = parseInt(document.getElementById('cfg-rapido')?.value)          || CONFIG_PUNTOS.rapido;
    CONFIG_PUNTOS.medio          = parseInt(document.getElementById('cfg-medio')?.value)           || CONFIG_PUNTOS.medio;
    CONFIG_PUNTOS.base           = parseInt(document.getElementById('cfg-base')?.value)            || CONFIG_PUNTOS.base;
    CONFIG_PUNTOS.umbral_rapido  = parseInt(document.getElementById('cfg-umbral-rapido')?.value)   || CONFIG_PUNTOS.umbral_rapido;
    CONFIG_PUNTOS.umbral_medio   = parseInt(document.getElementById('cfg-umbral-medio')?.value)    || CONFIG_PUNTOS.umbral_medio;

    if (!estadoUI.hiloActivo) {
        toast('Guarda un hilo primero para recalcular', 'info');
        renderConfig();
        return;
    }

    toast('⏳ Recalculando puntos…', 'info');
    const ok = await recalcularPuntos(estadoUI.hiloActivo.board, estadoUI.hiloActivo.thread_id);
    if (ok) {
        toast('✅ Puntos recalculados', 'ok');
        mostrarVista(estadoUI.vistaActual);
    } else {
        toast('❌ Error al recalcular', 'error');
    }
};

// ── Recalcular hilo activo ────────────────────────────────────
window.recalcularActual = async function() {
    if (!estadoUI.hiloActivo) return;
    toast('⏳ Recalculando…', 'info');
    const ok = await recalcularPuntos(estadoUI.hiloActivo.board, estadoUI.hiloActivo.thread_id);
    toast(ok ? '✅ Recalculado' : '❌ Error', ok ? 'ok' : 'error');
    if (ok) mostrarVista(estadoUI.vistaActual);
};

window.irAHilos = function() { mostrarVista('hilos'); };
window.mostrarVista = mostrarVista;

document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => mostrarVista(btn.dataset.vista));
});

init().catch(console.error);
