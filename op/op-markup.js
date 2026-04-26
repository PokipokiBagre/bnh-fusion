// ============================================================
// op/op-markup.js — Renderizado de markup y autocomplete @PJ@
// ============================================================
import { opState, STORAGE_URL } from './op-state.js';

const BASE = window.location.origin + window.location.pathname.split('/').slice(0, -2).join('/') + '/';

// Renderiza texto con markup: @Personaje@ → link, #Tag → color, !Medalla!
export function renderMsgMarkup(texto) {
    if (!texto) return '';
    let html = texto
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\n/g,'<br>');

    // @Personaje@ → link a ficha
    html = html.replace(/@([^@\n]+?)@/g, (_, nombre) => {
        const url = `${BASE}fichas/index.html?ficha=${encodeURIComponent(nombre)}`;
        return `<a href="${url}" target="_blank" style="color:#6c3483;font-weight:700;
            background:#f5eeff;padding:1px 6px;border-radius:4px;text-decoration:none;
            border:1px solid #c39bd3;">@${nombre}@</a>`;
    });

    // #Tag → badge azul
    html = html.replace(/#([^\s#<]+)/g, (_, tag) => {
        const url = `${BASE}tags/index.html?tag=%23${encodeURIComponent(tag)}`;
        return `<a href="${url}" target="_blank" style="color:#1a4a80;font-weight:700;
            background:#ebf5fb;padding:1px 6px;border-radius:4px;text-decoration:none;
            border:1px solid #aecde8;">#${tag}</a>`;
    });

    // !Medalla! → badge morado
    html = html.replace(/!([^!\n]+?)!/g, (_, nombre) => {
        return `<span style="color:#6c3483;font-weight:700;background:#f5eeff;
            padding:1px 6px;border-radius:4px;border:1px solid #c39bd3;">⚔ ${nombre}</span>`;
    });

    return html;
}

// ── Autocomplete @PJ@ ─────────────────────────────────────────
let _acDropdown = null;
let _acInput    = null;
let _acCallback = null;

export function mountMarkupAC(textarea, onInsert) {
    _acInput    = textarea;
    _acCallback = onInsert;

    textarea.addEventListener('input', _onInput);
    textarea.addEventListener('keydown', _onKey);
    document.addEventListener('click', _closeAC, true);
}

function _onInput(e) {
    const ta   = e.target;
    const val  = ta.value;
    const pos  = ta.selectionStart;
    // Buscar @ más cercano antes del cursor
    const before = val.slice(0, pos);
    const match  = before.match(/@([^@\n]*)$/);
    if (!match) { _closeAC(); return; }

    const query = match[1].toLowerCase();
    const grupos = opState.grupos || [];
    const hits = grupos
        .filter(g => (g.nombre_refinado||'').toLowerCase().includes(query))
        .slice(0, 8);

    if (!hits.length) { _closeAC(); return; }
    _showAC(ta, hits, match[0], pos);
}

function _showAC(ta, hits, triggerStr, pos) {
    _closeAC();
    const dd = document.createElement('div');
    dd.id = 'op-ac-dropdown';
    dd.style.cssText = `position:fixed;z-index:99999;background:#1a1a2e;border:2px solid #6c3483;
        border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.5);overflow:hidden;min-width:200px;`;

    hits.forEach((g, i) => {
        const nombre = g.nombre_refinado;
        const item = document.createElement('div');
        item.style.cssText = `display:flex;align-items:center;gap:8px;padding:8px 12px;
            cursor:pointer;color:#e2d9f3;font-size:0.85em;font-weight:600;transition:0.1s;`;
        item.dataset.i = i;

        const img = document.createElement('img');
        img.src = `${STORAGE_URL}/imgpersonajes/${_norm(nombre)}icon.png`;
        img.onerror = () => { img.src = `${STORAGE_URL}/imginterfaz/no_encontrado.png`; };
        img.style.cssText = 'width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;';

        item.appendChild(img);
        item.appendChild(document.createTextNode(nombre));
        item.addEventListener('mouseenter', () => item.style.background = 'rgba(108,52,131,0.4)');
        item.addEventListener('mouseleave', () => item.style.background = '');
        item.addEventListener('mousedown', ev => {
            ev.preventDefault();
            _insertAC(nombre, triggerStr, pos);
        });
        dd.appendChild(item);
    });

    // Posicionar junto al cursor
    const rect = ta.getBoundingClientRect();
    dd.style.left = rect.left + 'px';
    dd.style.top  = (rect.bottom + 4) + 'px';
    document.body.appendChild(dd);
    _acDropdown = dd;
}

function _insertAC(nombre, triggerStr, pos) {
    if (!_acInput) return;
    const val   = _acInput.value;
    const start = pos - triggerStr.length;
    const ins   = `@${nombre}@`;
    _acInput.value = val.slice(0, start) + ins + val.slice(pos);
    _acInput.selectionStart = _acInput.selectionEnd = start + ins.length;
    _acInput.focus();
    _closeAC();
    if (_acCallback) _acCallback();
}

function _onKey(e) {
    if (!_acDropdown) return;
    if (e.key === 'Escape') { _closeAC(); e.preventDefault(); }
}

function _closeAC() {
    if (_acDropdown) { _acDropdown.remove(); _acDropdown = null; }
}

function _norm(str) {
    return str.toString().trim().toLowerCase()
        .replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e')
        .replace(/[íìïî]/g,'i').replace(/[óòöô]/g,'o')
        .replace(/[úùüû]/g,'u').replace(/ñ/g,'n')
        .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
}
