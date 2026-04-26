// ============================================================
// op/op-markup.js — Renderizado de markup y autocomplete @PJ@
// ============================================================
import { opState, STORAGE_URL } from './op-state.js';

const BASE = window.location.origin + window.location.pathname.split('/').slice(0, -2).join('/') + '/';

// Renderiza texto con markup — SIN saltos de línea en los estilos inline
export function renderMsgMarkup(texto) {
    if (!texto) return '';
    let html = texto
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\n/g,'<br>');

    // @Personaje@ → link a ficha
    html = html.replace(/@([^@\n]+?)@/g, (_, nombre) => {
        const url = `${BASE}fichas/index.html?ficha=${encodeURIComponent(nombre)}`;
        return `<a href="${url}" target="_blank" style="color:#6c3483;font-weight:700;background:#f5eeff;padding:1px 6px;border-radius:4px;text-decoration:none;border:1px solid #c39bd3;">@${nombre}@</a>`;
    });

    // #Tag → badge azul
    html = html.replace(/#([^\s#<&]+)/g, (_, tag) => {
        const url = `${BASE}tags/index.html?tag=%23${encodeURIComponent(tag)}`;
        return `<a href="${url}" target="_blank" style="color:#1a4a80;font-weight:700;background:#ebf5fb;padding:1px 6px;border-radius:4px;text-decoration:none;border:1px solid #aecde8;">#${tag}</a>`;
    });

    // !Medalla! → badge rojo/morado
    html = html.replace(/!([^!\n]+?)!/g, (_, nombre) => {
        return `<span style="color:#c0392b;font-weight:700;background:#fdecea;padding:1px 6px;border-radius:4px;border:1px solid rgba(192,57,43,0.3);">⚔ ${nombre}</span>`;
    });

    return html;
}

// ── Autocomplete ──────────────────────────────────────────────
let _acDropdown = null;
let _acInput    = null;
let _acSelected = 0;

export function mountMarkupAC(textarea) {
    _acInput = textarea;
    textarea.addEventListener('input', _onInput);
    textarea.addEventListener('keydown', _onKey);
    document.addEventListener('mousedown', e => {
        if (_acDropdown && !_acDropdown.contains(e.target)) _closeAC();
    }, true);
}

function _onInput(e) {
    const ta  = e.target;
    const val = ta.value;
    const pos = ta.selectionStart;
    const before = val.slice(0, pos);
    const match  = before.match(/@([^@\n]*)$/);
    if (!match) { _closeAC(); return; }

    const query = match[1].toLowerCase();
    const hits  = (opState.grupos || [])
        .filter(g => (g.nombre_refinado||'').toLowerCase().includes(query))
        .slice(0, 8);

    if (!hits.length) { _closeAC(); return; }
    _acSelected = 0;
    _showAC(ta, hits, match[0], pos);
}

function _showAC(ta, hits, triggerStr, pos) {
    _closeAC();
    const dd = document.createElement('div');
    dd.id = 'op-ac-dropdown';
    dd.style.cssText = 'position:fixed;z-index:99999;background:white;border:1.5px solid #c0392b;border-radius:10px;box-shadow:0 -4px 20px rgba(0,0,0,0.15);overflow:hidden;min-width:220px;';

    hits.forEach((g, i) => {
        const nombre = g.nombre_refinado;
        const item = document.createElement('div');
        item.className = 'op-ac-item';
        item.dataset.idx = i;
        item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;color:#212529;font-size:0.85em;font-weight:600;transition:0.1s;';

        const img = document.createElement('img');
        img.src = `${STORAGE_URL}/imgpersonajes/${_norm(nombre)}icon.png`;
        img.onerror = () => { img.src = `${STORAGE_URL}/imginterfaz/no_encontrado.png`; };
        img.style.cssText = 'width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;';

        item.appendChild(img);
        item.appendChild(document.createTextNode(nombre));
        item.addEventListener('mouseenter', () => { _acSelected = i; _highlightAC(); });
        item.addEventListener('mousedown', ev => { ev.preventDefault(); _insertAC(nombre, triggerStr, pos); });
        dd.appendChild(item);
    });

    // Posicionar ARRIBA del textarea
    const rect = ta.getBoundingClientRect();
    document.body.appendChild(dd);
    const ddH = dd.offsetHeight;
    dd.style.left = rect.left + 'px';
    dd.style.top  = (rect.top - ddH - 6) + 'px';
    dd.style.width = Math.max(rect.width, 220) + 'px';

    _acDropdown = dd;
    _highlightAC();
}

function _highlightAC() {
    if (!_acDropdown) return;
    _acDropdown.querySelectorAll('.op-ac-item').forEach((el, i) => {
        el.style.background = i === _acSelected ? '#fdecea' : '';
        el.style.color      = i === _acSelected ? '#c0392b' : '#212529';
    });
}

function _onKey(e) {
    if (!_acDropdown) return;
    const items = _acDropdown.querySelectorAll('.op-ac-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); _acSelected = Math.min(_acSelected+1, items.length-1); _highlightAC(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); _acSelected = Math.max(_acSelected-1, 0); _highlightAC(); }
    else if (e.key === 'Tab' || e.key === 'Enter') {
        const sel = items[_acSelected];
        if (sel) {
            e.preventDefault();
            const val = _acInput.value;
            const pos = _acInput.selectionStart;
            const before = val.slice(0, pos);
            const match  = before.match(/@([^@\n]*)$/);
            if (match) _insertAC(sel.textContent.trim(), match[0], pos);
        }
    }
    else if (e.key === 'Escape') { _closeAC(); e.preventDefault(); }
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
