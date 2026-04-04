// ============================================================
// hist-main.js — Punto de Entrada y Controladores
// ============================================================
import { bnhAuth, supabase } from '../../bnh-auth.js';
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

// ── Inicialización ────────────────────────────────────────────
async function init() {
    // Badge de sesión
    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();

    await bnhAuth.init();
    estadoUI.esAdmin = bnhAuth.esAdmin();

    // Mostrar/ocultar botón de config
    const btnCfg = document.getElementById('btn-config');
    if (btnCfg) btnCfg.style.display = estadoUI.esAdmin ? 'inline-block' : 'none';

    // Cargar hilos rastreados
    await cargarHilos();

    // Recuperar hilo activo de sessionStorage
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

    // Highlight nav
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

// ── Scrape manual de un hilo ──────────────────────────────────
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
        ? `✅ ${resultado.nuevos} post${resultado.nuevos > 1 ? 's' : ''} nuevo${resultado.nuevos > 1 ? 's' : ''}!`
        : '✓ Sin posts nuevos', 'ok');
    renderHeaderInfo();
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
                toast(`🆕 ${r.nuevos} post${r.nuevos > 1 ? 's' : ''} nuevo${r.nuevos > 1 ? 's' : ''}!`, 'ok');
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
        toast('✅ Puntos recalculados con la nueva configuración', 'ok');
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

// ── Acceso rápido desde vista ranking ────────────────────────
window.irAHilos = function() { mostrarVista('hilos'); };

// ── Exponer navegación globalmente ────────────────────────────
window.mostrarVista = mostrarVista;

// ── Tabs del nav ──────────────────────────────────────────────
document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => mostrarVista(btn.dataset.vista));
});

// ── Arranque ──────────────────────────────────────────────────
init().catch(console.error);
