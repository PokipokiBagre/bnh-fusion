// ============================================================
// combate/combate-main.js  v2
// ============================================================
import { bnhAuth, supabase } from '../bnh-auth.js';
import {
    combateState, STORAGE_URL, crearSlot, norm,
    setTodosLosPJs, setTodosLosPTs, setTodasLasMedallas,
    setInventarios, setCatalogoTagsArr,
    todosLosPJs, todasLasMedallas, inventarios, catalogoTagsArr
} from './combate-state.js';
import {
    renderCombate, renderSlotDetalle, recalcSlot,
    refrescarPool, refrescarEquipo, refrescarRegistro, refrescarCuadro, refrescarTodo,
    renderCuadroResumen, generarImagenCuadro, toast, renderMedInfoPanel
} from './combate-ui.js';
import { calcCambios, calcPTTotal } from './combate-logic.js';
import { guardarStatsGrupo } from '../fichas/fichas-data.js';
import { proyectarFicha }    from '../fichas/fichas-logic.js';
import { cargarFusiones }    from '../bnh-fusion.js';
import { aplicarDeltas }     from '../bnh-pac.js';

// ── Init ──────────────────────────────────────────────────────
window.onload = async () => {
    const fav = document.getElementById('dynamic-favicon');
    if (fav) fav.href = `${STORAGE_URL}/imginterfaz/icon.png?v=${Date.now()}`;

    await bnhAuth.init();
    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();
    combateState.esAdmin = bnhAuth.esAdmin();

    try {
        await cargarFusiones();

        const [
            { data: pjData,  error: e1 },
            { data: ptData,  error: e2 },
            { data: medData, error: e3 },
            { data: invData, error: e4 },
            { data: catData              },
            { data: optsData             },
            { data: banData              },
        ] = await Promise.all([
            supabase.from('personajes_refinados').select('*').order('nombre_refinado'),
            supabase.from('puntos_tag').select('personaje_nombre, tag, cantidad'),
            supabase.from('medallas_catalogo').select('*').eq('propuesta', false).order('nombre'),
            supabase.from('medallas_inventario').select('personaje_nombre, medalla_id').eq('equipada', true),
            supabase.from('tags_catalogo').select('nombre').order('nombre'),
            supabase.from('opciones_fusion').select('*').eq('id', 1).maybeSingle(),
            supabase.from('tags_catalogo').select('nombre').eq('baneado', true),
        ]);

        if (e1) throw new Error(e1.message);
        if (e2) throw new Error(e2.message);
        if (e3) throw new Error(e3.message);

        setTodasLasMedallas(medData || []);
        setCatalogoTagsArr((catData || [])
            .map(t => t.nombre.startsWith('#') ? t.nombre : '#' + t.nombre)
            .sort());

        const ptMap = {};
        (ptData || []).forEach(row => {
            const nombre = row.personaje_nombre;
            if (!ptMap[nombre]) ptMap[nombre] = {};
            const tag = row.tag.startsWith('#') ? row.tag : '#' + row.tag;
            ptMap[nombre][tag] = row.cantidad;
        });
        setTodosLosPTs(ptMap);

        const medById = {};
        (medData || []).forEach(m => { medById[m.id] = m; });
        const invMap = {};
        (invData || []).forEach(row => {
            const med = medById[row.medalla_id];
            if (!med) return;
            if (!invMap[row.personaje_nombre]) invMap[row.personaje_nombre] = [];
            invMap[row.personaje_nombre].push(med);
        });
        setInventarios(invMap);

        const opcionesFusion = optsData || {};
        const bannedTags = (banData || []).map(t =>
            (t.nombre.startsWith('#') ? t.nombre : '#' + t.nombre).toLowerCase());

        const pjsProyectados = (pjData || []).map(pj => {
            try {
                return proyectarFicha(pj, pjData || [], ptMap, opcionesFusion, bannedTags) || pj;
            } catch { return pj; }
        });
        setTodosLosPJs(pjsProyectados);

    } catch (err) {
        console.error('[combate]', err);
        toast('Error al cargar: ' + err.message, 'error');
    }

    document.getElementById('pantalla-carga')?.style?.setProperty('display','none');
    document.getElementById('interfaz-combate')?.classList?.remove('oculto');
    renderCombate();
};

// ── Pool: seleccionar destino (A o B) ─────────────────────────
window._combateSetDestino = (eq) => {
    combateState._poolDestino = eq;
    refrescarPool();
};

// ── Pool: filtrar ─────────────────────────────────────────────
window._combatePoolFiltro = (grupo, val) => {
    combateState.poolFiltros[grupo] = val;
    refrescarPool();
};

