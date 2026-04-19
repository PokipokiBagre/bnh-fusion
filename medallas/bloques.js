// medallas/bloques.js — Motor Tetris 2.0 (Grid 20 cols, bloques proporcionales, canvas reactivo)
const NUM_COLS = 20; // 20 slots horizontales (ancho)
const GAP = 4;
// Altura mínima de bloque en px — los bloques nunca serán más cortos que esto
const MIN_BLOCK_H = 44;

// Altura base y dinámica del canvas (en "filas")
const ROWS_BASE = 15;      // altura inicial: 15 filas
const ROWS_MAX  = 30;      // límite máximo de expansión
// Umbral de bloques apilados en la columna más alta para expandir
// Cada EXPAND_STEP bloques de altura → +EXPAND_ADD filas al canvas
const EXPAND_STEP = 5;
const EXPAND_ADD  = 5;

let canvas, ctx;
let bloques = [];
let _animId = null;
let _currentRows = ROWS_BASE; // filas actuales del canvas
let _expandCooldown = 0;       // evita expandir cada frame

// Variables para el Tooltip
let mouseX = -100;
let mouseY = -100;
let hoveredBlock = null;

export function initBloques(canvasEl) {
    canvas = canvasEl;
    ctx    = canvas.getContext('2d');
    _currentRows = ROWS_BASE;
    _resize();
    window.addEventListener('resize', _resize);

    canvas.addEventListener('click', e => {
        if (hoveredBlock && !hoveredBlock.isTag && window._medallasAbrirDetalle) {
            window._medallasAbrirDetalle(hoveredBlock.data);
        }
    });

    canvas.addEventListener('mousemove', e => {
        const r = canvas.getBoundingClientRect();
        mouseX = e.clientX - r.left;
        mouseY = e.clientY - r.top;
        hoveredBlock = null;
        for (let i = bloques.length - 1; i >= 0; i--) {
            const b = bloques[i];
            if (mouseX >= b.visualX && mouseX <= b.visualX + b.w && mouseY >= b.visualY && mouseY <= b.visualY + b.h) {
                hoveredBlock = b;
                break;
            }
        }
        canvas.style.cursor = (hoveredBlock && !hoveredBlock.isTag) ? 'pointer' : 'default';
    });

    canvas.addEventListener('mouseleave', () => {
        hoveredBlock = null;
        mouseX = -100;
        mouseY = -100;
    });

    if (!_animId) loop();
}

function getColorForTag(tagStr) {
    let hash = 0;
    for (let i = 0; i < tagStr.length; i++) hash = tagStr.charCodeAt(i) + ((hash << 5) - hash);
    const paletas = ['#00b4d8', '#2ecc71', '#9b59b6', '#e74c3c', '#1abc9c', '#f1c40f', '#e67e22', '#3498db', '#e84393'];
    return paletas[Math.abs(hash) % paletas.length];
}

export function updateBloques(tagsData) {
    if (!canvas) return;
    _resize();

    const currentClusterIds = tagsData.map(g => g.tag);
    bloques = bloques.filter(b => currentClusterIds.includes(b.clusterId));

    const existingIds = new Set(bloques.map(b => b.clusterId));
    const newClusters = tagsData.filter(g => !existingIds.has(g.tag));

    newClusters.forEach((grupo) => {
        const cColor = getColorForTag(grupo.tag);
        const C = Math.floor(Math.random() * (NUM_COLS - 2)) + 1;
        let spawnY = -60;

        bloques.push({
            id: 'tag_' + grupo.tag,
            clusterId: grupo.tag,
            clusterColor: cColor,
            isTag: true,
            text: grupo.tag,
            data: null,
            col: C,
            visualY: spawnY
        });

        grupo.medallas.forEach((m) => {
            spawnY -= (40 + Math.random() * 60);
            let colOffset = 0;
            const rand = Math.random();
            if (rand < 0.33) colOffset = -1;
            else if (rand > 0.66) colOffset = 1;
            const finalCol = Math.max(0, Math.min(NUM_COLS - 1, C + colOffset));

            bloques.push({
                id: m.id,
                clusterId: grupo.tag,
                clusterColor: cColor,
                isTag: false,
                text: m.nombre,
                data: m,
                col: finalCol,
                visualY: spawnY
            });
        });
    });
}

