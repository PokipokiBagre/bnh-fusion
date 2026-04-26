// ============================================================
// combate/combate-ui.js  v2
// ============================================================
import {
    combateState, STORAGE_URL, norm, crearSlot,
    todosLosPJs, todasLasMedallas, inventarios, catalogoTagsArr
} from './combate-state.js';
import {
    calcPVMax, calcCambios, calcCTLUsado, calcPTTotal,
    getMedallasAccesibles, aplicarDeltaNum
} from './combate-logic.js';
import { aplicarDeltas } from '../bnh-pac.js';
import { renderMarkup } from '../bnh-markup.js';

const $ = id => document.getElementById(id);
const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fallback = `${STORAGE_URL}/imginterfaz/no_encontrado.png`;

// ── Toast ─────────────────────────────────────────────────────
export function toast(msg, tipo = 'ok') {
    const t = $('toast-msg');
    if (!t) return;
    t.textContent = msg;
    t.className = tipo === 'ok' ? 'toast-ok' : tipo === 'error' ? 'toast-error' : 'toast-info';
    clearTimeout(t._to);
    t._to = setTimeout(() => { t.className = ''; }, 3500);
}

// ── Recalcular stats del slot aplicando deltas encadenados ────
// (((((base Δ1) Δ2) Δ3) Δ4) Δ5) — igual que fichas-op y bnh-pac
export function recalcSlot(slot) {
    const g = slot._pj;
    if (!g) return;
    const d = slot._d;

    slot.pot = aplicarDeltas(g.pot || 0,
        d.delta_pot_1, d.delta_pot_2, d.delta_pot_3, d.delta_pot_4, d.delta_pot_5);
    slot.agi = aplicarDeltas(g.agi || 0,
        d.delta_agi_1, d.delta_agi_2, d.delta_agi_3, d.delta_agi_4, d.delta_agi_5);
    slot.ctl = aplicarDeltas(g.ctl || 0,
        d.delta_ctl_1, d.delta_ctl_2, d.delta_ctl_3, d.delta_ctl_4, d.delta_ctl_5);

    const pvMaxPuro = calcPVMax(slot.pot, slot.agi, slot.ctl);
    slot.pvMax = aplicarDeltas(pvMaxPuro,
        d.delta_pv_1, d.delta_pv_2, d.delta_pv_3, d.delta_pv_4, d.delta_pv_5);

    slot.cambios = aplicarDeltas(Math.floor(slot.agi / 4),
        d.delta_cambios_1, d.delta_cambios_2, d.delta_cambios_3,
        d.delta_cambios_4, d.delta_cambios_5);

    const pvBase = (slot._pvActualManual !== null && slot._pvActualManual !== undefined)
        ? slot._pvActualManual : slot.pvMax;
    // Sin clampeado superior: PV actual puede superar PVMax (aumento temporal, ej: 100/30)
    slot.pv = Math.max(0,
        aplicarDeltas(pvBase,
            d.delta_pv_actual_1, d.delta_pv_actual_2, d.delta_pv_actual_3,
            d.delta_pv_actual_4, d.delta_pv_actual_5));

    // CTL Usado: costo de medallas equipadas + deltas
    const ctlUsadoPuro = calcCTLUsado(slot.medallas);
    slot.ctlUsado = aplicarDeltas(ctlUsadoPuro,
        d.delta_ctl_usado_1, d.delta_ctl_usado_2, d.delta_ctl_usado_3,
        d.delta_ctl_usado_4, d.delta_ctl_usado_5);
}

// ── Render raíz ───────────────────────────────────────────────
export function renderCombate() {
    const wrap = $('vista-combate');
    if (!wrap) return;
    wrap.innerHTML = `
<div style="display:flex;flex-direction:column;gap:14px;">
    <div id="combate-pool-wrap">${renderPool()}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;" id="combate-equipos-grid">
        <div id="equipo-A-wrap">${renderEquipo('A')}</div>
        <div id="equipo-B-wrap">${renderEquipo('B')}</div>
    </div>
    <div id="combate-slot-detalle" style="display:none;"></div>
    <div id="combate-registro-wrap">${renderRegistroPanel()}</div>
    <div id="combate-cuadro-wrap">${renderCuadroResumen()}</div>
</div>`;
}

// ── Pool de personajes con filtros ────────────────────────────
// Estado de equipo destino (A o B) — persiste mientras el usuario no lo cambia
if (!combateState._poolDestino) combateState._poolDestino = 'A';

export function renderPool() {
    const f = combateState.poolFiltros;
    const dest = combateState._poolDestino || 'A';
    const usados = new Set([
        ...combateState.equipoA.filter(Boolean).map(s => s.nombre),
        ...combateState.equipoB.filter(Boolean).map(s => s.nombre),
    ]);

    const filtrados = todosLosPJs.filter(pj => {
        const tags = (pj.tags || []).map(t => (t.startsWith('#') ? t : '#' + t).toLowerCase());
        if (f.estado !== 'todos' && !tags.includes(f.estado)) return false;
        if (f.rol    !== 'todos' && !tags.includes(f.rol))    return false;
        if (f.tipo   !== 'todos' && !tags.includes(f.tipo))   return false;
        return true;
    });

    const _btn = (grupo, val, lbl) => {
        const activo = f[grupo] === val;
        return `<button style="padding:3px 11px;border-radius:16px;
            border:1.5px solid ${activo?'white':'rgba(255,255,255,0.3)'};
            background:${activo?'white':'transparent'};
            color:${activo?'#212529':'rgba(255,255,255,0.85)'};
            font-size:0.72em;font-weight:${activo?700:500};cursor:pointer;transition:.12s;white-space:nowrap;"
            onclick="window._combatePoolFiltro('${grupo}','${val}')">${lbl}</button>`;
    };

    const _destBtn = (eq, lbl, color) => {
        const activo = dest === eq;
        return `<button style="padding:4px 14px;border-radius:16px;
            border:2px solid ${activo?'white':color+'99'};
            background:${activo?'white':'transparent'};
            color:${activo?color:'rgba(255,255,255,0.75)'};
            font-size:0.75em;font-weight:${activo?800:600};cursor:pointer;transition:.15s;white-space:nowrap;
            ${activo?'box-shadow:0 0 0 3px '+color+'55;':''}"
            onclick="window._combateSetDestino('${eq}')">${lbl}</button>`;
    };

    return `
<div style="background:white;border:1.5px solid #dee2e6;border-radius:12px;overflow:hidden;">
    <div style="background:#212529;color:white;padding:8px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-weight:800;font-size:0.82em;letter-spacing:.5px;white-space:nowrap;">👥 PERSONAJES</span>
        <div style="display:flex;gap:4px;background:rgba(255,255,255,0.08);padding:3px 6px;border-radius:10px;align-items:center;">
            <span style="font-size:0.68em;color:rgba(255,255,255,0.5);white-space:nowrap;margin-right:2px;">Enviar a:</span>
            ${_destBtn('A','⬤ Azul','#4a90d9')}
            ${_destBtn('B','⬤ Rojo','#e05252')}
        </div>
        <div style="display:flex;gap:3px;background:rgba(255,255,255,0.1);padding:3px 5px;border-radius:10px;">
            ${_btn('estado','todos','Todos')}${_btn('estado','#activo','Activo')}${_btn('estado','#inactivo','Inactivo')}
        </div>
        <div style="display:flex;gap:3px;background:rgba(255,255,255,0.1);padding:3px 5px;border-radius:10px;">
            ${_btn('rol','todos','Todos')}${_btn('rol','#jugador','Jugador')}${_btn('rol','#npc','NPC')}
        </div>
        <div style="display:flex;gap:3px;background:rgba(255,255,255,0.1);padding:3px 5px;border-radius:10px;">
            ${_btn('tipo','todos','Todos')}${_btn('tipo','#héroe_profesional','Héroe')}${_btn('tipo','#villano','Villano')}
        </div>
    </div>
    <div style="padding:10px;display:flex;flex-wrap:wrap;gap:6px;max-height:145px;overflow-y:auto;background:#fafafa;">
        ${filtrados.map(pj => {
            const nombre = pj.nombre_refinado || pj.nombre;
            const enUso  = usados.has(nombre);
            const imgUrl = `${STORAGE_URL}/imgpersonajes/${norm(nombre)}icon.png`;
            const destColor = dest === 'A' ? '#1a4a80' : '#a93226';
            return `
        <div style="display:flex;align-items:center;gap:5px;padding:4px 9px 4px 5px;border-radius:20px;
            border:1.5px solid ${enUso?'#adb5bd':'#dee2e6'};background:${enUso?'#f1f3f4':'white'};
            opacity:${enUso?0.55:1};cursor:${enUso?'default':'pointer'};
            box-shadow:${enUso?'none':'0 1px 3px rgba(0,0,0,0.06)'};transition:.12s;"
            ${enUso?'':
                `onclick="window._combatePoolAddPJ(this)"
                 onmouseover="this.style.borderColor='${destColor}'"
                 onmouseout="this.style.borderColor='#dee2e6'"`}
            data-nombre="${esc(nombre)}">
            <img src="${imgUrl}" onerror="this.src='${fallback}'"
                style="width:26px;height:26px;border-radius:50%;object-fit:cover;object-position:top;flex-shrink:0;">
            <span style="font-size:0.78em;font-weight:600;white-space:nowrap;color:#212529;">${esc(nombre)}</span>
            ${enUso ? '<span style="font-size:0.65em;color:#aaa;margin-left:2px;">✓</span>' : ''}
        </div>`;
        }).join('')}
        ${!filtrados.length ? '<span style="font-size:0.8em;color:#aaa;padding:8px;">Sin resultados con estos filtros.</span>' : ''}
    </div>
</div>`;
}