// ── Pool: añadir PJ al equipo destino ────────────────────────
window._combatePoolAddPJ = (el) => {
    const nombre = el.dataset.nombre;
    if (!nombre) return;
    const pj = todosLosPJs.find(p => (p.nombre_refinado || p.nombre) === nombre);
    if (!pj) return;

    const dest = combateState._poolDestino || 'A';
    const slots = combateState[`equipo${dest}`];
    const idx   = slots.findIndex(s => !s);
    if (idx !== -1) {
        _asignarSlot(dest, idx, pj);
        return;
    }
    // Si el equipo destino está lleno, intentar el otro
    const otro = dest === 'A' ? 'B' : 'A';
    const slots2 = combateState[`equipo${otro}`];
    const idx2   = slots2.findIndex(s => !s);
    if (idx2 !== -1) {
        _asignarSlot(otro, idx2, pj);
        return;
    }
    toast('Todos los slots están llenos', 'error');
};

function _asignarSlot(eq, idx, pj) {
    const nombre = pj.nombre_refinado || pj.nombre;
    const medEquip = inventarios[nombre] || [];
    const slot = crearSlot(pj, medEquip);
    recalcSlot(slot);
    combateState[`equipo${eq}`][idx] = slot;
    refrescarEquipo(eq);
    refrescarPool();
    refrescarCuadro();
    if (combateState.esAdmin) {
        combateState.slotActivoEquipo = eq;
        combateState.slotActivoIdx    = idx;
        renderSlotDetalle(eq, idx);
    }
}

// ── Quitar PJ ─────────────────────────────────────────────────
window._combateQuitarSlot = (eq, idx) => {
    combateState[`equipo${eq}`][idx] = null;
    if (combateState.slotActivoEquipo === eq && combateState.slotActivoIdx === idx) {
        combateState.slotActivoEquipo = null;
        combateState.slotActivoIdx    = null;
        const w = document.getElementById('combate-slot-detalle');
        if (w) w.style.display = 'none';
    }
    refrescarEquipo(eq);
    refrescarPool();
    refrescarCuadro();
};

// ── Toggle slot expandido ─────────────────────────────────────
window._combateToggleSlot = (eq, idx) => {
    const mismo = combateState.slotActivoEquipo === eq && combateState.slotActivoIdx === idx;
    if (mismo) {
        combateState.slotActivoEquipo = null;
        combateState.slotActivoIdx    = null;
        const w = document.getElementById('combate-slot-detalle');
        if (w) w.style.display = 'none';
    } else {
        combateState.slotActivoEquipo = eq;
        combateState.slotActivoIdx    = idx;
        renderSlotDetalle(eq, idx);
    }
    refrescarEquipo(eq);
};

// ── Recalcular deltas desde inputs del detalle ─────────────────
window._combateRecalcDeltas = (eq, idx) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;

    const get = id => document.getElementById(id)?.value?.trim() || '0';

    const campos = ['pot','agi','ctl','pv','cambios','ctl_usado','pv_actual'];
    campos.forEach(c => {
        [1,2,3,4,5].forEach(n => {
            const v = get(`cb-${eq}-${idx}-${c}-d${n}`);
            slot._d[`delta_${c}_${n}`] = v;
        });
    });

    // Base manual (solo pot, agi, ctl)
    ['pot','agi','ctl'].forEach(c => {
        const bEl = document.getElementById(`cb-${eq}-${idx}-${c}-base`);
        if (bEl) slot._pj[c] = parseInt(bEl.value) || 0;
    });

    recalcSlot(slot);
    refrescarEquipo(eq);
    refrescarCuadro();

    // Actualizar displays de resultado sin re-renderizar todo el detalle
    const statMap = { pot:'pot', agi:'agi', ctl:'ctl', pv:'pvMax', cambios:'cambios', pv_actual:'pv' };
    Object.entries(statMap).forEach(([key, slotKey]) => {
        const displays = document.querySelectorAll(`[id^="cb-${eq}-${idx}-${key}-"]`);
        // Nada que actualizar en los inputs — solo el valor resultado
    });
};

// ── PV actual manual ──────────────────────────────────────────
window._combatePVActualChange = (eq, idx, valor) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    slot._pvActualManual = valor === '' ? null : (parseInt(valor) || 0);
    window._combateRecalcDeltas(eq, idx);
};

// ── Delta rápido en PVs — solo modifica _pvActualManual (Δ1 se usará como acumulador) ──
window._combateDeltaPV = (eq, idx, delta) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    const pvActAntes = slot.pv;
    const pvMaxAntes = slot.pvMax;
    // Sumar al manual (sin clampear al máx, permite superar pvMax temporalmente)
    const base = slot._pvActualManual !== null && slot._pvActualManual !== undefined
        ? slot._pvActualManual : slot.pv;
    slot._pvActualManual = Math.max(0, base + delta);
    recalcSlot(slot);
    const pvActNuevo = slot.pv;
    const pvMaxNuevo = slot.pvMax;
    _pushRegistro(slot.nombre, { etiqueta: `${delta>0?'+':''}${delta}PVs(${pvActAntes}/${pvMaxAntes}→${pvActNuevo}/${pvMaxNuevo})` });
    refrescarEquipo(eq);
    refrescarRegistro();
    refrescarCuadro();
    renderSlotDetalle(eq, idx);
};

