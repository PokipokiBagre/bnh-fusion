// ============================================================
// bnh-fusion.js — Estado global de Fusiones Activas
// Colocar en la RAÍZ del proyecto
// ============================================================
import { supabase } from './bnh-auth.js';

export const fusionState = new Map();

export async function cargarFusiones() {
    const { data } = await supabase
        .from('fusiones_activas')
        .select('*')
        .eq('activa', true);
    fusionState.clear();
    (data || []).forEach(f => fusionState.set(f.id, f));
}

// Recibe ahora el rendimiento y las stats finales
export async function activarFusion(pjA, pjB, rendimiento, statsFinales) {
    // Verificar que ninguno ya esté en fusión
    for (const [, f] of fusionState) {
        if (f.pj_a === pjA || f.pj_b === pjA || f.pj_a === pjB || f.pj_b === pjB) {
            return { ok: false, msg: `${f.pj_a === pjA || f.pj_b === pjA ? pjA : pjB} ya está en una fusión activa.` };
        }
    }

    const { data, error } = await supabase
        .from('fusiones_activas')
        .insert({
            pj_a:        pjA,
            pj_b:        pjB,
            rendimiento: rendimiento,
            stats_pot:   statsFinales?.pot || 0,
            stats_agi:   statsFinales?.agi || 0,
            stats_ctl:   statsFinales?.ctl || 0,
            activa:      true
        })
        .select('*')
        .single();

    if (error) return { ok: false, msg: error.message };
    fusionState.set(data.id, data);
    return { ok: true, fusion: data };
}

export async function terminarFusion(fusionId) {
    await supabase
        .from('fusiones_activas')
        .update({ activa: false, terminado_en: new Date().toISOString() })
        .eq('id', fusionId);
    fusionState.delete(fusionId);
}

// ── Helpers de consulta ───────────────────────────────────────
export function estaEnFusion(nombrePJ) {
    for (const [, f] of fusionState) {
        if (f.pj_a === nombrePJ || f.pj_b === nombrePJ) return true;
    }
    return false;
}

export function getFusionDe(nombrePJ) {
    for (const [, f] of fusionState) {
        if (f.pj_a === nombrePJ || f.pj_b === nombrePJ) return f;
    }
    return null;
}

// ── Render del doble icono de fusión (HTML string) ───────────
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
