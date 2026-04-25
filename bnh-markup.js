// ============================================================
// bnh-markup.js — Sistema de markup enriquecido para lore/quirk
// Colocar en la RAÍZ del proyecto.
// ============================================================

let _grupos   = [];  
let _medallas = [];  

export function initMarkup({ grupos = [], medallas = [] } = {}) {
    _grupos   = grupos;
    _medallas = medallas;
}

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
            const rest = t.slice(i + 1);
            const mD = rest.match(/^([\wÀ-ɏ][\wÀ-ɏ ._-]+?)@/);
            if (mD) { tokens.push({ tipo: 'persona', valor: mD[1].trim() }); i += 1 + mD[1].length + 1; continue; }
            const mS = rest.match(/^([\wÀ-ɏ][\wÀ-ɏ._-]*)/);
            if (mS) { tokens.push({ tipo: 'persona', valor: mS[1].trim() }); i += 1 + mS[1].length; continue; }
        }

        if (ch === '#') {
            const mS = t.slice(i + 1).match(/^([\wÀ-ɏ][\wÀ-ɏ_.]*)/);
            if (mS) { tokens.push({ tipo: 'tag', valor: mS[1] }); i += 1 + mS[1].length; continue; }
        }

        if (ch === '!') {
            const rest = t.slice(i + 1);
            const mD = rest.match(/^([\wÀ-ɏ][\wÀ-ɏ ._-]+?)!/);
            if (mD) { tokens.push({ tipo: 'medalla', valor: mD[1].trim() }); i += 1 + mD[1].length + 1; continue; }
            const mS = rest.match(/^([\wÀ-ɏ][\wÀ-ɏ._-]*)/);
            if (mS) { tokens.push({ tipo: 'medalla', valor: mS[1].trim() }); i += 1 + mS[1].length; continue; }
        }

        // Factor dado: %rango: descripción del efecto%
        // Ejemplos: %90+: Hace 3 PVs de daño.% | %20-: Autoquita 10 PVs.% | %50-89: Efecto neutro.%
        if (ch === '%') {
            const rest = t.slice(i + 1);
            const mBloque = rest.match(/^(\d{1,3}(?:[+-]|\s*-\s*\d{1,3})?)\s*:\s*([\s\S]*?)%/);
            if (mBloque) {
                tokens.push({ tipo: 'dado', rango: mBloque[1].trim(), efecto: mBloque[2].trim() });
                i += 1 + mBloque[0].length;
                continue;
            }
            // Fallback: %rango% sin efecto (solo badge)
            const mSimple = rest.match(/^(\d{1,3}(?:[+-]|\s*-\s*\d{1,3})?)%/);
            if (mSimple) { tokens.push({ tipo: 'dado', rango: mSimple[1].trim(), efecto: '' }); i += 1 + mSimple[0].length; continue; }
        }

        if (ch === '\n') { tokens.push({ tipo: 'br' }); i++; continue; }

        let j = i + 1;
        while (j < t.length && t[j] !== '@' && t[j] !== '#' && t[j] !== '!' && t[j] !== '%' && t[j] !== '\n') j++;
        tokens.push({ tipo: 'texto', valor: t.slice(i, j) });
        i = j;
    }

    return tokens.map(tok => {
        if (tok.tipo === 'br')    return '<br>';
        if (tok.tipo === 'texto') return escTxt(tok.valor);

       if (tok.tipo === 'persona') {
            const n = tok.valor;
            return `<a href="#" onclick="event.preventDefault();event.stopPropagation();window._markupIrAFicha('${n.replace(/'/g,"\\'")}');return false;"
                style="color:var(--green,#1e8449);font-weight:600;text-decoration:none;cursor:pointer;"
                title="Ver ficha de ${escTxt(n)}">${escTxt(n)}</a>`;
        }
        if (tok.tipo === 'tag') {
            const tag = tok.valor;
            return `<a href="#" onclick="event.preventDefault();event.stopPropagation();window._markupIrATag('${tag.replace(/'/g,"\'")}');return false;"
                style="color:var(--red,#c0392b);font-weight:600;text-decoration:none;cursor:pointer;"
                title="Ver tag #${escTxt(tag)}">#${escTxt(tag)}</a>`;
        }
        if (tok.tipo === 'medalla') {
            const m = tok.valor;
            return `<a href="#" onclick="event.preventDefault();event.stopPropagation();window._markupIrAMedalla('${m.replace(/'/g,"\\'")}');return false;"
                style="color:#1a4a80;font-weight:600;text-decoration:none;cursor:pointer;"
                title="Ver medalla ${escTxt(m)}">${escTxt(m)}</a>`;
        }
        if (tok.tipo === 'dado') {
            const rango = tok.rango;
            const efecto = tok.efecto;
            const esAlto = rango.includes('+');
            const esBajo = rango.endsWith('-') || /^\d{1,2}-$/.test(rango);
            const chipBg     = esAlto ? 'var(--green-pale)'  : esBajo ? 'var(--red-pale)'   : 'var(--orange-pale)';
            const chipColor  = esAlto ? 'var(--green-dark)'  : esBajo ? 'var(--red)'         : 'var(--orange)';
            const chipBorder = esAlto ? 'var(--green-light)' : esBajo ? 'var(--red)'         : 'var(--orange)';
            const chipHtml = `<span style="display:inline-flex;align-items:center;gap:3px;background:${chipBg};color:${chipColor};border:1.5px solid ${chipBorder};font-weight:800;font-size:0.78em;padding:1px 7px;border-radius:8px;font-family:monospace;white-space:nowrap;vertical-align:middle;">🎲 ${escTxt(rango)}</span>`;
            if (!efecto) return chipHtml;
            const efectoHtml = renderMarkup(efecto);
            return `<span style="display:inline-flex;align-items:baseline;gap:5px;flex-wrap:wrap;vertical-align:middle;">${chipHtml}<span style="font-size:0.85em;color:var(--gray-700);line-height:1.5;">${efectoHtml}</span></span>`;
        }
        return '';
    }).join('');
}

