// ============================================================
// combate/combate-main.js
// ============================================================
import { bnhAuth, supabase } from '../bnh-auth.js';
import {
    combateState, STORAGE_URL, crearSlot,
    setTodosLosPJs, setTodosLosPTs, setTodasLasMedallas,
    setInventarios, setCatalogoTagsArr,
    todosLosPJs, todasLasMedallas, inventarios, catalogoTagsArr
} from './combate-state.js';
import {
    renderCombate, renderSlotDetalle,
    refrescarEquipo, refrescarRegistro, refrescarCuadro, refrescarTodo,
    toast
} from './combate-ui.js';
import { aplicarDeltaNum, calcPVMax, calcCambios } from './combate-logic.js';
import { proyectarFicha } from '../fichas/fichas-logic.js';
import { cargarFusiones } from '../bnh-fusion.js';

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
            { data: catData, error: e5 },
            { data: optsData },
            { data: banData },
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

        // Guardar datos en state
        setTodasLasMedallas(medData || []);
        setCatalogoTagsArr((catData || []).map(t => t.nombre.startsWith('#') ? t.nombre : '#' + t.nombre).sort());

        // Construir mapa de PT por PJ
        const ptMap = {};
        (ptData || []).forEach(row => {
            if (!ptMap[row.personaje_nombre]) ptMap[row.personaje_nombre] = {};
            const tag = row.tag.startsWith('#') ? row.tag : '#' + row.tag;
            ptMap[row.personaje_nombre][tag] = row.cantidad;
        });
        setTodosLosPTs(ptMap);

        // Construir inventarios reales
        const invMap = {};
        const medById = {};
        (medData || []).forEach(m => { medById[m.id] = m; });
        (invData || []).forEach(row => {
            if (!invMap[row.personaje_nombre]) invMap[row.personaje_nombre] = [];
            const med = medById[row.medalla_id];
            if (med) invMap[row.personaje_nombre].push(med);
        });
        setInventarios(invMap);

        // Procesar PJs con proyección de fusión
        const opcionesFusion = optsData || {};
        const bannedTags = (banData || []).map(t => (t.nombre.startsWith('#') ? t.nombre : '#' + t.nombre).toLowerCase());

        const pjsProyectados = (pjData || []).map(pj => {
            try {
                const proyectado = proyectarFicha(pj, pjData || [], ptMap, opcionesFusion, bannedTags);
                return proyectado || pj;
            } catch {
                return pj;
            }
        });
        setTodosLosPJs(pjsProyectados);

    } catch (err) {
        console.error('[combate] Error cargando datos:', err);
        toast('Error al cargar datos: ' + err.message, 'error');
    }

    // Ocultar carga y mostrar interfaz
    const pantalla = document.getElementById('pantalla-carga');
    const interfaz = document.getElementById('interfaz-combate');
    if (pantalla) pantalla.style.display = 'none';
    if (interfaz) interfaz.classList.remove('oculto');

    renderCombate();
};

// ── Seleccionar PJ en un slot ─────────────────────────────────
window._combateSelPJ = (eq, idx, nombre) => {
    if (!nombre) return;
    const pj = todosLosPJs.find(p => (p.nombre_refinado || p.nombre) === nombre);
    if (!pj) return;
    const medEquip = inventarios[nombre] || [];
    const slot = crearSlot(pj, medEquip);
    combateState[`equipo${eq}`][idx] = slot;
    refrescarEquipo(eq);
    refrescarCuadro();
    // Expandir automáticamente si es admin
    if (combateState.esAdmin) {
        combateState.slotActivoEquipo = eq;
        combateState.slotActivoIdx    = idx;
        renderSlotDetalle(eq, idx);
    }
};

// ── Quitar PJ de un slot ──────────────────────────────────────
window._combateQuitarSlot = (eq, idx) => {
    combateState[`equipo${eq}`][idx] = null;
    if (combateState.slotActivoEquipo === eq && combateState.slotActivoIdx === idx) {
        combateState.slotActivoEquipo = null;
        combateState.slotActivoIdx    = null;
        const wrap = document.getElementById('combate-slot-detalle');
        if (wrap) wrap.style.display = 'none';
    }
    refrescarEquipo(eq);
    refrescarCuadro();
};

// ── Toggle slot expandido ─────────────────────────────────────
window._combateToggleSlot = (eq, idx) => {
    const mismoPJ = combateState.slotActivoEquipo === eq && combateState.slotActivoIdx === idx;
    if (mismoPJ) {
        combateState.slotActivoEquipo = null;
        combateState.slotActivoIdx    = null;
        const wrap = document.getElementById('combate-slot-detalle');
        if (wrap) wrap.style.display = 'none';
    } else {
        combateState.slotActivoEquipo = eq;
        combateState.slotActivoIdx    = idx;
        renderSlotDetalle(eq, idx);
    }
    refrescarEquipo(eq);
};

