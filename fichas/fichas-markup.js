// ============================================================
// fichas-markup.js — Sistema de markup para lore y quirk
//
// Sintaxis en el editor (lo que guarda el OP en la BD):
//   @Nombre        → link verde al personaje en fichas
//   #Tag           → link rojo al tag en la página de tags
//   !Medalla       → link azul a la medalla en medallas
//
// En la vista pública los símbolos NO se muestran,
// solo el texto coloreado con su link.
// En el editor (textarea) sí se ven los símbolos.
// ============================================================

import { gruposGlobal, aliasesGlobal } from './fichas-state.js';

// ── Renderizado de texto con markup ──────────────────────────
// Convierte el texto crudo a HTML con spans/links coloreados.
export function renderMarkup(texto) {
    if (!texto) return '';

    // Escapar HTML primero
    let html = String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // @Nombre → span verde con link a fichas
    html = html.replace(/@([\wÀ-ɏ][\wÀ-ɏ\s_.-]*?)(?=\s|$|[^wÀ-ɏ\s_.-])/g, (_, nombre) => {
        const enc = encodeURIComponent(nombre.trim());
        return `<a href="../fichas/index.html#${enc}"
            onclick="event.preventDefault();window._markupIrAFicha('${nombre.trim().replace(/'/g,"\\'")}');return false;"
            style="color:var(--green);font-weight:600;text-decoration:none;cursor:pointer;"
            title="Ver ficha de ${nombre.trim()}">${nombre.trim()}</a>`;
    });

    // #Tag → span rojo con link a tags
    html = html.replace(/#([\wÀ-ɏ][\wÀ-ɏ_.]*)/g, (_, tag) => {
        const enc = encodeURIComponent(tag);
        return `<a href="../tags/index.html#${enc}"
            style="color:var(--red);font-weight:600;text-decoration:none;cursor:pointer;"
            title="Ver tag #${tag}">#${tag}</a>`;
    });

    // !Medalla → span azul con link a medallas
    html = html.replace(/!([\wÀ-ɏ][\wÀ-ɏ\s_.-]*?)(?=\s|$|[^wÀ-ɏ\s_.-])/g, (_, medalla) => {
        const enc = encodeURIComponent(medalla.trim());
        return `<a href="../medallas/index.html#${enc}"
            style="color:#1a4a80;font-weight:600;text-decoration:none;cursor:pointer;"
            title="Ver medalla ${medalla.trim()}">${medalla.trim()}</a>`;
    });

    // Saltos de línea
    html = html.replace(/\n/g, '<br>');

    return html;
}

// Handler global para navegar a una ficha desde el markup
window._markupIrAFicha = (nombreGrupo) => {
    if (window.abrirFicha) {
        window.abrirFicha(nombreGrupo);
    } else {
        window.location.href = `../fichas/index.html`;
    }
};

