// medallas/medallas-grafo.js — Canvas 2D graph engine
import { medallas, medallaState, STORAGE_URL, norm } from './medallas-state.js';
import { guardarPosicionesGrafo } from './medallas-data.js';

// Tags de una medalla derivados de sus requisitos_base
const mTags = m => (m.requisitos_base||[]).map(r => r.tag.startsWith('#') ? r.tag : '#'+r.tag);

const CAM = { x: 0, y: 0, zoom: 1, minZ: 0.15, maxZ: 3 };
const NODO_R = 36;        // radio base de nodo
const INTER_R = 18;       // radio para nodos de tag-cluster label

let canvas, ctx;
let nodos = [];           // { id, x, y, r, label, color, tipo:'medalla'|'tag', medalla? }
let edges = [];           // { from, to, tipo:'req'|'cond' }
let dragging = null;
let lastMX = 0, lastMY = 0;
let isPanning = false;
let _dirty = true;
let _raf = null;
let _posChanged = false;

export function initGrafo(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('mousedown', onMD);
    canvas.addEventListener('mousemove', onMM);
    canvas.addEventListener('mouseup',   onMU);
    canvas.addEventListener('wheel',     onWheel, { passive: false });
    canvas.addEventListener('dblclick',  onDbl);
    loop();
}

function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement?.clientWidth || window.innerWidth;
    const h = Math.max(500, window.innerHeight - 200);
    canvas.width  = w * dpr; canvas.height = h * dpr;
    canvas.style.width  = w + 'px'; canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);
    CAM.x = w / 2; CAM.y = h / 2;
    _dirty = true;
}

export function buildGraph() {
    nodos = []; edges = [];
    if (!medallas.length) { _dirty = true; return; }

    // 1. Cluster de tags (nodos grandes de categoría)
    const tagMap = {};
    medallas.forEach(m => {
        mTags(m).forEach(t => {
            const k = '#' + (t.startsWith('#') ? t.slice(1) : t);
            if (!tagMap[k]) tagMap[k] = { tag: k, ms: [] };
            tagMap[k].ms.push(m);
        });
    });

    // Posiciones guardadas o layout circular
    const tagKeys = Object.keys(tagMap);
    const tw = canvas.clientWidth || 900;
    const th = canvas.clientHeight || 600;
    const cx = tw / 2, cy = th / 2;

    tagKeys.forEach((tk, i) => {
        const angle = (2 * Math.PI * i) / tagKeys.length - Math.PI / 2;
        const radius = Math.min(tw, th) * 0.35;
        const stored = tagMap[tk].ms[0]; // use first medalla's pos as anchor
        const tx = stored?.pos_x || (cx + Math.cos(angle) * radius);
        const ty = stored?.pos_y || (cy + Math.sin(angle) * radius);
        tagMap[tk].x = tx; tagMap[tk].y = ty;
        nodos.push({
            id: 'tag_' + tk, x: tx, y: ty, r: INTER_R + 4,
            label: tk, color: _tagColor(tk), tipo: 'tag',
        });
    });

    // 2. Medallas: posición guardada o distribuida alrededor de su primer tag
    medallas.forEach((m, i) => {
        const mainTag = mTags(m)[0] ? (mTags(m)[0].startsWith('#') ? mTags(m)[0] : '#'+mTags(m)[0]) : null;
        const cluster = mainTag ? tagMap[mainTag] : null;
        let mx = m.pos_x, my = m.pos_y;
        if (!mx && !my) {
            if (cluster) {
                const siblings = tagMap[mainTag].ms;
                const idx = siblings.indexOf(m);
                const spread = 120;
                const ang = (2 * Math.PI * idx) / siblings.length;
                mx = cluster.x + Math.cos(ang) * spread;
                my = cluster.y + Math.sin(ang) * spread;
            } else {
                mx = 100 + (i % 8) * 140; my = 100 + Math.floor(i / 8) * 140;
            }
        }
        nodos.push({
            id: m.id, x: mx, y: my, r: NODO_R,
            label: m.nombre, color: mainTag ? _tagColor(mainTag) : '#888',
            tipo: 'medalla', medalla: m,
        });
    });

    // 3. Edges: medalla → tag_cluster (requisito), medalla → tag_cluster (cond)
    medallas.forEach(m => {
        const mn = nodos.find(n => n.id === m.id);
        if (!mn) return;
        // tags base (derivados de requisitos_base)
        mTags(m).forEach(t => {
            const tk = '#' + (t.startsWith('#') ? t.slice(1) : t);
            const tn = nodos.find(n => n.id === 'tag_' + tk);
            if (tn) edges.push({ from: tn, to: mn, tipo: 'req' });
        });
        // efectos condicionales → otros tags
        (m.efectos_condicionales||[]).forEach(ec => {
            const tk = '#' + (ec.tag.startsWith('#') ? ec.tag.slice(1) : ec.tag);
            const tn = nodos.find(n => n.id === 'tag_' + tk);
            const _mainTag = mTags(m)[0] || '';
            if (tn && tn.id !== ('tag_' + (_mainTag.startsWith('#') ? _mainTag.slice(1) : _mainTag))) {
                edges.push({ from: tn, to: mn, tipo: 'cond' });
            }
        });
    });

    _dirty = true;
}

function _tagColor(tag) {
    // Deterministic color from tag string
    let h = 0;
    for (const c of tag) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
    return `hsl(${h % 360}, 65%, 55%)`;
}