// ── Escribir dado de una medalla ──────────────────────────────
window._combateSetDado = (eq, idx, medallaId, valor) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    const n = parseInt(valor);
    if (!isNaN(n) && n >= 1 && n <= 100) slot.dados[medallaId] = n;
    else delete slot.dados[medallaId];
};

// ── Delta en stat por botón ───────────────────────────────────
window._combateDeltaStat = (eq, idx, stat, delta) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    const antes = slot[stat];
    let nuevo = slot[stat] + delta;
    // PV no puede superar pvMax y no puede bajar de 0
    if (stat === 'pv') nuevo = Math.max(0, Math.min(slot.pvMax, nuevo));
    slot[stat] = nuevo;

    const etiqueta = _fmtEtiqueta(stat.toUpperCase(), delta, antes, nuevo);
    _pushRegistro(slot.nombre, { etiqueta });

    refrescarEquipo(eq);
    refrescarRegistro();
    refrescarCuadro();
    renderSlotDetalle(eq, idx);
};

// ── Delta libre en stat ───────────────────────────────────────
window._combateDeltaLibre = (eq, idx, stat, deltaStr, inputEl) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot || !deltaStr?.trim()) return;
    const antes = slot[stat];
    const nuevo = aplicarDeltaNum(antes, deltaStr.trim());
    slot[stat] = stat === 'pv' ? Math.max(0, Math.min(slot.pvMax, nuevo)) : nuevo;

    const etiqueta = _fmtEtiquetaDelta(stat.toUpperCase(), deltaStr.trim(), antes, slot[stat]);
    _pushRegistro(slot.nombre, { etiqueta });
    if (inputEl) inputEl.value = '';

    refrescarEquipo(eq);
    refrescarRegistro();
    refrescarCuadro();
    renderSlotDetalle(eq, idx);
};

// ── Delta en PT de un tag ─────────────────────────────────────
window._combateDeltaPT = (eq, idx, tag, delta) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    const tagKey = tag.startsWith('#') ? tag : '#' + tag;
    const antes = slot.pts[tagKey] || 0;
    slot.pts[tagKey] = Math.max(0, antes + delta);

    const etiqueta = `${delta > 0 ? '+' : ''}${delta}PT ${tagKey}`;
    _pushRegistro(slot.nombre, { etiqueta });

    refrescarRegistro();
    renderSlotDetalle(eq, idx);
};

// ── Toggle medalla virtual ────────────────────────────────────
window._combateToggleMedalla = (eq, idx, medallaId, checked) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    const med = todasLasMedallas.find(m => String(m.id) === String(medallaId));
    if (!med) return;

    if (checked) {
        if (!slot.medallas.some(m => String(m.id) === String(medallaId))) {
            slot.medallas.push(med);
        }
    } else {
        slot.medallas = slot.medallas.filter(m => String(m.id) !== String(medallaId));
        delete slot.dados[medallaId];
    }

    refrescarEquipo(eq);
    refrescarCuadro();
    renderSlotDetalle(eq, idx);
};

// ── Toggle catálogo de tags ───────────────────────────────────
window._combateToggleCatalogoTags = (eq, idx) => {
    const wrap = document.getElementById(`catalogo-tags-${eq}-${idx}`);
    if (!wrap) return;
    wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
};

window._combateFiltrarCatTags = (eq, idx, query) => {
    const lista = document.getElementById(`cat-tags-lista-${eq}-${idx}`);
    if (!lista) return;
    const q = query.toLowerCase();
    lista.querySelectorAll('[data-tag]').forEach(el => {
        el.style.display = !q || el.dataset.tag.toLowerCase().includes(q) ? '' : 'none';
    });
};

// ── Toggle tag en el slot ─────────────────────────────────────
window._combateToggleTag = (eq, idx, tag) => {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    const tN = (tag.startsWith('#') ? tag : '#' + tag).toLowerCase();
    const tieneIdx = slot.tags.findIndex(t => (t.startsWith('#') ? t : '#' + t).toLowerCase() === tN);
    if (tieneIdx >= 0) {
        slot.tags.splice(tieneIdx, 1);
        _pushRegistro(slot.nombre, { etiqueta: `-${tag}` });
    } else {
        slot.tags.push(tag.startsWith('#') ? tag : '#' + tag);
        _pushRegistro(slot.nombre, { etiqueta: `+${tag}` });
    }
    refrescarRegistro();
    renderSlotDetalle(eq, idx);
};

