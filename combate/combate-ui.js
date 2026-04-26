// ============================================================
// combate/combate-ui.js
// ============================================================
import {
    combateState, STORAGE_URL, norm, crearSlot,
    todosLosPJs, todasLasMedallas, inventarios, catalogoTagsArr
} from './combate-state.js';
import {
    calcPVMax, calcCambios, calcCTLUsado, calcPTTotal,
    getMedallasAccesibles, aplicarDeltaNum, buildCuadroResumen
} from './combate-logic.js';
import { renderMarkup } from '../bnh-markup.js';

const $ = id => document.getElementById(id);
const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fallback = `${STORAGE_URL}/imginterfaz/no_encontrado.png`;

// ── Toast ────────────────────────────────────────────────────
export function toast(msg, tipo = 'ok') {
    const t = $('toast-msg');
    if (!t) return;
    t.textContent = msg;
    t.className = '';
    t.classList.add(tipo === 'ok' ? 'toast-ok' : tipo === 'error' ? 'toast-error' : 'toast-info');
    clearTimeout(t._to);
    t._to = setTimeout(() => { t.className = ''; }, 3500);
}

// ── Render raíz ──────────────────────────────────────────────
export function renderCombate() {
    const wrap = $('vista-combate');
    if (!wrap) return;
    wrap.innerHTML = `
<div style="display:flex;flex-direction:column;gap:14px;">

    <!-- Selector de PJs -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;" id="combate-equipos-grid">
        <div id="equipo-A-wrap">${renderEquipo('A')}</div>
        <div id="equipo-B-wrap">${renderEquipo('B')}</div>
    </div>

    <!-- Slot expandido -->
    <div id="combate-slot-detalle" style="display:none;"></div>

    <!-- Registro de cambios -->
    <div id="combate-registro-wrap">${renderRegistroPanel()}</div>

    <!-- Cuadro resumen -->
    <div id="combate-cuadro-wrap">${renderCuadroResumen()}</div>

</div>`;
}

// ── Render de un equipo ───────────────────────────────────────
function renderEquipo(eq) {
    const slots = combateState[`equipo${eq}`];
    const colorEq = eq === 'A'
        ? { borde:'#1a4a80', fondo:'#ebf5fb', titulo:'#1a4a80', label:'Equipo Azul ⚔' }
        : { borde:'#a93226', fondo:'#fdedec', titulo:'#a93226', label:'Equipo Rojo ⚔' };

    return `
<div style="border:2px solid ${colorEq.borde};border-radius:12px;overflow:hidden;background:${colorEq.fondo};">
    <div style="background:${colorEq.borde};color:white;padding:8px 14px;font-weight:800;font-size:0.82em;
        letter-spacing:.5px;text-transform:uppercase;display:flex;align-items:center;justify-content:space-between;">
        <span>${colorEq.label}</span>
        <span style="font-size:0.8em;opacity:.8;">${slots.filter(Boolean).length} PJ(s)</span>
    </div>
    <div style="padding:10px;display:flex;flex-direction:column;gap:8px;">
        ${slots.map((slot, i) => renderSlotCard(eq, i, slot, colorEq)).join('')}
    </div>
</div>`;
}

