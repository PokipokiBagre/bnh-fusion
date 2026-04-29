// ============================================================
// bnh-recon.js — Reconexión Ultra Agresiva (1.5s) + Auto-Rescate V3
// Colocar en la RAÍZ del proyecto.
//
// EXPORTS:
//   initRecon({ supabaseClient, onReconectar, umbralMs })
//     → Inicializa el dot de estado y el reconector automático.
//       Llamar UNA VEZ tras bnhAuth.init().
//
//   resetRecon()
//     → Permite reinicializar (útil en HMR / dev).
//
//   salvarRescate(extraData?)
//     → Aspiradora global: guarda todos los inputs/textareas/selects
//       con ID en sessionStorage, más cualquier dato extra que el
//       módulo llamante quiera añadir (objeto plano).
//       Llamar manualmente antes de un reload forzado externo,
//       o dejar que initRecon lo llame automáticamente en emergencia.
//
//   restaurarRescate(opciones?)
//     → Lee sessionStorage, restaura todos los campos y dispara
//       los eventos necesarios para que los frameworks reaccionen.
//       Llamar AL INICIO de cada página (antes del primer render).
//       Opciones: {
//           onRestaurado(stateToSave) → callback con los datos recuperados,
//           toastElId                 → id del elemento toast (default: 'fichas-toast'),
//           maxEsperas                → intentos de reintento si el DOM aún no tiene
//                                       los elementos (default: 60, cada 50ms = 3s),
//       }
// ============================================================

const DOT_ID       = 'bnh-conn-dot';
const STORAGE_KEY  = 'bnh_rescate_v3';

// ─────────────────────────────────────────────────────────────
// DOT DE ESTADO DE CONEXIÓN
// ─────────────────────────────────────────────────────────────

function _getOrCreateDot() {
    let dot = document.getElementById(DOT_ID);
    if (dot) return dot;
    dot = document.createElement('div');
    dot.id = DOT_ID;
    dot.title = 'Estado de conexión';
    dot.style.cssText = [
        'display:inline-flex', 'align-items:center', 'gap:5px',
        'padding:4px 9px', 'border-radius:20px',
        'font-size:0.72em', 'font-weight:700', 'letter-spacing:0.3px',
        'border:1.5px solid transparent',
        'transition:background 0.3s,color 0.3s,border-color 0.3s',
        'white-space:nowrap', 'cursor:default', 'user-select:none',
        'height:36px', 'box-sizing:border-box',
    ].join(';');
    const badge     = document.getElementById('bnh-session-badge');
    const headerTop = document.querySelector('.header-top');
    if (badge?.parentNode) badge.parentNode.insertBefore(dot, badge);
    else if (headerTop)    headerTop.appendChild(dot);
    else                   document.body.appendChild(dot);
    return dot;
}

function _setDotState(state) {
    if (!document.body) { setTimeout(() => _setDotState(state), 50); return; }
    const dot = _getOrCreateDot();
    if (!dot) return;
    const S = {
        online:       { html: '● Online',        bg: 'rgba(39,174,96,0.10)',  border: '#27ae60', color: '#1e8449' },
        reconnecting: { html: '◌ Reconectando…', bg: 'rgba(243,156,18,0.12)', border: '#f39c12', color: '#b7770d' },
        offline:      { html: '● Sin conexión',  bg: 'rgba(231,76,60,0.10)',  border: '#e74c3c', color: '#c0392b' },
    };
    const s = S[state] || S.online;
    dot.innerHTML         = s.html;
    dot.style.background  = s.bg;
    dot.style.borderColor = s.border;
    dot.style.color       = s.color;
}

// ─────────────────────────────────────────────────────────────
// PROTOCOLO DE EMERGENCIA — GUARDAR
// ─────────────────────────────────────────────────────────────

/**
 * Aspiradora global. Captura el estado completo de la página actual
 * y lo guarda en sessionStorage para que restaurarRescate() lo recupere
 * tras el reload.
 *
 * @param {Object} [extraData] — Datos adicionales específicos de la página.
 *   Se guardan bajo stateToSave.extra y quedan disponibles en onRestaurado().
 *   Ejemplo: { tabActiva: 'stats', charName: 'Arthur', deltas: {...} }
 */
