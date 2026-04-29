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
// ============================================================

// ── Indicador de conexión ─────────────────────────────────────
// Se inyecta un pequeño punto de color junto al badge de sesión.
// Verde = conectado, Amarillo = reconectando, Rojo = sin conexión.

const DOT_ID = 'bnh-conn-dot';

function _getOrCreateDot() {
    let dot = document.getElementById(DOT_ID);
    if (!dot) {
        dot = document.createElement('div');
        dot.id = DOT_ID;
        dot.title = 'Estado de conexión';
        dot.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 4px 9px;
            border-radius: 20px;
            font-size: 0.72em;
            font-weight: 700;
            letter-spacing: 0.3px;
            border: 1.5px solid transparent;
            transition: all 0.3s ease;
            white-space: nowrap;
            cursor: default;
            user-select: none;
            height: 36px;
            box-sizing: border-box;
        `;
        // Insertar antes del badge de sesión
        const badge = document.getElementById('bnh-session-badge');
        if (badge?.parentNode) {
            badge.parentNode.insertBefore(dot, badge);
        } else {
            // Fallback: añadir al final del header-top
            const headerTop = document.querySelector('.header-top');
            if (headerTop) headerTop.appendChild(dot);
        }
    }
    return dot;
}

function _setDotState(state) {
    const dot = _getOrCreateDot();
    if (!dot) return;

    const estados = {
        online: {
            html:   '● Online',
            bg:     'rgba(39,174,96,0.10)',
            border: '#27ae60',
            color:  '#1e8449',
        },
        reconnecting: {
            html:   '◌ Reconectando…',
            bg:     'rgba(243,156,18,0.12)',
            border: '#f39c12',
            color:  '#b7770d',
        },
        offline: {
            html:   '● Sin conexión',
            bg:     'rgba(231,76,60,0.10)',
            border: '#e74c3c',
            color:  '#c0392b',
        },
    };

    const s = estados[state] || estados.online;
    dot.innerHTML   = s.html;
    dot.style.background   = s.bg;
    dot.style.borderColor  = s.border;
    dot.style.color        = s.color;
}

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

    // Mostrar online al arrancar
    _setDotState('online');

    // Detectar offline/online del navegador
    window.addEventListener('offline', () => _setDotState('offline'));
    window.addEventListener('online',  () => _setDotState('online'));

    let _lastVisible  = Date.now();
    let _reconectando = false;

    document.addEventListener('visibilitychange', async () => {
        if (document.hidden) {
            _lastVisible = Date.now();
            return;
        }

        if (_reconectando) return;
        _reconectando = true;

        const awayMs = Date.now() - _lastVisible;

        try {
            // 1. Verificar sesión
            if (typeof estaLogueado === 'function' && !estaLogueado()) {
                window.location.reload();
                return;
            }

            // 2. Si estuvo fuera menos del umbral, solo confirmar que sigue online
            if (awayMs < umbralMs) {
                _setDotState(navigator.onLine ? 'online' : 'offline');
                return;
            }

            // 3. Reconectando — mostrar estado amarillo
            _setDotState('reconnecting');

            // 4. Espera para liberar lock de auth de Supabase
            await new Promise(r => setTimeout(r, 200));

            // 5. Recargar datos y re-renderizar
            await onReconectar();

            // 6. Volver a verde
            _setDotState('online');

            if (mostrarToast) {
                _mostrarToast(toastId, '🔄 Reconectado');
            }

        } catch (e) {
            console.warn('[bnh-recon] Error al reconectar:', e.message || e);
            _setDotState('offline');
        } finally {
            _reconectando = false;
        }
    });
}

/**
 * Reinicia el módulo (útil para testing o páginas SPA reutilizadas).
 */
export function resetRecon() {
    _instanciada = false;
}
