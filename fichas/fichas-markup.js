// ============================================================
// fichas-markup.js
// @Nombre → green link to ficha
// #Tag    → red link to tags page
// !Medalla → blue link to medallas page
// ============================================================

import { gruposGlobal } from './fichas-state.js';

function escTxt(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function renderMarkup(texto) {
    if (!texto) return '';
    const t = String(texto);
    const tokens = [];
    let i = 0;

    while (i < t.length) {
        const ch = t[i];

        if (ch === '@') {
            // Match name: word chars + single spaces, stop at #!@, newline, double-space, end
            const rest = t.slice(i + 1);
            const m = rest.match(/^([\wÀ-ɏ][\wÀ-ɏ._-]*(?:\s[\wÀ-ɏ._-]+)*)(?=\s*[#!@,\n]|\s{2}|$)/);
            if (m && m[1].trim()) {
                tokens.push({ tipo: 'persona', valor: m[1].trim() });
                i += 1 + m[1].length;
                continue;
            }
        }

        if (ch === '#') {
            const m = t.slice(i + 1).match(/^([\wÀ-ɏ][\wÀ-ɏ_.]*)/);
            if (m) {
                tokens.push({ tipo: 'tag', valor: m[1] });
                i += 1 + m[1].length;
                continue;
            }
        }

        if (ch === '!') {
            const rest = t.slice(i + 1);
            const m = rest.match(/^([\wÀ-ɏ][\wÀ-ɏ._-]*(?:\s[\wÀ-ɏ._-]+)*)(?=\s*[#!@,\n]|\s{2}|$)/);
            if (m && m[1].trim()) {
                tokens.push({ tipo: 'medalla', valor: m[1].trim() });
                i += 1 + m[1].length;
                continue;
            }
        }

        if (ch === '\n') {
            tokens.push({ tipo: 'br' });
            i++;
            continue;
        }

        // Plain text: accumulate until next special char
        let j = i + 1;
        while (j < t.length && t[j] !== '@' && t[j] !== '#' && t[j] !== '!' && t[j] !== '\n') j++;
        tokens.push({ tipo: 'texto', valor: t.slice(i, j) });
        i = j;
    }

    return tokens.map(tok => {
        if (tok.tipo === 'br')    return '<br>';
        if (tok.tipo === 'texto') return escTxt(tok.valor);
        if (tok.tipo === 'persona') {
            const n = tok.valor;
            return `<a href="#" onclick="event.preventDefault();window._markupIrAFicha('${n.replace(/'/g,"\\'")}');return false;" style="color:var(--green);font-weight:600;text-decoration:none;cursor:pointer;" title="Ver ficha de ${escTxt(n)}">${escTxt(n)}</a>`;
        }
        if (tok.tipo === 'tag') {
            const tag = tok.valor;
            return `<a href="../tags/index.html#${encodeURIComponent(tag)}" style="color:var(--red);font-weight:600;text-decoration:none;cursor:pointer;" title="Ver tag #${escTxt(tag)}">#${escTxt(tag)}</a>`;
        }
        if (tok.tipo === 'medalla') {
            const m = tok.valor;
            return `<a href="../medallas/index.html#${encodeURIComponent(m)}" style="color:#1a4a80;font-weight:600;text-decoration:none;cursor:pointer;" title="Ver medalla ${escTxt(m)}">${escTxt(m)}</a>`;
        }
        return '';
    }).join('');
}

window._markupIrAFicha = (nombreGrupo) => {
    if (window.abrirFicha) window.abrirFicha(nombreGrupo);
};

// ── Autosugerencia ────────────────────────────────────────────
export function initMarkupTextarea(textarea) {
    if (!textarea || textarea._markupInit) return;
    textarea._markupInit = true;

    const sug = document.createElement('div');
    sug.style.cssText = 'display:none;position:fixed;z-index:99999;background:white;border:1.5px solid var(--booru-border);border-radius:6px;box-shadow:0 -4px 16px rgba(0,0,0,0.14);max-height:200px;overflow-y:auto;min-width:200px;max-width:300px;font-size:0.85em;font-family:Inter,sans-serif;';
    document.body.appendChild(sug);

    let _sym = '', _start = 0, _items = [], _sel = 0;

    function candidates(sym, q) {
        q = q.toLowerCase();
        if (sym === '@') return gruposGlobal.map(g => g.nombre_refinado).filter(n => n.toLowerCase().includes(q)).slice(0,8);
        if (sym === '#') {
            const set = new Set();
            gruposGlobal.forEach(g => (g.tags||[]).forEach(t => set.add(t.startsWith('#') ? t.slice(1) : t)));
            return [...set].filter(t => t.toLowerCase().includes(q)).sort().slice(0,8);
        }
        if (sym === '!') return (window._medidasCatalogo||[]).map(m => m.nombre).filter(n => n.toLowerCase().includes(q)).slice(0,8);
        return [];
    }

    function render() {
        if (!_items.length) { sug.style.display='none'; return; }
        const rect = textarea.getBoundingClientRect();
        const above = rect.top > 180;
        sug.style.left = rect.left + 'px';
        if (above) { sug.style.bottom=(window.innerHeight-rect.top+4)+'px'; sug.style.top='auto'; }
        else        { sug.style.top=(rect.bottom+4)+'px'; sug.style.bottom='auto'; }
        sug.style.display = 'block';
        const col = _sym==='@'?'var(--green)':_sym==='#'?'var(--red)':'#1a4a80';
        sug.innerHTML = _items.map((it,i) =>
            `<div data-i="${i}" style="padding:7px 12px;cursor:pointer;background:${i===_sel?'var(--green-pale)':'white'};color:${i===_sel?'var(--green-dark)':col};font-weight:${i===_sel?700:500};border-bottom:1px solid var(--gray-100);">
                <span style="opacity:.4">${_sym}</span>${it}
            </div>`).join('');
        sug.querySelectorAll('[data-i]').forEach(el => {
            el.onmousedown = e => { e.preventDefault(); apply(_items[+el.dataset.i]); };
        });
    }

    function apply(item) {
        const v = textarea.value, cur = textarea.selectionStart;
        const before = v.slice(0, _start-1) + _sym + item;
        const after  = v.slice(cur);
        textarea.value = before + ' ' + after;
        const pos = before.length + 1;
        textarea.setSelectionRange(pos, pos);
        close();
        textarea.focus();
    }

    function close() { sug.style.display='none'; _items=[]; _sym=''; _sel=0; }

    textarea.addEventListener('input', () => {
        const v=textarea.value, cur=textarea.selectionStart;
        let found=false;
        for (let i=cur-1;i>=0;i--) {
            const c=v[i];
            if (c==='@'||c==='#'||c==='!') {
                _sym=c; _start=i+1;
                _items=candidates(c, v.slice(i+1,cur));
                _sel=0; found=true; break;
            }
            if (c===' '||c==='\n') break;
        }
        if (!found) close(); else render();
    });

    textarea.addEventListener('keydown', e => {
        if (!_items.length) return;
        if (e.key==='ArrowUp')   { e.preventDefault(); _sel=(_sel-1+_items.length)%_items.length; render(); }
        if (e.key==='ArrowDown') { e.preventDefault(); _sel=(_sel+1)%_items.length; render(); }
        if (e.key==='Tab'||e.key==='Enter') { e.preventDefault(); apply(_items[_sel]); }
        if (e.key==='Escape') close();
    });

    textarea.addEventListener('blur', () => setTimeout(close, 150));
}
