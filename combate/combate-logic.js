// ============================================================
// combate/combate-logic.js
// ============================================================
import { combateState, todasLasMedallas, todosLosPTs, catalogoTagsArr } from './combate-state.js';

// ── Calcular PV máx a partir de stats ────────────────────────
export function calcPVMax(pot, agi, ctl) {
    const pac = pot + agi + ctl;
    const bono = pac >= 100 ? 20 : pac >= 80 ? 15 : pac >= 60 ? 10 : 5;
    return Math.floor(pot / 4) + Math.floor(agi / 4) + Math.floor(ctl / 4) + bono;
}

export function calcCambios(agi) { return Math.floor(agi / 4); }

export function calcPTTotal(pts) {
    if (!pts) return 0;
    return Object.values(pts).reduce((a, b) => a + (b || 0), 0);
}

// ── CTL usado por medallas ────────────────────────────────────
export function calcCTLUsado(medallas) {
    return (medallas || []).reduce((a, m) => a + (Number(m.costo_ctl) || 0), 0);
}

// ── Medallas accesibles para un slot (sin límite de CTL) ─────
export function getMedallasAccesibles(slot) {
    const tagsNorm = (slot.tags || []).map(t => (t.startsWith('#') ? t : '#' + t).toLowerCase());
    const ptsLook = {};
    Object.entries(slot.pts || {}).forEach(([k, v]) => {
        ptsLook[(k.startsWith('#') ? k : '#' + k).toLowerCase()] = v;
    });

    return todasLasMedallas.filter(m => {
        if (m.propuesta) return false;
        const reqs = m.requisitos_base || [];
        if (!reqs.length) return false;
        return reqs.every(r => {
            const tN = (r.tag.startsWith('#') ? r.tag : '#' + r.tag).toLowerCase();
            return tagsNorm.includes(tN) && (ptsLook[tN] || 0) >= (r.pts_minimos || 0);
        });
    });
}

// ── Aplicar delta a un stat ───────────────────────────────────
export function aplicarDeltaNum(base, deltaStr) {
    const s = String(deltaStr || '').trim();
    if (!s || s === '0') return base;
    const pow  = s.match(/^\^([+-]?\d+(?:\.\d+)?)$/);
    const mult = s.match(/^[xX*]([+-]?\d+(?:\.\d+)?)$/);
    const div  = s.match(/^\/([+-]?\d+(?:\.\d+)?)$/);
    const add  = s.match(/^([+-]?\d+(?:\.\d+)?)$/);
    if (pow)  return Math.round(Math.pow(base, parseFloat(pow[1])));
    if (mult) return Math.round(base * parseFloat(mult[1]));
    if (div)  return Math.round(base / parseFloat(div[1]));
    if (add)  return Math.round(base + parseFloat(add[1]));
    return base;
}

// ── Construir línea de registro ───────────────────────────────
// cambios = [{ etiqueta: '+3 AGI' }, ...]
export function buildLineaRegistro(nombre, cambios) {
    if (!cambios || !cambios.length) return '';
    return `${nombre} ${cambios.map(c => c.etiqueta).join(' ')}`;
}

// ── Construir cuadro resumen ──────────────────────────────────
export function buildCuadroResumen(slotsA, slotsB) {
    const actA = slotsA.filter(Boolean);
    const actB = slotsB.filter(Boolean);
    const filas = [];

    const maxN = Math.max(actA.length, actB.length);
    const nombres = [];
    for (let i = 0; i < maxN; i++) {
        const a = actA[i]?.nombre || '';
        const b = actB[i]?.nombre || '';
        nombres.push([a, b]);
    }

    // Cabecera nombres
    const todosA = actA.map(s => s.nombre);
    const todosB = actB.map(s => s.nombre);

    const rows = [];
    // Fila de nombres
    rows.push({ label: '', vals: [...todosA.map(n => ({ v: n, eq: 'A' })), ...todosB.map(n => ({ v: n, eq: 'B' }))] });
    // Stats
    const stats = [
        { k: 'pv',    fmt: s => `${s.pv}/${s.pvMax}`,           label: 'PVs' },
        { k: 'pot',   fmt: s => String(s.pot),                  label: 'POT' },
        { k: 'agi',   fmt: s => String(s.agi),                  label: 'AGI' },
        { k: 'ctl',   fmt: s => String(s.ctl),                  label: 'CTL' },
        { k: 'cam',   fmt: s => String(calcCambios(s.agi)),      label: 'C/T' },
        { k: 'pt',    fmt: s => String(calcPTTotal(s.pts)),      label: 'PT Total' },
        { k: 'med',   fmt: s => String(s.medallas?.length || 0), label: 'Medallas' },
    ];
    stats.forEach(st => {
        rows.push({
            label: st.label,
            vals: [
                ...actA.map(s => ({ v: st.fmt(s), eq: 'A' })),
                ...actB.map(s => ({ v: st.fmt(s), eq: 'B' })),
            ]
        });
    });
    return { rows, actA, actB };
}
