// bnh-fusion.js — Core actualizado
import { supabase } from './bnh-auth.js';

export const fusionState = new Map();

export async function cargarFusiones() {
    const { data } = await supabase.from('fusiones_activas').select('*').eq('activa', true);
    fusionState.clear();
    (data || []).forEach(f => fusionState.set(f.id, f));
}

// Ahora recibe el rendimiento (1-100)
export async function activarFusion(pjA, pjB, rendimiento) {
    for (const [, f] of fusionState) {
        if (f.pj_a === pjA || f.pj_b === pjA || f.pj_a === pjB || f.pj_b === pjB) {
            return { ok: false, msg: 'Uno de los personajes ya está fusionado.' };
        }
    }

    const { data, error } = await supabase
        .from('fusiones_activas')
        .insert({ pj_a: pjA, pj_b: pjB, rendimiento, activa: true })
        .select('*').single();

    if (error) return { ok: false, msg: error.message };
    fusionState.set(data.id, data);
    return { ok: true, fusion: data };
}

export async function terminarFusion(fusionId) {
    await supabase.from('fusiones_activas').update({ activa: false }).eq('id', fusionId);
    fusionState.delete(fusionId);
}

export function getFusionDe(nombrePJ) {
    for (const [, f] of fusionState) {
        if (f.pj_a === nombrePJ || f.pj_b === nombrePJ) return f;
    }
    return null;
}

// LA MAGIA: Calcula los PT proyectados en base al rendimiento
export function calcularPTsFusionados(ptsA, ptsB, rendimiento) {
    const fusionados = {};
    const todosLosTags = [...new Set([...Object.keys(ptsA), ...Object.keys(ptsB)])];

    todosLosTags.forEach(tag => {
        const valA = ptsA[tag] || 0;
        const valB = ptsB[tag] || 0;

        if (rendimiento <= 33) {
            // Tier 1: Stats se fusionan (manejado en UI), pero PTs no hacen sinergia. 
            // Cada uno aporta lo suyo, pero no se cruzan. Usamos el mayor para simplificar la vista, 
            // pero podrías restringirlo a 0 si quieres ser estricto.
            fusionados[tag] = Math.max(valA, valB); 
        } else if (rendimiento <= 66) {
            // Tier 2: Escoge el mayor
            fusionados[tag] = Math.max(valA, valB);
        } else {
            // Tier 3: Suma los PT
            fusionados[tag] = valA + valB;
        }
    });

    return fusionados;
}
// ── Render del doble icono de fusión (HTML string) ───────────
// Úsalo en cualquier página donde quieras mostrar el badge de fusión
// storageUrl = currentConfig.storageUrl
// norm = función normalizadora de nombres
export function renderFusionBadge(nombrePJ, storageUrl, norm) {
    const fusion = getFusionDe(nombrePJ);
    if (!fusion) return '';

    const compañero = fusion.pj_a === nombrePJ ? fusion.pj_b : fusion.pj_a;
    const imgA = `${storageUrl}/imgpersonajes/${norm(nombrePJ)}icon.png`;
    const imgB = `${storageUrl}/imgpersonajes/${norm(compañero)}icon.png`;
    const fallback = `${storageUrl}/imginterfaz/no_encontrado.png`;

    return `
        <div class="fusion-badge" title="En fusión con ${compañero}" style="
            display: inline-flex; align-items: center;
            background: linear-gradient(135deg, #1a0040, #000d1a);
            border: 1.5px solid #a855f7; border-radius: 20px;
            padding: 2px 8px 2px 2px; gap: 4px;">
            <div style="position:relative; display:inline-block; width:28px; height:28px;">
                <img src="${imgA}" onerror="this.src='${fallback}'"
                    style="width:24px; height:24px; border-radius:50%; border:1px solid #a855f7;
                           position:absolute; left:0; top:0; object-fit:cover; z-index:2;">
                <img src="${imgB}" onerror="this.src='${fallback}'"
                    style="width:24px; height:24px; border-radius:50%; border:1px solid #7c3aed;
                           position:absolute; left:10px; top:0; object-fit:cover; z-index:1; opacity:0.85;">
            </div>
            <span style="color:#c084fc; font-size:0.7em; font-weight:700; white-space:nowrap;">⚡ FUSIÓN</span>
        </div>`;
}
