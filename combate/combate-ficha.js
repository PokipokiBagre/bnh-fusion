// ============================================================
// combate/combate-ficha.js
// Render del panel de detalle de un slot (stats, PVs, tags, PT)
// ============================================================
import { combateState, STORAGE_URL, norm, catalogoTagsArr } from './combate-state.js';
import { calcCTLUsado } from './combate-logic.js';
import { aplicarDeltas } from '../bnh-pac.js';

const $ = id => document.getElementById(id);
const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fallback = `${STORAGE_URL}/imginterfaz/no_encontrado.png`;

// ── recalcSlot: recalcula todos los stats del slot desde sus deltas ──
export function recalcSlot(slot) {
    const g = slot._pj;
    if (!g) return;
    const d = slot._d;

    // POT / AGI / CTL con deltas encadenados sobre la base del PJ
    slot.pot = aplicarDeltas(g.pot || 0,
        d.delta_pot_1, d.delta_pot_2, d.delta_pot_3, d.delta_pot_4, d.delta_pot_5);
    slot.agi = aplicarDeltas(g.agi || 0,
        d.delta_agi_1, d.delta_agi_2, d.delta_agi_3, d.delta_agi_4, d.delta_agi_5);
    slot.ctl = aplicarDeltas(g.ctl || 0,
        d.delta_ctl_1, d.delta_ctl_2, d.delta_ctl_3, d.delta_ctl_4, d.delta_ctl_5);

    // PV Máx: se calcula a partir de POT/AGI/CTL ya con deltas, luego aplica sus propios deltas
    const pac = slot.pot + slot.agi + slot.ctl;
    const bono = pac >= 100 ? 20 : pac >= 80 ? 15 : pac >= 60 ? 10 : 5;
    const pvMaxPuro = Math.floor(slot.pot / 4) + Math.floor(slot.agi / 4) + Math.floor(slot.ctl / 4) + bono;
    slot.pvMax = aplicarDeltas(pvMaxPuro,
        d.delta_pv_1, d.delta_pv_2, d.delta_pv_3, d.delta_pv_4, d.delta_pv_5);

    // Cambios/turno
    slot.cambios = aplicarDeltas(Math.floor(slot.agi / 4),
        d.delta_cambios_1, d.delta_cambios_2, d.delta_cambios_3,
        d.delta_cambios_4, d.delta_cambios_5);

    // PV Actual: base manual (o pvMax si está vacío), luego deltas
    const pvBase = (slot._pvActualManual !== null && slot._pvActualManual !== undefined)
        ? slot._pvActualManual : slot.pvMax;
    // Sin clampeado superior — permite 100/30 (aumento temporal)
    slot.pv = Math.max(0, aplicarDeltas(pvBase,
        d.delta_pv_actual_1, d.delta_pv_actual_2, d.delta_pv_actual_3,
        d.delta_pv_actual_4, d.delta_pv_actual_5));

    // CTL Usado: suma de costo_ctl de medallas equipadas (+ delta_ctl_usado)
    const ctlUsadoPuro = calcCTLUsado(slot.medallas);
    slot.ctlUsado = aplicarDeltas(ctlUsadoPuro,
        d.delta_ctl_usado_1, d.delta_ctl_usado_2, d.delta_ctl_usado_3,
        d.delta_ctl_usado_4, d.delta_ctl_usado_5);
}

