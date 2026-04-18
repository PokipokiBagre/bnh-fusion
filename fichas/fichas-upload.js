// ============================================================
// fichas-upload.js — Subida de imágenes de personaje al Storage
// Bucket: imagenes-bnh / carpeta: imgpersonajes
// Nombre de archivo: norm(nombre_refinado)icon.png/.jpg
// ============================================================

import { supabase } from '../bnh-auth.js';
import { STORAGE_URL, norm } from './fichas-state.js';

const BUCKET  = 'imagenes-bnh';
const CARPETA = 'imgpersonajes';

// Timeout de subida: 25s (protege contra suspensión de pestaña)
function uploadSeguro(ruta, file, tipo) {
    const solicitud = supabase.storage.from(BUCKET)
        .upload(ruta, file, { upsert: true, contentType: tipo, cacheControl: '3600' });
    let t;
    const limite = new Promise((_, rej) => {
        t = setTimeout(() => rej(new Error('Conexión interrumpida (timeout 25s)')), 25000);
    });
    return Promise.race([solicitud, limite]).finally(() => clearTimeout(t));
}

// Redimensiona y convierte a PNG + JPG (max 512px)
function convertirAFormatos(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            try {
                const MAX = 512;
                let w = img.naturalWidth, h = img.naturalHeight;
                if (w > MAX || h > MAX) {
                    const r = Math.min(MAX / w, MAX / h);
                    w = Math.round(w * r); h = Math.round(h * r);
                }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);

                canvas.toBlob(blobPNG => {
                    const c2 = document.createElement('canvas');
                    c2.width = w; c2.height = h;
                    const ctx2 = c2.getContext('2d');
                    ctx2.fillStyle = '#ffffff';
                    ctx2.fillRect(0, 0, w, h);
                    ctx2.drawImage(img, 0, 0, w, h);
                    c2.toBlob(blobJPG => {
                        URL.revokeObjectURL(url);
                        resolve({ blobPNG, blobJPG });
                    }, 'image/jpeg', 0.92);
                }, 'image/png');
            } catch (e) { reject(new Error('Error procesando imagen localmente.')); }
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Formato inválido.')); };
        img.src = url;
    });
}

// ── API pública ───────────────────────────────────────────────
// Sube la imagen para un grupo (nombre_refinado).
// onProgreso(pct, msg) se llama durante el proceso.
// Devuelve la URL pública del PNG subido.
export async function subirImagenGrupo(file, nombreRefinado, onProgreso) {
    if (!file || !nombreRefinado) throw new Error('Faltan parámetros.');

    const key = norm(nombreRefinado) + 'icon';

    if (onProgreso) onProgreso(20, 'Procesando imagen…');
    const { blobPNG, blobJPG } = await convertirAFormatos(file);

    const rutaPNG = `${CARPETA}/${key}.png`;
    const rutaJPG = `${CARPETA}/${key}.jpg`;

    if (onProgreso) onProgreso(50, 'Subiendo PNG…');
    const { error: errPNG } = await uploadSeguro(
        rutaPNG, new File([blobPNG], `${key}.png`, { type: 'image/png' }), 'image/png'
    );
    if (errPNG) throw new Error(errPNG.message || 'Error subiendo PNG');

    if (onProgreso) onProgreso(80, 'Subiendo JPG…');
    const { error: errJPG } = await uploadSeguro(
        rutaJPG, new File([blobJPG], `${key}.jpg`, { type: 'image/jpeg' }), 'image/jpeg'
    );
    if (errJPG) throw new Error(errJPG.message || 'Error subiendo JPG');

    if (onProgreso) onProgreso(100, '¡Imagen subida!');
    return `${STORAGE_URL}/${rutaPNG}?v=${Date.now()}`;
}