export function salvarRescate(extraData = {}) {
    try {
        const stateToSave = {
            timestamp:  Date.now(),
            pagina:     window.location.pathname,  // Para detectar si el rescate es de la misma página
            globalData: {},
            uiState:    {},
            extra:      extraData,
        };

        // ── 1. Capturar TODOS los inputs, textareas y selects con ID ──
        //    Incluye: deltas, PV actual, chat del Panel OP, buscadores, etc.
        document.querySelectorAll('input[id], textarea[id], select[id]').forEach(el => {
            if (el.type === 'file' || el.type === 'submit' || el.type === 'button') return;
            if (el.type === 'checkbox' || el.type === 'radio') {
                stateToSave.globalData[el.id] = el.checked;
            } else if (el.value !== '') {
                stateToSave.globalData[el.id] = el.value;
            }
        });

        // ── 2. Tags activos en el sidebar (fichas) ─────────────────────
        stateToSave.uiState.activeTags = Array.from(
            document.querySelectorAll('#sidebar-tag-list li.active .tag-link')
        ).map(el => el.textContent.trim());

        // ── 3. Modal abierto (fichas — panel OP) ───────────────────────
        const overlay = document.getElementById('op-overlay');
        if (overlay && overlay.style.display !== 'none') {
            const titleEl   = overlay.querySelector('.op-modal-title');
            const titleText = titleEl ? titleEl.textContent : '';
            let activeTab   = 0;
            const activeTabEl = overlay.querySelector('.op-tab.active');
            if (activeTabEl?.id) activeTab = parseInt(activeTabEl.id.replace('op-tab-', '')) || 0;

            if (titleText.includes('Editar Lore')) {
                stateToSave.uiState.modal = {
                    type:     'lore',
                    charName: titleText.replace('📝 ', '').replace(' — Editar Lore', '').trim(),
                };
            } else if (titleText.includes('⚙️')) {
                stateToSave.uiState.modal = {
                    type:      'op',
                    charName:  titleText.replace('⚙️ ', '').trim(),
                    activeTab,
                };
            }
        }

        // ── 4. Panel OP flotante — conversación activa ─────────────────
        //    (por si portState no alcanzó a persistirla antes del reload)
        try {
            const convSel = document.getElementById('bnh-port-conv-sel');
            if (convSel?.value) stateToSave.uiState.portConvActual = convSel.value;
        } catch(_) {}

        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
        console.info('[bnh-recon] Estado salvado en sessionStorage.', stateToSave);
    } catch (e) {
        console.error('[bnh-recon] Error salvando datos:', e);
    }
}

// ─────────────────────────────────────────────────────────────
// PROTOCOLO DE EMERGENCIA — RESTAURAR
// ─────────────────────────────────────────────────────────────

/**
 * Restaura el estado guardado por salvarRescate() tras un reload de emergencia.
 * Debe llamarse AL INICIO de cada página, antes del primer render de la UI.
 *
 * Los elementos que aún no existen en el DOM (modales, panel OP) son
 * reintentados cada 50ms hasta maxEsperas veces.
 *
 * @param {Object} [opciones]
 * @param {Function} [opciones.onRestaurado]  — Callback(stateToSave) con los datos completos.
 *   Úsalo para restaurar estado complejo que no es un simple input:
 *   tabs activas, arrays de deltas, modo de vista, etc.
 * @param {string}   [opciones.toastElId]     — ID del toast (default: 'fichas-toast').
 * @param {number}   [opciones.maxEsperas]    — Máx. reintentos para elementos diferidos (default: 60).
 */