// ── Card de un slot ───────────────────────────────────────────
function renderSlotCard(eq, idx, slot, colorEq) {
    const estaActivo = combateState.slotActivoEquipo === eq && combateState.slotActivoIdx === idx;
    const borde = estaActivo ? colorEq.borde : '#dee2e6';

    if (!slot) {
        // Slot vacío: selector de PJ
        const usados = [
            ...combateState.equipoA.filter(Boolean).map(s => s.nombre),
            ...combateState.equipoB.filter(Boolean).map(s => s.nombre),
        ];
        const disponibles = todosLosPJs.filter(p => !usados.includes(p.nombre_refinado));
        return `
<div style="border:1.5px dashed #adb5bd;border-radius:10px;padding:8px;background:rgba(255,255,255,0.7);">
    <select class="inp" style="font-size:0.8em;"
        onchange="window._combateSelPJ('${eq}',${idx},this.value)">
        <option value="">— Seleccionar personaje —</option>
        ${disponibles.map(p => `<option value="${esc(p.nombre_refinado)}">${esc(p.nombre_refinado)}</option>`).join('')}
    </select>
</div>`;
    }

    const pct = slot.pvMax > 0 ? Math.max(0, Math.min(100, (slot.pv / slot.pvMax) * 100)) : 0;
    const pvColor = pct > 60 ? '#1e8449' : pct > 30 ? '#d68910' : '#c0392b';
    const ctlUsado = calcCTLUsado(slot.medallas);
    const imgUrl = `${STORAGE_URL}/imgpersonajes/${norm(slot.nombre)}icon.png`;

    return `
<div style="border:2px solid ${borde};border-radius:10px;background:white;
    box-shadow:${estaActivo ? `0 0 0 3px ${colorEq.borde}44` : '0 1px 3px rgba(0,0,0,0.08)'};
    transition:.15s;cursor:pointer;"
    onclick="window._combateToggleSlot('${eq}',${idx})">

    <!-- Cabecera del slot -->
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #f1f3f4;">
        <img src="${imgUrl}" onerror="this.src='${fallback}'" 
            style="width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid ${colorEq.borde};">
        <div style="flex:1;min-width:0;">
            <div style="font-weight:800;font-size:0.85em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(slot.nombre)}</div>
            <div style="display:flex;align-items:center;gap:4px;margin-top:2px;">
                <div style="flex:1;height:5px;background:#e9ecef;border-radius:3px;overflow:hidden;">
                    <div style="width:${pct}%;height:100%;background:${pvColor};transition:.3s;border-radius:3px;"></div>
                </div>
                <span style="font-size:0.7em;font-weight:700;color:${pvColor};white-space:nowrap;">${slot.pv}/${slot.pvMax}</span>
            </div>
        </div>
        <button style="background:none;border:none;color:#aaa;cursor:pointer;font-size:1em;padding:2px 4px;flex-shrink:0;"
            onclick="event.stopPropagation();window._combateQuitarSlot('${eq}',${idx})">✕</button>
    </div>

    <!-- Stats compactos -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:2px;padding:6px 8px;font-size:0.72em;text-align:center;">
        ${[
            ['POT', slot.pot, '#7d3c00'],
            ['AGI', slot.agi, '#1a4a80'],
            ['CTL', slot.ctl, '#4a235a'],
            ['C/T', calcCambios(slot.agi), '#1e8449'],
            ['PVs', `${slot.pv}/${slot.pvMax}`, pvColor],
        ].map(([lbl, val, col]) => `
        <div style="background:#f8f9fa;border-radius:6px;padding:3px 2px;">
            <div style="font-weight:800;color:${col};">${val}</div>
            <div style="color:#adb5bd;font-size:0.85em;">${lbl}</div>
        </div>`).join('')}
    </div>

    <!-- Medallas equipadas en este slot -->
    ${slot.medallas.length ? `
    <div style="padding:0 8px 6px;display:flex;flex-wrap:wrap;gap:3px;">
        ${slot.medallas.map(m => `
        <span style="font-size:0.68em;background:#f5eeff;color:#6c3483;border:1px solid #c8a8e9;
            padding:1px 6px;border-radius:6px;font-weight:700;" title="${esc(m.efecto_desc||'')}">
            ${esc(m.nombre)} <span style="opacity:.6;">${m.costo_ctl}C</span>
        </span>`).join('')}
        <span style="font-size:0.68em;color:#aaa;padding:1px 4px;">CTL ${ctlUsado}/${slot.ctl}</span>
    </div>` : ''}

    <!-- Dados: una celda por medalla -->
    ${slot.medallas.length ? `
    <div style="padding:0 8px 8px;display:flex;flex-wrap:wrap;gap:4px;" onclick="event.stopPropagation()">
        ${slot.medallas.map(m => {
            const v = slot.dados[m.id] || '';
            return `
        <div style="display:flex;align-items:center;gap:3px;">
            <span style="font-size:0.65em;color:#888;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(m.nombre)}">${esc(m.nombre.slice(0,10))}…</span>
            <input type="number" min="1" max="100" placeholder="d100"
                style="width:52px;padding:2px 4px;border:1.5px solid #dee2e6;border-radius:5px;font-size:0.75em;text-align:center;font-weight:700;"
                value="${v}"
                onchange="window._combateSetDado('${eq}',${idx},'${m.id}',this.value)">
        </div>`;
        }).join('')}
    </div>` : ''}

</div>`;
}

