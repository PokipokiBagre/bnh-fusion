// ============================================================
// bnh-scroll.js — Botones de atajo de scroll para cualquier página BNH
// Uso:
//   import { initScroll } from '../bnh-scroll.js';
//   initScroll();                         // usa window scroll (default)
//   initScroll({ scrollEl: '#mi-panel' }) // usa un elemento específico
// ============================================================

const _CSS = `
#bnh-scroll-btns {
    position: fixed;
    right: 18px;
    bottom: 72px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 9000;
    pointer-events: none;
}
#bnh-scroll-btns button {
    pointer-events: all;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    font-size: 1em;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.22);
    transition: opacity 0.2s, transform 0.15s;
    background: rgba(255,255,255,0.92);
    color: #333;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
}
#bnh-scroll-btns button:hover {
    transform: scale(1.12);
    background: white;
}
#bnh-scroll-up   { opacity: 0; }
#bnh-scroll-down { opacity: 0.75; }
`;

function _inject() {
    if (document.getElementById('bnh-scroll-btns')) return;

    const style = document.createElement('style');
    style.textContent = _CSS;
    document.head.appendChild(style);

    const wrap = document.createElement('div');
    wrap.id = 'bnh-scroll-btns';
    wrap.innerHTML = `
        <button id="bnh-scroll-up"   title="Ir al inicio" aria-label="Subir al inicio">▲</button>
        <button id="bnh-scroll-down" title="Ir al final"  aria-label="Bajar al final">▼</button>
    `;
    document.body.appendChild(wrap);
}

export function initScroll({ scrollEl } = {}) {
    _inject();

    // Resolver el elemento de scroll
    const getEl = () => {
        if (!scrollEl) return null;
        if (typeof scrollEl === 'string') return document.querySelector(scrollEl);
        return scrollEl;
    };

    const btnUp   = document.getElementById('bnh-scroll-up');
    const btnDown = document.getElementById('bnh-scroll-down');
    if (!btnUp || !btnDown) return;

    // Scroll a arriba
    btnUp.onclick = () => {
        const el = getEl();
        if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
        else    window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Scroll a abajo
    btnDown.onclick = () => {
        const el = getEl();
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        else    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    };

    // Visibilidad dinámica: up visible cuando no estás al inicio, down cuando no estás al final
    const onScroll = () => {
        const el = getEl();
        const scrollTop    = el ? el.scrollTop    : window.scrollY;
        const scrollHeight = el ? el.scrollHeight : document.body.scrollHeight;
        const clientHeight = el ? el.clientHeight : window.innerHeight;

        const atTop    = scrollTop < 60;
        const atBottom = scrollTop + clientHeight >= scrollHeight - 60;

        btnUp.style.opacity   = atTop    ? '0'    : '0.75';
        btnDown.style.opacity = atBottom ? '0'    : '0.75';
        btnUp.style.pointerEvents   = atTop    ? 'none' : 'all';
        btnDown.style.pointerEvents = atBottom ? 'none' : 'all';
    };

    const target = getEl() || window;
    target.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // estado inicial
}