// Handler global para navegar a un TAG
window._markupIrATag = (tag) => {
    if (window._tagsVerDetalle) {
        window._tagsVerDetalle(tag.startsWith('#') ? tag : '#' + tag);
    } else {
        const isSub = window.location.pathname.includes('/fichas/') || window.location.pathname.includes('/medallas/');
        window.location.href = (isSub ? '../tags/' : 'tags/') + 'index.html?tag=' + encodeURIComponent(tag);
    }
};

// Handler global para navegar a FICHAS
window._markupIrAFicha = (nombre) => {
    if (window.abrirFicha) {
        window.abrirFicha(nombre);
    } else {
        const isSub = window.location.pathname.includes('/tags/') || window.location.pathname.includes('/medallas/');
        window.location.href = (isSub ? '../fichas/' : 'fichas/') + 'index.html?ficha=' + encodeURIComponent(nombre);
    }
};

// Handler global para navegar a MEDALLAS
window._markupIrAMedalla = (nombre) => {
    if (window._medallasAbrirDetalleByName) {
        window._medallasAbrirDetalleByName(nombre);
    } else {
        const isSub = window.location.pathname.includes('/tags/') || window.location.pathname.includes('/fichas/');
        window.location.href = (isSub ? '../medallas/' : 'medallas/') + 'index.html?medalla=' + encodeURIComponent(nombre);
    }
};