// ── Slot expandido (edición) ──────────────────────────────────
export function renderSlotDetalle(eq, idx) {
    const wrap = $('combate-slot-detalle');
    if (!wrap) return;
    const slot = combateState[`equipo${eq}`][idx];
    if (!slot) { wrap.style.display = 'none'; return; }

    const colorEq = eq === 'A' ? '#1a4a80' : '#a93226';
    const colorPale = eq === 'A' ? '#ebf5fb' : '#fdedec';

    // Tags con PTs
    const tagsConPT = Object.entries(slot.pts || {})
        .map(([tag, pts]) => ({ tag, pts }))
        .sort((a, b) => b.pts - a.pts);

    // Catálogo de tags disponibles (para agregar/quitar)
    const tagsActivos = new Set((slot.tags || []).map(t => (t.startsWith('#') ? t : '#' + t).toLowerCase()));

    // Medallas accesibles
    const medallasAcc = getMedallasAccesibles(slot);
    const medallasEquip = new Set((slot.medallas || []).map(m => m.id));

    const ctlUsado = calcCTLUsado(slot.medallas);

    wrap.style.display = 'block';
    wrap.innerHTML = `
<div style="background:white;border:2px solid ${colorEq};border-radius:12px;overflow:hidden;">
    <!-- Header -->
    <div style="background:${colorEq};color:white;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-weight:800;font-size:0.9em;">✏️ Editando: ${esc(slot.nombre)}</span>
        <button style="background:rgba(255,255,255,0.2);border:none;color:white;border-radius:50%;width:26px;height:26px;cursor:pointer;font-size:1em;"
            onclick="window._combateToggleSlot('${eq}',${idx})">×</button>
    </div>

    <div style="padding:14px;display:flex;flex-direction:column;gap:16px;">

        <!-- Stats editables -->
        <div>
            <div style="font-size:0.72em;font-weight:800;color:${colorEq};text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Stats en combate</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;">
                ${[
                    { k:'pv', lbl:'PVs (actual)', sub:`Máx: ${slot.pvMax}` },
                    { k:'pot', lbl:'POT', sub:`Base: ${slot.potBase}` },
                    { k:'agi', lbl:'AGI', sub:`Base: ${slot.agiBase}` },
                    { k:'ctl', lbl:'CTL', sub:`Base: ${slot.ctlBase}` },
                ].map(f => `
                <div style="background:#f8f9fa;border-radius:8px;padding:8px 10px;">
                    <div style="font-size:0.7em;color:#888;margin-bottom:3px;">${f.lbl} <span style="opacity:.6;">${f.sub}</span></div>
                    <div style="display:flex;align-items:center;gap:4px;">
                        <span style="font-size:1.1em;font-weight:800;color:${colorEq};min-width:32px;">${slot[f.k]}</span>
                        ${combateState.esAdmin ? `
                        <div style="display:flex;flex-direction:column;gap:2px;">
                            ${[-100,-50,-20,-10,-5,-1,1,5,10,20,50,100].map(d =>
                                `<button style="font-size:0.6em;padding:1px 4px;border:1px solid #dee2e6;border-radius:3px;background:${d>0?'#d5f5e3':'#fdecea'};color:${d>0?'#1e8449':'#c0392b'};cursor:pointer;line-height:1.4;"
                                    onclick="window._combateDeltaStat('${eq}',${idx},'${f.k}',${d})">${d>0?'+':''}${d}</button>`
                            ).join('')}
                        </div>` : ''}
                    </div>
                </div>`).join('')}
            </div>
            ${combateState.esAdmin ? `
            <!-- Delta libre -->
            <div style="margin-top:8px;padding:8px 10px;background:#f8f9fa;border-radius:8px;">
                <div style="font-size:0.72em;font-weight:700;color:#555;margin-bottom:6px;">Delta libre (ej: x2, ^1.5, +8, -3)</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    ${['pv','pot','agi','ctl'].map(k => `
                    <div style="display:flex;align-items:center;gap:4px;">
                        <span style="font-size:0.75em;font-weight:700;color:#666;">${k.toUpperCase()}</span>
                        <input class="inp" placeholder="delta" style="width:70px;font-size:0.8em;padding:4px 6px;"
                            id="delta-libre-${eq}-${idx}-${k}"
                            onkeydown="if(event.key==='Enter')window._combateDeltaLibre('${eq}',${idx},'${k}',this.value,this)">
                        <button style="padding:3px 8px;font-size:0.75em;border:1px solid #dee2e6;border-radius:5px;background:white;cursor:pointer;"
                            onclick="window._combateDeltaLibre('${eq}',${idx},'${k}',document.getElementById('delta-libre-${eq}-${idx}-${k}').value,document.getElementById('delta-libre-${eq}-${idx}-${k}'))">OK</button>
                    </div>`).join('')}
                </div>
            </div>` : ''}
        </div>

        <!-- Tags y PTs -->
        <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <div style="font-size:0.72em;font-weight:800;color:${colorEq};text-transform:uppercase;letter-spacing:.5px;">Tags y PT</div>
                ${combateState.esAdmin ? `
                <button style="font-size:0.72em;padding:3px 10px;background:${colorEq};color:white;border:none;border-radius:6px;cursor:pointer;"
                    onclick="window._combateToggleCatalogoTags('${eq}',${idx})">+ / − Tag</button>` : ''}
            </div>

            <!-- Catálogo de tags (oculto por defecto) -->
            <div id="catalogo-tags-${eq}-${idx}" style="display:none;margin-bottom:10px;max-height:180px;overflow-y:auto;
                border:1.5px solid ${colorEq};border-radius:8px;padding:8px;background:#fafafa;">
                <input class="inp" placeholder="Buscar tag…" style="font-size:0.8em;margin-bottom:6px;"
                    oninput="window._combateFiltrarCatTags('${eq}',${idx},this.value)">
                <div id="cat-tags-lista-${eq}-${idx}" style="display:flex;flex-wrap:wrap;gap:4px;">
                    ${catalogoTagsArr.map(t => {
                        const tN = (t.startsWith('#') ? t : '#' + t).toLowerCase();
                        const tiene = tagsActivos.has(tN);
                        return `<span data-tag="${esc(t)}" data-tiene="${tiene}"
                            style="cursor:pointer;padding:2px 8px;border-radius:8px;font-size:0.73em;font-weight:700;
                            background:${tiene ? colorEq : '#f1f3f4'};color:${tiene ? 'white' : '#495057'};
                            border:1.5px solid ${tiene ? colorEq : '#dee2e6'};"
                            onclick="window._combateToggleTag('${eq}',${idx},'${esc(t)}')">${esc(t)}</span>`;
                    }).join('')}
                </div>
            </div>

            <!-- Lista de tags con PTs editables -->
            <div style="display:flex;flex-direction:column;gap:3px;max-height:280px;overflow-y:auto;">
                ${tagsConPT.length ? tagsConPT.map(({ tag, pts }) => {
                    const tDisp = tag.startsWith('#') ? tag : '#' + tag;
                    const enTags = tagsActivos.has(tDisp.toLowerCase());
                    return `
                <div style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;
                    background:${enTags ? colorPale : '#f8f9fa'};border:1px solid ${enTags ? colorEq+'44' : '#dee2e6'};">
                    <span style="flex:1;font-size:0.78em;font-weight:700;color:${enTags ? colorEq : '#888'};">${esc(tDisp)}</span>
                    <span style="font-size:0.8em;font-weight:800;min-width:28px;text-align:right;">${pts}</span>
                    ${combateState.esAdmin ? `
                    <div style="display:flex;gap:2px;">
                        ${[-100,-50,-20,-10,-5,-1,1,5,10,20,50,100].map(d =>
                            `<button style="font-size:0.6em;padding:1px 3px;border:1px solid #dee2e6;border-radius:3px;
                                background:${d>0?'#d5f5e3':'#fdecea'};color:${d>0?'#1e8449':'#c0392b'};cursor:pointer;"
                                onclick="window._combateDeltaPT('${eq}',${idx},'${esc(tDisp)}',${d})">${d>0?'+':''}${d}</button>`
                        ).join('')}
                    </div>` : ''}
                </div>`;
                }).join('') : `<div style="font-size:0.78em;color:#aaa;text-align:center;padding:10px;">Sin PT registrados</div>`}
            </div>
        </div>

        <!-- Medallas: equipadas + catálogo virtual -->
        <div>
            <div style="font-size:0.72em;font-weight:800;color:${colorEq};text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">
                Medallas — CTL ${ctlUsado}/${slot.ctl}
                <span style="font-size:0.85em;font-weight:500;color:#aaa;text-transform:none;">(simulación: puede superar límite)</span>
            </div>
            <div style="max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;">
                ${medallasAcc.map(m => {
                    const eq2 = medallasEquip.has(m.id);
                    return `
                <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:8px;
                    border:1.5px solid ${eq2 ? colorEq : '#dee2e6'};background:${eq2 ? colorPale : 'white'};">
                    <input type="checkbox" ${eq2 ? 'checked' : ''} style="margin-top:2px;accent-color:${colorEq};"
                        onchange="window._combateToggleMedalla('${eq}',${idx},'${m.id}',this.checked)">
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:0.8em;font-weight:700;">${esc(m.nombre)}
                            <span style="font-size:0.85em;color:#888;font-weight:500;">${m.costo_ctl}C · ${m.tipo}</span>
                        </div>
                        <div style="font-size:0.73em;color:#666;margin-top:2px;">${renderMarkup(m.efecto_desc || '')}</div>
                    </div>
                </div>`;
                }).join('')}
                ${!medallasAcc.length ? `<div style="font-size:0.78em;color:#aaa;text-align:center;padding:10px;">Sin medallas accesibles con los tags y PT actuales</div>` : ''}
            </div>
        </div>

    </div>
</div>`;
}