// ── Render equipo ─────────────────────────────────────────────
export function renderEquipo(eq) {
    const slots = combateState[`equipo${eq}`];
    const col = eq === 'A'
        ? { borde:'#1a4a80', fondo:'#ebf5fb', label:'EQUIPO AZUL ⚔' }
        : { borde:'#a93226', fondo:'#fdedec', label:'EQUIPO ROJO ⚔' };
    return `
<div style="border:2px solid ${col.borde};border-radius:12px;overflow:hidden;background:${col.fondo};">
    <div style="background:${col.borde};color:white;padding:8px 14px;font-weight:800;font-size:0.82em;
        letter-spacing:.5px;text-transform:uppercase;display:flex;align-items:center;justify-content:space-between;">
        <span>${col.label}</span>
        <span style="opacity:.8;">${slots.filter(Boolean).length} PJ(s)</span>
    </div>
    <div style="padding:10px;display:flex;flex-direction:column;gap:8px;">
        ${slots.map((slot, i) => _renderSlotCard(eq, i, slot, col)).join('')}
    </div>
</div>`;
}

function _renderSlotCard(eq, idx, slot, col) {
    const estaActivo = combateState.slotActivoEquipo === eq && combateState.slotActivoIdx === idx;
    if (!slot) {
        return `<div style="border:1.5px dashed #adb5bd;border-radius:10px;padding:10px;background:rgba(255,255,255,0.5);
            text-align:center;font-size:0.78em;color:#aaa;">Selecciona desde la pool ↑</div>`;
    }
    const pct      = slot.pvMax > 0 ? Math.max(0, Math.min(100, (slot.pv / slot.pvMax) * 100)) : 0;
    const pvColor  = pct > 60 ? '#1e8449' : pct > 30 ? '#d68910' : '#c0392b';
    const ctlUsado = slot.ctlUsado ?? calcCTLUsado(slot.medallas);
    const imgUrl   = `${STORAGE_URL}/imgpersonajes/${norm(slot.nombre)}icon.png`;

    return `
<div style="border:2px solid ${estaActivo ? col.borde : '#dee2e6'};border-radius:10px;background:white;
    box-shadow:${estaActivo ? `0 0 0 3px ${col.borde}44` : '0 1px 3px rgba(0,0,0,0.06)'};
    transition:.15s;cursor:pointer;" onclick="window._combateToggleSlot('${eq}',${idx})">

    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #f1f3f4;">
        <img src="${imgUrl}" onerror="this.src='${fallback}'"
            style="width:36px;height:36px;border-radius:50%;object-fit:cover;object-position:top;border:2px solid ${col.borde};flex-shrink:0;">
        <div style="flex:1;min-width:0;">
            <div style="font-weight:800;font-size:0.88em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(slot.nombre)}</div>
            <div style="display:flex;align-items:center;gap:4px;margin-top:2px;">
                <div style="flex:1;height:5px;background:#e9ecef;border-radius:3px;overflow:hidden;">
                    <div style="width:${pct}%;height:100%;background:${pvColor};border-radius:3px;transition:.3s;"></div>
                </div>
                <span style="font-size:0.7em;font-weight:700;color:${pvColor};white-space:nowrap;">${slot.pv}/${slot.pvMax}</span>
            </div>
        </div>
        <button style="background:none;border:none;color:#bbb;cursor:pointer;font-size:1.1em;padding:0 4px;flex-shrink:0;"
            onclick="event.stopPropagation();window._combateQuitarSlot('${eq}',${idx})">✕</button>
    </div>

    <div style="display:flex;gap:2px;padding:6px 8px;">
        ${[['POT',slot.pot,'#7d3c00'],['AGI',slot.agi,'#1a4a80'],['CTL',slot.ctl,'#4a235a'],['C/T',slot.cambios,'#1e8449']
          ].map(([l,v,c]) => `
        <div style="flex:1;background:#f8f9fa;border-radius:6px;padding:3px 2px;text-align:center;min-width:0;font-size:0.72em;">
            <div style="font-weight:800;color:${c};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${v}</div>
            <div style="color:#adb5bd;font-size:0.8em;">${l}</div>
        </div>`).join('')}
        <div style="flex:1.2;background:#e8f4fd;border-radius:6px;padding:3px 2px;text-align:center;min-width:0;font-size:0.72em;border:1px solid #b3d7f5;">
            <div style="font-weight:800;color:#1a4a80;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${slot.pvMax}</div>
            <div style="color:#5b9bd5;font-size:0.8em;">PVMax</div>
        </div>
        <div style="flex:1.4;background:#e9f7ef;border-radius:6px;padding:3px 2px;text-align:center;min-width:0;font-size:0.72em;border:1px solid #a9dfbf;">
            <div style="font-weight:800;color:${pvColor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${slot.pv}/${slot.pvMax}</div>
            <div style="color:#1e8449;font-size:0.8em;">PVAct</div>
        </div>
    </div>

    ${slot.medallas.length ? `
    <div style="padding:0 8px 6px;display:flex;flex-wrap:wrap;gap:3px;" onclick="event.stopPropagation()">
        ${slot.medallas.map(m => `
        <span title="Click para ver info"
            style="display:inline-flex;align-items:center;gap:3px;font-size:0.68em;background:#f5eeff;color:#6c3483;
                border:1.5px solid #c8a8e9;padding:2px 4px 2px 7px;border-radius:6px;font-weight:700;cursor:pointer;"
            onclick="window._combateMostrarInfoMedalla('${eq}',${idx},'${m.id}')">
            ${esc(m.nombre)} <span style="opacity:.6;">${m.costo_ctl}C</span>
            <button style="background:rgba(108,52,131,0.15);border:none;color:#6c3483;cursor:pointer;
                border-radius:4px;padding:0 3px;font-size:1em;line-height:1;font-weight:900;flex-shrink:0;"
                title="Desequipar"
                onclick="event.stopPropagation();window._combateToggleMedalla('${eq}',${idx},'${m.id}',false)">✕</button>
        </span>`).join('')}
        <span style="font-size:0.65em;color:#aaa;align-self:center;">CTL ${ctlUsado}/${slot.ctl}</span>
    </div>` : ''}

    ${slot.medallas.length ? `
    <div style="padding:0 8px 8px;display:flex;flex-wrap:wrap;gap:4px;" onclick="event.stopPropagation()">
        ${slot.medallas.map((m, mi) => `
        <div style="display:flex;align-items:center;gap:2px;">
            <span style="font-size:0.62em;color:#888;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                title="${esc(m.nombre)}">${esc(m.nombre.length>8?m.nombre.slice(0,8)+'…':m.nombre)}</span>
            <button title="Pasar al PJ anterior" style="background:none;border:1px solid #dee2e6;border-radius:3px;
                font-size:0.7em;cursor:pointer;padding:0 3px;color:#888;line-height:1.3;"
                onclick="window._combatePasarDado('${eq}',${idx},'${m.id}',-1)">▲</button>
            <input type="number" min="1" max="100" placeholder="🎲"
                id="dado-${eq}-${idx}-${esc(m.id)}"
                style="width:46px;padding:2px 3px;border:1.5px solid #dee2e6;border-radius:5px;
                    font-size:0.75em;text-align:center;font-weight:700;"
                value="${slot.dados[m.id]||''}"
                onchange="window._combateSetDado('${eq}',${idx},'${m.id}',this.value)"
                onkeydown="window._combateDadoNavKey(event,'${eq}',${idx},${mi})">
            <button title="Pasar al PJ siguiente" style="background:none;border:1px solid #dee2e6;border-radius:3px;
                font-size:0.7em;cursor:pointer;padding:0 3px;color:#888;line-height:1.3;"
                onclick="window._combatePasarDado('${eq}',${idx},'${m.id}',1)">▼</button>
        </div>`).join('')}
    </div>` : ''}
</div>`;
}

