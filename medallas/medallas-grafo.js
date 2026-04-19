// medallas/medallas-grafo.js — Canvas 2D graph engine v2
// Nodos tag = cuadrados naranjas, nodos medalla = triángulos celestes
// Layout geométrico según cantidad de tags seleccionados
import { medallas, medallaState } from './medallas-state.js';

const mTags = m => (m.requisitos_base||[]).map(r => r.tag.startsWith('#') ? r.tag : '#'+r.tag);

const CAM = { x: 0, y: 0, zoom: 1, minZ: 0.15, maxZ: 4 };
const TAG_COLOR    = '#f39c12';   // naranja
const MEDAL_COLOR  = '#00b4d8';   // celeste
const TAG_SIZE     = 38;          // mitad del lado del cuadrado
const MED_SIZE     = 28;          // radio del triángulo

let canvas, ctx;
let nodos   = [];  // { id, x, y, tipo:'tag'|'medalla', label, data }
let edges   = [];  // { from, to }
let _dirty  = true;
let _hoveredNode = null;

// ── Geometría de posición de tags ────────────────────────────
// n tags → polígono regular (con casos especiales)
function _tagPositions(n, cx, cy, R) {
    if (n === 1) return [{ x: cx, y: cy }];
    if (n === 2) return [{ x: cx - R, y: cy }, { x: cx + R, y: cy }];
    // n=5: dado (4 esquinas + centro)
    if (n === 5) {
        const corners = _polyPositions(4, cx, cy, R);
        return [...corners, { x: cx, y: cy }];
    }
    // n>=6: cuadrado base + extras en sentido horario
    if (n >= 6) {
        const base = _polyPositions(4, cx, cy, R);
        // posiciones extra en los lados del cuadrado
        const extras = [
            { x: cx + R, y: cy },           // derecha centro
            { x: cx, y: cy + R },           // abajo centro
            { x: cx - R, y: cy },           // izquierda centro
            { x: cx, y: cy - R },           // arriba centro
            { x: cx + R * 0.7, y: cy + R * 0.7 }, // esquina inf-der
            { x: cx - R * 0.7, y: cy + R * 0.7 }, // esquina inf-izq
        ];
        return [...base, ...extras.slice(0, n - 4)];
    }
    return _polyPositions(n, cx, cy, R);
}

function _polyPositions(n, cx, cy, R) {
    const positions = [];
    for (let i = 0; i < n; i++) {
        const angle = (2 * Math.PI * i / n) - Math.PI / 2;
        positions.push({ x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) });
    }
    return positions;
}

// ── Construir grafo ───────────────────────────────────────────
export function buildGraph() {
    nodos = []; edges = [];
    const selTags = medallaState.grafoTagsSel;
    if (!selTags.length || !canvas) { _dirty = true; return; }

    const W = canvas.clientWidth  || 900;
    const H = canvas.clientHeight || 600;
    const cx = W / 2, cy = H / 2;
    const R  = Math.min(W, H) * 0.28;

    // 1. Posicionar nodos tag
    const tagPositions = _tagPositions(selTags.length, cx, cy, R);
    selTags.forEach((tag, i) => {
        const pos = tagPositions[i] || { x: cx, y: cy };
        nodos.push({ id: 'tag_' + tag, x: pos.x, y: pos.y, tipo: 'tag', label: tag, data: tag });
    });

    // 2. Para cada tag, distribuir sus medallas en arco alrededor
    selTags.forEach((tag, ti) => {
        const tagNodo = nodos.find(n => n.id === 'tag_' + tag);
        if (!tagNodo) return;

        // Medallas de este tag (incluyendo propuestas solo si OP)
        const medallasDeltag = medallas.filter(m =>
            (!m.propuesta || medallaState.esAdmin) &&
            mTags(m).some(t => t.toLowerCase() === tag.toLowerCase())
        );

        if (!medallasDeltag.length) return;

        // Dirección base: desde el centro hacia el nodo tag
        const angle0 = Math.atan2(tagNodo.y - cy, tagNodo.x - cx);
        const orbit   = Math.min(R * 0.55, 140); // radio de órbita
        const spread  = medallasDeltag.length > 1
            ? (Math.PI * 0.7) / (medallasDeltag.length - 1)
            : 0;
        const startAngle = angle0 - (spread * (medallasDeltag.length - 1)) / 2;

        medallasDeltag.forEach((m, mi) => {
            const ang = startAngle + spread * mi;
            const mx  = tagNodo.x + Math.cos(ang) * orbit;
            const my  = tagNodo.y + Math.sin(ang) * orbit;

            // Evitar duplicar si ya existe
            if (!nodos.find(n => n.id === m.id)) {
                nodos.push({ id: m.id, x: mx, y: my, tipo: 'medalla', label: m.nombre, data: m,
                    // Ángulo hacia el tag (para orientar la punta del triángulo)
                    anguloHaciaTag: Math.atan2(tagNodo.y - my, tagNodo.x - mx)
                });
            }

            // Edge
            edges.push({
                from: nodos.find(n => n.id === 'tag_' + tag),
                to:   nodos.find(n => n.id === m.id),
                propuesta: !!m.propuesta
            });
        });
    });

    _dirty = true;
}

