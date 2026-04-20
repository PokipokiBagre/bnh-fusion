import { supabase } from './bnh-auth.js';

export function verificarRequisitosMedalla(medalla, pjData, ptsMapa) {
    if (!pjData) return false;
    
    // Normalizar tags del personaje para comparación segura
    const tagsPJ = (pjData.tags || []).map(t => t.startsWith('#') ? t.toLowerCase() : '#' + t.toLowerCase());
    
    const reqs = medalla.requisitos_base || [];
    for (const req of reqs) {
        const tagNorm = (req.tag.startsWith('#') ? req.tag : '#' + req.tag).toLowerCase();
        
        // 1. Verificar si el personaje tiene el TAG
        if (!tagsPJ.includes(tagNorm)) return false;
        
        // 2. Verificar si tiene los PT mínimos (usando la llave normalizada)
        const pts = ptsMapa[tagNorm] || 0;
        if (pts < (req.pts_minimos || 0)) return false;
    }
    
    return true;
}

export async function limpiarInventarioInvalido(pjNombre, inventarioActual, grupos, puntosAll) {
    const pjData = grupos.find(g => g.nombre_refinado === pjNombre);
    if (!pjData) return inventarioActual;

    // Normalizamos las llaves del mapa a minúsculas y con '#' asegurado
    const ptsMapa = {};
    puntosAll.filter(p => p.personaje_nombre === pjNombre).forEach(p => { 
        const k = p.tag.startsWith('#') ? p.tag.toLowerCase() : '#' + p.tag.toLowerCase();
        ptsMapa[k] = p.cantidad; 
    });

    const idsInvalidos = [];
    const inventarioLimpio = inventarioActual.filter(m => {
        const esValida = verificarRequisitosMedalla(m, pjData, ptsMapa);
        if (!esValida) idsInvalidos.push(m.id);
        return esValida;
    });

    if (idsInvalidos.length > 0) {
        console.warn(`[Seguridad-Medallas] Retirando ${idsInvalidos.length} medallas inválidas de ${pjNombre}`);
        
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
