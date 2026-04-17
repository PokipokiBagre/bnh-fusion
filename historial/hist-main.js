// ============================================================
// hist-main.js — Punto de Entrada y Controladores
// ============================================================
import { bnhAuth, currentConfig } from '../bnh-auth.js';
import {
    hilosState, postsState, rankingState,
    ptTagState, estadoUI
} from './hist-state.js';
import {
    cargarHilos, cargarPostsDB, cargarRankingDB,
    cargarPTTagDelHilo, scrapearHilo, calcularPTHilo, eliminarPTHilo,
    agregarHilo, eliminarHilo, toggleHiloActivo
} from './hist-data.js';
import {
    renderRanking, renderTimeline, renderHilos,
    renderHeaderInfo, toast
} from './hist-ui.js';

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

    // Tab config solo para admins
    const btnCfg = document.getElementById('btn-config');
    if (btnCfg) btnCfg.style.display = estadoUI.esAdmin ? 'inline-block' : 'none';

    await cargarHilos();

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

    mostrarVista('ranking');
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
}

// ── Navegación ────────────────────────────────────────────────
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
    }
}

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
    mostrarVista('ranking');
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
        ? `✅ ${resultado.nuevos} post(s) nuevo(s)${resultado.nuevos > 0 ? ' · PT calculados' : ''}`
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
    // rango === 'todo' → desdeFecha queda null → procesa todos

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

window.toggleAutoRefresh = function() {
    if (estadoUI.autoRefresh) {
        clearInterval(estadoUI.refreshInterval);
        estadoUI.refreshInterval = null;
        estadoUI.autoRefresh     = false;
        toast('⏹ Auto-refresh detenido', 'info');
    } else {
        if (!estadoUI.hiloActivo) { toast('Selecciona un hilo primero', 'error'); return; }
        estadoUI.autoRefresh     = true;
        estadoUI.refreshInterval = setInterval(async () => {
            if (!estadoUI.hiloActivo) return;
            const { board, thread_id, thread_url } = estadoUI.hiloActivo;
            const r = await scrapearHilo(board, thread_id, thread_url);
            if (r.ok && r.nuevos > 0) {
                await cargarHiloActivo();
                mostrarVista(estadoUI.vistaActual);
                toast(`🆕 ${r.nuevos} post(s) · PT calculados`, 'ok');
            }
            renderHeaderInfo();
        }, estadoUI.refreshRate);
        toast(`▶ Auto-refresh cada ${estadoUI.refreshRate / 1000}s`, 'ok');
    }
    renderHeaderInfo();
};

window.irAHilos     = function() { mostrarVista('hilos'); };
window.mostrarVista = mostrarVista;

document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => mostrarVista(btn.dataset.vista));
});

init().catch(console.error);