// ── Slot detalle ──────────────────────────────────────────────
export function renderSlotDetalle(eq, idx) {
    const wrap = $('combate-slot-detalle');
    if (!wrap) return;
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) { wrap.style.display = 'none'; return; }

    const col  = eq === 'A' ? '#1a4a80' : '#a93226';
    const pale = eq === 'A' ? '#ebf5fb' : '#fdedec';
    const imgUrl = `${STORAGE_URL}/imgpersonajes/${norm(slot.nombre)}icon.png`;
    const d   = slot._d;
    const medallasEquip = new Set(slot.medallas.map(m => String(m.id)));
    const medallasAcc   = getMedallasAccesibles(slot);
    const ctlUsado      = calcCTLUsado(slot.medallas);
    const tagsActivos   = new Set((slot.tags||[]).map(t=>(t.startsWith('#')?t:'#'+t).toLowerCase()));
    const tab = slot._tabActiva || 'stats';

    // ── Bloque stat con deltas ────────────────────────────────
    const _statBlock = (key, lbl, baseVal, isAuto=false, accentColor=col, bg='#f8f9fa', border='#e9ecef', extraHTML='') => {
        const deltas = [1,2,3,4,5].map(n => d[`delta_${key}_${n}`]||'0');
        const resultKey = { pv:'pvMax', cambios:'cambios', pv_actual:'pv', ctl_usado:'ctlUsado' }[key] || key;
        const result = key === 'ctl_usado'
            ? (slot.ctlUsado ?? 0) + ' / ' + slot.ctl
            : (slot[resultKey] ?? '?');
        return `
<div style="background:${bg};border-radius:8px;padding:7px 10px;border:1.5px solid ${border};">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
        <span style="font-weight:800;color:${accentColor};font-size:0.82em;min-width:58px;">${lbl}</span>
        ${isAuto
            ? `<span style="background:#e9ecef;border-radius:4px;padding:2px 8px;font-size:0.78em;color:#666;">Auto</span>`
            : `<input type="number" value="${baseVal}"
                style="width:60px;border:1.5px solid ${border};border-radius:4px;padding:2px 5px;text-align:center;font-weight:700;color:${accentColor};"
                id="cb-${eq}-${idx}-${key}-base" oninput="window._combateRecalcDeltas('${eq}',${idx})">`
        }
        <span id="cb-${eq}-${idx}-${key}-result" style="font-size:0.75em;color:#888;">→ <b style="color:${accentColor};font-size:1.1em;">${result}</b></span>
    </div>
    <div style="display:flex;gap:3px;">
        ${[1,2,3,4,5].map(n=>`
        <div style="flex:1;text-align:center;">
            <div style="font-size:0.58em;color:#9b59b6;margin-bottom:1px;font-weight:700;">Δ${n}</div>
            <input type="text" value="${deltas[n-1]}" placeholder="0"
                style="width:100%;border:1px solid #ddd;border-radius:4px;padding:2px 1px;
                    text-align:center;font-size:0.78em;font-weight:700;color:#6c3483;"
                id="cb-${eq}-${idx}-${key}-d${n}"
                oninput="window._combateRecalcDeltas('${eq}',${idx})">
        </div>`).join('')}
    </div>
    ${extraHTML}
</div>`;
    };

    // ── Tab helper ────────────────────────────────────────────
    const _tabBtn = (id, lbl) => {
        const active = tab === id;
        return `<button style="flex:1;padding:7px 4px;border:none;border-bottom:3px solid ${active?col:'transparent'};
            background:transparent;font-weight:${active?800:500};font-size:0.8em;
            color:${active?col:'#888'};cursor:pointer;transition:.12s;"
            onclick="window._combateSetTab('${eq}',${idx},'${id}')">${lbl}</button>`;
    };

    // ══ TAB: STATS ══════════════════════════════════════════
    const tabStats = `
<div style="display:flex;flex-direction:column;gap:6px;">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:2px;">
        <span style="font-size:0.7em;color:#aaa;">((( Base Δ1) Δ2) Δ3) Δ4) Δ5)</span>
        ${combateState.esAdmin ? `<button style="font-size:0.8em;padding:3px 12px;background:${col};color:white;border:none;border-radius:5px;cursor:pointer;"
            onclick="window._combateGuardarStatsSlot('${eq}',${idx})">💾 Guardar en BD</button>` : ''}
    </div>
    ${_statBlock('pot', 'POT', slot._pj.pot||0, false, '#7d3c00')}
    ${_statBlock('agi', 'AGI', slot._pj.agi||0, false, '#1a4a80')}
    ${_statBlock('ctl', 'CTL', slot._pj.ctl||0, false, '#4a235a')}
    ${_statBlock('pv',  '🔵 PV Máx', 0, true, '#1a4a80', '#eaf3fb', '#aecde8', `
        <div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center;padding:5px 2px 2px;">
            <span style="font-size:0.68em;font-weight:700;color:#1a4a80;margin-right:2px;">PVMax:</span>
            ${[-100,-50,-20,-10,-5,-1,1,5,10,20,50,100].map(dv=>
                `<button style="font-size:0.65em;padding:2px 5px;border:1px solid ${dv>0?'#1a4a80':'#e74c3c'};
                    border-radius:4px;background:${dv>0?'#dbeafe':'#fdecea'};color:${dv>0?'#1a4a80':'#7b241c'};cursor:pointer;"
                    onclick="window._combateDeltaPVMax('${eq}',${idx},${dv})">${dv>0?'+':''}${dv}</button>`
            ).join('')}
        </div>
    `)}
    ${_statBlock('cambios', 'Camb/T', 0, true, '#1e8449', '#f0faf4', '#a9dfbf')}
    ${_statBlock('ctl_usado', '🛡 CTL Usd', 0, true, '#4a235a', '#f5eeff', '#c39bd3')}

    <div style="background:#f0fff4;border:2px solid #27ae60;border-radius:8px;padding:7px 10px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
            <span style="font-weight:800;color:#1e8449;font-size:0.82em;min-width:58px;">🟢 PV Act</span>
            <input type="number" value="${slot._pvActualManual??''}" placeholder="Vacío=Máx"
                style="width:72px;border:2px solid #27ae60;border-radius:4px;padding:2px 5px;text-align:center;font-weight:700;color:#1e8449;background:white;"
                id="cb-${eq}-${idx}-pvactual-base"
                oninput="window._combatePVActualChange('${eq}',${idx},this.value)">
            <span id="cb-${eq}-${idx}-pv_actual-result" style="font-size:0.75em;color:#888;">→ <b style="color:#1e8449;font-size:1.1em;">${slot.pv}</b>
                <span style="color:#aaa;">/ ${slot.pvMax}</span></span>
        </div>
        <div style="display:flex;gap:3px;">
            ${[1,2,3,4,5].map(n=>`
            <div style="flex:1;text-align:center;">
                <div style="font-size:0.58em;color:#27ae60;margin-bottom:1px;font-weight:700;">Δ${n}</div>
                <input type="text" value="${d[`delta_pv_actual_${n}`]||'0'}" placeholder="0"
                    style="width:100%;border:1px solid #a9dfbf;border-radius:4px;padding:2px 1px;
                        text-align:center;font-size:0.78em;font-weight:700;color:#27ae60;background:white;"
                    id="cb-${eq}-${idx}-pv_actual-d${n}"
                    oninput="window._combateRecalcDeltas('${eq}',${idx})">
            </div>`).join('')}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center;padding:5px 0 1px;">
            <span style="font-size:0.68em;font-weight:700;color:#555;margin-right:2px;">PVs:</span>
            ${[-100,-50,-20,-10,-5,-1,1,5,10,20,50,100].map(dv=>
                `<button style="font-size:0.65em;padding:2px 5px;border:1px solid ${dv>0?'#27ae60':'#e74c3c'};
                    border-radius:4px;background:${dv>0?'#d5f5e3':'#fdecea'};color:${dv>0?'#1a5e35':'#7b241c'};cursor:pointer;"
                    onclick="window._combateDeltaPV('${eq}',${idx},${dv})">${dv>0?'+':''}${dv}</button>`
            ).join('')}
        </div>
    </div>
</div>`;

    // ══ TAB: TAGS Y PT ══════════════════════════════════════
    const tabTags = `
<div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:6px;">
        <span style="font-size:0.72em;font-weight:800;color:${col};text-transform:uppercase;letter-spacing:.5px;">Tags y PT</span>
        <div style="display:flex;gap:4px;">
            ${combateState.esAdmin ? `
            <button style="font-size:0.72em;padding:3px 10px;background:#27ae60;color:white;
                border:none;border-radius:6px;cursor:pointer;"
                onclick="window._combateGuardarPTs('${eq}',${idx})">💾 Guardar PTs</button>
            <button style="font-size:0.72em;padding:3px 10px;background:${col};color:white;
                border:none;border-radius:6px;cursor:pointer;"
                onclick="window._combateToggleCatalogoTags('${eq}',${idx})">+ / − Tag</button>` : ''}
        </div>
    </div>
    <div id="catalogo-tags-${eq}-${idx}" style="display:none;margin-bottom:10px;border:1.5px solid ${col};border-radius:8px;padding:8px;background:#fafafa;">
        <input class="inp" placeholder="Buscar tag…" style="font-size:0.8em;margin-bottom:6px;"
            oninput="window._combateFiltrarCatTags('${eq}',${idx},this.value)">
        <div id="cat-tags-lista-${eq}-${idx}" style="display:flex;flex-wrap:wrap;gap:4px;max-height:120px;overflow-y:auto;">
            ${catalogoTagsArr.map(t => {
                const tN = (t.startsWith('#')?t:'#'+t).toLowerCase();
                const tiene = tagsActivos.has(tN);
                return `<span data-tag="${esc(t)}"
                    style="cursor:pointer;padding:2px 8px;border-radius:8px;font-size:0.73em;font-weight:700;
                    background:${tiene?col:'#f1f3f4'};color:${tiene?'white':'#495057'};
                    border:1.5px solid ${tiene?col:'#dee2e6'};"
                    onclick="window._combateToggleTag('${eq}',${idx},'${esc(t)}')">${esc(t)}</span>`;
            }).join('')}
        </div>
    </div>` : ''}
    <div style="display:flex;flex-direction:column;gap:3px;max-height:380px;overflow-y:auto;">
        ${(() => {
            const ptsCompleto = { ...(slot.pts || {}) };
            tagsActivos.forEach(tN => {
                const tD = tN.startsWith('#') ? tN : '#' + tN;
                const key = Object.keys(ptsCompleto).find(k => (k.startsWith('#')?k:'#'+k).toLowerCase() === tN);
                if (!key) {
                    // Buscar capitalización original en slot.tags
                    const tagOriginal = (slot.tags || []).find(t => (t.startsWith('#')?t:'#'+t).toLowerCase() === tN);
                    ptsCompleto[tagOriginal ? (tagOriginal.startsWith('#')?tagOriginal:'#'+tagOriginal) : tD] = 0;
                }
            });
            return Object.entries(ptsCompleto).sort((a,b) => b[1]-a[1]).map(([tag,pts]) => {
                const tD = tag.startsWith('#')?tag:'#'+tag;
                const enT = tagsActivos.has(tD.toLowerCase());
                const safeId = `cb-pt-val-${eq}-${idx}-${tD.replace(/[^a-zA-Z0-9_-]/g,'_')}`;
                return `
        <div style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;
            background:${enT?pale:'#f8f9fa'};border:1px solid ${enT?col+'44':'#dee2e6'};">
            <span style="flex:1;font-size:0.78em;font-weight:700;color:${enT?col:'#888'};">${esc(tD)}</span>
            <span id="${safeId}" style="font-size:0.82em;font-weight:800;min-width:28px;text-align:right;">${pts}</span>
            ${combateState.esAdmin?`<div style="display:flex;gap:2px;flex-wrap:nowrap;">
                ${[-100,-50,-20,-10,-5,-1,1,5,10,20,50,100].map(dv=>
                    `<button style="font-size:0.58em;padding:1px 3px;border:1px solid ${dv>0?'#27ae60':'#e74c3c'};
                        border-radius:3px;background:${dv>0?'#d5f5e3':'#fdecea'};color:${dv>0?'#1a5e35':'#7b241c'};cursor:pointer;"
                        onclick="window._combateDeltaPT('${eq}',${idx},'${esc(tD)}',${dv})">${dv>0?'+':''}${dv}</button>`
                ).join('')}
            </div>`:''}
        </div>`;
            }).join('') || '<div style="font-size:0.78em;color:#aaa;text-align:center;padding:16px;">Sin PT registrados</div>';
        })()}
    </div>
    </div>