// ── Render del panel de detalle de un slot ────────────────────
export function renderSlotDetalle(eq, idx) {
    const wrap = $('combate-slot-detalle');
    if (!wrap) return;
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) { wrap.style.display = 'none'; return; }

    const col  = eq === 'A' ? '#1a4a80' : '#a93226';
    const pale = eq === 'A' ? '#ebf5fb' : '#fdedec';
    const imgUrl = `${STORAGE_URL}/imgpersonajes/${norm(slot.nombre)}icon.png`;
    const d = slot._d;
    const tagsActivos = new Set((slot.tags || []).map(t => (t.startsWith('#') ? t : '#' + t).toLowerCase()));

    // ── Bloque stat genérico con deltas encadenados ────────────
    // key: clave en slot._d (ej: 'pot', 'pv', 'pv_actual')
    // lbl: etiqueta visible
    // baseVal: valor editable (null = auto/calculado)
    // resultVal: valor ya calculado en slot (para mostrar →)
    // accentColor: color del resultado
    const _statBlock = ({ key, lbl, baseVal, isAuto, resultVal, accent, bgColor, borderColor }) => {
        const deltas = [1,2,3,4,5].map(n => d[`delta_${key}_${n}`] || '0');
        const ac = accent || col;
        const bg = bgColor || '#f8f9fa';
        const bd = borderColor || '#e9ecef';
        return `
<div style="background:${bg};border-radius:8px;padding:8px 10px;border:1.5px solid ${bd};">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap;">
        <span style="font-weight:800;color:${ac};font-size:0.82em;min-width:62px;">${lbl}</span>
        ${isAuto
            ? `<span style="background:#e9ecef;border-radius:4px;padding:2px 8px;font-size:0.78em;color:#666;">Auto</span>`
            : `<input type="number" value="${baseVal ?? ''}"
                style="width:64px;border:1.5px solid ${bd};border-radius:4px;padding:2px 5px;text-align:center;font-weight:700;color:${ac};background:white;"
                id="cb-${eq}-${idx}-${key}-base"
                oninput="window._combateRecalcDeltas('${eq}',${idx})">`
        }
        <span style="font-size:0.75em;color:#888;">→ <b style="color:${ac};font-size:1.05em;">${resultVal ?? '?'}</b></span>
    </div>
    <div style="display:flex;gap:3px;">
        ${[1,2,3,4,5].map(n => `
        <div style="flex:1;text-align:center;">
            <div style="font-size:0.6em;color:#9b59b6;margin-bottom:1px;font-weight:700;">Δ${n}</div>
            <input type="text" value="${deltas[n-1]}" placeholder="0"
                style="width:100%;border:1px solid #ddd;border-radius:4px;padding:2px 1px;
                    text-align:center;font-size:0.8em;font-weight:700;color:#6c3483;background:white;"
                id="cb-${eq}-${idx}-${key}-d${n}"
                oninput="window._combateRecalcDeltas('${eq}',${idx})">
        </div>`).join('')}
    </div>
</div>`;
    };

    wrap.style.display = 'block';
    wrap.innerHTML = `
<div style="background:white;border:2px solid ${col};border-radius:12px;overflow:hidden;" id="slot-detalle-inner-${eq}-${idx}">
    <!-- Header -->
    <div style="background:${col};color:white;padding:10px 16px;display:flex;align-items:center;gap:10px;">
        <img src="${imgUrl}" onerror="this.src='${fallback}'"
            style="width:38px;height:38px;border-radius:50%;object-fit:cover;object-position:top;border:2px solid rgba(255,255,255,0.5);">
        <span style="font-weight:800;font-size:0.95em;flex:1;">✏️ ${esc(slot.nombre)}</span>
        <button style="background:rgba(255,255,255,0.2);border:none;color:white;border-radius:50%;
            width:26px;height:26px;cursor:pointer;font-size:1em;"
            onclick="window._combateToggleSlot('${eq}',${idx})">×</button>
    </div>

    <div style="padding:14px;display:flex;flex-direction:column;gap:14px;">

        <!-- ══ STATS ══════════════════════════════════════════ -->
        <div>
            <div style="font-size:0.72em;font-weight:800;color:${col};text-transform:uppercase;
                letter-spacing:.5px;margin-bottom:8px;display:flex;align-items:center;
                justify-content:space-between;flex-wrap:wrap;gap:6px;">
                <span>Stats — (((Base Δ1) Δ2) Δ3) Δ4) Δ5)</span>
                ${combateState.esAdmin ? `
                <button style="font-size:0.85em;padding:3px 12px;background:${col};color:white;
                    border:none;border-radius:5px;cursor:pointer;"
                    onclick="window._combateGuardarStatsSlot('${eq}',${idx})">💾 Guardar en BD</button>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
                ${_statBlock({ key:'pot', lbl:'POT', baseVal:slot._pj.pot||0, resultVal:slot.pot, accent:'#7d3c00' })}
                ${_statBlock({ key:'agi', lbl:'AGI', baseVal:slot._pj.agi||0, resultVal:slot.agi, accent:'#1a4a80' })}
                ${_statBlock({ key:'ctl', lbl:'CTL', baseVal:slot._pj.ctl||0, resultVal:slot.ctl, accent:'#4a235a' })}
            </div>

            <!-- PV Máx: calculado (auto) + sus propios deltas → es el denominador -->
            <div style="margin-top:6px;">
                ${_statBlock({ key:'pv', lbl:'🔵 PV Máx', isAuto:true, resultVal:slot.pvMax, accent:'#1a4a80', bgColor:'#eaf3fb', borderColor:'#aecde8' })}
            </div>

            <!-- Camb/T -->
            <div style="margin-top:6px;">
                ${_statBlock({ key:'cambios', lbl:'Camb/T', isAuto:true, resultVal:slot.cambios, accent:'#1e8449', bgColor:'#f0faf4', borderColor:'#a9dfbf' })}
            </div>

            <!-- CTL Usado: base = costo medallas equipadas (auto) + deltas, muestra usado/total -->
            <div style="margin-top:6px;">
                ${_statBlock({ key:'ctl_usado', lbl:'🛡 CTL Usd', isAuto:true, resultVal: slot.ctlUsado + ' / ' + slot.ctl, accent:'#4a235a', bgColor:'#f5eeff', borderColor:'#c39bd3' })}
            </div>

            <!-- PV Actual: cuadro verde, muestra act/máx -->
            <div style="margin-top:6px;background:#f0fff4;border:2px solid #27ae60;border-radius:8px;padding:8px 10px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap;">
                    <span style="font-weight:800;color:#1e8449;font-size:0.82em;min-width:62px;">🟢 PV Act</span>
                    <input type="number" value="${slot._pvActualManual ?? ''}" placeholder="Vacío=Máx"
                        style="width:70px;border:1.5px solid #27ae60;border-radius:4px;padding:2px 5px;
                            text-align:center;font-weight:700;color:#1e8449;background:white;"
                        id="cb-${eq}-${idx}-pvactual-base"
                        oninput="window._combatePVActualChange('${eq}',${idx},this.value)">
                    <span style="font-size:0.8em;color:#888;">→ <b style="color:#1e8449;font-size:1.1em;">${slot.pv}</b>
                        <span style="color:#aaa;"> / ${slot.pvMax}</span></span>
                </div>
                <div style="display:flex;gap:3px;">
                    ${[1,2,3,4,5].map(n => `
                    <div style="flex:1;text-align:center;">
                        <div style="font-size:0.6em;color:#27ae60;margin-bottom:1px;font-weight:700;">Δ${n}</div>
                        <input type="text" value="${d[`delta_pv_actual_${n}`] || '0'}" placeholder="0"
                            style="width:100%;border:1px solid #a9dfbf;border-radius:4px;padding:2px 1px;
                                text-align:center;font-size:0.8em;font-weight:700;color:#27ae60;background:white;"
                            id="cb-${eq}-${idx}-pv_actual-d${n}"
                            oninput="window._combateRecalcDeltas('${eq}',${idx})">
                    </div>`).join('')}
                </div>
                <!-- Botones rápidos ±PV -->
                <div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center;padding:6px 0 2px;">
                    <span style="font-size:0.68em;font-weight:700;color:#555;margin-right:3px;white-space:nowrap;">PVs:</span>
                    ${[-100,-50,-20,-10,-5,-1,1,5,10,20,50,100].map(dv =>
                        `<button style="font-size:0.65em;padding:2px 5px;cursor:pointer;
                            border:1px solid ${dv > 0 ? '#27ae60' : '#e74c3c'};border-radius:4px;
                            background:${dv > 0 ? '#d5f5e3' : '#fdecea'};
                            color:${dv > 0 ? '#1a5e35' : '#7b241c'};"
                            onclick="window._combateDeltaPV('${eq}',${idx},${dv})">${dv > 0 ? '+' : ''}${dv}</button>`
                    ).join('')}
                </div>
            </div>
        </div>

        <!-- ══ TAGS Y PT ════════════════════════════════════════ -->
        <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:6px;">
                <span style="font-size:0.72em;font-weight:800;color:${col};text-transform:uppercase;letter-spacing:.5px;">Tags y PT</span>
                ${combateState.esAdmin ? `
                <button style="font-size:0.72em;padding:3px 10px;background:${col};color:white;
                    border:none;border-radius:6px;cursor:pointer;"
                    onclick="window._combateToggleCatalogoTags('${eq}',${idx})">+ / − Tag</button>` : ''}
            </div>

            <!-- Catálogo de tags (oculto por defecto) -->
            <div id="catalogo-tags-${eq}-${idx}" style="display:none;margin-bottom:10px;
                border:1.5px solid ${col};border-radius:8px;padding:8px;background:#fafafa;">
                <input class="inp" placeholder="Buscar tag…" style="font-size:0.8em;margin-bottom:6px;"
                    oninput="window._combateFiltrarCatTags('${eq}',${idx},this.value)">
                <div id="cat-tags-lista-${eq}-${idx}"
                    style="display:flex;flex-wrap:wrap;gap:4px;max-height:120px;overflow-y:auto;">
                    ${catalogoTagsArr.map(t => {
                        const tN = (t.startsWith('#') ? t : '#' + t).toLowerCase();
                        const tiene = tagsActivos.has(tN);
                        return `<span data-tag="${esc(t)}"
                            style="cursor:pointer;padding:2px 8px;border-radius:8px;font-size:0.73em;
                                font-weight:700;background:${tiene ? col : '#f1f3f4'};
                                color:${tiene ? 'white' : '#495057'};
                                border:1.5px solid ${tiene ? col : '#dee2e6'};"
                            onclick="window._combateToggleTag('${eq}',${idx},'${esc(t)}')">${esc(t)}</span>`;
                    }).join('')}
                </div>
            </div>

            <!-- Lista PT -->
            <div style="display:flex;flex-direction:column;gap:3px;max-height:230px;overflow-y:auto;">
                ${Object.entries(slot.pts || {}).sort((a, b) => b[1] - a[1]).map(([tag, pts]) => {
                    const tD = tag.startsWith('#') ? tag : '#' + tag;
                    const enT = tagsActivos.has(tD.toLowerCase());
                    return `
                <div style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;
                    background:${enT ? pale : '#f8f9fa'};border:1px solid ${enT ? col + '44' : '#dee2e6'};">
                    <span style="flex:1;font-size:0.78em;font-weight:700;color:${enT ? col : '#888'};">${esc(tD)}</span>
                    <span style="font-size:0.82em;font-weight:800;min-width:28px;text-align:right;">${pts}</span>
                    ${combateState.esAdmin ? `
                    <div style="display:flex;gap:2px;flex-wrap:nowrap;">
                        ${[-100,-50,-20,-10,-5,-1,1,5,10,20,50,100].map(dv =>
                            `<button style="font-size:0.58em;padding:1px 3px;cursor:pointer;
                                border:1px solid ${dv > 0 ? '#27ae60' : '#e74c3c'};border-radius:3px;
                                background:${dv > 0 ? '#d5f5e3' : '#fdecea'};
                                color:${dv > 0 ? '#1a5e35' : '#7b241c'};"
                                onclick="window._combateDeltaPT('${eq}',${idx},'${esc(tD)}',${dv})">${dv > 0 ? '+' : ''}${dv}</button>`
                        ).join('')}
                    </div>` : ''}
                </div>`;
                }).join('') || '<div style="font-size:0.78em;color:#aaa;text-align:center;padding:10px;">Sin PT registrados</div>'}
            </div>
        </div>

        <!-- ══ MEDALLAS (se inyecta desde combate-medallas.js) ══ -->
        <div id="slot-medallas-panel-${eq}-${idx}"></div>

    </div>
</div>`;
}
