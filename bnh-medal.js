// bnh-medal.js
import { supabase } from './bnh-auth.js';

export function verificarRequisitosMedalla(medalla, tagsPJ, ptsMapa) {
    if (!tagsPJ) return false;
    
    // Normalizar tags del personaje
    const tagsNorm = tagsPJ.map(t => t.startsWith('#') ? t.toLowerCase() : '#' + t.toLowerCase());
    
    // Normalizar mapa de PT
    const ptsSeguros = {};
    Object.keys(ptsMapa || {}).forEach(k => {
        const cleanKey = k.startsWith('#') ? k.toLowerCase() : '#' + k.toLowerCase();
        ptsSeguros[cleanKey] = ptsMapa[k];
    });

    const reqs = medalla.requisitos_base || [];
    for (const req of reqs) {
        const tagNorm = (req.tag.startsWith('#') ? req.tag : '#' + req.tag).toLowerCase();
        
        if (!tagsNorm.includes(tagNorm)) return false;
        
        const pts = ptsSeguros[tagNorm] || 0;
        if (pts < (req.pts_minimos || 0)) return false;
    }
    
    return true;
}

// NUEVO: Ahora recibe los datos proyectados y el límite de CTL.
export async function limpiarInventarioInvalido(pjNombre, inventarioActual, tagsPJ, ptsMapa, ctlMaximo) {
    if (!tagsPJ || !ptsMapa) return inventarioActual;

    const idsInvalidos = [];
    let inventarioValido = [];

    // 1. Validar requisitos individuales (Tags y PTs)
    for (const m of inventarioActual) {
        if (!verificarRequisitosMedalla(m, tagsPJ, ptsMapa)) {
            idsInvalidos.push(m.id);
        } else {
            inventarioValido.push(m);
        }
    }

    // 2. Validar límite de CTL (Si se pasa, quita desde la última hasta cumplir)
    let ctlUsado = inventarioValido.reduce((acc, m) => acc + (Number(m.costo_ctl) || 0), 0);
    
    while (ctlUsado > ctlMaximo && inventarioValido.length > 0) {
        const removida = inventarioValido.pop(); // Sacrificamos la última validada
        idsInvalidos.push(removida.id);
        ctlUsado -= (Number(removida.costo_ctl) || 0);
    }

    // 3. Ejecutar borrado en BD si se violó alguna regla
    if (idsInvalidos.length > 0) {
        console.warn(`[Seguridad-Medallas] Retirando ${idsInvalidos.length} medallas de ${pjNombre} por pérdida de requisitos o CTL.`);
        
        await supabase
            .from('medallas_inventario')
            .delete()
            .eq('personaje_nombre', pjNombre)
            .in('medalla_id', idsInvalidos);
            
        if (window.toast) {
            window.toast(`⚠️ Se desequiparon ${idsInvalidos.length} medallas (Requisitos insuficientes o CTL excedido al perder fusión).`, 'error');
        }
    }

    return inventarioValido;
}
