// ============================================================
// fichas-data.js — Todo opera sobre grupos, no sobre aliases
// ============================================================
import { supabase }  from '../bnh-auth.js';
import { db }        from '../bnh-db.js';
import { gruposGlobal, aliasesGlobal, ptGlobal, hilosGlobal } from './fichas-state.js';

export async function cargarTodo() {
    const [grupos, aliases, ptRows, hilos] = await Promise.all([
        // Grupos con todos sus campos (stats, tags, lore, quirk)
        supabase.from('personajes_refinados').select('*').order('nombre_refinado'),
        // Aliases: solo nombre e id de grupo
        supabase.from('personajes').select('id, nombre, refinado_id').order('nombre'),
        // PT por grupo (personaje_nombre = nombre_refinado del grupo)
        db.progresion.getPuntosAll(),
        supabase.from('historial_hilos').select('thread_id, titulo').order('creado_en', { ascending: false })
    ]);

    gruposGlobal.length  = 0;
    gruposGlobal.push(...(grupos.data  || []));

    aliasesGlobal.length = 0;
    aliasesGlobal.push(...(aliases.data || []));

    hilosGlobal.length   = 0;
    hilosGlobal.push(...(hilos.data    || []));

    Object.keys(ptGlobal).forEach(k => delete ptGlobal[k]);
    (ptRows || []).forEach(row => {
        if (!ptGlobal[row.personaje_nombre]) ptGlobal[row.personaje_nombre] = {};
        ptGlobal[row.personaje_nombre][row.tag] = row.cantidad;
    });
}

// Devuelve Set de poster_names del hilo dado
export async function getPosterNamesDelHilo(threadId) {
    if (!threadId || threadId === 'todos') return null;
    const { data } = await supabase
        .from('historial_posts')
        .select('poster_name')
        .eq('thread_id', Number(threadId));
    return new Set((data || []).map(p => p.poster_name));
}

// ── CRUD Grupos ───────────────────────────────────────────────

export async function crearGrupo({ nombre, pot, agi, ctl, tags, lore, quirk }) {
    if (!nombre?.trim()) return { ok: false, msg: 'El nombre es obligatorio.' };
    const existe = gruposGlobal.find(g => g.nombre_refinado.toLowerCase() === nombre.trim().toLowerCase());
    if (existe) return { ok: false, msg: 'Ya existe un grupo con ese nombre.' };

    const pv = calcPVSimple(pot, agi, ctl);
    const { data, error } = await supabase.from('personajes_refinados').insert({
        nombre_refinado: nombre.trim(),
        pot: pot||0, agi: agi||0, ctl: ctl||0,
        pv_actual: pv,
        tags: tags||[], lore: lore||'', quirk: quirk||''
    }).select('*').single();

    if (error) return { ok: false, msg: error.message };
    gruposGlobal.push(data);

    // Auto-crear alias con el mismo nombre del grupo
    const { data: aliasData } = await supabase.from('personajes')
        .insert({ nombre: nombre.trim(), refinado_id: data.id })
        .select('*').single();
    if (aliasData) aliasesGlobal.push(aliasData);

    return { ok: true, grupo: data };
}

export async function guardarStatsGrupo(grupoId, { pot, agi, ctl, pot_actual, agi_actual, ctl_actual, pv_actual, pv_max_delta }) {
    const pvBase = calcPVSimple(pot, agi, ctl);
    const delta  = pv_max_delta ?? 0;
    const pvMax  = pvBase + delta;
    const payload = {
        pot, agi, ctl,
        pot_actual:   pot_actual ?? null,
        agi_actual:   agi_actual ?? null,
        ctl_actual:   ctl_actual ?? null,
        pv_actual:    Math.min(pv_actual ?? pvMax, pvMax),
        pv_max_delta: delta,
    };
    const { error } = await supabase.from('personajes_refinados').update(payload).eq('id', grupoId);
    if (error) return { ok: false, msg: error.message };
    const g = gruposGlobal.find(x => x.id === grupoId);
    if (g) Object.assign(g, payload);
    return { ok: true };
}

export async function guardarLoreGrupo(grupoId, { descripcion, lore, personalidad, quirk, info_extra }) {
    const payload = { descripcion: descripcion||'', lore: lore||'', personalidad: personalidad||'', quirk: quirk||'' };
    if (info_extra !== undefined) payload.info_extra = info_extra;
    const { error } = await supabase.from('personajes_refinados').update(payload).eq('id', grupoId);
    if (error) return { ok: false, msg: error.message };
    const g = gruposGlobal.find(x => x.id === grupoId);
    if (g) Object.assign(g, payload);
    return { ok: true };
}

// Pares mutuamente excluyentes de tags
const TAG_EXCLUSIVOS = [
    ['#Activo', '#Inactivo'],
    ['#Jugador', '#NPC'],
];

export async function guardarTagsGrupo(grupoId, tags) {
    // Aplicar exclusividad: si se añade uno del par, quitar el otro
    let tagsFinal = [...tags];
    TAG_EXCLUSIVOS.forEach(([a, b]) => {
        const tieneA = tagsFinal.some(t => (t.startsWith('#')?t:'#'+t).toLowerCase() === a.toLowerCase());
        const tieneB = tagsFinal.some(t => (t.startsWith('#')?t:'#'+t).toLowerCase() === b.toLowerCase());
        if (tieneA && tieneB) {
            // Quedarse con el último añadido (el que está más al final del array)
            const idxA = tagsFinal.map(t=>(t.startsWith('#')?t:'#'+t).toLowerCase()).lastIndexOf(a.toLowerCase());
            const idxB = tagsFinal.map(t=>(t.startsWith('#')?t:'#'+t).toLowerCase()).lastIndexOf(b.toLowerCase());
            const quitar = idxA > idxB ? b : a;
            tagsFinal = tagsFinal.filter(t => (t.startsWith('#')?t:'#'+t).toLowerCase() !== quitar.toLowerCase());
        }
    });

    const { error } = await supabase.from('personajes_refinados')
        .update({ tags: tagsFinal }).eq('id', grupoId);
    if (error) return { ok: false, msg: error.message };
    const g = gruposGlobal.find(x => x.id === grupoId);
    if (g) g.tags = tagsFinal;
    return { ok: true };
}