// ── Helper global para que combate-ui.js pueda acceder a medallas ─
window._combateGetMedalla = (id) => todasLasMedallas.find(m => String(m.id) === String(id));

// ── Mostrar info de medalla (click en chip o en nombre) ────────
window._combateMostrarInfoMedalla = (eq, idx, medallaId) => {
    renderMedInfoPanel(eq, idx, medallaId);
};

// ── Pasar dado de una medalla al PJ anterior/siguiente ────────
// dir: -1 = anterior, +1 = siguiente (entre todos los slots de ambos equipos)
window._combatePasarDado = (eq, idx, medallaId, dir) => {
    const slotOrigen = combateState[`equipo${eq}`][idx];
    if (!slotOrigen) return;
    const val = slotOrigen.dados[medallaId];
    if (!val) return;

    // Construir lista plana de slots activos: [{eq, idx, slot}]
    const todos = [];
    ['A','B'].forEach(e => combateState[`equipo${e}`].forEach((s, i) => {
        if (s) todos.push({ eq: e, idx: i, slot: s });
    }));
    const actualPos = todos.findIndex(t => t.eq === eq && t.idx === idx);
    if (actualPos === -1) return;
    const destPos = (actualPos + dir + todos.length) % todos.length;
    const destItem = todos[destPos];
    if (!destItem || destItem.eq === eq && destItem.idx === idx) return;

    // Si el destino tiene la medalla, mover el valor
    if (destItem.slot.medallas.some(m => String(m.id) === String(medallaId))) {
        destItem.slot.dados[medallaId] = val;
        delete slotOrigen.dados[medallaId];
    } else {
        toast('El PJ destino no tiene esa medalla equipada', 'info');
        return;
    }

    // Refrescar ambos equipos
    refrescarEquipo(eq);
    refrescarEquipo(destItem.eq);
    renderSlotDetalle(combateState.slotActivoEquipo, combateState.slotActivoIdx);
};

// ── Navegación de dado con flechas de teclado ─────────────────
// Flecha arriba/abajo mueve entre las habilidades del mismo PJ
window._combateDadoNavKey = (event, eq, idx, medallaIdx) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const medallas = slot.medallas;
    const nextIdx = medallaIdx + (event.key === 'ArrowDown' ? 1 : -1);
    if (nextIdx < 0 || nextIdx >= medallas.length) return;
    const nextId = medallas[nextIdx].id;
    const nextInput = document.getElementById(`dado-${eq}-${idx}-${nextId}`);
    if (nextInput) nextInput.focus();
};


    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    const n = parseInt(valor);
    if (!isNaN(n) && n >= 1 && n <= 100) slot.dados[medallaId] = n;
    else delete slot.dados[medallaId];
};

// ── Toggle medalla ─────────────────────────────────────────────
window._combateToggleMedalla = (eq, idx, medallaId, checked) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    const med = todasLasMedallas.find(m => String(m.id) === String(medallaId));
    if (!med) return;
    if (checked) {
        if (!slot.medallas.some(m => String(m.id) === String(medallaId)))
            slot.medallas.push(med);
    } else {
        slot.medallas = slot.medallas.filter(m => String(m.id) !== String(medallaId));
        delete slot.dados[medallaId];
    }
    refrescarEquipo(eq);
    refrescarCuadro();
    renderSlotDetalle(eq, idx);
};

// ── Toggle catálogo de tags ────────────────────────────────────
window._combateToggleCatalogoTags = (eq, idx) => {
    const w = document.getElementById(`catalogo-tags-${eq}-${idx}`);
    if (w) w.style.display = w.style.display === 'none' ? 'block' : 'none';
};
window._combateFiltrarCatTags = (eq, idx, q) => {
    const lista = document.getElementById(`cat-tags-lista-${eq}-${idx}`);
    if (!lista) return;
    const ql = q.toLowerCase();
    lista.querySelectorAll('[data-tag]').forEach(el => {
        el.style.display = !ql || el.dataset.tag.toLowerCase().includes(ql) ? '' : 'none';
    });
};

// ── Toggle tag en slot ─────────────────────────────────────────
window._combateToggleTag = (eq, idx, tag) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    const tN = (tag.startsWith('#') ? tag : '#' + tag).toLowerCase();
    const i  = slot.tags.findIndex(t => (t.startsWith('#')?t:'#'+t).toLowerCase() === tN);
    if (i >= 0) {
        slot.tags.splice(i, 1);
        _pushRegistro(slot.nombre, { etiqueta: `-${tag}` });
    } else {
        slot.tags.push(tag.startsWith('#') ? tag : '#' + tag);
        _pushRegistro(slot.nombre, { etiqueta: `+${tag}` });
    }
    refrescarRegistro();
    renderSlotDetalle(eq, idx);
};

