// ============================================================
// combate/combate-medallas.js
// Render del panel de medallas de un slot:
//  - listado de medallas accesibles con checkbox equip
//  - chips de medallas equipadas con dado y navegación ▲▼
//  - panel de info al click (requisitos, condición dado)
//  - CTL Usado (calculado) / CTL (stat)
// ============================================================
import { combateState, STORAGE_URL, norm } from './combate-state.js';
import { calcCTLUsado, getMedallasAccesibles } from './combate-logic.js';
import { renderMarkup } from '../bnh-markup.js';

const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ── Parsear condición dado ────────────────────────────────────
// condicion_dado puede ser: ">= 90", "> 85", "< 20", "<= 10", "= 50"  etc.
// Devuelve { op, val } o null
function parsearCondicionDado(str) {
    if (!str) return null;
    const m = String(str).trim().match(/^(>=|<=|>|<|=|==)\s*(\d+)$/);
    if (!m) return null;
    return { op: m[1], val: parseInt(m[2]) };
}

function evaluarCondicionDado(cond, dado) {
    if (!cond || dado === undefined || dado === null) return null; // null = sin dato
    const d = parseInt(dado);
    if (isNaN(d)) return null;
    switch (cond.op) {
        case '>':  return d > cond.val;
        case '>=': return d >= cond.val;
        case '<':  return d < cond.val;
        case '<=': return d <= cond.val;
        case '=':
        case '==': return d === cond.val;
    }
    return null;
}

// ── Render completo del panel de medallas de un slot ──────────
export function renderMedallasPanel(eq, idx) {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;

    const panelEl = document.getElementById(`slot-medallas-panel-${eq}-${idx}`);
    if (!panelEl) return;

    const col  = eq === 'A' ? '#1a4a80' : '#a93226';
    const pale = eq === 'A' ? '#ebf5fb' : '#fdedec';

    const medallasEquip = new Set(slot.medallas.map(m => String(m.id)));
    const medallasAcc   = getMedallasAccesibles(slot);
    const tagsActivos   = new Set((slot.tags || []).map(t => (t.startsWith('#') ? t : '#' + t).toLowerCase()));

    // CTL Usado (calculado) y CTL (stat del slot)
    const ctlUsado = slot.ctlUsado ?? calcCTLUsado(slot.medallas);
    const ctlTotal = slot.ctl ?? 0;

    panelEl.innerHTML = `
<div>
    <!-- Cabecera: CTL Usado/CTL -->
    <div style="font-size:0.72em;font-weight:800;color:${col};text-transform:uppercase;
        letter-spacing:.5px;margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span>Medallas</span>
        <span style="background:${col}22;color:${col};border:1px solid ${col}55;border-radius:6px;
            padding:1px 8px;font-weight:900;">
            CTL Usado: ${ctlUsado} / ${ctlTotal}
        </span>
        <span style="font-size:0.85em;font-weight:500;color:#aaa;text-transform:none;">(simulación, sin límite)</span>
    </div>

    <!-- Panel de info (oculto hasta click) -->
    <div id="med-info-${eq}-${idx}"
        style="display:none;margin-bottom:10px;border:2px solid ${col};border-radius:8px;
            padding:10px;background:${pale};">
        <div id="med-info-content-${eq}-${idx}"></div>
    </div>

    <!-- Listado de medallas accesibles -->
    <div style="max-height:340px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;">
        ${medallasAcc.length === 0
            ? '<div style="font-size:0.78em;color:#aaa;text-align:center;padding:10px;">Sin medallas accesibles</div>'
            : medallasAcc.map(m => _renderFilaMedalla(m, eq, idx, medallasEquip, tagsActivos, slot, col, pale)).join('')
        }
    </div>

    <!-- Chips de medallas equipadas con dado -->
    ${slot.medallas.length ? `
    <div style="margin-top:10px;border-top:1px solid #eee;padding-top:8px;">
        <div style="font-size:0.68em;font-weight:800;color:${col};text-transform:uppercase;
            letter-spacing:.4px;margin-bottom:6px;">Dados de habilidades</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">
            ${slot.medallas.map((m, mi) => _renderChipDado(m, mi, eq, idx, slot, col)).join('')}
        </div>
    </div>` : ''}
</div>`;
}

