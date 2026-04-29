// ============================================================
// bnh-recon.js — Reconexión con Watchdog Anti-Cuelgues
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
    const badge = document.getElementById('bnh-session-badge');
    const headerTop = document.querySelector('.header-top');
    if (badge?.parentNode) badge.parentNode.insertBefore(dot, badge);
    else if (headerTop) headerTop.appendChild(dot);
    else document.body.appendChild(dot);
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

let _instanciada = false;

export function initRecon({
    supabaseClient,
    onReconectar,
    umbralMs = 3000
}) {
    if (_instanciada) return;
    _instanciada = true;

    if (!supabaseClient) {
        console.error('[bnh-recon] Falta el cliente de Supabase.');
        return;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(() => _setDotState('online'), 50), { once: true });
    } else {
        setTimeout(() => _setDotState('online'), 50);
    }

    window.addEventListener('offline', () => _setDotState('offline'));
    window.addEventListener('online', () => _setDotState('online'));

    let _lastVisible = Date.now();
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
            // 1. Pausa de gracia para que la red física despierte
            await new Promise(r => setTimeout(r, 800));

            if (!navigator.onLine) {
                _setDotState('offline');
                return;
            }

            // 2. TIMEOUT ESTRICTO (Watchdog) de 7 segundos
            // Usamos Promise.race: El primero que termine (Supabase o el Timer) gana.
            await Promise.race([
                // Proceso normal de reconexión
                (async () => {
                    const { data: { session }, error: authErr } = await supabaseClient.auth.getSession();
                    if (authErr || !session) throw new Error('SESION_INVALIDA');
                    if (typeof onReconectar === 'function') await onReconectar();
                })(),
                // Temporizador asesino: si pasan 7000ms, lanza error
                new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_RED')), 7000))
            ]);

            // Si llega aquí, significa que todo cargó rápido y bien
            _setDotState('online');
            
            const toastEl = document.getElementById('fichas-toast');
            if (toastEl) {
                toastEl.textContent = '🔄 Sistema restaurado';
                toastEl.className = 'toast-ok';
                toastEl.style.display = 'block';
                setTimeout(() => { toastEl.className = ''; toastEl.style.display = 'none'; }, 2500);
            }

        } catch (error) {
            console.warn('[bnh-recon] Falla de red o timeout detectado. Recargando página para limpiar caché...', error.message);
            // 3. LA SOLUCIÓN DEFINITIVA: 
            // Si hubo timeout (tardó más de 7 seg) o la sesión murió, hacemos el reload automático.
            window.location.reload();
        } finally {
            _reconectando = false;
        }
    });
}

export function resetRecon() {
    _instanciada = false;
}
