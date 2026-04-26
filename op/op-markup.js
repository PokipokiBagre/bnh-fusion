// ============================================================
// op/op-markup.js — Renderizado de markup y autocomplete
// ============================================================
import { opState, STORAGE_URL } from './op-state.js';

const BASE = window.location.origin + window.location.pathname.split('/').slice(0, -2).join('/') + '/';

const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ── Render markup ─────────────────────────────────────────────
// Usa tokenizer para evitar que los regexes se apliquen
// sobre el HTML generado por otros regexes (bug del #color en styles)
export function renderMsgMarkup(texto) {
    if (!texto) return '';

    // Dividir en tokens preservando los delimitadores (capturing group)
    const partes = texto.split(/(@[^@\n]+?@|#[^\s#\n]+|![^!\n]+?!|\n)/g);

    return partes.map(p => {
        if (!p) return '';
        if (p === '\n') return '<br>';

        // @Personaje@
        if (/^@[^@]+@$/.test(p)) {
            const nombre = p.slice(1, -1);
            const url = `${BASE}fichas/index.html?ficha=${encodeURIComponent(nombre)}`;
            return `<a href="${url}" target="_blank" style="color:#6c3483;font-weight:700;background:#f5eeff;padding:1px 6px;border-radius:4px;text-decoration:none;border:1px solid #c39bd3;">@${esc(nombre)}@</a>`;
        }

        // #Tag
        if (/^#/.test(p)) {
            const tag = p.slice(1);
            const url = `${BASE}tags/index.html?tag=%23${encodeURIComponent(tag)}`;
            return `<a href="${url}" target="_blank" style="color:#1a4a80;font-weight:700;background:#ebf5fb;padding:1px 6px;border-radius:4px;text-decoration:none;border:1px solid #aecde8;">#${esc(tag)}</a>`;
        }

        // !Medalla!
        if (/^![^!]+!$/.test(p)) {
            const nombre = p.slice(1, -1);
            return `<span style="color:#c0392b;font-weight:700;background:#fdecea;padding:1px 6px;border-radius:4px;border:1px solid rgba(192,57,43,0.3);">⚔ ${esc(nombre)}</span>`;
        }

        // Texto plano — escapar HTML
        return esc(p);
    }).join('');
}

// ── Autocomplete ──────────────────────────────────────────────
let _acDropdown = null;
let _acInput    = null;
let _acSelected = 0;
let _acType     = 'persona'; // 'persona' | 'tag' | 'medalla'

export function mountMarkupAC(textarea) {
    _acInput = textarea;
    textarea.addEventListener('input', _onInput);
    textarea.addEventListener('keydown', _onKey);
    document.addEventListener('mousedown', e => {
        if (_acDropdown && !_acDropdown.contains(e.target)) _closeAC();
    }, true);
}

function _onInput(e) {
    const ta     = e.target;
    const val    = ta.value;
    const pos    = ta.selectionStart;
    const before = val.slice(0, pos);

    // Orden de prioridad: @ > # > !
    const matchAt   = before.match(/@([^@\n]*)$/);
    const matchHash = before.match(/#([^\s#\n]*)$/);
    const matchBang = before.match(/!([^!\n]*)$/);

    if (matchAt) {
        _acType = 'persona';
        const query = matchAt[1].toLowerCase();
        const hits  = (opState.grupos || [])
            .filter(g => (g.nombre_refinado || '').toLowerCase().includes(query))
            .slice(0, 8)
            .map(g => ({
                label: g.nombre_refinado,
                img:   `${STORAGE_URL}/imgpersonajes/${_norm(g.nombre_refinado)}icon.png`,
            }));
        if (!hits.length) { _closeAC(); return; }
        _acSelected = 0;
        _showAC(ta, hits, matchAt[0], pos);

    } else if (matchHash) {
        _acType = 'tag';
        const query = matchHash[1].toLowerCase();
        const tags  = _getUniqueTags();
        const hits  = tags.filter(t => t.toLowerCase().includes(query)).slice(0, 8)
            .map(t => ({ label: t }));
        if (!hits.length) { _closeAC(); return; }
        _acSelected = 0;
        _showAC(ta, hits, matchHash[0], pos);

    } else if (matchBang) {
        _acType = 'medalla';
        const query = matchBang[1].toLowerCase();
        const hits  = (opState.medallas || [])
            .filter(m => (m.nombre || '').toLowerCase().includes(query))
            .slice(0, 8)
            .map(m => ({ label: m.nombre }));
        if (!hits.length) { _closeAC(); return; }
        _acSelected = 0;
        _showAC(ta, hits, matchBang[0], pos);

    } else {
        _closeAC();
    }
}

function _getUniqueTags() {
    const set = new Set();
    (opState.grupos || []).forEach(g => {
        (g.tags || []).forEach(t => {
            set.add(t.startsWith('#') ? t.slice(1) : t);
        });
    });
    return [...set].sort();
}

// ── Mostrar dropdown ──────────────────────────────────────────
function _showAC(ta, items, triggerStr, pos) {
    _closeAC();

    const dd = document.createElement('div');
    dd.id = 'op-ac-dropdown';
    dd.style.cssText = [
        'position:fixed', 'z-index:99999', 'background:white',
        'border:1.5px solid #c0392b', 'border-radius:10px',
        'box-shadow:0 -4px 20px rgba(0,0,0,0.15)',
        'overflow:hidden', 'min-width:220px',
    ].join(';');

    // Color de acento según tipo
    const accentColor = _acType === 'persona' ? '#6c3483'
                      : _acType === 'tag'     ? '#1a4a80'
                      : '#c0392b';

    items.forEach((item, i) => {
        const el = document.createElement('div');
        el.className = 'op-ac-item';
        el.dataset.idx = i;
        el.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;color:#212529;font-size:0.85em;font-weight:600;transition:0.1s;';

        if (item.img) {
            const img = document.createElement('img');
            img.src     = item.img;
            img.onerror = () => { img.src = `${STORAGE_URL}/imginterfaz/no_encontrado.png`; };
            img.style.cssText = 'width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;';
            el.appendChild(img);
        } else {
            // Icono de texto para tags y medallas
            const icon = document.createElement('span');
            icon.textContent = _acType === 'tag' ? '#' : '⚔';
            icon.style.cssText = `font-size:0.85em;color:${accentColor};font-weight:800;flex-shrink:0;`;
            el.appendChild(icon);
        }

        el.appendChild(document.createTextNode(item.label));
        el.addEventListener('mouseenter', () => { _acSelected = i; _highlightAC(); });
        el.addEventListener('mousedown',  ev => { ev.preventDefault(); _insertAC(item.label, triggerStr, pos); });
        dd.appendChild(el);
    });

    // Posicionar ARRIBA del textarea
    const rect = ta.getBoundingClientRect();
    document.body.appendChild(dd);
    const ddH = dd.offsetHeight;
    dd.style.left  = rect.left + 'px';
    dd.style.top   = (rect.top - ddH - 6) + 'px';
    dd.style.width = Math.max(rect.width, 220) + 'px';

    _acDropdown = dd;
    _highlightAC();
}

function _highlightAC() {
    if (!_acDropdown) return;
    const accentColor = _acType === 'persona' ? '#6c3483'
                      : _acType === 'tag'     ? '#1a4a80'
                      : '#c0392b';
    _acDropdown.querySelectorAll('.op-ac-item').forEach((el, i) => {
        el.style.background = i === _acSelected ? '#fdecea' : '';
        el.style.color      = i === _acSelected ? accentColor : '#212529';
    });
}

function _onKey(e) {
    if (!_acDropdown) return;
    const items = _acDropdown.querySelectorAll('.op-ac-item');
    if (e.key === 'ArrowDown') {
        e.preventDefault(); _acSelected = Math.min(_acSelected + 1, items.length - 1); _highlightAC();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault(); _acSelected = Math.max(_acSelected - 1, 0); _highlightAC();
    } else if (e.key === 'Tab' || e.key === 'Enter') {
        const sel = items[_acSelected];
        if (sel) {
            e.preventDefault();
            const val    = _acInput.value;
            const pos    = _acInput.selectionStart;
            const before = val.slice(0, pos);
            const matchAt   = before.match(/@([^@\n]*)$/);
            const matchHash = before.match(/#([^\s#\n]*)$/);
            const matchBang = before.match(/!([^!\n]*)$/);
            const trigger = matchAt?.[0] || matchHash?.[0] || matchBang?.[0];
            if (trigger) _insertAC(sel.textContent.trim(), trigger, pos);
        }
    } else if (e.key === 'Escape') {
        _closeAC(); e.preventDefault();
    }
}

function _insertAC(label, triggerStr, pos) {
    if (!_acInput) return;
    const val   = _acInput.value;
    const start = pos - triggerStr.length;

    let ins;
    if (_acType === 'persona') ins = `@${label}@ `;
    else if (_acType === 'tag') ins = `#${label} `;
    else ins = `!${label}! `;

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