// ── Render ────────────────────────────────────────────────────
function loop() {
    if (_dirty) { draw(); _dirty = false; }
    requestAnimationFrame(loop);
}

function draw() {
    if (!canvas || !ctx) return;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(CAM.x, CAM.y);
    ctx.scale(CAM.zoom, CAM.zoom);

    // Edges
    edges.forEach(e => {
        if (!e.from || !e.to) return;
        ctx.beginPath();
        ctx.moveTo(e.from.x, e.from.y);
        ctx.lineTo(e.to.x, e.to.y);
        ctx.strokeStyle = e.propuesta ? 'rgba(243,156,18,0.4)' : 'rgba(0,180,216,0.25)';
        ctx.lineWidth = 1.5;
        if (e.propuesta) ctx.setLineDash([4, 4]);
        else ctx.setLineDash([]);
        ctx.stroke();
        ctx.setLineDash([]);
    });

    // Nodos
    nodos.forEach(n => {
        const hov = n === _hoveredNode;
        const sc  = hov ? 1.15 : 1;

        if (n.tipo === 'tag') {
            // Cuadrado naranja
            const s = TAG_SIZE * sc;
            ctx.save();
            ctx.translate(n.x, n.y);
            ctx.rotate(Math.PI / 4); // 45° para rombo visual
            ctx.beginPath();
            ctx.rect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
            ctx.fillStyle = TAG_COLOR + (hov ? 'cc' : '33');
            ctx.fill();
            ctx.strokeStyle = TAG_COLOR;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
            // Label
            ctx.fillStyle = TAG_COLOR;
            ctx.font = `bold ${Math.round(8 / CAM.zoom + 9)}px Inter`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const label = n.label.length > 14 ? n.label.slice(0, 13) + '…' : n.label;
            ctx.fillText(label, n.x, n.y + TAG_SIZE + 14);
        } else {
            // Triángulo celeste con punta apuntando al tag
            const r    = MED_SIZE * sc;
            const ang  = n.anguloHaciaTag || 0;
            const isProp = n.data?.propuesta;
            // Punta en la dirección del tag, base opuesta
            const p1x = n.x + Math.cos(ang) * r;
            const p1y = n.y + Math.sin(ang) * r;
            const p2x = n.x + Math.cos(ang + 2.4) * r;
            const p2y = n.y + Math.sin(ang + 2.4) * r;
            const p3x = n.x + Math.cos(ang - 2.4) * r;
            const p3y = n.y + Math.sin(ang - 2.4) * r;
            ctx.beginPath();
            ctx.moveTo(p1x, p1y);
            ctx.lineTo(p2x, p2y);
            ctx.lineTo(p3x, p3y);
            ctx.closePath();
            ctx.fillStyle = isProp
                ? (hov ? 'rgba(243,156,18,0.7)' : 'rgba(243,156,18,0.25)')
                : (hov ? 'rgba(0,180,216,0.7)'  : 'rgba(0,180,216,0.22)');
            ctx.fill();
            ctx.strokeStyle = isProp ? TAG_COLOR : MEDAL_COLOR;
            ctx.lineWidth = hov ? 2.5 : 1.5;
            ctx.stroke();
            // Label
            ctx.fillStyle = isProp ? TAG_COLOR : MEDAL_COLOR;
            ctx.font = `${Math.round(6 / CAM.zoom + 8)}px Inter`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const words = n.label.split(' ');
            const line1 = words.slice(0, Math.ceil(words.length / 2)).join(' ');
            const line2 = words.slice(Math.ceil(words.length / 2)).join(' ');
            ctx.fillText(line1.length > 15 ? line1.slice(0,14)+'…' : line1, n.x, n.y + MED_SIZE * sc + 4);
            if (line2) ctx.fillText(line2.length > 15 ? line2.slice(0,14)+'…' : line2, n.x, n.y + MED_SIZE * sc + 16);
        }
    });

    ctx.restore();
}

