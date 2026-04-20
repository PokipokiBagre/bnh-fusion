import { supabase } from './bnh-auth.js';

/**
 * Verifica estrictamente si un personaje cumple con los requisitos de Tags y PT para una medalla.
 */
export function verificarRequisitosMedalla(medalla, pjData, ptsMapa) {
    if (!pjData) return false;
    
    // Normalizar tags del personaje para comparación segura
    const tagsPJ = (pjData.tags || []).map(t => t.startsWith('#') ? t.toLowerCase() : '#' + t.toLowerCase());
    
    const reqs = medalla.requisitos_base || [];
    for (const req of reqs) {
        const tagNorm = (req.tag.startsWith('#') ? req.tag : '#' + req.tag).toLowerCase();
        
        // 1. Verificar si el personaje tiene el TAG
        if (!tagsPJ.includes(tagNorm)) return false;
        
        // 2. Verificar si tiene los PT mínimos (soporta tag con o sin #)
        const pts = ptsMapa[req.tag] || ptsMapa[req.tag.startsWith('#') ? req.tag.slice(1) : req.tag] || 0;
        if (pts < (req.pts_minimos || 0)) return false;
    }
    
    return true;
}

/**
 * Escanea el inventario cargado y elimina de la base de datos cualquier medalla que ya no sea válida.
 */
export async function limpiarInventarioInvalido(pjNombre, inventarioActual, grupos, puntosAll) {
    const pjData = grupos.find(g => g.nombre_refinado === pjNombre);
    if (!pjData) return inventarioActual;

    const ptsMapa = {};
    puntosAll.filter(p => p.personaje_nombre === pjNombre).forEach(p => { 
        ptsMapa[p.tag] = p.cantidad; 
    });

    const idsInvalidos = [];
    const inventarioLimpio = inventarioActual.filter(m => {
        const esValida = verificarRequisitosMedalla(m, pjData, ptsMapa);
        if (!esValida) idsInvalidos.push(m.id);
        return esValida;
    });

    if (idsInvalidos.length > 0) {
        console.warn(`[Seguridad-Medallas] Retirando ${idsInvalidos.length} medallas inválidas de ${pjNombre}`);
        
        // Eliminación física en Supabase para sincronizar el error
        await supabase
            .from('medallas_inventario')
            .delete()
            .eq('personaje_nombre', pjNombre)
            .in('medalla_id', idsInvalidos);
            
        if (window.toast) {
            window.toast(`⚠️ Se retiraron ${idsInvalidos.length} medallas por falta de requisitos (Tags/PT).`, 'error');
        }
    }

    return inventarioLimpio;
}