// ── Fila de medalla en el listado ──────────────────────────────
function _renderFilaMedalla(m, eq, idx, medallasEquip, tagsActivos, slot, col, pale) {
    const equipada = medallasEquip.has(String(m.id));

    // Verificar requisitos base (para badge)
    const reqs = (m.requisitos_base || []).map(r => {
        const tN = (r.tag.startsWith('#') ? r.tag : '#' + r.tag).toLowerCase();
        const cumpleTag = tagsActivos.has(tN);
        const ptsKey = r.tag.startsWith('#') ? r.tag : '#' + r.tag;
        const pts = slot.pts?.[ptsKey] || 0;
        const cumplePts = pts >= (r.pts_minimos || 0);
        return { tag: r.tag, pts, min: r.pts_minimos || 0, ok: cumpleTag && cumplePts };
    });

    // Condición dado: badge rápido
    const cond = parsearCondicionDado(m.condicion_dado);
    const dadoVal = slot.dados?.[m.id];
    const condOk = evaluarCondicionDado(cond, dadoVal);

    return `
<div style="display:flex;align-items:flex-start;gap:8px;padding:8px;border-radius:8px;transition:.12s;
    border:1.5px solid ${equipada ? col : '#dee2e6'};background:${equipada ? pale : 'white'};">

    <!-- Checkbox equip -->
    <div style="width:18px;height:18px;border-radius:4px;flex-shrink:0;margin-top:1px;cursor:pointer;
        border:2px solid ${equipada ? col : '#adb5bd'};background:${equipada ? col : 'white'};
        display:flex;align-items:center;justify-content:center;"
        onclick="window._combateToggleMedalla('${eq}',${idx},'${m.id}',${!equipada})">
        ${equipada ? '<span style="color:white;font-size:0.75em;font-weight:900;">✓</span>' : ''}
    </div>

    <!-- Nombre + badges + descripción breve — click abre info -->
    <div style="flex:1;min-width:0;cursor:pointer;"
        onclick="window._combateMostrarInfoMedalla('${eq}',${idx},'${m.id}')">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
            <span style="font-size:0.82em;font-weight:700;">${esc(m.nombre)}</span>
            <span style="font-size:0.75em;color:#888;">${m.costo_ctl}C · ${m.tipo || ''}</span>
            ${reqs.map(r => `
            <span style="font-size:0.62em;padding:1px 4px;border-radius:3px;font-weight:700;
                background:${r.ok ? '#d5f5e3' : '#fdecea'};color:${r.ok ? '#1a5e35' : '#7b241c'};
                border:1px solid ${r.ok ? '#a9dfbf' : '#f5b7b1'};">
                ${esc(r.tag)}${r.min ? ' ' + r.pts + '/' + r.min : ''} ${r.ok ? '✓' : '✗'}</span>`).join('')}
            ${cond ? `
            <span style="font-size:0.62em;padding:1px 4px;border-radius:3px;font-weight:700;
                background:${condOk === true ? '#d5f5e3' : condOk === false ? '#fdecea' : '#f0f0ff'};
                color:${condOk === true ? '#1a5e35' : condOk === false ? '#7b241c' : '#444'};
                border:1px solid ${condOk === true ? '#a9dfbf' : condOk === false ? '#f5b7b1' : '#c5cae9'};">
                🎲 ${esc(m.condicion_dado)} ${dadoVal !== undefined ? '(' + dadoVal + ') ' : ''}${condOk === true ? '✓' : condOk === false ? '✗' : '?'}</span>` : ''}
        </div>
        <div style="font-size:0.72em;color:#555;margin-top:2px;line-height:1.4;">${renderMarkup(m.efecto_desc || '')}</div>
    </div>
</div>`;
}

