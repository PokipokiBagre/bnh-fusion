// ============================================================
// fichas-markup.js — Sistema de markup para lore y quirk
//
// Sintaxis guardada en BD:
//   @Nombre        → link verde al personaje en fichas
//   #Tag           → link rojo al tag en tags
//   !Medalla       → link azul a la medalla en medallas
//
// Vista pública: símbolo oculto, texto coloreado con link.
// Editor: símbolo visible antes del nombre.
// ============================================================

import { gruposGlobal } from './fichas-state.js';

// Escapa solo para texto plano (no para atributos ya seguros)
function escTxt(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Renderizado de texto con markup ──────────────────────────
// Parsea el texto crudo token a token para evitar doble-escape.
export function renderMarkup(texto) {
    if (!texto) return '';

    // Tokenizar: separar en fragmentos de texto plano y tokens @/#!/
    // Token: @Palabra_con_espacios_hasta_doble_espacio_o_salto
    // Para @ admitimos espacios dentro del nombre (ej: @All Tight)
    // Para # y ! solo palabras sin espacios
    const tokens = [];
    let i = 0;
    const t = String(texto);

    while (i < t.length) {
        const ch = t[i];

        if (ch === '@') {
            // Nombre: letras, números, spaces, guiones, puntos hasta \n o doble espacio
            const match = t.slice(i + 1).match(/^([\wÀ-ɏ][\wÀ-ɏ .,-]*?)(?=\s{2}|\n|$)/);
            if (match && match[1].trim()) {
                tokens.push({ tipo: 'persona', valor: match[1].trim() });
                i += 1 + match[1].length;
                continue;
            }
        }

        if (ch === '#') {
            const match = t.slice(i + 1).match(/^([\wÀ-ɏ][\wÀ-ɏ_.]*)/);
            if (match) {
                tokens.push({ tipo: 'tag', valor: match[1] });
                i += 1 + match[1].length;
                continue;
            }
        }

        if (ch === '!') {
            const match = t.slice(i + 1).match(/^([\wÀ-ɏ][\wÀ-ɏ _.,-]*?)(?=\s{2}|\n|$)/);
            if (match && match[1].trim()) {
                tokens.push({ tipo: 'medalla', valor: match[1].trim() });
                i += 1 + match[1].length;
                continue;
            }
        }

        if (ch === '\n') {
            tokens.push({ tipo: 'br' });
            i++;
            continue;
        }

        // Texto plano: acumular hasta el próximo símbolo especial o salto
        let j = i + 1;
        while (j < t.length && t[j] !== '@' && t[j] !== '#' && t[j] !== '!' && t[j] !== '\n') j++;
        tokens.push({ tipo: 'texto', valor: t.slice(i, j) });
        i = j;
    }

    // Convertir tokens a HTML
    return tokens.map(tok => {
        if (tok.tipo === 'br') return '<br>';
        if (tok.tipo === 'texto') return escTxt(tok.valor);

        if (tok.tipo === 'persona') {
            const n = tok.valor;
            return `<a href="#" onclick="event.preventDefault();window._markupIrAFicha('${n.replace(/'/g,"\\'")}');return false;"
                style="color:var(--green);font-weight:600;text-decoration:none;cursor:pointer;"
                title="Ver ficha de ${escTxt(n)}">${escTxt(n)}</a>`;
        }

        if (tok.tipo === 'tag') {
            const tag = tok.valor;
            return `<a href="../tags/index.html#${encodeURIComponent(tag)}"
                style="color:var(--red);font-weight:600;text-decoration:none;cursor:pointer;"
                title="Ver tag #${escTxt(tag)}">#${escTxt(tag)}</a>`;
        }

        if (tok.tipo === 'medalla') {
            const m = tok.valor;
            return `<a href="../medallas/index.html#${encodeURIComponent(m)}"
                style="color:#1a4a80;font-weight:600;text-decoration:none;cursor:pointer;"
                title="Ver medalla ${escTxt(m)}">${escTxt(m)}</a>`;
        }

        return '';
    }).join('');
}

// Handler global para navegar a una ficha desde el markup
window._markupIrAFicha = (nombreGrupo) => {
    if (window.abrirFicha) {
        window.abrirFicha(nombreGrupo);
    }
};

// ── Autosugerencia en textareas ───────────────────────────────
export function initMarkupTextarea(textarea) {
    if (!textarea || textarea._markupInit) return;
    textarea._markupInit = true;

    const sug = document.createElement('div');
    sug.style.cssText = `
        display:none; position:fixed; z-index:99999;
        background:white; border:1.5px solid var(--booru-border);
        border-radius:6px; box-shadow:0 -4px 16px rgba(0,0,0,0.14);
        max-height:200px; overflow-y:auto; min-width:200px; max-width:300px;
        font-size:0.85em; font-family:'Inter',sans-serif;
    `;
    document.body.appendChild(sug);

    let _symbol = '', _startPos = 0, _items = [], _sel = 0;

    function getCandidatos(sym, query) {
        const q = query.toLowerCase();
        if (sym === '@') {
            return gruposGlobal
                .map(g => g.nombre_refinado)
                .filter(n => n.toLowerCase().includes(q))
                .slice(0, 8);
        }
        if (sym === '#') {
            const set = new Set();
            gruposGlobal.forEach(g => (g.tags||[]).forEach(t => {
                set.add(t.startsWith('#') ? t.slice(1) : t);
            }));
            return [...set].filter(t => t.toLowerCase().includes(q)).sort().slice(0, 8);
        }
        if (sym === '!') {
            return (window._medidasCatalogo || [])
                .map(m => m.nombre)
                .filter(n => n.toLowerCase().includes(q))
                .slice(0, 8);
        }
        return [];
    }

    function posicionar() {
        const rect = textarea.getBoundingClientRect();
        // Mostrar encima del textarea
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceAbove > 180 || spaceAbove > spaceBelow) {
            sug.style.top    = 'auto';
            sug.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
        } else {
            sug.style.top    = (rect.bottom + 4) + 'px';
            sug.style.bottom = 'auto';
        }
        sug.style.left = rect.left + 'px';
    }

    function renderSug() {
        if (!_items.length) { sug.style.display = 'none'; return; }
        posicionar();
        sug.style.display = 'block';

        const col = _symbol === '@' ? 'var(--green)' : _symbol === '#' ? 'var(--red)' : '#1a4a80';
        sug.innerHTML = _items.map((item, i) => `
            <div data-idx="${i}" style="padding:7px 12px;cursor:pointer;
                background:${i===_sel?'var(--green-pale)':'white'};
                color:${i===_sel?'var(--green-dark)':col};
                font-weight:${i===_sel?'700':'500'};
                border-bottom:1px solid var(--gray-100);">
                <span style="opacity:0.45;margin-right:1px;">${_symbol}</span>${item}
            </div>`).join('');

        sug.querySelectorAll('[data-idx]').forEach(el => {
            el.onmousedown = (e) => {
                e.preventDefault();
                aplicar(_items[parseInt(el.dataset.idx)]);
            };
        });
    }

    function aplicar(item) {
        const val    = textarea.value;
        const before = val.slice(0, _startPos - 1) + _symbol + item; // incluir símbolo
        const after  = val.slice(textarea.selectionStart);
        textarea.value = before + ' ' + after;
        const pos = before.length + 1;
        textarea.setSelectionRange(pos, pos);
        cerrar();
        textarea.focus();
    }

    function cerrar() {
        sug.style.display = 'none';
        _items = []; _symbol = ''; _sel = 0;
    }

    textarea.addEventListener('input', () => {
        const val = textarea.value;
        const cur = textarea.selectionStart;
        let found = false;

        for (let i = cur - 1; i >= 0; i--) {
            const ch = val[i];
            if (ch === '@' || ch === '#' || ch === '!') {
                _symbol   = ch;
                _startPos = i + 1;
                const query = val.slice(i + 1, cur);
                _items    = getCandidatos(ch, query);
                _sel      = 0;
                found     = true;
                break;
            }
            if (ch === ' ' || ch === '\n') break;
        }
        if (!found) cerrar();
        else renderSug();
    });

    textarea.addEventListener('keydown', (e) => {
        if (!_items.length) return;
        if (e.key === 'ArrowUp')   { e.preventDefault(); _sel = (_sel-1+_items.length)%_items.length; renderSug(); }
        if (e.key === 'ArrowDown') { e.preventDefault(); _sel = (_sel+1)%_items.length; renderSug(); }
        if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); aplicar(_items[_sel]); }
        if (e.key === 'Escape') cerrar();
    });

    textarea.addEventListener('blur', () => setTimeout(cerrar, 150));
}