</div>`;

    // ══ TAB: MEDALLAS ═══════════════════════════════════════
    const tabMedallas = `
<div>
    <div style="font-size:0.75em;color:#888;margin-bottom:8px;">
        CTL usado: <b style="color:${col};">${slot.ctlUsado ?? ctlUsado}</b> / ${slot.ctl}
        <span style="margin-left:6px;font-size:0.88em;">(simulación, sin límite)</span>
    </div>
    <div id="med-info-${eq}-${idx}" style="display:none;margin-bottom:10px;border:2px solid ${col};border-radius:8px;padding:10px;background:${pale};">
        <div id="med-info-content-${eq}-${idx}"></div>
    </div>
    <div style="max-height:420px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;">
        ${medallasAcc.map(m=>{
            const eq2 = medallasEquip.has(String(m.id));
            const reqs = (m.requisitos_base||[]).map(r=>{
                const tN=(r.tag.startsWith('#')?r.tag:'#'+r.tag).toLowerCase();
                const cumpleTag = tagsActivos.has(tN);
                const pts2 = slot.pts?.[(r.tag.startsWith('#')?r.tag:'#'+r.tag)]||0;
                const cumplePts = pts2 >= (r.pts_minimos||0);
                return {tag:r.tag, pts:pts2, min:r.pts_minimos||0, ok:cumpleTag&&cumplePts};
            });
            return `
        <div style="display:flex;align-items:flex-start;gap:6px;padding:5px 7px;border-radius:7px;
            border:1.5px solid ${eq2?col:'#dee2e6'};background:${eq2?pale:'white'};transition:.12s;">
            <div style="width:18px;height:18px;border-radius:4px;border:2px solid ${eq2?col:'#adb5bd'};
                background:${eq2?col:'white'};display:flex;align-items:center;justify-content:center;
                flex-shrink:0;margin-top:1px;cursor:pointer;"
                onclick="window._combateToggleMedalla('${eq}',${idx},'${m.id}',${!eq2})">
                ${eq2?'<span style="color:white;font-size:0.75em;font-weight:900;">✓</span>':''}
            </div>
            <div style="flex:1;min-width:0;cursor:pointer;"
                onclick="window._combateMostrarInfoMedalla('${eq}',${idx},'${m.id}')">
                <div style="font-size:0.82em;font-weight:700;">${esc(m.nombre)}
                    <span style="font-size:0.82em;color:#888;font-weight:500;">${m.costo_ctl}C · ${m.tipo||''}</span>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:2px;margin-top:3px;">
                    ${reqs.map(r=>`<span style="font-size:0.65em;padding:1px 5px;border-radius:4px;font-weight:700;
                        background:${r.ok?'#d5f5e3':'#fdecea'};color:${r.ok?'#1a5e35':'#7b241c'};
                        border:1px solid ${r.ok?'#a9dfbf':'#f5b7b1'};">
                        ${esc(r.tag)} ${r.min?r.pts+'/'+r.min:''} ${r.ok?'✓':'✗'}</span>`).join('')}
                </div>
            </div>
        </div>`;
        }).join('')||'<div style="font-size:0.78em;color:#aaa;text-align:center;padding:16px;">Sin medallas accesibles</div>'}
    </div>
    ${slot.medallas.length ? `
    <div style="margin-top:10px;border-top:1px solid #eee;padding-top:8px;">
        <div style="font-size:0.68em;font-weight:800;color:${col};text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px;">Dados</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
            ${slot.medallas.map((m,mi)=>{
                const dado = slot.dados?.[m.id];
                return `
            <div style="display:flex;align-items:center;gap:2px;background:#f5eeff;
                border:1.5px solid #c8a8e9;border-radius:8px;padding:2px 4px;">
                <span style="font-size:0.65em;font-weight:700;color:#6c3483;max-width:54px;
                    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;"
                    onclick="window._combateMostrarInfoMedalla('${eq}',${idx},'${m.id}')"
                    title="${esc(m.nombre)}">${esc(m.nombre.length>9?m.nombre.slice(0,8)+'…':m.nombre)}</span>
                <button style="background:none;border:1px solid #c8a8e9;border-radius:3px;font-size:0.62em;
                    cursor:pointer;padding:0 2px;color:#6c3483;line-height:1.3;"
                    onclick="window._combatePasarDado('${eq}',${idx},'${m.id}',-1)">▲</button>
                <input type="number" min="1" max="100" placeholder="🎲"
                    id="dado-${eq}-${idx}-${esc(m.id)}"
                    style="width:40px;padding:1px 3px;border:1.5px solid #c8a8e9;border-radius:5px;
                        font-size:0.75em;text-align:center;font-weight:800;color:#6c3483;background:white;"
                    value="${dado!==undefined?dado:''}"
                    onchange="window._combateSetDado('${eq}',${idx},'${m.id}',this.value)"
                    oninput="window._combateSetDado('${eq}',${idx},'${m.id}',this.value)"
                    onkeydown="window._combateDadoNavKey(event,'${eq}',${idx},${mi})">
                <button style="background:none;border:1px solid #c8a8e9;border-radius:3px;font-size:0.62em;
                    cursor:pointer;padding:0 2px;color:#6c3483;line-height:1.3;"
                    onclick="window._combatePasarDado('${eq}',${idx},'${m.id}',1)">▼</button>
                <button style="background:none;border:none;color:#6c3483;cursor:pointer;font-size:0.82em;
                    padding:0 2px;font-weight:900;line-height:1;"
                    onclick="window._combateToggleMedalla('${eq}',${idx},'${m.id}',false)">✕</button>
            </div>`;
            }).join('')}
        </div>
    </div>` : ''}
