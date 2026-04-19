// medallas/bloques.js — Motor Tetris 2.0 (Persistencia, Empaquetado y Regiones)
const NUM_COLS = 12; // 12 slots horizontales
const GAP = 4;

let canvas, ctx;
let bloques = []; // { id, clusterId, clusterColor, isTag, text, data, col, visualY, targetY, w, h }
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
        
        for (let i = bloques.length - 1; i >= 0; i--) {
            const b = bloques[i];
            if (mx >= b.visualX && mx <= b.visualX + b.w && my >= b.visualY && my <= b.visualY + b.h) {
                if (!b.isTag && window._medallasAbrirDetalle) {
                    window._medallasAbrirDetalle(b.data);
                }
                break;
            }
        }
    });

    if (!_animId) loop();
}

// Función hash para asignar siempre el mismo color a un mismo Tag
function getColorForTag(tagStr) {
    let hash = 0;
    for (let i = 0; i < tagStr.length; i++) hash = tagStr.charCodeAt(i) + ((hash << 5) - hash);
    const paletas = ['#00b4d8', '#2ecc71', '#9b59b6', '#e74c3c', '#1abc9c', '#f1c40f', '#e67e22', '#3498db', '#e84393'];
    return paletas[Math.abs(hash) % paletas.length];
}

export function updateBloques(tagsData) {
    if (!canvas) return;
    _resize();
    
    // 1. Encontrar qué tags están seleccionados ahora
    const currentClusterIds = tagsData.map(g => g.tag);
    
    // 2. Eliminar los bloques de los tags que fueron deseleccionados
    bloques = bloques.filter(b => currentClusterIds.includes(b.clusterId));
    
    // 3. Identificar qué tags son NUEVOS (aún no están en la pantalla)
    const existingIds = new Set(bloques.map(b => b.clusterId));
    const newClusters = tagsData.filter(g => !existingIds.has(g.tag));

    // 4. Instanciar los nuevos bloques (nacen arriba y caerán)
    newClusters.forEach((grupo) => {
        const cColor = getColorForTag(grupo.tag);
        
        // Elegir una columna aleatoria central para el bloque Tag
        const C = Math.floor(Math.random() * (NUM_COLS - 2)) + 1; 
        
        let spawnY = -60; // Empieza a nacer justo arriba de la pantalla
        
        // Instanciar el Tag
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
        
        // Instanciar sus medallas de forma aleatoria alrededor
        grupo.medallas.forEach((m, idx) => {
            spawnY -= (60 + Math.random() * 80); // Distanciados verticalmente para que caigan en secuencia
            
            // Elegir columna al azar: misma, izquierda o derecha
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
    
    // Dimensiones dinámicas
    const BLOCK_W = (W - (NUM_COLS + 1) * GAP) / NUM_COLS;
    const BLOCK_H = Math.max(30, BLOCK_W * 0.55); // Más cuadrados, menos anchos

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    // --- FÍSICA Y GRAVEDAD INDEPENDIENTE ---
    // Agrupamos los bloques por columna para calcular su caída
    let blocksByCol = Array.from({length: NUM_COLS}, () => []);
    bloques.forEach(b => blocksByCol[b.col].push(b));
    
    blocksByCol.forEach(colBlocks => {
        // Ordenamos de abajo hacia arriba visualmente (mayor Y a menor Y)
        colBlocks.sort((a, b) => b.visualY - a.visualY);
        
        let currentFloor = H - GAP; // El piso inicial
        
        colBlocks.forEach(b => {
            b.targetY = currentFloor - BLOCK_H;
            currentFloor = b.targetY - GAP; // El nuevo piso para el bloque de más arriba
            
            b.w = BLOCK_W;
            b.h = BLOCK_H;
            b.visualX = GAP + b.col * (BLOCK_W + GAP);
            
            // Animación suave de caída
            b.visualY += (b.targetY - b.visualY) * 0.2;
            if (Math.abs(b.targetY - b.visualY) < 0.5) b.visualY = b.targetY;
        });
    });

    // --- DIBUJAR MARCOS DE REGIÓN (Bounding Boxes) ---
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
        
        // Dibujar el marco relacionador
        const P = 8; // Padding del marco
        ctx.fillStyle = `${color}1A`;   // 10% opacidad de fondo
        ctx.strokeStyle = `${color}80`; // 50% opacidad de borde
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(minX - P, minY - P, (maxX - minX) + P*2, (maxY - minY) + P*2, 10);
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

        // Indicador de propuesta
        if (b.data?.propuesta) {
            ctx.fillStyle = '#f39c12';
            ctx.beginPath();
            ctx.arc(b.visualX + b.w - 10, b.visualY + 10, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // Texto
        ctx.fillStyle = b.isTag ? '#f39c12' : '#ffffff';
        ctx.font = b.isTag ? 'bold 12px Inter' : '11px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        let label = b.text;
        if (label.length > 20) label = label.substring(0, 18) + '…';
        
        if (label.length > 12 && !b.isTag) {
            let words = label.split(' ');
            let l1 = words.slice(0, Math.ceil(words.length/2)).join(' ');
            let l2 = words.slice(Math.ceil(words.length/2)).join(' ');
            ctx.fillText(l1, b.visualX + b.w / 2, b.visualY + b.h / 2 - 6);
            if(l2) ctx.fillText(l2, b.visualX + b.w / 2, b.visualY + b.h / 2 + 8);
        } else {
            ctx.fillText(label, b.visualX + b.w / 2, b.visualY + b.h / 2);
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
    
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr; 
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
    }
}
