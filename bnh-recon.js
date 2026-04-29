// ============================================================
// bnh-recon.js — Reconexión automática al volver a la pestaña
// Colocar en la RAÍZ del proyecto.
// ============================================================

const DOT_ID = 'bnh-conn-dot';

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
    if (badge?.parentNode)  badge.parentNode.insertBefore(dot, badge);
    else if (headerTop)     headerTop.appendChild(dot);
    else                    document.body.appendChild(dot);

    return dot;
}

function _setDotState(state) {
    if (!document.body) { setTimeout(() => _setDotState(state), 50); return; }
    const dot = _getOrCreateDot();
    if (!dot) return;

    const S = {
        online:       { html: '● Online',         bg: 'rgba(39,174,96,0.10)',  border: '#27ae60', color: '#1e8449' },
        reconnecting: { html: '◌ Reconectando…',  bg: 'rgba(243,156,18,0.12)', border: '#f39c12', color: '#b7770d' },
        offline:      { html: '● Sin conexión',   bg: 'rgba(231,76,60,0.10)',  border: '#e74c3c', color: '#c0392b' },
    };
    const s = S[state] || S.online;
    dot.innerHTML         = s.html;
    dot.style.background  = s.bg;
    dot.style.borderColor = s.border;
    dot.style.color       = s.color;
}

function _mostrarToast(toastId, msg) {
    const el = toastId ? document.getElementById(toastId) : null;
    if (!el) return;
    el.textContent   = msg;
    el.className     = 'toast-ok';
    el.style.display = 'block';
    clearTimeout(el._toastTimer);
    el._toastTimer = setTimeout(() => { el.className = ''; el.style.display = 'none'; }, 2500);
}

let _instanciada = false;

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

    // Mostrar "online" cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(() => _setDotState('online'), 50), { once: true });
    } else {
        setTimeout(() => _setDotState('online'), 50);
    }

    window.addEventListener('offline', () => _setDotState('offline'));
    window.addEventListener('online',  () => _setDotState('online'));

    let _lastVisible  = Date.now();
    let _reconectando = false;
    let _watchdogTimer = null;

    document.addEventListener('visibilitychange', async () => {
        if (document.hidden) {
            _lastVisible = Date.now();
            return;
        }

        if (_reconectando) return;
        _reconectando = true;

        // Watchdog: máximo 30s en "reconectando", luego forzar reset
        _watchdogTimer = setTimeout(() => {
            _reconectando = false;
            _setDotState(navigator.onLine ? 'online' : 'offline');
        }, 30_000);

        const awayMs = Date.now() - _lastVisible;

        try {
            if (typeof estaLogueado === 'function' && !estaLogueado()) {
                window.location.reload();
                return;
            }

            if (awayMs < umbralMs) {
                _setDotState(navigator.onLine ? 'online' : 'offline');
                return;
            }

            _setDotState('reconnecting');
            await new Promise(r => setTimeout(r, 200));
            await onReconectar();
            _setDotState('online');
            if (mostrarToast) _mostrarToast(toastId, '🔄 Reconectado');

        } catch (e) {
            console.warn('[bnh-recon] Error al reconectar:', e.message || e);
            _setDotState(navigator.onLine ? 'online' : 'offline');
        } finally {
            clearTimeout(_watchdogTimer);
            _reconectando = false;
            // Garantía: si por alguna razón quedó en "Reconectando", corregir
            const dot = document.getElementById(DOT_ID);
            if (dot?.innerHTML?.includes('Reconectando')) {
                _setDotState(navigator.onLine ? 'online' : 'offline');
            }
        }
    });
}

export function resetRecon() {
    _instanciada = false;
}