function loop() {
    _animId = requestAnimationFrame(loop);
    if (!canvas || !ctx) return;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    const BLOCK_W = (W - (NUM_COLS + 1) * GAP) / NUM_COLS;
    const BLOCK_H = Math.max(MIN_BLOCK_H, Math.round(BLOCK_W * 0.85));

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    // --- FÍSICA ---
    let blocksByCol = Array.from({length: NUM_COLS}, () => []);
    bloques.forEach(b => blocksByCol[b.col].push(b));

    // Calcular la altura máxima de bloques apilados (en número de bloques)
    let maxStackHeight = 0;

    blocksByCol.forEach(colBlocks => {
        colBlocks.sort((a, b) => b.visualY - a.visualY);
        let currentFloor = H - GAP;

        colBlocks.forEach(b => {
            b.targetY = currentFloor - BLOCK_H;
            currentFloor = b.targetY - GAP;
            b.w = BLOCK_W;
            b.h = BLOCK_H;
            b.visualX = GAP + b.col * (BLOCK_W + GAP);
            b.visualY += (b.targetY - b.visualY) * 0.18;
            if (Math.abs(b.targetY - b.visualY) < 0.5) b.visualY = b.targetY;
        });

        if (colBlocks.length > maxStackHeight) maxStackHeight = colBlocks.length;
    });

    // --- EXPANSIÓN REACTIVA DEL CANVAS ---
    // Cada EXPAND_STEP bloques de altura, añadir EXPAND_ADD filas
    _expandCooldown--;
    if (_expandCooldown <= 0 && bloques.length > 0) {
        _expandCooldown = 60; // solo revisar cada ~1s
        const targetRows = Math.min(
            ROWS_MAX,
            ROWS_BASE + Math.floor(maxStackHeight / EXPAND_STEP) * EXPAND_ADD
        );
        if (targetRows !== _currentRows) {
            _currentRows = targetRows;
            const wrap = canvas.parentElement;
            if (wrap) {
                // Calcular altura en px según BLOCK_H actual
                const newH = _currentRows * (BLOCK_H + GAP) + GAP;
                wrap.style.height = newH + 'px';
                _resize();
            }
        }
    }

    // --- DIBUJAR CLUSTERS ---
    const clusters = {};
    bloques.forEach(b => {
        if (!clusters[b.clusterId]) clusters[b.clusterId] = [];
        clusters[b.clusterId].push(b);
    });

    for (const cid in clusters) {
        const clusterBlocks = clusters[cid];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const color = clusterBlocks[0].clusterColor;
        clusterBlocks.forEach(b => {
            if (b.visualX < minX) minX = b.visualX;
            if (b.visualY < minY) minY = b.visualY;
            if (b.visualX + b.w > maxX) maxX = b.visualX + b.w;
            if (b.visualY + b.h > maxY) maxY = b.visualY + b.h;
        });
        const P = 8;
        ctx.fillStyle = `${color}1A`;
        ctx.strokeStyle = `${color}80`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(minX - P, minY - P, (maxX - minX) + P * 2, (maxY - minY) + P * 2, 10);
        ctx.fill();
        ctx.stroke();
    }

    // --- DIBUJAR BLOQUES ---
    bloques.forEach(b => {
        ctx.fillStyle = b.isTag ? 'rgba(243,156,18,0.25)' : `${b.clusterColor}25`;
        ctx.strokeStyle = b.isTag ? '#f39c12' : b.clusterColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(b.visualX, b.visualY, b.w, b.h, 6);
        ctx.fill();
        ctx.stroke();

        if (b.data?.propuesta) {
            ctx.fillStyle = '#f39c12';
            ctx.beginPath();
            ctx.arc(b.visualX + b.w - 8, b.visualY + 8, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Texto con padding para no tocar el borde
        const fontSz = b.isTag ? 11 : 10;
        ctx.font = `${b.isTag ? 'bold ' : ''}${fontSz}px Inter`;
        ctx.fillStyle = b.isTag ? '#f39c12' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const PAD_X = 8;
        const maxW = b.w - PAD_X * 2;
        let label = b.text;
        while (label.length > 3 && ctx.measureText(label).width > maxW) {
            label = label.slice(0, -1);
        }
        if (label !== b.text && label.length > 1) label = label.slice(0, -1) + '\u2026';

        // Si el bloque es suficientemente alto, intentar dos líneas
        if (!b.isTag && b.h >= 36 && label === b.text) {
            const words = label.split(' ');
            if (words.length > 1) {
                const half = Math.ceil(words.length / 2);
                const l1 = words.slice(0, half).join(' ');
                const l2 = words.slice(half).join(' ');
                if (ctx.measureText(l1).width <= maxW && ctx.measureText(l2).width <= maxW) {
                    ctx.fillText(l1, b.visualX + b.w / 2, b.visualY + b.h / 2 - 7);
                    ctx.fillText(l2, b.visualX + b.w / 2, b.visualY + b.h / 2 + 7);
                    return;
                }
            }
        }
        ctx.fillText(label, b.visualX + b.w / 2, b.visualY + b.h / 2);
    });

    // --- TOOLTIP ---
    if (hoveredBlock) {
        const txt = hoveredBlock.text;
        ctx.font = '600 12px Inter';
        const txtW = ctx.measureText(txt).width;
        const padX = 10, padY = 6;
        const ttW = txtW + padX * 2;
        const ttH = 14 + padY * 2;
        let tx = mouseX + 15;
        let ty = mouseY + 15;
        if (tx + ttW > W) tx = mouseX - ttW - 10;
        if (ty + ttH > H) ty = mouseY - ttH - 10;
        ctx.fillStyle = 'rgba(13, 17, 23, 0.95)';
        ctx.strokeStyle = hoveredBlock.isTag ? '#f39c12' : hoveredBlock.clusterColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(tx, ty, ttW, ttH, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, tx + padX, ty + ttH / 2);
    }
}

export function clearBloques() {
    bloques = [];
    _currentRows = ROWS_BASE;
    // Reset canvas height
    if (canvas?.parentElement) {
        canvas.parentElement.style.height = '';
    }
}

function _resize() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const parent = canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
    }
}