</div>`;

    wrap.style.display = 'block';
    wrap.innerHTML = `
<div style="background:white;border:2px solid ${col};border-radius:12px;overflow:hidden;">
    <div style="background:${col};color:white;padding:10px 16px;display:flex;align-items:center;gap:10px;">
        <img src="${imgUrl}" onerror="this.src='${fallback}'"
            style="width:36px;height:36px;border-radius:50%;object-fit:cover;object-position:top;border:2px solid rgba(255,255,255,0.4);">
        <span style="font-weight:800;font-size:0.92em;flex:1;">${esc(slot.nombre)}</span>
        <button style="background:rgba(255,255,255,0.2);border:none;color:white;border-radius:50%;
            width:26px;height:26px;cursor:pointer;font-size:1em;"
            onclick="window._combateToggleSlot('${eq}',${idx})">×</button>
    </div>
    <div style="display:flex;border-bottom:1.5px solid #e9ecef;background:#fafafa;">
        ${_tabBtn('stats',   '📊 Stats')}
        ${_tabBtn('tags',    '🏷 Tags y PT')}
        ${_tabBtn('medallas','🎖 Medallas' + (slot.medallas.length ? ` (${slot.medallas.length})` : ''))}
    </div>
    <div style="padding:12px;">
        ${tab==='stats'    ? tabStats    : ''}
        ${tab==='tags'     ? tabTags     : ''}
        ${tab==='medallas' ? tabMedallas : ''}
    </div>
</div>`;
}

// ── Registro ──────────────────────────────────────────────────
export function renderRegistroPanel() {
    const lineas = combateState.registro.map(e =>
        `${e.nombre} ${(e.cambios||[]).map(c=>c.etiqueta).join(' ')}`
    );
    return `
