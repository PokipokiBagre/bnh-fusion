// medallas/bloques.js — Motor de bloques apilables estilo Tetris
const BLOCK_W = 200;
const BLOCK_H = 46;
const GAP     = 4;

let canvas, ctx;
let bloques = []; // { id, x, y, targetY, text, color, isTag, data }
let cols    = []; // Altura actual de cada columna
let _animId = null;

export function initBloques(canvasEl) {
    canvas = canvasEl;
    ctx    = canvas.getContext('2d');
    _resize();
    window.addEventListener('resize', _resize);

    // Interacción de click
    canvas.addEventListener('click', e => {
        const r = canvas.getBoundingClientRect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        
        // Buscar si hicimos click en algún bloque
        for (let i = bloques.length - 1; i >= 0; i--) {
            const b = bloques[i];
            if (mx >= b.x && mx <= b.x + BLOCK_W && my >= b.y && my <= b.y + BLOCK_H) {
                if (!b.isTag && window._medallasAbrirDetalle) {
                    window._medallasAbrirDetalle(b.data);
                }
                break;
            }
        }
    });

    loop();
}

export function buildBloques(tagsData) {
    // tagsData: [{ tag: '#Nombre', medallas: [{...}, {...}] }]
    bloques = [];
    if (!canvas) return;
    
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    
    // Calcular cuántas columnas caben
    const numCols = Math.max(1, Math.floor(W / (BLOCK_W + GAP)));
    const offsetX = (W - (numCols * (BLOCK_W + GAP))) / 2; // Centrar las columnas
    
    // Reiniciar las alturas de las columnas al fondo del canvas
    cols = Array(numCols).fill(H - GAP);

    const paletas = ['#00b4d8', '#2ecc71', '#9b59b6', '#e74c3c', '#1abc9c'];

    tagsData.forEach((grupo, tIdx) => {
        // Encontrar la columna más vacía (la de y mayor)
        let colIdx = 0;
        let maxY = 0;
        for (let i = 0; i < numCols; i++) {
            if (cols[i] > maxY) { maxY = cols[i]; colIdx = i; }
        }

        const xPos = offsetX + colIdx * (BLOCK_W + GAP);
        const colorMedalla = paletas[tIdx % paletas.length];

        // 1. Apilar el Tag (Naranja)
        cols[colIdx] -= BLOCK_H;
        bloques.push({
            id: 'tag_' + grupo.tag,
            x: xPos,
            y: -100 - (Math.random() * 200), // Nace arriba fuera de pantalla
            targetY: cols[colIdx],
            text: grupo.tag,
            color: '#f39c12',
            isTag: true,
            data: null
        });
        cols[colIdx] -= GAP;

        // 2. Apilar sus medallas encima
        grupo.medallas.forEach(m => {
            cols[colIdx] -= BLOCK_H;
            bloques.push({
                id: m.id,
                x: xPos,
                y: -100 - (Math.random() * 300), 
                targetY: cols[colIdx],
                text: m.nombre,
                color: colorMedalla,
                isTag: false,
                data: m
            });
            cols[colIdx] -= GAP;
        });
    });
}

function loop() {
    _animId = requestAnimationFrame(loop);
    if (!canvas || !ctx) return;
    
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    ctx.clearRect(0, 0, W, H);
    
    // Fondo oscuro
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    // Actualizar y dibujar bloques
    bloques.forEach(b => {
        // Gravedad suave (animación de caída)
        b.y += (b.targetY - b.y) * 0.1;
        if (Math.abs(b.targetY - b.y) < 0.5) b.y = b.targetY;

        // Dibujar caja
        ctx.fillStyle = b.isTag ? 'rgba(243,156,18,0.2)' : `${b.color}33`; // Fondo con opacidad
        ctx.strokeStyle = b.isTag ? b.color : b.color;
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, BLOCK_W, BLOCK_H, 6);
        ctx.fill();
        ctx.stroke();

        // Si es medalla, dibujar pequeño indicador de si es propuesta
        if (b.data?.propuesta) {
            ctx.fillStyle = '#f39c12';
            ctx.beginPath();
            ctx.arc(b.x + BLOCK_W - 12, b.y + 12, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // Texto
        ctx.fillStyle = b.isTag ? '#f39c12' : '#ffffff';
        ctx.font = b.isTag ? 'bold 14px Inter' : '13px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        let label = b.text;
        if (label.length > 22) label = label.substring(0, 20) + '…';
        ctx.fillText(label, b.x + BLOCK_W / 2, b.y + BLOCK_H / 2);
    });
}

export function clearBloques() {
    bloques = [];
}

function _resize() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement?.clientWidth || window.innerWidth;
    const h = Math.max(500, window.innerHeight - 260);
    canvas.width = w * dpr; 
    canvas.height = h * dpr;
    canvas.style.width = w + 'px'; 
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);
    // Forzar recalcular si se redimensiona
    bloques.forEach(b => b.y = -100); 
}