// ── Panel de registro ─────────────────────────────────────────
export function renderRegistroPanel() {
    const reg = combateState.registro;
    const lineas = reg.map(entry => {
        const cambiosStr = (entry.cambios || []).map(c => c.etiqueta).join(' ');
        return `${entry.nombre} ${cambiosStr}`;
    });
    const texto = lineas.join('\n') || '(sin cambios aún)';

    return `
<div style="background:white;border:1.5px solid #dee2e6;border-radius:12px;overflow:hidden;">
    <div style="background:#212529;color:white;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-weight:800;font-size:0.82em;letter-spacing:.5px;">📋 REGISTRO DE CAMBIOS</span>
        <div style="display:flex;gap:6px;">
            <button style="font-size:0.75em;padding:3px 10px;background:rgba(255,255,255,0.15);color:white;border:1px solid rgba(255,255,255,0.3);border-radius:6px;cursor:pointer;"
                onclick="window._combateCopiarRegistro()">📋 Copiar texto</button>
            <button style="font-size:0.75em;padding:3px 10px;background:#c0392b;color:white;border:none;border-radius:6px;cursor:pointer;"
                onclick="window._combateLimpiarRegistro()">🗑 Limpiar</button>
        </div>
    </div>
    <pre id="combate-registro-txt" style="font-family:'Inter',monospace;font-size:0.82em;padding:12px 16px;
        white-space:pre-wrap;word-break:break-word;min-height:60px;max-height:220px;overflow-y:auto;
        margin:0;background:#f8f9fa;color:#212529;line-height:1.6;">${esc(texto)}</pre>
</div>`;
}

