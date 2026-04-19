// medallas/bloques.js — Motor de piezas tipo Tetris
const NUM_COLS = 12; // 12 slots horizontales
const GAP = 4;

let canvas, ctx;
let bloques = []; // Todos los bloques individuales en pantalla
let cols    = []; // Altura disponible actual de cada columna
let _animId = null;

export function initBloques(canvasEl) {
    canvas = canvasEl;
    ctx    = canvas.getContext('2d');
    _resize();
    window.addEventListener('resize', _resize);

    // Interacción de click en los bloques
    canvas.addEventListener('click', e => {
        const r = canvas.getBoundingClientRect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        
        // Revisamos desde los últimos (los que están más arriba visualmente)
        for (let i = bloques.length - 1; i >= 0; i--) {
            const b = bloques[i];
            if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
                if (!b.isTag && window._medallasAbrirDetalle) {
                    window._medallasAbrirDetalle(b.data);
                }
                break;
            }
        }
    });

    if (!_animId) loop();
}

export function buildBloques(tagsData) {
    if (!canvas) return;
    _resize();
    
    bloques = [];
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    
    // Calcular ancho para 12 columnas y un alto más cuadrado
    const BLOCK_W = (W - (NUM_COLS + 1) * GAP) / NUM_COLS;
    const BLOCK_H = BLOCK_W * 0.65; 
    
    // Reiniciar las alturas de las columnas (H es el piso, crecen hacia 0)
    cols = Array(NUM_COLS).fill(H - GAP);

    const paletas = ['#00b4d8', '#2ecc71', '#9b59b6', '#e74c3c', '#1abc9c', '#f1c40f', '#e67e22'];

    tagsData.forEach((grupo, tIdx) => {
        const colorMedalla = paletas[tIdx % paletas.length];

        // 1. Crear el "Cluster" (El Tag en el centro, y medallas pegadas al azar a los lados)
        let localBlocks = [];
        localBlocks.push({ cx: 0, cy: 0, isTag: true, text: grupo.tag, color: '#f39c12', data: null });

        let filled = new Set(['0,0']); // Para no sobreponer bloques de la misma pieza
        
        grupo.medallas.forEach(m => {
            let validSpots = [];
            // Buscar todos los espacios adyacentes vacíos alrededor de los bloques ya colocados
            localBlocks.forEach(lb => {
                [[1,0], [-1,0], [0,1], [0,-1]].forEach(dir => {
                    let nx = lb.cx + dir[0];
                    let ny = lb.cy + dir[1];
                    if (!filled.has(`${nx},${ny}`)) validSpots.push({cx: nx, cy: ny});
                });
            });
            
            // Eliminar duplicados
            let uniqueSpots = [];
            let seen = new Set();
            validSpots.forEach(s => {
                let key = `${s.cx},${s.cy}`;
                if(!seen.has(key)) { seen.add(key); uniqueSpots.push(s); }
            });
            
            // Escoger uno al azar
            let spot = uniqueSpots[Math.floor(Math.random() * uniqueSpots.length)];
            filled.add(`${spot.cx},${spot.cy}`);
            localBlocks.push({ cx: spot.cx, cy: spot.cy, isTag: false, text: m.nombre, color: colorMedalla, data: m });
        });

        // 2. Normalizar el cluster para que las coordenadas cx y cy empiecen desde 0
        let min_cx = Math.min(...localBlocks.map(b => b.cx));
        let max_cx = Math.max(...localBlocks.map(b => b.cx));
        let min_cy = Math.min(...localBlocks.map(b => b.cy));
        let max_cy = Math.max(...localBlocks.map(b => b.cy));
        
        localBlocks.forEach(b => {
            b.cx -= min_cx;
            b.cy -= min_cy;
        });

        let cWidth = max_cx - min_cx + 1;
        let cHeight = max_cy - min_cy + 1;

        // 3. Escoger una columna aleatoria donde quepa toda la figura
        let max_C = NUM_COLS - cWidth;
        if (max_C < 0) max_C = 0; // Por seguridad si la pieza es anormalmente ancha
        let C = Math.floor(Math.random() * (max_C + 1));

        // 4. Calcular hasta qué altura cae la pieza sin chocar con las de abajo
        let Y_base = H;
        localBlocks.forEach(b => {
            let blockCol = C + b.cx;
            if (blockCol >= NUM_COLS) return;
            let obstacleY = cols[blockCol];
            let max_base_for_this = obstacleY - (b.cy + 1) * (BLOCK_H + GAP);
            if (max_base_for_this < Y_base) Y_base = max_base_for_this;
        });

        // 5. Instanciar los bloques desde el cielo cayendo a su posición final
        let spawn_Y_base = - (cHeight * (BLOCK_H + GAP)) - Math.random() * 300 - 100;

        localBlocks.forEach(b => {
            let blockCol = C + b.cx;
            if (blockCol >= NUM_COLS) return;
            
            let finalY = Y_base + b.cy * (BLOCK_H + GAP);
            let startY = spawn_Y_base + b.cy * (BLOCK_H + GAP);
            let finalX = GAP + blockCol * (BLOCK_W + GAP);
            
            bloques.push({
                id: Math.random().toString(),
                w: BLOCK_W,
                h: BLOCK_H,
                x: finalX,
                y: startY,
                targetY: finalY,
                text: b.text,
                color: b.color,
                isTag: b.isTag,
                data: b.data
            });
            
            // Actualizar la cima de esta columna para las siguientes piezas
            cols[blockCol] = Math.min(cols[blockCol], finalY);
        });
    });
}

function loop() {
    _animId = requestAnimationFrame(loop);
    if (!canvas || !ctx) return;
    
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    ctx.clearRect(0, 0, W, H);
    
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    bloques.forEach(b => {
        // Físicas de caída
        b.y += (b.targetY - b.y) * 0.12;
        if (Math.abs(b.targetY - b.y) < 0.5) b.y = b.targetY;

        // Dibujar el bloque
        ctx.fillStyle = b.isTag ? 'rgba(243,156,18,0.25)' : `${b.color}25`;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 1.5;
        
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.w, b.h, 6);
        ctx.fill();
        ctx.stroke();

        // Indicador de propuesta
        if (b.data?.propuesta) {
            ctx.fillStyle = '#f39c12';
            ctx.beginPath();
            ctx.arc(b.x + b.w - 10, b.y + 10, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // Texto
        ctx.fillStyle = b.isTag ? '#f39c12' : '#ffffff';
        ctx.font = b.isTag ? 'bold 12px Inter' : '11px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        let label = b.text;
        if (label.length > 20) label = label.substring(0, 18) + '…';
        
        // Dividir en 2 líneas si el texto no es el tag
        if (label.length > 12 && !b.isTag) {
            let words = label.split(' ');
            let l1 = words.slice(0, Math.ceil(words.length/2)).join(' ');
            let l2 = words.slice(Math.ceil(words.length/2)).join(' ');
            ctx.fillText(l1, b.x + b.w / 2, b.y + b.h / 2 - 6);
            if(l2) ctx.fillText(l2, b.x + b.w / 2, b.y + b.h / 2 + 8);
        } else {
            ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
        }
    });
}

export function clearBloques() {
    bloques = [];
}

function _resize() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const parent = canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    
    // Solo redimensionar si el contenedor cambió de tamaño (evita parpadeos)
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr; 
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
    }
}
