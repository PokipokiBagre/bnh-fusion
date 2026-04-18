// medallas/medallas-logic.js
import { medallas, grupos, puntosAll } from './medallas-state.js';

// PT de un PJ por tag
export function getPuntosPJ(nombrePJ) {
    const m = {};
    puntosAll.filter(p => p.personaje_nombre === nombrePJ)
             .forEach(p => { m[p.tag] = p.cantidad; });
    return m;
}

// Normaliza un tag (asegura el #)
const norm = t => (t||'').trim().startsWith('#') ? t.trim() : '#' + t.trim();

// Estado de una medalla para un PJ dado
// returns: 'activable' | 'parcial' | 'bloqueada'
export function estadoMedallaPJ(medalla, nombrePJ) {
    const g = grupos.find(x => x.nombre_refinado === nombrePJ);
    if (!g) return 'bloqueada';

    const ptsMapa = getPuntosPJ(nombrePJ);
    const tagsGrupo = (g.tags||[]).map(t => norm(t).toLowerCase());

    // Verificar requisitos_base: el PJ debe tener el tag Y los pts mínimos
    const reqs = medalla.requisitos_base || [];
    for (const req of reqs) {
        const tagNorm = norm(req.tag).toLowerCase();
        if (!tagsGrupo.includes(tagNorm)) return 'bloqueada';
        const pts = ptsMapa[norm(req.tag)] || ptsMapa[norm(req.tag).slice(1)] || 0;
        if (pts < (req.pts_minimos || 0)) return 'parcial';
    }

    // Si no hay requisitos_base: verificar al menos el tag principal (tags[0])
    if (!reqs.length && medalla.tags?.length) {
        const tagPrincipal = norm(medalla.tags[0]).toLowerCase();
        if (!tagsGrupo.includes(tagPrincipal)) return 'bloqueada';
    }

    return 'activable';
}

// Efectos condicionales activos para un PJ
export function efectosActivosPJ(medalla, nombrePJ) {
    const g = grupos.find(x => x.nombre_refinado === nombrePJ);
    if (!g) return [];
    const ptsMapa  = getPuntosPJ(nombrePJ);
    const tagsGrupo = (g.tags||[]).map(t => norm(t).toLowerCase());

    return (medalla.efectos_condicionales || []).map(ec => {
        const tagNorm = norm(ec.tag).toLowerCase();
        const tieneTag = tagsGrupo.includes(tagNorm);
        const pts = ptsMapa[norm(ec.tag)] || ptsMapa[norm(ec.tag).slice(1)] || 0;
        const cumple = tieneTag && pts >= (ec.pts_minimos || 0);
        return { ...ec, activo: cumple, pts_actuales: pts };
    });
}

// Grupos únicos de tags entre todas las medallas (para el grafo)
export function getTagsClusters() {
    const map = {};
    medallas.forEach(m => {
        (m.tags||[]).forEach(t => {
            const k = norm(t);
            if (!map[k]) map[k] = { tag: k, medallas: [] };
            map[k].medallas.push(m);
        });
    });
    return Object.values(map);
}

// Medallas filtradas
export function filtrarMedallas({ busqueda = '', tag = '' } = {}) {
    return medallas.filter(m => {
        const q = busqueda.toLowerCase();
        const matchBusq = !q || m.nombre.toLowerCase().includes(q) ||
            (m.efecto_desc||'').toLowerCase().includes(q) ||
            (m.tags||[]).some(t => t.toLowerCase().includes(q));
        const matchTag  = !tag  || (m.tags||[]).some(t => norm(t).toLowerCase() === norm(tag).toLowerCase());
        return matchBusq && matchTag;
    });
}