<div style="background:white;border:1.5px solid #dee2e6;border-radius:12px;overflow:hidden;">
    <div style="background:#212529;color:white;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-weight:800;font-size:0.82em;letter-spacing:.5px;">📋 REGISTRO DE CAMBIOS</span>
        <div style="display:flex;gap:6px;">
            <button style="font-size:0.75em;padding:3px 10px;background:rgba(255,255,255,0.15);color:white;
                border:1px solid rgba(255,255,255,0.3);border-radius:6px;cursor:pointer;"
                onclick="window._combateCopiarRegistro()">📋 Copiar texto</button>
            <button style="font-size:0.75em;padding:3px 10px;background:#c0392b;color:white;border:none;border-radius:6px;cursor:pointer;"
                onclick="window._combateLimpiarRegistro()">🗑 Limpiar</button>
        </div>
    </div>
    <pre id="combate-registro-txt" style="font-family:'Inter',monospace;font-size:0.82em;
        padding:12px 16px;white-space:pre-wrap;word-break:break-word;min-height:50px;
        max-height:200px;overflow-y:auto;margin:0;background:#f8f9fa;color:#212529;line-height:1.6;">
${esc(lineas.join('\n')||'(sin cambios aún)')}</pre>
</div>`;
}

// ── Cuadro resumen ────────────────────────────────────────────
export function renderCuadroResumen() {
    const actA = combateState.equipoA.filter(Boolean);
    const actB = combateState.equipoB.filter(Boolean);
    if (!actA.length && !actB.length) return `
<div style="background:white;border:1.5px solid #dee2e6;border-radius:12px;padding:20px;text-align:center;color:#aaa;font-size:0.85em;">
    El cuadro resumen aparecerá cuando haya al menos un personaje.
</div>`;

    const stats = [
        {lbl:'PVs',      fmt:s=>`${s.pv}/${s.pvMax}`},
        {lbl:'POT',      fmt:s=>String(s.pot)},
        {lbl:'AGI',      fmt:s=>String(s.agi)},
        {lbl:'CTL',      fmt:s=>String(s.ctl)},
        {lbl:'C/T',      fmt:s=>String(s.cambios)},
        {lbl:'PT Total', fmt:s=>String(calcPTTotal(s.pts))},
        {lbl:'Medallas', fmt:s=>String(s.medallas?.length||0)},
    ];

    const _img = s => {
        const url = `${STORAGE_URL}/imgpersonajes/${norm(s.nombre)}icon.png`;
        return `<img src="${url}" onerror="this.src='${fallback}'"
            style="width:20px;height:20px;border-radius:50%;object-fit:cover;object-position:top;vertical-align:middle;margin-right:4px;">`;
    };

    const thA = 'padding:6px 10px;font-size:0.78em;font-weight:800;text-align:center;background:#1a4a80;color:white;white-space:nowrap;';
    const thB = 'padding:6px 10px;font-size:0.78em;font-weight:800;text-align:center;background:#a93226;color:white;white-space:nowrap;';
    const tdA = 'padding:5px 10px;font-size:0.82em;text-align:center;background:#dbeafe;font-weight:600;';
    const tdB = 'padding:5px 10px;font-size:0.82em;text-align:center;background:#fde8e8;font-weight:600;';
    const tdL = 'padding:5px 10px;font-size:0.75em;font-weight:700;color:#495057;text-align:right;white-space:nowrap;background:#f8f9fa;';

    let thead = `<tr><th style="${tdL}background:white;"></th>`;
    actA.forEach(s=>thead+=`<th style="${thA}">${_img(s)}${esc(s.nombre)}</th>`);
    actB.forEach(s=>thead+=`<th style="${thB}">${_img(s)}${esc(s.nombre)}</th>`);
    thead += '</tr>';

    let tbody = '';
    stats.forEach(st=>{
        tbody += `<tr><td style="${tdL}">${st.lbl}</td>`;
        actA.forEach(s=>tbody+=`<td style="${tdA}">${esc(st.fmt(s))}</td>`);
        actB.forEach(s=>tbody+=`<td style="${tdB}">${esc(st.fmt(s))}</td>`);
        tbody += '</tr>';
    });

    return `
<div style="background:white;border:1.5px solid #dee2e6;border-radius:12px;overflow:hidden;">
    <div style="background:#212529;color:white;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-weight:800;font-size:0.82em;letter-spacing:.5px;">📊 CUADRO RESUMEN</span>
        <div style="display:flex;gap:6px;">
            <button style="font-size:0.75em;padding:3px 10px;background:rgba(255,255,255,0.15);color:white;
                border:1px solid rgba(255,255,255,0.3);border-radius:6px;cursor:pointer;"
                onclick="window._combateCopiarCuadroTexto()">📋 Copiar texto</button>
            <button style="font-size:0.75em;padding:4px 12px;background:#4a235a;color:white;border:none;border-radius:6px;cursor:pointer;"
                onclick="window._combateCopiarImagenCuadro()">🖼 Imagen al portapapeles</button>
        </div>
    </div>
    <div style="overflow-x:auto;">
        <table id="combate-tabla-resumen" style="border-collapse:collapse;width:100%;min-width:400px;">
            <thead>${thead}</thead><tbody>${tbody}</tbody>
        </table>
    </div>
</div>`;
}

// ── Cambiar tab del slot detalle ──────────────────────────────
window._combateSetTab = (eq, idx, tabId) => {
    const slot = combateState[`equipo${eq}`]?.[idx];
    if (!slot) return;
    slot._tabActiva = tabId;
    renderSlotDetalle(eq, idx);
};

export function refrescarPool()     { const w=$('combate-pool-wrap');    if(w) w.innerHTML=renderPool(); }
export function refrescarEquipo(eq) { const w=$(`equipo-${eq}-wrap`);   if(w) w.innerHTML=renderEquipo(eq); }
export function refrescarRegistro() { const w=$('combate-registro-wrap');if(w) w.innerHTML=renderRegistroPanel(); }
export function refrescarCuadro()   { const w=$('combate-cuadro-wrap'); if(w) w.innerHTML=renderCuadroResumen(); }
export function refrescarTodo() {
    refrescarPool(); refrescarEquipo('A'); refrescarEquipo('B');
    refrescarRegistro(); refrescarCuadro();
    if (combateState.slotActivoEquipo !== null)
        renderSlotDetalle(combateState.slotActivoEquipo, combateState.slotActivoIdx);
}

// ── Helpers para rangos de dado ───────────────────────────────
function _parsearRangos(efecto_desc) {
    const rangos = [];
    const re = /%(\d{1,3}(?:[+-]|\s*-\s*\d{1,3})?)\s*:([\s\S]*?)%/g;
    let m;
    while ((m = re.exec(efecto_desc || '')) !== null)
        rangos.push({ rango: m[1].trim(), efecto: m[2].trim() });
    return rangos;
}

function _dadoActivaRango(dado, rangoStr) {
    if (!dado || isNaN(dado)) return null;
    const n = Number(dado), r = rangoStr.trim();
    const altoM = r.match(/^(\d+)\+$/);   if (altoM) return n >= Number(altoM[1]);
    const bajoM = r.match(/^(\d+)-$/);    if (bajoM) return n <= Number(bajoM[1]);
    const rngM  = r.match(/^(\d+)\s*-\s*(\d+)$/); if (rngM) return n >= Number(rngM[1]) && n <= Number(rngM[2]);
    return null;
}

// ── Extraer efecto base (texto antes del primer %rango:%) ─────
function _efectoBase(efecto_desc) {
    if (!efecto_desc) return '';
    // Todo lo que viene antes del primer bloque %N...:...%
    const idx = efecto_desc.search(/%\d{1,3}(?:[+-]|\s*-\s*\d{1,3})?\s*:/);
    if (idx <= 0) return '';
    return efecto_desc.slice(0, idx).trim();
}

// ── Construir HTML del panel de info (reutilizable en top y bottom) ──
function _buildMedHTML(m, slot, eq, idx, closeFn) {
    const col  = eq === 'A' ? '#1a4a80' : '#a93226';
    const pale = eq === 'A' ? '#ebf5fb' : '#fdedec';
    const tagsActivos = new Set((slot.tags||[]).map(t=>(t.startsWith('#')?t:'#'+t).toLowerCase()));
    const dadoActual  = slot.dados?.[m.id];

    const reqsBase = (m.requisitos_base||[]).map(r => {
        const tN = (r.tag.startsWith('#')?r.tag:'#'+r.tag).toLowerCase();
        const cumpleTag = tagsActivos.has(tN);
        const pts = slot.pts?.[(r.tag.startsWith('#')?r.tag:'#'+r.tag)] || 0;
        const cumplePts = pts >= (r.pts_minimos||0);
        return { tag: r.tag, pts, min: r.pts_minimos||0, ok: cumpleTag && cumplePts, cumpleTag, cumplePts };
    });

    // Efectos condicionales: cada uno tiene tag, pts_minimos, efecto_desc
    const condActivos = (m.efectos_condicionales||[]).map(ec => {
        const tN = (ec.tag.startsWith('#')?ec.tag:'#'+ec.tag).toLowerCase();
        const cumpleTag = tagsActivos.has(tN);
        const pts = slot.pts?.[(ec.tag.startsWith('#')?ec.tag:'#'+ec.tag)] || 0;
        const cumplePts = pts >= (ec.pts_minimos||0);
        return { ...ec, ok: cumpleTag && cumplePts, pts };
    });

    const _req = r => `