// ── Delta PT ──────────────────────────────────────────────────
window._combateDeltaPT = (eq, idx, tag, delta) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    const k = tag.startsWith('#') ? tag : '#' + tag;
    const antes = slot.pts[k] || 0;
    slot.pts[k] = Math.max(0, antes + delta);
    _pushRegistro(slot.nombre, { etiqueta: `${delta>0?'+':''}${delta}PT ${k}` });
    refrescarRegistro();
    renderSlotDetalle(eq, idx);
};

// ── Guardar stats en BD ───────────────────────────────────────
window._combateGuardarStatsSlot = async (eq, idx) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    const d = slot._d;
    const payload = {
        pot: slot._pj.pot || 0,
        agi: slot._pj.agi || 0,
        ctl: slot._pj.ctl || 0,
        pv_actual: slot._pvActualManual ?? null,
    };
    const campos = ['pot','agi','ctl','pv','cambios','ctl_usado','pv_actual'];
    campos.forEach(c => {
        [1,2,3,4,5].forEach(n => {
            payload[`delta_${c}_${n}`] = d[`delta_${c}_${n}`] || '0';
        });
    });
    const res = await guardarStatsGrupo(slot.nombre, payload);
    toast(res.ok ? '✅ Stats guardados' : '❌ ' + res.msg, res.ok ? 'ok' : 'error');
};

// ── Registro ──────────────────────────────────────────────────
window._combateCopiarRegistro = () => {
    const el = document.getElementById('combate-registro-txt');
    if (!el) return;
    navigator.clipboard.writeText(el.textContent.trim())
        .then(() => toast('Registro copiado', 'ok'));
};
window._combateLimpiarRegistro = () => {
    combateState.registro = [];
    refrescarRegistro();
};

// ── Cuadro texto ──────────────────────────────────────────────
window._combateCopiarCuadroTexto = () => {
    const actA = combateState.equipoA.filter(Boolean);
    const actB = combateState.equipoB.filter(Boolean);
    if (!actA.length && !actB.length) return;
    const stats = [
        {lbl:'PVs',      fmt:s=>`${s.pv}/${s.pvMax}`},
        {lbl:'POT',      fmt:s=>String(s.pot)},
        {lbl:'AGI',      fmt:s=>String(s.agi)},
        {lbl:'CTL',      fmt:s=>String(s.ctl)},
        {lbl:'C/T',      fmt:s=>String(s.cambios)},
        {lbl:'PT Total', fmt:s=>String(calcPTTotal(s.pts))},
        {lbl:'Medallas', fmt:s=>String(s.medallas?.length||0)},
    ];
    const todos = [...actA, ...actB];
    const W = 14;
    let txt = ''.padEnd(12) + todos.map(s=>s.nombre.slice(0,W).padEnd(W)).join('') + '\n';
    txt += '─'.repeat(12 + W * todos.length) + '\n';
    stats.forEach(st => {
        txt += st.lbl.padEnd(12) + todos.map(s=>st.fmt(s).padEnd(W)).join('') + '\n';
    });
    navigator.clipboard.writeText(txt).then(() => toast('Cuadro copiado', 'ok'));
};

// ── Cuadro imagen ─────────────────────────────────────────────
window._combateCopiarImagenCuadro = async () => {
    toast('Generando imagen…', 'info');
    try {
        const canvas = await generarImagenCuadro();
        if (!canvas) return;

        // Intentar clipboard API primero
        canvas.toBlob(async blob => {
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                toast('✅ Imagen copiada al portapapeles', 'ok');
            } catch {
                // Fallback: descargar
                const url  = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.href     = url;
                link.download = `combate-${Date.now()}.png`;
                link.click();
                toast('Imagen descargada (portapapeles no disponible)', 'info');
            }
        }, 'image/png');
    } catch (err) {
        console.error(err);
        toast('Error: ' + err.message, 'error');
    }
};

// ── Helpers internos ──────────────────────────────────────────
function _pushRegistro(nombre, cambio) {
    // Agrupar cambios del mismo PJ en la misma "ronda" (mismo segundo)
    const ahora = Math.floor(Date.now() / 2000);  // ventana de 2s
    let entry = combateState.registro
        .filter(e => e.nombre === nombre && e._t === ahora)
        .slice(-1)[0];
    if (!entry) {
        entry = { nombre, cambios: [], _t: ahora };
        combateState.registro.push(entry);
    }
    entry.cambios.push(cambio);
}