// ── Autosugerencia en textareas ───────────────────────────────
// Llama esto una vez que el textarea está en el DOM.
// tipo: 'lore' | 'quirk' (solo para identificar el elemento)
export function initMarkupTextarea(textarea) {
    if (!textarea || textarea._markupInit) return;
    textarea._markupInit = true;

    // Contenedor de sugerencias (aparece encima del cursor)
    const sug = document.createElement('div');
    sug.id = textarea.id + '-markup-sug';
    sug.style.cssText = `
        display:none; position:fixed; z-index:99999;
        background:white; border:1.5px solid var(--booru-border);
        border-radius:6px; box-shadow:0 -4px 16px rgba(0,0,0,0.12);
        max-height:180px; overflow-y:auto; min-width:200px; max-width:320px;
        font-size:0.85em;
    `;
    document.body.appendChild(sug);

    let _prefix = '';   // texto después del símbolo activo
    let _symbol = '';   // '@', '#', o '!'
    let _startPos = 0;  // posición donde empezó el token
    let _items = [];    // lista actual de sugerencias
    let _sel = 0;       // índice seleccionado

    function getCandidatos(sym, query) {
        const q = query.toLowerCase();
        if (sym === '@') {
            // Nombres de grupos (nombre_refinado)
            return gruposGlobal
                .map(g => g.nombre_refinado)
                .filter(n => n.toLowerCase().includes(q))
                .slice(0, 8);
        }
        if (sym === '#') {
            // Tags de todos los grupos (únicos)
            const set = new Set();
            gruposGlobal.forEach(g => (g.tags||[]).forEach(t => {
                const tag = t.startsWith('#') ? t.slice(1) : t;
                set.add(tag);
            }));
            return [...set].filter(t => t.toLowerCase().includes(q)).sort().slice(0, 8);
        }
        if (sym === '!') {
            // Por ahora vacío — medallas se cargarán cuando exista el módulo
            return (window._medidasCatalogo || [])
                .map(m => m.nombre)
                .filter(n => n.toLowerCase().includes(q))
                .slice(0, 8);
        }
        return [];
    }

    function renderSug() {
        if (!_items.length) { sug.style.display = 'none'; return; }

        // Posicionar encima del cursor
        const rect = textarea.getBoundingClientRect();
        // Estimamos posición vertical — encima del textarea
        sug.style.left   = rect.left + 'px';
        sug.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
        sug.style.top    = 'auto';
        sug.style.display = 'block';

        const colorMap = { '@': 'var(--green)', '#': 'var(--red)', '!': '#1a4a80' };
        const col = colorMap[_symbol] || 'var(--gray-900)';

        sug.innerHTML = _items.map((item, i) => `
            <div data-idx="${i}" style="padding:7px 12px;cursor:pointer;
                background:${i === _sel ? 'var(--green-pale)' : 'white'};
                color:${i === _sel ? 'var(--green-dark)' : col};
                font-weight:${i === _sel ? '700' : '500'};
                border-bottom:1px solid var(--gray-100);">
                <span style="opacity:0.5;margin-right:2px;">${_symbol}</span>${item}
            </div>`).join('');

        sug.querySelectorAll('[data-idx]').forEach(el => {
            el.onmousedown = (e) => {
                e.preventDefault();
                aplicar(_items[parseInt(el.dataset.idx)]);
            };
        });
    }

    function aplicar(item) {
        const val = textarea.value;
        const before = val.slice(0, _startPos);   // incluye el símbolo
        const after  = val.slice(textarea.selectionStart);
        textarea.value = before + item + ' ' + after;
        // Mover cursor
        const pos = _startPos + item.length + 1;
        textarea.setSelectionRange(pos, pos);
        cerrar();
        textarea.focus();
    }

    function cerrar() {
        sug.style.display = 'none';
        _items = []; _prefix = ''; _symbol = ''; _sel = 0;
    }

    textarea.addEventListener('input', () => {
        const val = textarea.value;
        const cur = textarea.selectionStart;

        // Buscar el último @, # o ! antes del cursor en la misma palabra
        let found = false;
        for (let i = cur - 1; i >= 0; i--) {
            const ch = val[i];
            if (ch === '@' || ch === '#' || ch === '!') {
                _symbol   = ch;
                _startPos = i + 1; // después del símbolo
                _prefix   = val.slice(i + 1, cur);
                _items    = getCandidatos(ch, _prefix);
                _sel      = 0;
                found     = true;
                break;
            }
            // Si hay espacio o salto de línea, parar
            if (ch === ' ' || ch === '\n') break;
        }
        if (!found) cerrar();
        else renderSug();
    });

    textarea.addEventListener('keydown', (e) => {
        if (!_items.length) return;
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            _sel = (_sel - 1 + _items.length) % _items.length;
            renderSug();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            _sel = (_sel + 1) % _items.length;
            renderSug();
        } else if (e.key === 'Tab' || e.key === 'Enter') {
            if (_items.length) {
                e.preventDefault();
                aplicar(_items[_sel]);
            }
        } else if (e.key === 'Escape') {
            cerrar();
        }
    });

    textarea.addEventListener('blur', () => {
        // Delay para que el mousedown de la sugerencia se procese primero
        setTimeout(cerrar, 150);
    });

    textarea.addEventListener('scroll', cerrar);
}