// ── Cuadro resumen ────────────────────────────────────────────
export function renderCuadroResumen() {
    const slotsA = combateState.equipoA;
    const slotsB = combateState.equipoB;
    const actA = slotsA.filter(Boolean);
    const actB = slotsB.filter(Boolean);

    if (!actA.length && !actB.length) return `
<div style="background:white;border:1.5px solid #dee2e6;border-radius:12px;padding:20px;text-align:center;color:#aaa;font-size:0.85em;">
    El cuadro resumen aparecerá cuando haya al menos un personaje en combate.
</div>`;

    const maxA = actA.length;
    const maxB = actB.length;

    const stats = [
        { lbl:'PVs',      fmt: s => `${s.pv}/${s.pvMax}` },
        { lbl:'POT',      fmt: s => String(s.pot) },
        { lbl:'AGI',      fmt: s => String(s.agi) },
        { lbl:'CTL',      fmt: s => String(s.ctl) },
        { lbl:'C/T',      fmt: s => String(calcCambios(s.agi)) },
        { lbl:'PT Total', fmt: s => String(calcPTTotal(s.pts)) },
        { lbl:'Medallas', fmt: s => String(s.medallas?.length || 0) },
    ];

    const colA = '#1a4a80';
    const colB = '#a93226';
    const paleA = '#dbeafe';
    const paleB = '#fde8e8';

    // Construir tabla
    const thStyle = (col, pale) => `padding:5px 8px;font-size:0.72em;font-weight:800;text-align:center;background:${col};color:white;white-space:nowrap;`;
    const tdStyle = (pale) => `padding:4px 8px;font-size:0.78em;text-align:center;background:${pale};font-weight:600;`;
    const tdLbl   = `padding:4px 10px;font-size:0.72em;font-weight:700;color:#495057;text-align:right;white-space:nowrap;background:#f8f9fa;`;

    let thead = `<tr><th style="${tdLbl}background:#fff;"></th>`;
    actA.forEach(s => thead += `<th style="${thStyle(colA, paleA)}">${esc(s.nombre)}</th>`);
    actB.forEach(s => thead += `<th style="${thStyle(colB, paleB)}">${esc(s.nombre)}</th>`);
    thead += '</tr>';

    let tbody = '';
    stats.forEach(st => {
        tbody += `<tr><td style="${tdLbl}">${st.lbl}</td>`;
        actA.forEach(s => tbody += `<td style="${tdStyle(paleA)}">${esc(st.fmt(s))}</td>`);
        actB.forEach(s => tbody += `<td style="${tdStyle(paleB)}">${esc(st.fmt(s))}</td>`);
        tbody += '</tr>';
    });

    return `
<div style="background:white;border:1.5px solid #dee2e6;border-radius:12px;overflow:hidden;">
    <div style="padding:8px 14px;display:flex;align-items:center;justify-content:space-between;background:#212529;color:white;">
        <span style="font-weight:800;font-size:0.82em;letter-spacing:.5px;">📊 CUADRO RESUMEN</span>
        <button style="font-size:0.75em;padding:3px 10px;background:rgba(255,255,255,0.15);color:white;border:1px solid rgba(255,255,255,0.3);border-radius:6px;cursor:pointer;"
            onclick="window._combateCopiarCuadro()">📋 Copiar texto</button>
    </div>
    <div style="overflow-x:auto;">
        <table id="combate-tabla-resumen" style="border-collapse:collapse;width:100%;min-width:400px;">
            <thead>${thead}</thead>
            <tbody>${tbody}</tbody>
        </table>
    </div>
    <div style="padding:8px 14px;border-top:1px solid #dee2e6;display:flex;gap:8px;justify-content:flex-end;">
        <button style="font-size:0.75em;padding:4px 14px;background:#212529;color:white;border:none;border-radius:6px;cursor:pointer;"
            onclick="window._combateCopiarImagenCuadro()">🖼 Copiar como imagen</button>
    </div>
</div>`;
}

// ── Refrescos parciales ───────────────────────────────────────
export function refrescarEquipo(eq) {
    const wrap = $(`equipo-${eq}-wrap`);
    if (wrap) wrap.innerHTML = renderEquipo(eq);
}

export function refrescarRegistro() {
    const wrap = $('combate-registro-wrap');
    if (wrap) wrap.innerHTML = renderRegistroPanel();
}

export function refrescarCuadro() {
    const wrap = $('combate-cuadro-wrap');
    if (wrap) wrap.innerHTML = renderCuadroResumen();
}

export function refrescarTodo() {
    refrescarEquipo('A');
    refrescarEquipo('B');
    refrescarRegistro();
    refrescarCuadro();
    // Si hay slot activo, refrescarlo también
    if (combateState.slotActivoEquipo !== null) {
        renderSlotDetalle(combateState.slotActivoEquipo, combateState.slotActivoIdx);
    }
}
