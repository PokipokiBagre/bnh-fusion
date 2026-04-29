// ============================================================
// bnh-recon.js — Reconexión Ultra Agresiva (1.5s) + Auto-Rescate
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

// ⚡ PROTOCOLO DE EMERGENCIA V3: Aspiradora Global
function _salvarDatosEnPeligroV3() {
    try {
        const stateToSave = { timestamp: Date.now(), globalData: {}, uiState: {} };

        // 1. Guardar TODO input, textarea y select con ID (¡incluye el chat OP y los deltas!)
        document.querySelectorAll('input[id], textarea[id], select[id]').forEach(el => {
            if (el.type !== 'file' && el.type !== 'submit' && el.type !== 'button') {
                if (el.type === 'checkbox' || el.type === 'radio') {
                    stateToSave.globalData[el.id] = el.checked;
                } else if (el.value !== '') {
                    stateToSave.globalData[el.id] = el.value;
                }
            }
        });

        // 2. Guardar tags activos en el sidebar
        stateToSave.uiState.activeTags = Array.from(document.querySelectorAll('#sidebar-tag-list li.active .tag-link')).map(el => el.textContent.trim());

        // 3. Modales abiertos
        const overlay = document.getElementById('op-overlay');
        if (overlay && overlay.style.display !== 'none') {
            const titleEl = overlay.querySelector('.op-modal-title');
            const titleText = titleEl ? titleEl.textContent : '';
            let activeTab = 0;
            const activeTabEl = overlay.querySelector('.op-tab.active');
            if (activeTabEl && activeTabEl.id) activeTab = parseInt(activeTabEl.id.replace('op-tab-', '')) || 0;
            
            if (titleText.includes('Editar Lore')) {
                stateToSave.uiState.modal = { type: 'lore', charName: titleText.replace('📝 ', '').replace(' — Editar Lore', '').trim() };
            } else if (titleText.includes('⚙️')) {
                stateToSave.uiState.modal = { type: 'op', charName: titleText.replace('⚙️ ', '').trim(), activeTab };
            }
        }

        sessionStorage.setItem('bnh_rescate_v3', JSON.stringify(stateToSave));
    } catch (e) { console.error('Error salvando datos:', e); }
}

// ── Reconexión automática al volver a la pestaña (Ultra Agresiva 50ms) ──────────────
function _initVisibilityReconnect() {
    let _lastVisible = Date.now();
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
            if (!bnhAuth.estaLogueado()) {
                window.location.reload();
                return;
            }

            if (awayMs >= 3000) {
                // 1. Pausa mínima dictada: 50ms
                await new Promise(r => setTimeout(r, 50));

                if (!navigator.onLine) {
                    _reconectando = false;
                    return;
                }

                // 2. Timeout letal de 1.5s
                await Promise.race([
                    (async () => {
                        await Promise.all([cargarTodo(), cargarFusiones()]);
                        window._equipCache = {};
                        cerrarUploadPanel();
                        sincronizarVista();
                    })(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 1500))
                ]);

                const toastEl = document.getElementById('fichas-toast');
                if (toastEl) {
                    toastEl.textContent = '🔄 Reconectado';
                    toastEl.className = 'toast-ok';
                    toastEl.style.display = 'block';
                    setTimeout(() => { toastEl.className = ''; toastEl.style.display = 'none'; }, 2000);
                }
            }
        } catch (e) {
            console.warn('[Fichas] Red Zombie detectada. Salvando datos y recargando...', e);
            _salvarDatosEnPeligroV3();
            window.location.reload();
        } finally {
            _reconectando = false;
        }
    });
}

let _instanciada = false;

export function initRecon({
    supabaseClient,
    onReconectar,
    umbralMs = 3000 // Esto ahora solo dicta cuánto tiempo fuera de la pestaña activa el reconector
}) {
    if (_instanciada) return;
    _instanciada = true;

    if (!supabaseClient) return;

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
            // 1. Pausa mínima para despertar la tarjeta de red (bajado de 600ms a 400ms)
            await new Promise(r => setTimeout(r, 400));

            if (!navigator.onLine) {
                _setDotState('offline');
                return;
            }

            // 2. TIMEOUT ULTRA AGRESIVO (1.5 Segundos)
            await Promise.race([
                (async () => {
                    const { data: { session }, error: authErr } = await supabaseClient.auth.getSession();
                    if (authErr || !session) throw new Error('SESION_INVALIDA');
                    if (typeof onReconectar === 'function') await onReconectar();
                })(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_RED')), 1500))
            ]);

            _setDotState('online');
            
            const toastEl = document.getElementById('fichas-toast');
            if (toastEl) {
                toastEl.textContent = '🔄 Sistema restaurado';
                toastEl.className = 'toast-ok';
                toastEl.style.display = 'block';
                setTimeout(() => { toastEl.className = ''; toastEl.style.display = 'none'; }, 2500);
            }

        } catch (error) {
            console.warn('[bnh-recon] Timeout agresivo (1.5s). Disparando reload de emergencia...');
            _salvarDatosEnPeligro();
            window.location.reload();
        } finally {
            _reconectando = false;
        }
    });
}

export function resetRecon() {
    _instanciada = false;
}
