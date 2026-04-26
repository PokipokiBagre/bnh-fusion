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
    slot.pv = Math.max(0, Math.min(slot.pvMax,
        aplicarDeltas(pvBase,
            d.delta_pv_actual_1, d.delta_pv_actual_2, d.delta_pv_actual_3,
            d.delta_pv_actual_4, d.delta_pv_actual_5)));
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
export function renderPool() {
    const f = combateState.poolFiltros;
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

    return `
<div style="background:white;border:1.5px solid #dee2e6;border-radius:12px;overflow:hidden;">
    <div style="background:#212529;color:white;padding:8px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-weight:800;font-size:0.82em;letter-spacing:.5px;white-space:nowrap;">👥 PERSONAJES</span>
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
            return `
        <div style="display:flex;align-items:center;gap:5px;padding:4px 9px 4px 5px;border-radius:20px;
            border:1.5px solid ${enUso?'#adb5bd':'#dee2e6'};background:${enUso?'#f1f3f4':'white'};
            opacity:${enUso?0.55:1};cursor:${enUso?'default':'pointer'};
            box-shadow:${enUso?'none':'0 1px 3px rgba(0,0,0,0.06)'};transition:.12s;"
            ${enUso?'':'onclick="window._combatePoolAddPJ(this)" onmouseover="this.style.borderColor=\'#212529\'" onmouseout="this.style.borderColor=\'#dee2e6\'"'}
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
    const ctlUsado = calcCTLUsado(slot.medallas);
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

    <!-- Stats horizontales -->
    <div style="display:flex;gap:2px;padding:6px 8px;">
        ${[['POT',slot.pot,'#7d3c00'],['AGI',slot.agi,'#1a4a80'],['CTL',slot.ctl,'#4a235a'],
           ['C/T',slot.cambios,'#1e8449'],['PVMax',slot.pvMax,pvColor],['PVAct',`${slot.pv}/${slot.pvMax}`,pvColor]
          ].map(([l,v,c]) => `
        <div style="flex:1;background:#f8f9fa;border-radius:6px;padding:3px 2px;text-align:center;min-width:0;font-size:0.72em;">
            <div style="font-weight:800;color:${c};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${v}</div>
            <div style="color:#adb5bd;font-size:0.8em;">${l}</div>
        </div>`).join('')}
    </div>

    <!-- Medallas equipadas: click para desequipar -->
    ${slot.medallas.length ? `
    <div style="padding:0 8px 6px;display:flex;flex-wrap:wrap;gap:3px;" onclick="event.stopPropagation()">
        ${slot.medallas.map(m => `
        <span title="Click para desequipar"
            style="font-size:0.68em;background:#f5eeff;color:#6c3483;border:1.5px solid #c8a8e9;
                padding:2px 7px;border-radius:6px;font-weight:700;cursor:pointer;"
            onmouseover="this.style.background='#6c3483';this.style.color='white';"
            onmouseout="this.style.background='#f5eeff';this.style.color='#6c3483';"
            onclick="window._combateToggleMedalla('${eq}',${idx},'${m.id}',false)">
            ✕ ${esc(m.nombre)} <span style="opacity:.6;">${m.costo_ctl}C</span></span>`).join('')}
        <span style="font-size:0.65em;color:#aaa;align-self:center;">CTL ${ctlUsado}/${slot.ctl}</span>
    </div>` : ''}

    <!-- Dados -->
    ${slot.medallas.length ? `
    <div style="padding:0 8px 8px;display:flex;flex-wrap:wrap;gap:4px;" onclick="event.stopPropagation()">
        ${slot.medallas.map(m => `
        <div style="display:flex;align-items:center;gap:3px;">
            <span style="font-size:0.62em;color:#888;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                title="${esc(m.nombre)}">${esc(m.nombre.length>8?m.nombre.slice(0,8)+'…':m.nombre)}</span>
            <input type="number" min="1" max="100" placeholder="🎲"
                style="width:50px;padding:2px 4px;border:1.5px solid #dee2e6;border-radius:5px;
                    font-size:0.75em;text-align:center;font-weight:700;"
                value="${slot.dados[m.id]||''}"
                onchange="window._combateSetDado('${eq}',${idx},'${m.id}',this.value)">
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

    // Bloque de un stat con deltas encadenados
    const _statBlock = (key, lbl, baseVal, isAuto=false) => {
        const deltas = [1,2,3,4,5].map(n => d[`delta_${key}_${n}`]||'0');
        const resultKey = { pv:'pvMax', cambios:'cambios', pv_actual:'pv' }[key] || key;
        const result = slot[resultKey] ?? '?';
        return `
<div style="background:#f8f9fa;border-radius:8px;padding:8px 10px;border:1px solid #e9ecef;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap;">
        <span style="font-weight:800;color:${col};font-size:0.82em;min-width:58px;">${lbl}</span>
        ${isAuto
            ? `<span style="background:#e9ecef;border-radius:4px;padding:2px 8px;font-size:0.78em;color:#666;">Auto</span>`
            : `<input type="number" value="${baseVal}"
                style="width:60px;border:1px solid #ccc;border-radius:4px;padding:2px 5px;text-align:center;font-weight:700;"
                id="cb-${eq}-${idx}-${key}-base" oninput="window._combateRecalcDeltas('${eq}',${idx})">`
        }
        <span style="font-size:0.75em;color:#888;">→ <b style="color:${col};font-size:1.05em;">${result}</b></span>
    </div>
    <div style="display:flex;gap:3px;">
        ${[1,2,3,4,5].map(n=>`
        <div style="flex:1;text-align:center;">
            <div style="font-size:0.6em;color:#9b59b6;margin-bottom:1px;font-weight:700;">Δ${n}</div>
            <input type="text" value="${deltas[n-1]}" placeholder="0"
                style="width:100%;border:1px solid #ddd;border-radius:4px;padding:2px 1px;
                    text-align:center;font-size:0.8em;font-weight:700;color:#6c3483;"
                id="cb-${eq}-${idx}-${key}-d${n}"
                oninput="window._combateRecalcDeltas('${eq}',${idx})">
        </div>`).join('')}
    </div>
</div>`;
    };

    wrap.style.display = 'block';
    wrap.innerHTML = `
<div style="background:white;border:2px solid ${col};border-radius:12px;overflow:hidden;">
    <div style="background:${col};color:white;padding:10px 16px;display:flex;align-items:center;gap:10px;">
        <img src="${imgUrl}" onerror="this.src='${fallback}'"
            style="width:38px;height:38px;border-radius:50%;object-fit:cover;object-position:top;border:2px solid rgba(255,255,255,0.5);">
        <span style="font-weight:800;font-size:0.95em;flex:1;">✏️ ${esc(slot.nombre)}</span>
        <button style="background:rgba(255,255,255,0.2);border:none;color:white;border-radius:50%;width:26px;height:26px;cursor:pointer;"
            onclick="window._combateToggleSlot('${eq}',${idx})">×</button>
    </div>

    <div style="padding:14px;display:flex;flex-direction:column;gap:16px;">

        <!-- STATS CON DELTAS ENCADENADOS -->
        <div>
            <div style="font-size:0.72em;font-weight:800;color:${col};text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
                <span>Stats — (((Base Δ1) Δ2) Δ3) Δ4) Δ5)</span>
                ${combateState.esAdmin ? `<button style="font-size:0.85em;padding:3px 12px;background:${col};color:white;border:none;border-radius:5px;cursor:pointer;"
                    onclick="window._combateGuardarStatsSlot('${eq}',${idx})">💾 Guardar en BD</button>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
                ${_statBlock('pot',      'POT',     slot._pj.pot||0)}
                ${_statBlock('agi',      'AGI',     slot._pj.agi||0)}
                ${_statBlock('ctl',      'CTL',     slot._pj.ctl||0)}
                ${_statBlock('pv',       'PV Máx',  0, true)}
                ${_statBlock('cambios',  'Camb/T',  0, true)}
            </div>

            <!-- PV Actual con sus deltas -->
            <div style="background:rgba(30,132,73,0.06);border:1px solid rgba(30,132,73,0.3);border-radius:8px;padding:8px 10px;margin-top:6px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap;">
                    <span style="font-weight:800;color:#1e8449;font-size:0.82em;min-width:58px;">PV Actual</span>
                    <input type="number" value="${slot._pvActualManual??''}" placeholder="Vacío=Máx"
                        style="width:75px;border:1px solid #27ae60;border-radius:4px;padding:2px 5px;text-align:center;font-weight:700;color:#1e8449;"
                        id="cb-${eq}-${idx}-pvactual-base"
                        oninput="window._combatePVActualChange('${eq}',${idx},this.value)">
                    <span style="font-size:0.75em;color:#888;">→ <b style="color:#1e8449;font-size:1.05em;">${slot.pv}</b></span>
                </div>
                <div style="display:flex;gap:3px;">
                    ${[1,2,3,4,5].map(n=>`
                    <div style="flex:1;text-align:center;">
                        <div style="font-size:0.6em;color:#27ae60;margin-bottom:1px;font-weight:700;">Δ${n}</div>
                        <input type="text" value="${d[`delta_pv_actual_${n}`]||'0'}" placeholder="0"
                            style="width:100%;border:1px solid #ddd;border-radius:4px;padding:2px 1px;
                                text-align:center;font-size:0.8em;font-weight:700;color:#27ae60;"
                            id="cb-${eq}-${idx}-pv_actual-d${n}"
                            oninput="window._combateRecalcDeltas('${eq}',${idx})">
                    </div>`).join('')}
                </div>
            </div>

            <!-- Botones rápidos PVs -->
            <div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center;padding:6px 8px;border-radius:8px;background:#f8f9fa;border:1px solid #dee2e6;margin-top:6px;">
                <span style="font-size:0.7em;font-weight:700;color:#555;margin-right:3px;white-space:nowrap;">PVs:</span>
                ${[-100,-50,-20,-10,-5,-1,1,5,10,20,50,100].map(dv=>
                    `<button style="font-size:0.65em;padding:2px 5px;border:1px solid ${dv>0?'#27ae60':'#e74c3c'};
                        border-radius:4px;background:${dv>0?'#d5f5e3':'#fdecea'};color:${dv>0?'#1a5e35':'#7b241c'};cursor:pointer;"
                        onclick="window._combateDeltaPV('${eq}',${idx},${dv})">${dv>0?'+':''}${dv}</button>`
                ).join('')}
            </div>
        </div>

        <!-- TAGS Y PTS -->
        <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:6px;">
                <span style="font-size:0.72em;font-weight:800;color:${col};text-transform:uppercase;letter-spacing:.5px;">Tags y PT</span>
                ${combateState.esAdmin ? `<button style="font-size:0.72em;padding:3px 10px;background:${col};color:white;border:none;border-radius:6px;cursor:pointer;"
                    onclick="window._combateToggleCatalogoTags('${eq}',${idx})">+ / − Tag</button>` : ''}
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
            </div>
            <div style="display:flex;flex-direction:column;gap:3px;max-height:230px;overflow-y:auto;">
                ${Object.entries(slot.pts||{}).sort((a,b)=>b[1]-a[1]).map(([tag,pts])=>{
                    const tD = tag.startsWith('#')?tag:'#'+tag;
                    const enT = tagsActivos.has(tD.toLowerCase());
                    return `
                <div style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;
                    background:${enT?pale:'#f8f9fa'};border:1px solid ${enT?col+'44':'#dee2e6'};">
                    <span style="flex:1;font-size:0.78em;font-weight:700;color:${enT?col:'#888'};">${esc(tD)}</span>
                    <span style="font-size:0.82em;font-weight:800;min-width:28px;text-align:right;">${pts}</span>
                    ${combateState.esAdmin?`<div style="display:flex;gap:2px;flex-wrap:nowrap;">
                        ${[-100,-50,-20,-10,-5,-1,1,5,10,20,50,100].map(dv=>
                            `<button style="font-size:0.58em;padding:1px 3px;border:1px solid ${dv>0?'#27ae60':'#e74c3c'};
                                border-radius:3px;background:${dv>0?'#d5f5e3':'#fdecea'};color:${dv>0?'#1a5e35':'#7b241c'};cursor:pointer;"
                                onclick="window._combateDeltaPT('${eq}',${idx},'${esc(tD)}',${dv})">${dv>0?'+':''}${dv}</button>`
                        ).join('')}
                    </div>`:''}</div>`;
                }).join('')||'<div style="font-size:0.78em;color:#aaa;text-align:center;padding:10px;">Sin PT registrados</div>'}
            </div>
        </div>

        <!-- MEDALLAS -->
        <div>
            <div style="font-size:0.72em;font-weight:800;color:${col};text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">
                Medallas — CTL ${ctlUsado}/${slot.ctl}
                <span style="font-size:0.85em;font-weight:500;color:#aaa;text-transform:none;">(simulación, sin límite)</span>
            </div>
            <div style="max-height:320px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;">
                ${medallasAcc.map(m=>{
                    const eq2 = medallasEquip.has(String(m.id));
                    return `
                <div style="display:flex;align-items:flex-start;gap:8px;padding:9px;border-radius:8px;
                    border:1.5px solid ${eq2?col:'#dee2e6'};background:${eq2?pale:'white'};
                    cursor:pointer;transition:.12s;"
                    onclick="window._combateToggleMedalla('${eq}',${idx},'${m.id}',${!eq2})"
                    onmouseover="this.style.borderColor='${col}';this.style.background='${pale}'"
                    onmouseout="this.style.borderColor='${eq2?col:'#dee2e6'}';this.style.background='${eq2?pale:'white'}'">
                    <div style="width:18px;height:18px;border-radius:4px;border:2px solid ${eq2?col:'#adb5bd'};
                        background:${eq2?col:'white'};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">
                        ${eq2?'<span style="color:white;font-size:0.75em;font-weight:900;">✓</span>':''}
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:0.82em;font-weight:700;">${esc(m.nombre)}
                            <span style="font-size:0.82em;color:#888;font-weight:500;">${m.costo_ctl}C · ${m.tipo}</span>
                        </div>
                        <div style="font-size:0.73em;color:#555;margin-top:2px;line-height:1.4;">${renderMarkup(m.efecto_desc||'')}</div>
                    </div>
                </div>`;
                }).join('')||'<div style="font-size:0.78em;color:#aaa;text-align:center;padding:10px;">Sin medallas accesibles</div>'}
            </div>
        </div>
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

// ── Generación de imagen Canvas estilizada ────────────────────
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