// ── Chip de dado para medalla equipada ────────────────────────
function _renderChipDado(m, mi, eq, idx, slot, col) {
    const dado = slot.dados?.[m.id];
    const cond = parsearCondicionDado(m.condicion_dado);
    const condOk = evaluarCondicionDado(cond, dado);

    // Color del chip según condición dado
    const chipBg    = condOk === true  ? '#d5f5e3' : condOk === false ? '#fdecea' : '#f5eeff';
    const chipColor = condOk === true  ? '#1a5e35' : condOk === false ? '#7b241c' : '#6c3483';
    const chipBorder= condOk === true  ? '#a9dfbf' : condOk === false ? '#f5b7b1' : '#c8a8e9';

    return `
<div style="display:flex;align-items:center;gap:2px;background:${chipBg};
    border:1.5px solid ${chipBorder};border-radius:8px;padding:2px 4px;">
    <!-- Nombre corto -->
    <span style="font-size:0.65em;font-weight:700;color:${chipColor};
        max-width:54px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;"
        title="${esc(m.nombre)}"
        onclick="window._combateMostrarInfoMedalla('${eq}',${idx},'${m.id}')">${esc(m.nombre.length > 9 ? m.nombre.slice(0,8) + '…' : m.nombre)}</span>
    <!-- Flecha arriba (medalla anterior) -->
    <button title="Medalla anterior" style="background:none;border:1px solid ${chipBorder};
        border-radius:3px;font-size:0.62em;cursor:pointer;padding:0 2px;color:${chipColor};line-height:1.3;"
        onclick="window._combateDadoNavArrow('${eq}',${idx},${mi},-1)">▲</button>
    <!-- Input dado -->
    <input type="number" min="1" max="100" placeholder="🎲"
        id="dado-${eq}-${idx}-${esc(m.id)}"
        style="width:40px;padding:1px 3px;border:1.5px solid ${chipBorder};border-radius:5px;
            font-size:0.75em;text-align:center;font-weight:800;color:${chipColor};background:white;"
        value="${dado !== undefined ? dado : ''}"
        onchange="window._combateSetDado('${eq}',${idx},'${m.id}',this.value)"
        oninput="window._combateSetDado('${eq}',${idx},'${m.id}',this.value);window._combateRefrescarMedallas('${eq}',${idx})"
        onkeydown="window._combateDadoNavKey(event,'${eq}',${idx},${mi})">
    <!-- Flecha abajo (medalla siguiente) -->
    <button title="Medalla siguiente" style="background:none;border:1px solid ${chipBorder};
        border-radius:3px;font-size:0.62em;cursor:pointer;padding:0 2px;color:${chipColor};line-height:1.3;"
        onclick="window._combateDadoNavArrow('${eq}',${idx},${mi},1)">▼</button>
    <!-- X desequipar -->
    <button title="Desequipar" style="background:none;border:none;color:${chipColor};
        cursor:pointer;font-size:0.82em;padding:0 2px;font-weight:900;line-height:1;"
        onclick="window._combateToggleMedalla('${eq}',${idx},'${m.id}',false)">✕</button>
</div>`;
}

