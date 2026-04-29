// ============================================================
// bnh-recon.js — Reconexión automática al volver a la pestaña
// Colocar en la RAÍZ del proyecto.
//
// USO (en cada página main.js):
//
//   import { initRecon } from '../bnh-recon.js';
//
//   // Al final de init(), después de cargar datos:
//   initRecon({
//       onReconectar: async () => {
//           await Promise.all([cargarTodo(), cargarFusiones()]);
//           sincronizarVista();
//       },
//       umbralMs:  3000,   // opcional — tiempo mínimo fuera para reconectar (default 3s)
//       toastId:   'fichas-toast',  // opcional — id del elemento toast de la página
//   });
//
// ── POR QUÉ ESTO EXISTE ───────────────────────────────────────
// Los navegadores modernos "congelan" pestañas en background:
//   - Chrome/Edge: throttling de timers a 1 req/min tras ~5 min
//   - Safari: suspende JavaScript completamente al ocultar la pestaña
//   - Firefox: reduce frecuencia de tasks background agresivamente
//
// Consecuencia: el cliente Supabase (que usa fetch + WebSocket) pierde
// la sesión o queda con tokens expirados. Al volver, las queries fallan
// silenciosamente con "JWT expired" o simplemente no responden.
//
// La solución es escuchar `visibilitychange` y al recuperar visibilidad:
//   1. Esperar un tick para que el lock interno de Supabase Auth se libere
//   2. Recargar los datos (cargarTodo, cargarFusiones, etc.)
//   3. Re-renderizar la vista actual
// ============================================================

// ── Utilidad interna: toast genérico ──────────────────────────
function _mostrarToast(toastId, msg, claseOk = 'toast-ok') {
    const el = toastId ? document.getElementById(toastId) : null;
    if (!el) return;
    el.textContent = msg;
    el.className   = claseOk;
    el.style.display = 'block';
    clearTimeout(el._toastTimer);
    el._toastTimer = setTimeout(() => {
        el.className     = '';
        el.style.display = 'none';
    }, 2500);
}

// ── Estado interno del módulo ─────────────────────────────────
let _instanciada = false;

/**
 * Inicializa el listener de reconexión para la página actual.
 * Seguro llamarlo múltiples veces — solo instala el listener una vez.
 *
 * @param {object} opts
 * @param {() => Promise<void>} opts.onReconectar  Callback async que recarga datos y re-renderiza.
 * @param {number}  [opts.umbralMs=3000]            Tiempo mínimo de ausencia (ms) para disparar recarga.
 * @param {string}  [opts.toastId]                  ID del elemento <div id="..."> para el toast.
 * @param {boolean} [opts.mostrarToast=true]         Si mostrar el toast "🔄 Reconectado".
 * @param {() => boolean} [opts.estaLogueado]        Función que retorna si hay sesión activa.
 *                                                   Si retorna false, se hace reload completo.
 */
export function initRecon({
    onReconectar,
    umbralMs      = 3000,
    toastId       = null,
    mostrarToast  = true,
    estaLogueado  = null,
} = {}) {
    if (_instanciada) return;
    _instanciada = true;

    if (typeof onReconectar !== 'function') {
        console.warn('[bnh-recon] Se requiere onReconectar como función async.');
        return;
    }

    let _lastVisible  = Date.now();
    let _reconectando = false;

    document.addEventListener('visibilitychange', async () => {
        if (document.hidden) {
            // Registrar cuándo se fue
            _lastVisible = Date.now();
            return;
        }

        // Volvió a primer plano
        if (_reconectando) return;
        _reconectando = true;

        const awayMs = Date.now() - _lastVisible;

        try {
            // ── 1. Verificar sesión ──────────────────────────────
            // Si hay función de verificación y la sesión expiró → reload completo.
            // NO llamamos APIs de auth aquí — solo chequeamos el estado en memoria
            // para evitar competir con el lock interno de Supabase.
            if (typeof estaLogueado === 'function' && !estaLogueado()) {
                window.location.reload();
                return;
            }

            // ── 2. Umbral de tiempo ──────────────────────────────
            // Si el usuario solo cambió de pestaña por menos de umbralMs, no hacer nada.
            if (awayMs < umbralMs) return;

            // ── 3. Pequeña espera ────────────────────────────────
            // Dar tiempo al lock de auth de Supabase para liberarse antes de queries.
            await new Promise(r => setTimeout(r, 200));

            // ── 4. Recargar datos y re-renderizar ────────────────
            await onReconectar();

            // ── 5. Toast de confirmación ─────────────────────────
            if (mostrarToast) {
                _mostrarToast(toastId, '🔄 Reconectado');
            }

        } catch (e) {
            console.warn('[bnh-recon] Error al reconectar:', e.message || e);
            // No relanzar — el fallo silencioso es preferible a romper la UI
        } finally {
            _reconectando = false;
        }
    });

    // ── Nota técnica ─────────────────────────────────────────
    // NO escuchamos 'focus' en window porque compite con visibilitychange
    // por el lock de auth de Supabase y genera AbortError en Safari.
    // 'visibilitychange' es suficiente y más confiable entre navegadores.
}

/**
 * Reinicia el módulo (útil para testing o si la página se reutiliza como SPA).
 * En uso normal no hace falta llamarlo.
 */
export function resetRecon() {
    _instanciada = false;
}
