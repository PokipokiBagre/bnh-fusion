// ============================================================
// combate/combate-main.js  v2
// ============================================================
import { bnhAuth, supabase } from '../bnh-auth.js';
import { bnhPort } from '../bnh-port-principal.js';
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
    bnhPort.init().catch(console.error);

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
                const proyectado = proyectarFicha(pj, pjData || [], ptMap, opcionesFusion, bannedTags) || pj;
                // Adjuntar el raw de BD para que crearSlot pueda leer bases reales
                proyectado.gOriginal = pj;
                return proyectado;
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

    // ── Fix markup links: bnh-markup.js genera rutas relativas como fichas/index.html
    // Desde /combate/ eso resuelve a /combate/fichas/ en vez de /fichas/
    // Interceptamos y corregimos con la ruta absoluta correcta.
    document.addEventListener('click', e => {
        const a = e.target.closest('a[href]');
        if (!a) return;
        const href = a.getAttribute('href');
        if (!href || href.startsWith('http') || href.startsWith('#') || href.startsWith('/')) return;
        // Detectar rutas relativas que apuntan a secciones del proyecto
        const secciones = ['fichas/', 'tags/', 'medallas/', 'combate/'];
        const apuntaASección = secciones.some(s => href.startsWith(s) || href.includes('/' + s));
        if (!apuntaASección) return;
        e.preventDefault();
        // Construir URL absoluta desde la raíz del proyecto
        const root = window.location.origin + window.location.pathname.split('/').slice(0, -2).join('/') + '/';
        // Quitar los ../ iniciales del href y resolver desde la raíz
        const hrefClean = href.replace(/^(\.\.\/)+/, '');
        window.open(root + hrefClean, '_blank');
    }, true);
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

    // Snapshot antes para detectar cambios
    const antes = { pot: slot.pot, agi: slot.agi, ctl: slot.ctl, pvMax: slot.pvMax, cambios: slot.cambios, pv: slot.pv, ctlUsado: slot.ctlUsado ?? 0 };

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

    // Registrar cambios con debounce (600ms) para no spamear al escribir
    clearTimeout(slot._recalcRegistroTimer);
    slot._recalcRegistroTimer = setTimeout(() => {
        const despues = { pot: slot.pot, agi: slot.agi, ctl: slot.ctl, pvMax: slot.pvMax, cambios: slot.cambios, pv: slot.pv, ctlUsado: slot.ctlUsado ?? 0 };
        const etiquetas = [];
        if (despues.pot     !== antes.pot)     etiquetas.push(`POT(${antes.pot}→${despues.pot})`);
        if (despues.agi     !== antes.agi)     etiquetas.push(`AGI(${antes.agi}→${despues.agi})`);
        if (despues.ctl     !== antes.ctl)     etiquetas.push(`CTL(${antes.ctl}→${despues.ctl})`);
        if (despues.pvMax   !== antes.pvMax)   etiquetas.push(`PVMax(${antes.pvMax}→${despues.pvMax})`);
        if (despues.pv      !== antes.pv)      etiquetas.push(`PV(${antes.pv}→${despues.pv})`);
        if (despues.cambios !== antes.cambios) etiquetas.push(`Camb/T(${antes.cambios}→${despues.cambios})`);
        if (despues.ctlUsado !== antes.ctlUsado) etiquetas.push(`CTLUsd(${antes.ctlUsado}→${despues.ctlUsado})`);
        if (etiquetas.length) {
            _pushRegistro(slot.nombre, { etiqueta: etiquetas.join(' ') });
            refrescarRegistro();
        }
    }, 600);

    // Actualizar displays de resultado sin re-renderizar todo el detalle para no perder foco
    const statMap = { pot:'pot', agi:'agi', ctl:'ctl', pv:'pvMax', cambios:'cambios', pv_actual:'pv', ctl_usado:'ctlUsado' };
    Object.entries(statMap).forEach(([key, slotKey]) => {
        const resultEl = document.getElementById(`cb-${eq}-${idx}-${key}-result`);
        if (resultEl) {
            if (key === 'pv_actual') {
                // Caso especial para el recuadro de PV actual que muestra act / max
                resultEl.innerHTML = `→ <b style="color:#1e8449;font-size:1.1em;">${slot[slotKey]}</b> <span style="color:#aaa;">/ ${slot.pvMax}</span>`;
            } else if (key === 'ctl_usado') {
                // Caso especial: muestra ctlUsado / ctl
                resultEl.innerHTML = `→ <b style="color:#4a235a;font-size:1.1em;">${slot.ctlUsado} / ${slot.ctl}</b>`;
            } else {
                // Modificar sólo el interior de la etiqueta <b> que contiene el número para mantener el color
                const bEl = resultEl.querySelector('b');
                if (bEl) bEl.innerText = slot[slotKey];
            }
        }
    });
};