<div style="display:flex;align-items:center;gap:5px;padding:3px 6px;border-radius:5px;
    background:${r.ok?'#d5f5e3':'#fdecea'};border:1px solid ${r.ok?'#a9dfbf':'#f5b7b1'};font-size:0.78em;">
    <span style="font-weight:800;color:${r.ok?'#1a5e35':'#7b241c'};">${r.ok?'✓':'✗'}</span>
    <span style="font-weight:700;color:#333;">${esc(r.tag)}</span>
    ${r.min ? `<span style="color:#666;">PT: <b>${r.pts}/${r.min}</b></span>` : ''}
    ${!r.cumpleTag ? `<span style="color:#c0392b;font-size:0.88em;">Tag no activo</span>` : ''}
</div>`;

    // Rangos de dado — una línea por rango
    const rangos = _parsearRangos(m.efecto_desc);
    const rangosHTML = rangos.map(r => {
        const activa = _dadoActivaRango(dadoActual, r.rango);
        const esAlto = r.rango.includes('+');
        const esBajo = /^\d+-$/.test(r.rango);
        const baseColor  = esAlto ? '#1a5e35' : esBajo ? '#7b241c' : '#5a3e00';
        const baseBg     = esAlto ? '#d5f5e3' : esBajo ? '#fdecea' : '#fef9e7';
        const baseBorder = esAlto ? '#a9dfbf' : esBajo ? '#f5b7b1' : '#f9e79f';
        const bg     = activa === null ? baseBg     : activa ? '#d5f5e3' : '#f8f9fa';
        const border = activa === null ? baseBorder : activa ? '#27ae60' : '#dee2e6';
        const txtCol = activa === null ? baseColor  : activa ? '#1a5e35' : '#aaa';
        const badge  = activa === true
            ? `<span style="font-size:0.72em;background:#27ae60;color:white;border-radius:3px;padding:0 4px;font-weight:800;flex-shrink:0;">✓</span>`
            : activa === false
            ? `<span style="font-size:0.72em;background:#adb5bd;color:white;border-radius:3px;padding:0 4px;font-weight:800;flex-shrink:0;">✗</span>`
            : '';
        return `<div style="display:flex;align-items:baseline;gap:5px;padding:4px 8px;border-radius:6px;
            border:1.5px solid ${border};background:${bg};opacity:${activa===false?0.5:1};flex-wrap:wrap;">
            ${badge}
            <span style="font-family:monospace;font-weight:900;font-size:0.82em;color:${txtCol};white-space:nowrap;">🎲 ${esc(r.rango)}</span>
            <span style="font-size:0.8em;color:${txtCol};">: ${renderMarkup(r.efecto)}</span>
        </div>`;
    }).join('');

    // Efecto base (texto antes del primer rango)
    const efectoBase = _efectoBase(m.efecto_desc);
    const efectoBaseHTML = efectoBase
        ? `<div style="background:white;border:1.5px solid #dee2e6;border-radius:6px;padding:6px 10px;
            font-size:0.82em;color:#333;line-height:1.5;margin-bottom:6px;">${renderMarkup(efectoBase)}</div>`
        : (!rangos.length
            ? `<div style="background:white;border:1.5px solid #dee2e6;border-radius:6px;padding:6px 10px;
                font-size:0.82em;color:#333;line-height:1.5;margin-bottom:6px;">${renderMarkup(m.efecto_desc||'(sin descripción)')}</div>`
            : '');

    return `
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:6px;flex-wrap:wrap;">
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="font-weight:900;font-size:0.9em;color:${col};">${esc(m.nombre)}</span>
        <span style="font-size:0.78em;color:#888;">${m.costo_ctl}C · ${m.tipo||''}</span>
        ${dadoActual ? `<span style="font-size:0.78em;background:#212529;color:white;border-radius:4px;padding:1px 6px;font-weight:700;">🎲 ${dadoActual}</span>` : ''}
    </div>
    <button style="background:none;border:none;cursor:pointer;font-size:1.1em;color:#aaa;flex-shrink:0;"
        onclick="${closeFn}">✕</button>
</div>
${efectoBaseHTML}
${rangos.length ? `<div style="display:flex;flex-direction:column;gap:3px;margin-bottom:6px;">${rangosHTML}</div>` : ''}
${reqsBase.length ? `<div style="font-size:0.7em;font-weight:800;color:#555;text-transform:uppercase;margin-bottom:3px;">Requisitos base</div>
<div style="display:flex;flex-direction:column;gap:2px;margin-bottom:6px;">${reqsBase.map(_req).join('')}</div>` : ''}
${condActivos.length ? `<div style="font-size:0.7em;font-weight:800;color:#555;text-transform:uppercase;margin-bottom:3px;">Efectos condicionales</div>
<div style="display:flex;flex-direction:column;gap:3px;">
${condActivos.map(ec => {
    const descEc = ec.efecto_desc || ec.efecto || ec.descripcion || ec.efecto_condicional || '';
    return `
<div style="border:2px solid ${ec.ok?'#27ae60':'#dee2e6'};border-radius:6px;padding:6px 10px;
    background:${ec.ok?'#f0fff4':'#f8f9fa'};opacity:${ec.ok?1:0.5};">
    <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:${descEc?'5px':'0'};">
        <span style="font-size:0.72em;font-weight:800;background:${ec.ok?'#27ae60':'#adb5bd'};color:white;
            border-radius:4px;padding:1px 6px;">${ec.ok?'✓ ACTIVO':'✗'}</span>
        <span style="font-size:0.82em;font-weight:800;color:${ec.ok?'#1a5e35':col};">${esc(ec.tag)}</span>
        ${ec.pts_minimos ? `<span style="font-size:0.72em;color:#666;">≥ ${ec.pts_minimos} PT (tienes ${ec.pts})</span>` : ''}
    </div>
    ${descEc ? `<div style="font-size:0.85em;color:${ec.ok?'#1a5e35':'#555'};line-height:1.5;
        font-weight:${ec.ok?600:400};padding:${ec.ok?'4px 8px':'0'};
        background:${ec.ok?'rgba(39,174,96,0.1)':'transparent'};border-radius:4px;">
        ${renderMarkup(descEc)}</div>` : ''}
</div>`;
}).join('')}
</div>` : ''}`;
}