// ── Panel de info detallada de una medalla ────────────────────
export function mostrarInfoMedalla(eq, idx, medallaId) {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    const m = window._combateGetMedalla?.(medallaId);
    if (!m) return;

    const col  = eq === 'A' ? '#1a4a80' : '#a93226';
    const tagsActivos = new Set((slot.tags || []).map(t => (t.startsWith('#') ? t : '#' + t).toLowerCase()));

    // Requisitos base
    const reqsBase = (m.requisitos_base || []).map(r => {
        const tN = (r.tag.startsWith('#') ? r.tag : '#' + r.tag).toLowerCase();
        const cumpleTag = tagsActivos.has(tN);
        const ptsKey = r.tag.startsWith('#') ? r.tag : '#' + r.tag;
        const pts = slot.pts?.[ptsKey] || 0;
        const cumplePts = pts >= (r.pts_minimos || 0);
        return { tag: r.tag, pts, min: r.pts_minimos || 0, ok: cumpleTag && cumplePts, cumpleTag, cumplePts };
    });

    // Requisitos condicionales
    const reqsCond = (m.requisitos_condicionales || []).map(r => {
        const tN = (r.tag.startsWith('#') ? r.tag : '#' + r.tag).toLowerCase();
        const cumpleTag = tagsActivos.has(tN);
        const ptsKey = r.tag.startsWith('#') ? r.tag : '#' + r.tag;
        const pts = slot.pts?.[ptsKey] || 0;
        const cumplePts = pts >= (r.pts_minimos || 0);
        return { tag: r.tag, pts, min: r.pts_minimos || 0, ok: cumpleTag && cumplePts, cumpleTag, cumplePts };
    });

    // Condición dado
    const cond = parsearCondicionDado(m.condicion_dado);
    const dadoVal = slot.dados?.[m.id];
    const condOk  = evaluarCondicionDado(cond, dadoVal);

    const _reqRow = (r, tipo) => `
<div style="display:flex;align-items:center;gap:5px;padding:3px 8px;border-radius:5px;
    background:${r.ok ? '#d5f5e3' : '#fdecea'};border:1px solid ${r.ok ? '#a9dfbf' : '#f5b7b1'};
    font-size:0.78em;">
    <span style="font-weight:800;color:${r.ok ? '#1a5e35' : '#7b241c'};">${r.ok ? '✓' : '✗'}</span>
    <span style="font-weight:700;color:#333;">${esc(r.tag)}</span>
    ${r.min ? `<span style="color:#666;">PT: <b>${r.pts}</b>/${r.min} ${r.cumplePts ? '✓' : '✗'}</span>` : ''}
    ${!r.cumpleTag ? `<span style="color:#c0392b;font-size:0.85em;">Tag no activo</span>` : ''}
    <span style="margin-left:auto;font-size:0.72em;color:#888;font-style:italic;">${tipo}</span>
</div>`;

    const panelEl   = document.getElementById(`med-info-${eq}-${idx}`);
    const contentEl = document.getElementById(`med-info-content-${eq}-${idx}`);
    if (!panelEl || !contentEl) return;

    // Bloque condición dado
    let condDadoHTML = '';
    if (cond) {
        const estadoColor  = condOk === true ? '#d5f5e3' : condOk === false ? '#fdecea' : '#f0f0ff';
        const estadoBorder = condOk === true ? '#a9dfbf' : condOk === false ? '#f5b7b1' : '#c5cae9';
        const estadoLabel  = condOk === true ? '✓ Activada' : condOk === false ? '✗ No activada' : '? Sin dado';
        const estadoColor2 = condOk === true ? '#1a5e35' : condOk === false ? '#7b241c' : '#444';
        condDadoHTML = `
<div style="font-size:0.7em;font-weight:800;color:#555;text-transform:uppercase;margin-bottom:4px;">Condición de dado</div>
<div style="background:${estadoColor};border:1.5px solid ${estadoBorder};border-radius:6px;
    padding:6px 10px;font-size:0.8em;display:flex;align-items:center;gap:8px;">
    <span style="font-size:1.2em;">🎲</span>
    <span>Necesita dado <b>${esc(m.condicion_dado)}</b></span>
    <span style="margin-left:4px;color:#666;">Dado actual: <b>${dadoVal !== undefined ? dadoVal : '—'}</b></span>
    <span style="margin-left:auto;font-weight:900;color:${estadoColor2};">${estadoLabel}</span>
</div>`;
    }

    contentEl.innerHTML = `
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:6px;flex-wrap:wrap;">
    <div>
        <span style="font-weight:900;font-size:0.9em;color:${col};">${esc(m.nombre)}</span>
        <span style="font-size:0.78em;color:#888;margin-left:6px;">${m.costo_ctl}C · ${m.tipo || ''}</span>
    </div>
    <button style="background:none;border:none;cursor:pointer;font-size:1.2em;color:#aaa;line-height:1;"
        onclick="document.getElementById('med-info-${eq}-${idx}').style.display='none'">✕</button>
</div>
<div style="font-size:0.8em;color:#333;line-height:1.5;margin-bottom:10px;">${renderMarkup(m.efecto_desc || '(sin descripción)')}</div>
${reqsBase.length ? `
<div style="font-size:0.7em;font-weight:800;color:#555;text-transform:uppercase;margin-bottom:4px;">Requisitos base</div>
<div style="display:flex;flex-direction:column;gap:3px;margin-bottom:8px;">${reqsBase.map(r => _reqRow(r, 'base')).join('')}</div>` : ''}
${reqsCond.length ? `
<div style="font-size:0.7em;font-weight:800;color:#555;text-transform:uppercase;margin-bottom:4px;">Requisitos condicionales</div>
<div style="display:flex;flex-direction:column;gap:3px;margin-bottom:8px;">${reqsCond.map(r => _reqRow(r, 'cond.')).join('')}</div>` : ''}
${condDadoHTML}`;

    panelEl.style.display = 'block';
    panelEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}