// ── PV actual manual ──────────────────────────────────────────
window._combatePVActualChange = (eq, idx, valor) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    slot._pvActualManual = valor === '' ? null : (parseInt(valor) || 0);
    window._combateRecalcDeltas(eq, idx);
};

// ── Delta rápido en PVs — acumula en delta_pv_actual_1 ────────
window._combateDeltaPV = (eq, idx, delta) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    const pvActAntes = slot.pv;
    const pvMaxAntes = slot.pvMax;

    // Acumular en Δ1 de PV Actual (el campo visible en la UI)
    const d1Actual = parseInt(slot._d.delta_pv_actual_1) || 0;
    slot._d.delta_pv_actual_1 = String(d1Actual + delta);

    recalcSlot(slot);
    const pvActNuevo = slot.pv;
    const pvMaxNuevo = slot.pvMax;
    _pushRegistro(slot.nombre, { etiqueta: `${delta>0?'+':''}${delta}PVs(${pvActAntes}/${pvMaxAntes}→${pvActNuevo}/${pvMaxNuevo})` });
    refrescarEquipo(eq);
    refrescarRegistro();
    refrescarCuadro();
    renderSlotDetalle(eq, idx);
};

// ── Delta rápido en PV Máx — acumula en delta_pv_1 ───────────
window._combateDeltaPVMax = (eq, idx, delta) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    const antes = slot.pvMax;

    // Acumular en Δ1 de PV Máx
    const d1 = parseInt(slot._d.delta_pv_1) || 0;
    slot._d.delta_pv_1 = String(d1 + delta);

    recalcSlot(slot);
    const despues = slot.pvMax;
    _pushRegistro(slot.nombre, { etiqueta: `${delta>0?'+':''}${delta}PVMax(${antes}→${despues})` });
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
// ←/→ mueve entre medallas del mismo PJ
// ↑/↓ mueve al mismo índice de medalla en el PJ anterior/siguiente del mismo equipo
window._combateDadoNavKey = (event, eq, idx, medallaIdx) => {
    const slot = combateState[`equipo${eq}`]?.[idx];
    if (!slot) return;
    const tecla = event.key;
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(tecla)) return;
    event.preventDefault();

    if (tecla === 'ArrowLeft' || tecla === 'ArrowRight') {
        // Moverse entre medallas del mismo PJ
        const medallas = slot.medallas;
        const nextIdx = medallaIdx + (tecla === 'ArrowRight' ? 1 : -1);
        if (nextIdx < 0 || nextIdx >= medallas.length) return;
        const nextInput = document.getElementById(`dado-${eq}-${idx}-${medallas[nextIdx].id}`);
        if (nextInput) nextInput.focus();
    } else {
        // ↑/↓ moverse al mismo índice de medalla en el PJ anterior/siguiente (mismo equipo)
        const slots = combateState[`equipo${eq}`];
        const dir = tecla === 'ArrowDown' ? 1 : -1;
        let nextPJIdx = idx + dir;
        while (nextPJIdx >= 0 && nextPJIdx < slots.length) {
            const destSlot = slots[nextPJIdx];
            if (destSlot && destSlot.medallas.length > 0) {
                // Usar mismo índice de medalla si existe, o el último
                const destMedIdx = Math.min(medallaIdx, destSlot.medallas.length - 1);
                const destId = destSlot.medallas[destMedIdx].id;
                const destInput = document.getElementById(`dado-${eq}-${nextPJIdx}-${destId}`);
                if (destInput) { destInput.focus(); return; }
            }
            nextPJIdx += dir;
        }
    }
};


