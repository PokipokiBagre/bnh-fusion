// ============================================================
// fichas-upload.js — Subida de imágenes de personaje al Storage
// Bucket: imagenes-bnh / carpeta: imgpersonajes
// icon:    norm(nombre_refinado)icon.png/.jpg   → thumbnail cuadrado
// profile: norm(nombre_refinado)profile.png/.jpg → imagen detalle
// ============================================================

import { supabase } from '../bnh-auth.js';
import { STORAGE_URL, norm } from './fichas-state.js';

const BUCKET  = 'imagenes-bnh';
const CARPETA = 'imgpersonajes';

function uploadSeguro(ruta, file, tipo) {
    const solicitud = supabase.storage.from(BUCKET)
        .upload(ruta, file, { upsert: true, contentType: tipo, cacheControl: '3600' });
    let t;
    const limite = new Promise((_, rej) => {
        t = setTimeout(() => rej(new Error('Timeout 25s — intenta de nuevo')), 25000);
    });
    return Promise.race([solicitud, limite]).finally(() => clearTimeout(t));
}

// icon: cuadrado 512px | profile: 800px ancho máximo, sin recorte
function convertirAFormatos(file, tipoUpload) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            try {
                const MAX = tipoUpload === 'profile' ? 800 : 512;
                let w = img.naturalWidth, h = img.naturalHeight;
                if (w > MAX || h > MAX) {
                    const r = Math.min(MAX / w, MAX / h);
                    w = Math.round(w * r); h = Math.round(h * r);
                }

                // PNG
                const c1 = document.createElement('canvas');
                c1.width = w; c1.height = h;
                c1.getContext('2d').drawImage(img, 0, 0, w, h);

                c1.toBlob(blobPNG => {
                    // JPG con fondo blanco
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
            } catch(e) { reject(new Error('Error procesando imagen.')); }
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Formato inválido.')); };
        img.src = url;
    });
}

// tipoUpload: 'icon' | 'profile'
export async function subirImagenGrupo(file, nombreRefinado, tipoUpload = 'icon', onProgreso) {
    if (!file || !nombreRefinado) throw new Error('Faltan parámetros.');

    const sufijo = tipoUpload === 'profile' ? 'profile' : 'icon';
    const key = norm(nombreRefinado) + sufijo;

    if (onProgreso) onProgreso(20, 'Procesando imagen…');
    const { blobPNG, blobJPG } = await convertirAFormatos(file, tipoUpload);

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

// URLs públicas de cada tipo
export function urlIcono(nombreRefinado) {
    return `${STORAGE_URL}/${CARPETA}/${norm(nombreRefinado)}icon.png`;
}
export function urlProfile(nombreRefinado) {
    return `${STORAGE_URL}/${CARPETA}/${norm(nombreRefinado)}profile.png`;
}