// ── Panel info de medalla — toggle ───────────────────────────
export function renderMedInfoPanel(eq, idx, medallaId) {
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) return;
    const m = window._combateGetMedalla?.(medallaId);
    if (!m) return;

    const mid = String(m.id);

    // Toggle: misma medalla ya abierta → cerrar
    if (slot._medallaInfoAbierta === mid) {
        slot._medallaInfoAbierta = null;
        const panel = document.getElementById(`med-info-${eq}-${idx}`);
        if (panel) panel.style.display = 'none';
        return;
    }
    slot._medallaInfoAbierta = mid;

    const closeFn = `window._combateCerrarInfoMed('${eq}',${idx})`;
    const html = _buildMedHTML(m, slot, eq, idx, closeFn);

    const contentEl = document.getElementById(`med-info-content-${eq}-${idx}`);
    const panelEl   = document.getElementById(`med-info-${eq}-${idx}`);
    if (contentEl) contentEl.innerHTML = html;
    if (panelEl)   { panelEl.style.display = 'block'; panelEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}

window._combateCerrarInfoMed = (eq, idx) => {
    const slot = combateState[`equipo${eq}`]?.[idx];
    if (slot) slot._medallaInfoAbierta = null;
    const panel = document.getElementById(`med-info-${eq}-${idx}`);
    if (panel) panel.style.display = 'none';
};


export async function generarImagenCuadro() {
    const actA = combateState.equipoA.filter(Boolean);
    const actB = combateState.equipoB.filter(Boolean);
    if (!actA.length && !actB.length) { toast('Sin personajes', 'error'); return null; }

    const SCALE = 2;
    const PAD = 20, ROW_H = 36, COL_LBL = 120, COL_W = 120, IMG_R = 14;
    const todos = [...actA, ...actB];
    const stats = [
        {lbl:'PVs',      fmt:s=>`${s.pv}/${s.pvMax}`},
        {lbl:'POT',      fmt:s=>String(s.pot)},
        {lbl:'AGI',      fmt:s=>String(s.agi)},
        {lbl:'CTL',      fmt:s=>String(s.ctl)},
        {lbl:'C/T',      fmt:s=>String(s.cambios)},
        {lbl:'PT Total', fmt:s=>String(calcPTTotal(s.pts))},
        {lbl:'Medallas', fmt:s=>String(s.medallas?.length||0)},
    ];

    const HEAD_H = 60;
    const cW = PAD*2 + COL_LBL + COL_W * todos.length;
    const cH = HEAD_H + PAD + ROW_H * (stats.length + 1) + PAD;

    const canvas = document.createElement('canvas');
    canvas.width  = cW  * SCALE;
    canvas.height = cH  * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    // Fondo
    ctx.fillStyle = '#f0f4f8';
    ctx.fillRect(0, 0, cW, cH);

    // Header
    const grad = ctx.createLinearGradient(0,0,cW,0);
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(1, '#16213e');
    ctx.fillStyle = grad;
    _rrect(ctx, 0, 0, cW, HEAD_H, 0); ctx.fill();

    ctx.fillStyle = 'white';
    ctx.font = `800 16px 'Inter', sans-serif`;
    ctx.fillText('⚔ CUADRO DE COMBATE — BNH', PAD, 26);
    ctx.font = `400 11px 'Inter', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(new Date().toLocaleString('es-419'), PAD, 44);

    // Equipo labels en header
    let hx = PAD + COL_LBL;
    todos.forEach((s, i) => {
        const isA = actA.includes(s);
        ctx.fillStyle = isA ? 'rgba(26,74,128,0.5)' : 'rgba(169,50,38,0.5)';
        _rrect(ctx, hx+2, HEAD_H+PAD, COL_W-4, ROW_H, 6); ctx.fill();
        hx += COL_W;
    });

    // Cargar fotos
    const imgs = await Promise.all(todos.map(s =>
        _loadImgCORS(`${STORAGE_URL}/imgpersonajes/${norm(s.nombre)}icon.png`, fallback)));

    // Fila cabecera PJs
    let cx = PAD + COL_LBL;
    const ROW0_Y = HEAD_H + PAD;
    todos.forEach((s, i) => {
        const isA = actA.includes(s);
        ctx.fillStyle = isA ? '#1a4a80' : '#a93226';
        _rrect(ctx, cx+2, ROW0_Y, COL_W-4, ROW_H, 8); ctx.fill();

        // Foto circular
        if (imgs[i]) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx + 6 + IMG_R, ROW0_Y + ROW_H/2, IMG_R, 0, Math.PI*2);
            ctx.closePath(); ctx.clip();
            ctx.drawImage(imgs[i], cx+6, ROW0_Y+(ROW_H-IMG_R*2)/2, IMG_R*2, IMG_R*2);
            ctx.restore();
        }
        ctx.fillStyle = 'white';
        ctx.font = `700 11px 'Inter',sans-serif`;
        ctx.textAlign = 'left';
        const tx = cx + 6 + IMG_R*2 + 5;
        const mxW = COL_W - IMG_R*2 - 18;
        ctx.fillText(_trunc(ctx, s.nombre, mxW), tx, ROW0_Y + ROW_H/2 + 4);
        cx += COL_W;
    });

    // Filas stats
    stats.forEach((st, ri) => {
        const y = ROW0_Y + ROW_H * (ri + 1);
        const alt = ri % 2 === 0;

        // Label
        ctx.fillStyle = alt ? '#e2e8f0' : '#edf2f7';
        _rrect(ctx, PAD, y, COL_LBL-4, ROW_H, 4); ctx.fill();
        ctx.fillStyle = '#4a5568';
        ctx.font = `600 11px 'Inter',sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(st.lbl, PAD + COL_LBL - 10, y + ROW_H/2 + 4);

        let vcx = PAD + COL_LBL;
        todos.forEach(s => {
            const isA = actA.includes(s);
            ctx.fillStyle = isA ? (alt?'#dbeafe':'#bfdbfe') : (alt?'#fde8e8':'#fecaca');
            _rrect(ctx, vcx+2, y, COL_W-4, ROW_H, 4); ctx.fill();
            ctx.fillStyle = '#1e293b';
            ctx.font = `600 12px 'Inter',sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(st.fmt(s), vcx + COL_W/2, y + ROW_H/2 + 4);
            vcx += COL_W;
        });
    });

    ctx.textAlign = 'left';
    return canvas;
}

function _rrect(ctx, x, y, w, h, r) {
    if (!r) { ctx.beginPath(); ctx.rect(x, y, w, h); return; }
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
    ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
    ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
    ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}
function _loadImgCORS(src, fb) {
    return new Promise(res => {
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload  = () => res(img);
        img.onerror = () => {
            if (src === fb) return res(null);
            const f2 = new Image(); f2.crossOrigin='anonymous';
            f2.onload=()=>res(f2); f2.onerror=()=>res(null); f2.src=fb;
        };
        img.src = src;
    });
}
function _trunc(ctx, t, mxW) {
    if (ctx.measureText(t).width <= mxW) return t;
    while (t.length > 1 && ctx.measureText(t+'…').width > mxW) t=t.slice(0,-1);
    return t+'…';
}