// ── Dado ──────────────────────────────────────────────────────
window._combateSetDado = (eq, idx, medallaId, valor) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    const n = parseInt(valor);
    if (!isNaN(n) && n >= 1 && n <= 100) slot.dados[medallaId] = n;
    else delete slot.dados[medallaId];
    // Si hay un panel de info abierto para esta medalla, actualizarlo reactivamente
    if (slot._medallaInfoAbierta === String(medallaId)) {
        slot._medallaInfoAbierta = null; // reset para que el toggle no cierre
        renderMedInfoPanel(eq, idx, medallaId);
    }
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
    recalcSlot(slot); // ← recalcula ctlUsado para que la tarjeta lo refleje
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
    // Solo actualizar el número inline para no mover los botones
    const safeId = `cb-pt-val-${eq}-${idx}-${k.replace(/[^a-zA-Z0-9_-]/g,'_')}`;
    const spanEl = document.getElementById(safeId);
    if (spanEl) spanEl.textContent = slot.pts[k];
    else renderSlotDetalle(eq, idx); // fallback si no existe el span
};

// ── Guardar PTs en BD ──────────────────────────────────────────
window._combateGuardarPTs = async (eq, idx) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    const { supabase } = await import('../bnh-auth.js');
    let errores = 0;
    for (const [tag, cantidad] of Object.entries(slot.pts || {})) {
        const k = tag.startsWith('#') ? tag : '#' + tag;
        const { error } = await supabase.from('puntos_tag').upsert(
            { personaje_nombre: slot.nombre, tag: k, cantidad },
            { onConflict: 'personaje_nombre,tag' }
        );
        if (error) errores++;
    }
    toast(errores === 0 ? '✅ PTs guardados en BD' : `⚠️ ${errores} error(es) al guardar`, errores === 0 ? 'ok' : 'error');
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
        // Guardar nota en la columna nota_X (nombre real en BD)
        payload[`nota_${c}`] = d[`delta_${c}_nota`] || '';
    });
    const res = await guardarStatsGrupo(slot.nombre, payload);
    toast(res.ok ? '✅ Stats guardados' : '❌ ' + res.msg, res.ok ? 'ok' : 'error');
};

// ── Limpiar deltas en Stats ───────────────────────────────────
window._combateLimpiarDeltas = (eq, idx, cual) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    const keys = ['pot','agi','ctl','pv','cambios','ctl_usado','pv_actual'];
    if (cual === 1) {
        keys.forEach(k => { slot._d[`delta_${k}_1`] = '0'; });
        toast('Δ1 borrados', 'ok');
    } else {
        keys.forEach(k => {
            [1,2,3,4,5].forEach(n => { slot._d[`delta_${k}_${n}`] = '0'; });
        });
        toast('Todos los deltas borrados', 'ok');
    }
    recalcSlot(slot);
    refrescarEquipo(eq);
    refrescarCuadro();
    renderSlotDetalle(eq, idx);
};

// ── Igualar PV Actual al PV Máximo proyectado ─────────────────
window._combateIgualarPVMax = (eq, idx) => {
    const slot = combateState[`equipo${eq}`]?.[idx];
    if (!slot) return;
    // recalcSlot ya dejó pvMax correcto (con deltas de pv_max aplicados)
    recalcSlot(slot);
    const pvMaxProyectado = slot.pvMax;
    // Escribir en el input de base y en el estado del slot
    slot._pvActualManual = pvMaxProyectado;
    const inputEl = document.getElementById(`cb-${eq}-${idx}-pvactual-base`);
    if (inputEl) {
        inputEl.value = pvMaxProyectado;
        inputEl.style.background = '#d5f5e3';
        setTimeout(() => { inputEl.style.background = ''; }, 1200);
    }
    recalcSlot(slot);
    refrescarEquipo(eq);
    refrescarCuadro();
    renderSlotDetalle(eq, idx);
    toast(`💚 PV Actual igualado a ${pvMaxProyectado}`, 'ok');
};

// ── Nota de texto para cada stat ──────────────────────────────
window._combateSetNota = (eq, idx, key, valor) => {
    const slot = combateState[`equipo${eq}`]?.[idx];
    if (!slot) return;
    if (!slot._notas) slot._notas = {};
    slot._notas[`delta_${key}_nota`] = valor;
    // También persist en _d para que se guarde con Guardar en BD
    slot._d[`delta_${key}_nota`] = valor;
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