// ── Autosugerencia en textareas ───────────────────────────────
export function initMarkupTextarea(textarea) {
    if (!textarea || textarea._markupInit) return;
    textarea._markupInit = true;

    const sug = document.createElement('div');
    sug.style.cssText = [
        'display:none','position:fixed','z-index:99999',
        'background:white','border:1.5px solid #ccc',
        'border-radius:6px','box-shadow:0 -4px 16px rgba(0,0,0,0.14)',
        'max-height:200px','overflow-y:auto',
        'min-width:200px','max-width:300px',
        'font-size:0.85em','font-family:Inter,sans-serif'
    ].join(';');
    document.body.appendChild(sug);

    let _sym = '', _start = 0, _items = [], _sel = 0, _applying = false;

    function getCandidatos(sym, q) {
        q = q.toLowerCase();
        if (sym === '@') return _grupos.map(g => g.nombre_refinado).filter(n => n.toLowerCase().includes(q)).slice(0, 8);
        if (sym === '#') {
            const set = new Set();
            _grupos.forEach(g => (g.tags||[]).forEach(t => set.add(t.startsWith('#') ? t.slice(1) : t)));
            return [...set].filter(t => t.toLowerCase().includes(q)).sort().slice(0, 8);
        }
        if (sym === '!') return _medallas.map(m => m.nombre).filter(n => n.toLowerCase().includes(q)).slice(0, 8);
        if (sym === '%') {
            // Rangos de dado d100 más usados
            const rangos = ['90+', '80+', '70+', '60+', '50+', '20-', '30-', '40-', '50-69', '40-69', '30-59'];
            return q ? rangos.filter(r => r.startsWith(q)) : rangos;
        }
        return [];
    }

    function render() {
        if (!_items.length) { sug.style.display = 'none'; return; }
        const rect = textarea.getBoundingClientRect();
        sug.style.left = rect.left + 'px';
        if (rect.top > 180) {
            sug.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
            sug.style.top    = 'auto';
        } else {
            sug.style.top    = (rect.bottom + 4) + 'px';
            sug.style.bottom = 'auto';
        }
        sug.style.display = 'block';
        const col = _sym==='@' ? '#1e8449' : _sym==='#' ? '#c0392b' : _sym==='%' ? '#5a3e00' : '#1a4a80';
        sug.innerHTML = _items.map((it, i) => `
            <div data-i="${i}" style="padding:7px 12px;cursor:pointer;background:${i===_sel?'#d5f5e3':'white'};color:${i===_sel?'#145a32':col};font-weight:${i===_sel?700:500};border-bottom:1px solid #f1f3f4;">
                <span style="opacity:.4;">${_sym}</span>${it}
            </div>`).join('');
        sug.querySelectorAll('[data-i]').forEach(el => { el.onmousedown = e => { e.preventDefault(); apply(_items[+el.dataset.i]); }; });
    }

    function apply(item) {
        _applying = true;
        const v = textarea.value, cur = textarea.selectionStart;
        const symPos = _start - 1;        
        const textBefore = v.slice(0, symPos); 
        const textAfter  = v.slice(cur);       
        // Para dado: inserta %rango:  y deja el cursor después de los dos puntos para escribir el efecto
        const insertion = _sym === '#' ? `#${item} ` : _sym === '%' ? `%${item}: ` : `${_sym}${item}${_sym} `;
        textarea.value = textBefore + insertion + textAfter;
        const pos = textBefore.length + insertion.length;
        textarea.setSelectionRange(pos, pos);
        close();
        textarea.focus();
        Promise.resolve().then(() => { _applying = false; });
    }

    function close() { sug.style.display='none'; _items=[]; _sym=''; _sel=0; }

    textarea.addEventListener('input', () => {
        if (_applying) return; 
        const v = textarea.value, cur = textarea.selectionStart;
        let found = false;
        for (let i = cur - 1; i >= 0; i--) {
            const c = v[i];
            if (c==='@' || c==='#' || c==='!' || c==='%') { _sym = c; _start = i + 1; _items = getCandidatos(c, v.slice(i+1, cur)); _sel = 0; found = true; break; }
            if (c==='\n') break;
            if (c===' ' && _sym !== '!' && _sym !== '@' && _sym !== '%') break;
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