// ── Render ────────────────────────────────────────────────────
function loop() {
    if (_dirty) { draw(); _dirty = false; }
    _raf = requestAnimationFrame(loop);
}

function draw() {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(CAM.x, CAM.y);
    ctx.scale(CAM.zoom, CAM.zoom);

    // Edges
    edges.forEach(e => {
        ctx.beginPath();
        ctx.moveTo(e.from.x, e.from.y);
        ctx.lineTo(e.to.x, e.to.y);
        ctx.strokeStyle = e.tipo === 'req'
            ? 'rgba(255,255,255,0.12)'
            : 'rgba(255,200,80,0.2)';
        ctx.lineWidth = e.tipo === 'req' ? 1 : 1.5;
        if (e.tipo === 'cond') { ctx.setLineDash([4,4]); } else { ctx.setLineDash([]); }
        ctx.stroke();
        ctx.setLineDash([]);
    });

    // Nodes
    nodos.forEach(n => {
        const isHover = n === _hoveredNode;
        const isSelected = n.id === _selectedId;

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + (isHover ? 3 : 0), 0, Math.PI * 2);

        if (n.tipo === 'tag') {
            // Tag cluster: filled circle
            ctx.fillStyle = n.color + '33';
            ctx.fill();
            ctx.strokeStyle = n.color;
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            // Medalla node
            ctx.fillStyle = isSelected ? n.color + '55' : n.color + '22';
            ctx.fill();
            ctx.strokeStyle = isSelected ? '#fff' : n.color;
            ctx.lineWidth = isSelected ? 2.5 : 1.5;
            ctx.stroke();
        }

        // Label
        ctx.fillStyle = n.tipo === 'tag' ? n.color : '#e0e0e0';
        ctx.font = n.tipo === 'tag'
            ? `bold ${Math.round(9 / CAM.zoom + 8)}px Inter`
            : `${Math.round(7 / CAM.zoom + 7)}px Inter`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const maxW = (n.r * 2 - 4);
        const words = n.label.split(' ');
        if (words.length > 1 && n.tipo === 'medalla') {
            // Two-line label
            const line1 = words.slice(0, Math.ceil(words.length/2)).join(' ');
            const line2 = words.slice(Math.ceil(words.length/2)).join(' ');
            ctx.fillText(line1, n.x, n.y - 7, maxW);
            ctx.fillText(line2, n.x, n.y + 7, maxW);
        } else {
            ctx.fillText(n.label, n.x, n.y, maxW);
        }
    });

    ctx.restore();
}

// ── Interaction ───────────────────────────────────────────────
let _hoveredNode = null, _selectedId = null;

function screenToWorld(sx, sy) {
    return { x: (sx - CAM.x) / CAM.zoom, y: (sy - CAM.y) / CAM.zoom };
}

function hitTest(wx, wy) {
    // Medallas on top
    for (let i = nodos.length - 1; i >= 0; i--) {
        const n = nodos[i];
        const dx = n.x - wx, dy = n.y - wy;
        if (dx*dx + dy*dy <= n.r*n.r) return n;
    }
    return null;
}

function onMD(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const { x, y } = screenToWorld(sx, sy);
    const hit = hitTest(x, y);
    if (hit && medallaState.esAdmin) {
        dragging = hit; dragging._ox = hit.x - x; dragging._oy = hit.y - y;
    } else {
        isPanning = true; lastMX = sx; lastMY = sy;
    }
}

function onMM(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const { x, y } = screenToWorld(sx, sy);
    if (dragging) {
        dragging.x = x + dragging._ox;
        dragging.y = y + dragging._oy;
        _dirty = true; _posChanged = true;
    } else if (isPanning) {
        CAM.x += sx - lastMX; CAM.y += sy - lastMY;
        lastMX = sx; lastMY = sy;
        _dirty = true;
    } else {
        const h = hitTest(x, y);
        if (h !== _hoveredNode) { _hoveredNode = h; canvas.style.cursor = h ? 'pointer' : 'grab'; _dirty = true; }
    }
}

function onMU(e) {
    if (dragging) {
        _savePositions();
        dragging = null;
    }
    isPanning = false;
}

function onWheel(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const dz = e.deltaY > 0 ? 0.88 : 1.14;
    const nz = Math.max(CAM.minZ, Math.min(CAM.maxZ, CAM.zoom * dz));
    CAM.x = sx - (sx - CAM.x) * (nz / CAM.zoom);
    CAM.y = sy - (sy - CAM.y) * (nz / CAM.zoom);
    CAM.zoom = nz;
    _dirty = true;
}

function onDbl(e) {
    const rect = canvas.getBoundingClientRect();
    const { x, y } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hit = hitTest(x, y);
    if (hit?.tipo === 'medalla') {
        _selectedId = hit.id;
        _dirty = true;
        window._medallasAbrirDetalle(hit.medalla);
    }
}

async function _savePositions() {
    if (!_posChanged || !medallaState.esAdmin) return;
    _posChanged = false;
    const poss = nodos.filter(n => n.tipo === 'medalla').map(n => ({ id: n.id, pos_x: Math.round(n.x), pos_y: Math.round(n.y) }));
    await guardarPosicionesGrafo(poss);
}

export function resetGrafoView() {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    CAM.x = W / 2; CAM.y = H / 2; CAM.zoom = 0.9;
    _dirty = true;
}