// ── Interacción ───────────────────────────────────────────────
function screenToWorld(sx, sy) {
    return { x: (sx - CAM.x) / CAM.zoom, y: (sy - CAM.y) / CAM.zoom };
}

function hitTest(wx, wy) {
    for (let i = nodos.length - 1; i >= 0; i--) {
        const n = nodos[i];
        const r = n.tipo === 'tag' ? TAG_SIZE : MED_SIZE;
        const dx = n.x - wx, dy = n.y - wy;
        if (dx*dx + dy*dy <= r*r*1.8) return n;
    }
    return null;
}

let _isPanning = false, _lastMX = 0, _lastMY = 0;

export function initGrafo(canvasEl) {
    canvas = canvasEl;
    ctx    = canvas.getContext('2d');
    _resize();
    window.addEventListener('resize', _resize);

    canvas.addEventListener('mousedown', e => {
        const r  = canvas.getBoundingClientRect();
        const { x, y } = screenToWorld(e.clientX - r.left, e.clientY - r.top);
        const hit = hitTest(x, y);
        if (!hit) { _isPanning = true; _lastMX = e.clientX; _lastMY = e.clientY; }
    });
    canvas.addEventListener('mousemove', e => {
        const r = canvas.getBoundingClientRect();
        const { x, y } = screenToWorld(e.clientX - r.left, e.clientY - r.top);
        if (_isPanning) {
            CAM.x += e.clientX - _lastMX; CAM.y += e.clientY - _lastMY;
            _lastMX = e.clientX; _lastMY = e.clientY; _dirty = true;
        } else {
            const h = hitTest(x, y);
            if (h !== _hoveredNode) { _hoveredNode = h; canvas.style.cursor = h ? 'pointer' : 'default'; _dirty = true; }
        }
    });
    canvas.addEventListener('mouseup',  () => { _isPanning = false; });
    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const r  = canvas.getBoundingClientRect();
        const sx = e.clientX - r.left, sy = e.clientY - r.top;
        const dz = e.deltaY > 0 ? 0.88 : 1.14;
        const nz = Math.max(CAM.minZ, Math.min(CAM.maxZ, CAM.zoom * dz));
        CAM.x = sx - (sx - CAM.x) * (nz / CAM.zoom);
        CAM.y = sy - (sy - CAM.y) * (nz / CAM.zoom);
        CAM.zoom = nz; _dirty = true;
    }, { passive: false });
    canvas.addEventListener('click', e => {
        const r  = canvas.getBoundingClientRect();
        const { x, y } = screenToWorld(e.clientX - r.left, e.clientY - r.top);
        const hit = hitTest(x, y);
        if (!hit) return;
        if (hit.tipo === 'medalla') window._medallasAbrirDetalle?.(hit.data);
        if (hit.tipo === 'tag')    window._medGrafoTagClick?.(hit.data);
    });

    loop();
}

function _resize() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w   = canvas.parentElement?.clientWidth || window.innerWidth;
    const h   = Math.max(500, window.innerHeight - 260);
    canvas.width  = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);
    CAM.x = w / 2; CAM.y = h / 2;
    _dirty = true;
}

export function resetGrafoView() {
    const W = canvas?.clientWidth || 900;
    const H = canvas?.clientHeight || 600;
    CAM.x = W / 2; CAM.y = H / 2; CAM.zoom = 1;
    _dirty = true;
}

export { _dirty };