export async function renombrarGrupo(grupoId, nuevoNombre) {
    if (!nuevoNombre?.trim()) return { ok: false, msg: 'Nombre vacío.' };
    const { error } = await supabase.from('personajes_refinados')
        .update({ nombre_refinado: nuevoNombre.trim() }).eq('id', grupoId);
    if (error) return { ok: false, msg: error.message };
    const g = gruposGlobal.find(x => x.id === grupoId);
    if (g) g.nombre_refinado = nuevoNombre.trim();
    return { ok: true };
}

export async function eliminarGrupo(grupoId, borrarPT = false) {
    const g = gruposGlobal.find(x => x.id === grupoId);
    const nombreGrupo = g?.nombre_refinado;

    // Desasignar aliases primero
    await supabase.from('personajes').update({ refinado_id: null }).eq('refinado_id', grupoId);
    await supabase.from('personajes_refinados').delete().eq('id', grupoId);

    // Opcionalmente borrar PT del historial
    if (borrarPT && nombreGrupo) {
        await supabase.from('puntos_tag').delete().eq('personaje_nombre', nombreGrupo);
        await supabase.from('log_puntos_tag').delete().eq('personaje_nombre', nombreGrupo);
    }

    const idx = gruposGlobal.findIndex(g => g.id === grupoId);
    if (idx !== -1) gruposGlobal.splice(idx, 1);
}

// ── CRUD Aliases ──────────────────────────────────────────────

export async function crearAlias(nombre) {
    if (!nombre?.trim()) return { ok: false, msg: 'Nombre vacío.' };
    const { data, error } = await supabase.from('personajes')
        .insert({ nombre: nombre.trim(), refinado_id: null })
        .select('*').single();
    if (error) return { ok: false, msg: error.message };
    aliasesGlobal.push(data);
    return { ok: true, alias: data };
}

export async function asignarAlias(aliasId, grupoId) {
    const { error } = await supabase.from('personajes')
        .update({ refinado_id: grupoId || null }).eq('id', aliasId);
    if (error) return { ok: false, msg: error.message };
    const a = aliasesGlobal.find(x => x.id === aliasId);
    if (a) a.refinado_id = grupoId || null;
    return { ok: true };
}

export async function eliminarAlias(aliasId) {
    await supabase.from('personajes').delete().eq('id', aliasId);
    const idx = aliasesGlobal.findIndex(a => a.id === aliasId);
    if (idx !== -1) aliasesGlobal.splice(idx, 1);
}

// ── PT (opera sobre nombre_refinado del grupo) ────────────────

export async function aplicarDeltaPT(nombreGrupo, tag, delta, motivo) {
    const res = await db.progresion.aplicarTransacciones([{
        personaje_nombre: nombreGrupo, tag, delta, motivo
    }]);
    if (!res.ok) return res;
    if (!ptGlobal[nombreGrupo]) ptGlobal[nombreGrupo] = {};
    ptGlobal[nombreGrupo][tag] = (ptGlobal[nombreGrupo][tag] || 0) + delta;
    return { ok: true };
}

function calcPVSimple(pot, agi, ctl) {
    const pac = (pot||0)+(agi||0)+(ctl||0);
    const b = pac>=100?20:pac>=80?15:pac>=60?10:5;
    return Math.floor((pot||0)/4)+Math.floor((agi||0)/4)+Math.floor((ctl||0)/4)+b;
}

// Borra PT de un tag específico de un grupo (al desasignar el tag)
export async function borrarPTDeTag(nombreGrupo, tag) {
    // Borrar de puntos_tag
    await supabase.from('puntos_tag')
        .delete()
        .eq('personaje_nombre', nombreGrupo)
        .eq('tag', tag);
    // Borrar del log también para que no se reconstruyan
    await supabase.from('log_puntos_tag')
        .delete()
        .eq('personaje_nombre', nombreGrupo)
        .eq('tag', tag);
    // Actualizar estado en memoria
    if (ptGlobal[nombreGrupo]) delete ptGlobal[nombreGrupo][tag];
}

// Asigna alias de grupo nombre: crea o reasigna el alias con el nombre del grupo
// para todos los grupos que no lo tengan, o lo tengan en otro grupo
export async function asignarAliasesDeGrupoNombre() {
    let creados = 0, reasignados = 0;
    for (const g of gruposGlobal) {
        const nombre = g.nombre_refinado;
        // Buscar alias con ese nombre exacto
        const existente = aliasesGlobal.find(a => a.nombre === nombre);
        if (!existente) {
            // No existe: crear y asignar
            const { data } = await supabase.from('personajes')
                .insert({ nombre, refinado_id: g.id })
                .select('*').single();
            if (data) { aliasesGlobal.push(data); creados++; }
        } else if (existente.refinado_id !== g.id) {
            // Existe pero en otro grupo (o suelto): reasignar
            await supabase.from('personajes')
                .update({ refinado_id: g.id })
                .eq('id', existente.id);
            existente.refinado_id = g.id;
            reasignados++;
        }
        // Si ya está bien asignado, no hacer nada
    }
    return { creados, reasignados };
}