export function restaurarRescate({
    onRestaurado = null,
    toastElId    = 'fichas-toast',
    maxEsperas   = 60,
} = {}) {
    let saved;
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        saved = JSON.parse(raw);
        sessionStorage.removeItem(STORAGE_KEY); // Consumir de inmediato para no restaurar dos veces
    } catch(e) {
        console.warn('[bnh-recon] No se pudo leer el rescate:', e);
        return;
    }

    // Si el rescate es de otra página no restaurar los inputs
    // (el callback onRestaurado sí se llama siempre; la página puede usar extra)
    const mismaPagina = !saved.pagina || saved.pagina === window.location.pathname;

    let intentos = 0;

    function _ciclo() {
        intentos++;
        let pendientes = 0; // Inputs que todavía no existen en el DOM

        if (mismaPagina) {
            Object.entries(saved.globalData || {}).forEach(([id, valor]) => {
                const el = document.getElementById(id);
                if (!el) {
                    pendientes++;
                    return;
                }
                // Restaurar valor
                if (el.type === 'checkbox' || el.type === 'radio') {
                    if (el.checked !== valor) {
                        el.checked = valor;
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                } else if (el.value !== String(valor)) {
                    el.value = String(valor);
                    // Disparar ambos eventos para compatibilidad con listeners nativos y frameworks
                    el.dispatchEvent(new Event('input',  { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        }

        // Si quedan elementos y aún tenemos intentos, reintentar
        if (pendientes > 0 && intentos < maxEsperas) {
            setTimeout(_ciclo, 50);
            return;
        }

        // ── Callback para datos complejos ──────────────────────────────
        // Se llama siempre, sin importar si todos los inputs se encontraron,
        // porque el módulo llamante puede tener lógica propia de restauración.
        if (typeof onRestaurado === 'function') {
            try {
                onRestaurado(saved);
            } catch(e) {
                console.error('[bnh-recon] Error en onRestaurado:', e);
            }
        }

        // ── Toast de confirmación ──────────────────────────────────────
        const totalCampos = Object.keys(saved.globalData || {}).length;
        if (totalCampos > 0 && mismaPagina) {
            _showToast(toastElId, '♻️ Datos recuperados tras reconexión', 3500);
        }

        console.info(
            `[bnh-recon] Rescate restaurado. Campos: ${totalCampos}, ` +
            `Intentos DOM: ${intentos}, Extra:`, saved.extra
        );
    }

    // Arrancar: si el DOM aún no está listo, esperar DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(_ciclo, 80), { once: true });
    } else {
        // DOM listo, pero la UI de la página (modales, panel OP) puede montarse
        // de forma asíncrona. Dar un tick de margen antes del primer intento.
        setTimeout(_ciclo, 80);
    }
}

// ─────────────────────────────────────────────────────────────
// INIT PRINCIPAL
// ─────────────────────────────────────────────────────────────

let _instanciada = false;

/**
 * Inicializa el dot de estado de conexión y el reconector automático.
 *
 * @param {Object} opciones
 * @param {Object}   opciones.supabaseClient   — Cliente Supabase inicializado.
 * @param {Function} [opciones.onReconectar]   — Async fn a ejecutar tras reconectar
 *   (típicamente: cargarTodo, sincronizarVista, etc.).
 * @param {number}   [opciones.umbralMs=3000]  — Tiempo mínimo fuera de pestaña
 *   para que se active el reconector (ms).
 * @param {Function} [opciones.onEmergencia]   — Async fn ANTES del reload de emergencia.
 *   Úsala para salvar datos extra específicos de la página:
 *   onEmergencia: () => salvarRescate({ tabActiva: estado.tabActiva, ... })
 *   Si no se provee, se llama salvarRescate() sin extras automáticamente.
 */
export function initRecon({
    supabaseClient,
    onReconectar  = null,
    umbralMs      = 3000,
    onEmergencia  = null,
}) {
    if (_instanciada) return;
    _instanciada = true;

    if (!supabaseClient) {
        console.warn('[bnh-recon] supabaseClient no provisto. Dot desactivado.');
        return;
    }

    // ── Dot inicial ────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(() => _setDotState('online'), 50), { once: true });
    } else {
        setTimeout(() => _setDotState('online'), 50);
    }

    window.addEventListener('offline', () => _setDotState('offline'));
    window.addEventListener('online',  () => _setDotState('online'));

    // ── Reconector por visibilidad ─────────────────────────────
    let _lastVisible  = Date.now();
    let _reconectando = false;

    document.addEventListener('visibilitychange', async () => {
        if (document.hidden) {
            _lastVisible = Date.now();
            return;
        }

        const awayMs = Date.now() - _lastVisible;
        if (_reconectando || awayMs < umbralMs) return;

        _reconectando = true;
        _setDotState('reconnecting');

        try {
            // 1. Pausa mínima para despertar la tarjeta de red
            await new Promise(r => setTimeout(r, 400));

            if (!navigator.onLine) {
                _setDotState('offline');
                return;
            }

            // 2. Timeout ultra agresivo de 1.5s
            await Promise.race([
                (async () => {
                    const { data: { session }, error: authErr } = await supabaseClient.auth.getSession();
                    if (authErr || !session) throw new Error('SESION_INVALIDA');
                    if (typeof onReconectar === 'function') await onReconectar();
                })(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_RED')), 1500))
            ]);

            _setDotState('online');
            _showToast('fichas-toast', '🔄 Sistema restaurado', 2500);

        } catch (error) {
            console.warn('[bnh-recon] Timeout agresivo (1.5s). Reload de emergencia...', error.message);

            // Salvar datos antes del reload
            // Si la página pasó un callback personalizado, usarlo;
            // de lo contrario, la aspiradora genérica.
            if (typeof onEmergencia === 'function') {
                try { await onEmergencia(); } catch(e) { salvarRescate(); }
            } else {
                salvarRescate();
            }

            window.location.reload();

        } finally {
            _reconectando = false;
        }
    });
}

/**
 * Permite reinicializar initRecon (útil en HMR / desarrollo).
 */
export function resetRecon() {
    _instanciada = false;
}

// ─────────────────────────────────────────────────────────────
// HELPER INTERNO — TOAST
// ─────────────────────────────────────────────────────────────

function _showToast(elId, mensaje, duracionMs = 2500) {
    const toastEl = document.getElementById(elId);
    if (!toastEl) return;
    toastEl.textContent    = mensaje;
    toastEl.className      = 'toast-ok';
    toastEl.style.display  = 'block';
    setTimeout(() => {
        toastEl.className     = '';
        toastEl.style.display = 'none';
    }, duracionMs);
}