// ── Copiar registro como texto ────────────────────────────────
window._combateCopiarRegistro = () => {
    const el = document.getElementById('combate-registro-txt');
    if (!el) return;
    navigator.clipboard.writeText(el.textContent).then(() => toast('Registro copiado', 'ok'));
};

window._combateLimpiarRegistro = () => {
    combateState.registro = [];
    refrescarRegistro();
};

// ── Copiar cuadro como texto ──────────────────────────────────
window._combateCopiarCuadro = () => {
    const actA = combateState.equipoA.filter(Boolean);
    const actB = combateState.equipoB.filter(Boolean);
    if (!actA.length && !actB.length) return;

    const stats = [
        { lbl:'PVs',      fmt: s => `${s.pv}/${s.pvMax}` },
        { lbl:'POT',      fmt: s => String(s.pot) },
        { lbl:'AGI',      fmt: s => String(s.agi) },
        { lbl:'CTL',      fmt: s => String(s.ctl) },
        { lbl:'C/T',      fmt: s => String(calcCambios(s.agi)) },
        { lbl:'PT Total', fmt: s => String(Object.values(s.pts||{}).reduce((a,b)=>a+b,0)) },
        { lbl:'Medallas', fmt: s => String(s.medallas?.length||0) },
    ];

    const todos = [...actA, ...actB];
    const lblW = 10;
    const colW = 14;

    let txt = ''.padEnd(lblW);
    todos.forEach(s => { txt += s.nombre.slice(0, colW).padEnd(colW); });
    txt += '\n' + '─'.repeat(lblW + colW * todos.length) + '\n';
    stats.forEach(st => {
        txt += st.lbl.padEnd(lblW);
        todos.forEach(s => { txt += st.fmt(s).padEnd(colW); });
        txt += '\n';
    });

    navigator.clipboard.writeText(txt).then(() => toast('Cuadro copiado', 'ok'));
};

// ── Copiar cuadro como imagen ─────────────────────────────────
window._combateCopiarImagenCuadro = async () => {
    const tabla = document.getElementById('combate-tabla-resumen');
    if (!tabla) { toast('Sin tabla para copiar', 'error'); return; }

    toast('Generando imagen…', 'info');

    try {
        // Clonar tabla para renderizar off-screen con estilos explícitos
        const TARGET_W = 1000;

        const canvas = document.createElement('canvas');
        canvas.width  = TARGET_W;

        // Serializar la tabla a SVG → canvas usando foreignObject
        const xml = new XMLSerializer().serializeToString(tabla);
        const wrapper = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${TARGET_W}" height="600">
            <style>
                table { border-collapse: collapse; width: 100%; font-family: Inter, sans-serif; font-size: 13px; }
                th, td { padding: 7px 12px; border: 1px solid #dee2e6; }
                th { color: white; font-weight: 800; }
            </style>
            <foreignObject width="${TARGET_W}" height="600">
                <div xmlns="http://www.w3.org/1999/xhtml" style="background:white;padding:12px;">
                    ${xml}
                </div>
            </foreignObject>
        </svg>`;

        const img = new Image();
        const svgBlob = new Blob([wrapper], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        img.onload = async () => {
            canvas.height = img.height || 400;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            try {
                canvas.toBlob(async blob => {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                    toast('Imagen copiada al portapapeles ✅', 'ok');
                }, 'image/png');
            } catch {
                // Fallback: abrir en nueva pestaña
                const dataUrl = canvas.toDataURL('image/png');
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = 'combate-resumen.png';
                a.click();
                toast('Imagen descargada', 'ok');
            }
        };
        img.src = url;

    } catch (err) {
        console.error(err);
        toast('Error generando imagen: ' + err.message, 'error');
    }
};

// ── Helpers internos ──────────────────────────────────────────
function _pushRegistro(nombre, cambio) {
    let entry = combateState.registro.find(e => e.nombre === nombre && e._turno === _turnoActual());
    if (!entry) {
        entry = { nombre, cambios: [], _turno: _turnoActual() };
        combateState.registro.push(entry);
    }
    entry.cambios.push(cambio);
}

function _turnoActual() {
    // Simple: un nuevo "turno" cada vez que se renderiza el combate
    return combateState._turno || 0;
}

function _fmtEtiqueta(stat, delta, _antes, nuevo) {
    const signo = delta > 0 ? '+' : '';
    return `${signo}${delta}${stat}(→${nuevo})`;
}

function _fmtEtiquetaDelta(stat, deltaStr, antes, nuevo) {
    return `${deltaStr}${stat}(${antes}→${nuevo})`;
}
