// ============================================================
// bnh-auth.js — Autenticación y Sesión para BNH
// ============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { bnhConfigs } from './bnh/config.js';

// 1. Detección síncrona de la campaña activa
const selectedBnh = localStorage.getItem('bnh_selected') || 'bnh1';
export let currentConfig = bnhConfigs[selectedBnh] || bnhConfigs['bnh1'];

// 2. Inicialización inmediata del cliente Supabase
export let supabase = createClient(currentConfig.dbUrl, currentConfig.dbAnonKey);

// ──────────────────────────────────────────────────────────────
// bnhAuth: objeto principal de autenticación
// ──────────────────────────────────────────────────────────────
export const bnhAuth = {

    _session: null,
    _perfil:  null,

    // ── Inicializar (llamar al inicio de cada página) ──
    async init() {
        const { data: { session } } = await supabase.auth.getSession();
        this._session = session;

        if (session) {
            for (let intento = 0; intento < 3; intento++) {
                try {
                    const { data, error } = await supabase
                        .from('perfiles_usuario')
                        .select('rol, personaje_nombre, email')
                        .eq('id', session.user.id)
                        .single();
                    if (data) { this._perfil = data; break; }
                    if (error) console.warn(`Intento ${intento + 1} fallido:`, error.message);
                } catch (e) { console.warn('Error cargando perfil:', e); }
                if (intento < 2) await new Promise(r => setTimeout(r, 500));
            }
        }

        supabase.auth.onAuthStateChange(async (event, session) => {
            this._session = session;

            if (event === 'SIGNED_OUT') {
                this._perfil = null;
                return;
            }

            if (session) {
                const { data } = await supabase
                    .from('perfiles_usuario')
                    .select('rol, personaje_nombre, email')
                    .eq('id', session.user.id)
                    .single();
                if (data) {
                    this._perfil = data;
                    const badge = document.getElementById('bnh-session-badge');
                    if (badge) badge.innerHTML = this.renderStatusBadge();
                }
            }
        });

        return this.esAdmin();
    },

    // ── Getters ──
    estaLogueado() { return this._session !== null; },
    esAdmin()      { return this._perfil?.rol === 'admin' || this._session?.user?.app_metadata?.rol === 'admin'; },
    esJugador()    { return this._perfil?.rol === 'jugador'; },
    getEmail()     { return this._session?.user?.email || null; },
    getPersonaje() { return this._perfil?.personaje_nombre || null; },
    getRol()       { return this._perfil?.rol || 'espectador'; },

    // ── Login ──
    async login(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { ok: false, mensaje: error.message };
        this._session = data.session;

        let perfil = null;
        for (let i = 0; i < 4; i++) {
            if (i > 0) await new Promise(r => setTimeout(r, 300 * i));
            const { data: p, error: e } = await supabase
                .from('perfiles_usuario')
                .select('rol, personaje_nombre')
                .eq('id', data.user.id)
                .single();
            if (p) { perfil = p; break; }
            console.warn('Login: intento ' + (i + 1) + ' perfil fallido:', e?.message);
        }
        this._perfil = perfil;

        if (!perfil) {
            const metaRol = data.user?.app_metadata?.rol;
            if (metaRol) this._perfil = { rol: metaRol, personaje_nombre: null };
        }

        const esAdmin = this._perfil?.rol === 'admin' || data.user?.app_metadata?.rol === 'admin';
        return { ok: true, esAdmin };
    },

    // ── Logout ──
    async logout() {
        await supabase.auth.signOut();
        this._session = null;
        this._perfil  = null;
    },

    // ── Cambiar contraseña ──
    async cambiarPassword(nuevaPassword) {
        const { error } = await supabase.auth.updateUser({ password: nuevaPassword });
        return error ? { ok: false, mensaje: error.message } : { ok: true };
    },

    // ── Widget de login ──
    renderLoginWidget() {
        return `
        <div id="bnh-login-widget" style="
            background: var(--white, #ffffff);
            border: 1px solid var(--booru-border, #cccccc);
            border-radius: 12px;
            padding: 30px;
            max-width: 380px;
            margin: 0 auto;
            font-family: inherit;
            box-shadow: 0 8px 24px rgba(0,0,0,0.12);
        ">
            <h3 style="color:#0073ff; text-align:center; margin:0 0 20px 0; letter-spacing:1px;">⚡ ACCESO OP</h3>
            <input id="bnh-login-email" type="email" placeholder="Correo electrónico"
                style="width:100%; background:var(--gray-100, #f8f9fa); color:var(--gray-900, #212529); border:1.5px solid var(--gray-300, #dee2e6);
                       padding:12px; border-radius:6px; font-family:inherit; box-sizing:border-box;
                       margin-bottom:12px; font-size:0.95em; outline:none; transition: border-color 0.2s;"
                onfocus="this.style.borderColor='#0073ff'" onblur="this.style.borderColor='var(--gray-300, #dee2e6)'"
                onkeydown="if(event.key==='Enter') bnhAuth._submitLogin()">
            <input id="bnh-login-pass" type="password" placeholder="Contraseña"
                style="width:100%; background:var(--gray-100, #f8f9fa); color:var(--gray-900, #212529); border:1.5px solid var(--gray-300, #dee2e6);
                       padding:12px; border-radius:6px; font-family:inherit; box-sizing:border-box;
                       margin-bottom:16px; font-size:0.95em; outline:none; transition: border-color 0.2s;"
                onfocus="this.style.borderColor='#0073ff'" onblur="this.style.borderColor='var(--gray-300, #dee2e6)'"
                onkeydown="if(event.key==='Enter') bnhAuth._submitLogin()">
            <button onclick="bnhAuth._submitLogin()" style="
                width:100%; background:#0073ff;
                color:#fff; border:none; padding:14px;
                border-radius:6px; font-family:inherit; font-weight:600;
                font-size:1em; cursor:pointer; letter-spacing:1px; transition:0.2s;"
                onmouseover="this.style.background='#005bb5'; this.style.boxShadow='0 4px 12px rgba(0,115,255,0.25)';"
                onmouseout="this.style.background='#0073ff'; this.style.boxShadow='none';">
                ENTRAR
            </button>
            <div id="bnh-login-error" style="color:var(--red, #c0392b); font-size:0.85em;
                 text-align:center; margin-top:12px; min-height:20px; font-weight:600;"></div>
        </div>`;
    },

    async _submitLogin() {
        const email  = document.getElementById('bnh-login-email')?.value?.trim();
        const pass   = document.getElementById('bnh-login-pass')?.value;
        const errDiv = document.getElementById('bnh-login-error');

        if (!email || !pass) {
            if (errDiv) errDiv.innerText = 'Completa email y contraseña.';
            return;
        }

        const btn = document.querySelector('#bnh-login-widget button');
        if (btn) { btn.innerText = 'Verificando...'; btn.disabled = true; }

        const resultado = await this.login(email, pass);

        if (resultado.ok) {
            if (errDiv) { errDiv.style.color = '#00ff88'; errDiv.innerText = `✅ Bienvenido${resultado.esAdmin ? ', OP' : ''}`; }
            setTimeout(() => window.location.reload(), 800);
        } else {
            if (errDiv) errDiv.innerText = '❌ Credenciales incorrectas.';
            if (btn) { btn.innerText = 'ENTRAR'; btn.disabled = false; }
        }
    },

            renderStatusBadge() {
        // Estilos comunes para evitar que el botón se deforme
        const baseStyle = `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            white-space: nowrap;
            padding: 6px 10px;
            border-radius: 6px;
            font-weight: bold;
            font-family: inherit;
            font-size: 0.8em;
            cursor: pointer;
            transition: 0.2s;
            box-sizing: border-box;
            height: 36px;
            min-width: fit-content;
        `;

        if (this.esAdmin()) {
            return `<span style="${baseStyle} background:#fff; color:#0073ff; border:1.5px solid #0073ff; box-shadow:0 1px 3px rgba(0,115,255,0.15);"
                    onclick="bnhAuth._mostrarPanelSesion()">
                    ⚡ OP
                    </span>`;
        } else if (this.estaLogueado()) {
            return `<span style="${baseStyle} background:#fff; color:var(--green, #1e8449); border:1.5px solid var(--green, #1e8449); box-shadow:0 1px 3px rgba(30,132,73,0.15);"
                    onclick="bnhAuth._mostrarPanelSesion()">
                    🟢 ${this.getPersonaje() || 'User'}
                    </span>`;
        } else {
            return `<button onclick="bnhAuth._mostrarModalLogin()"
                        style="${baseStyle} background:#fff; color:var(--gray-700, #495057); border:1.5px dashed var(--gray-500, #adb5bd);"
                        onmouseover="this.style.borderColor='#0073ff'; this.style.color='#0073ff';"
                        onmouseout="this.style.borderColor='var(--gray-500)'; this.style.color='var(--gray-700)';">
                    🔒 OP
                    </button>`;
        }
    },
    _mostrarModalLogin() {
        let modal = document.getElementById('bnh-auth-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'bnh-auth-modal';
            modal.style.cssText = `
                position:fixed; top:0; left:0; width:100vw; height:100vh;
                background:rgba(0,0,0,0.75); backdrop-filter:blur(4px);
                display:flex; align-items:center; justify-content:center;
                z-index:99999;`;
            modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
            document.body.appendChild(modal);
        }
        modal.innerHTML = this.renderLoginWidget();
        modal.style.display = 'flex';
        setTimeout(() => document.getElementById('bnh-login-email')?.focus(), 100);
    },

    _mostrarPanelSesion() {
        const confirmar = confirm(
            `Sesión activa: ${this.getEmail()}\nRol: ${this.getRol()}\n\n¿Cerrar sesión?`
        );
        if (confirmar) this.logout().then(() => window.location.reload());
    }
};

window.bnhAuth = bnhAuth;
