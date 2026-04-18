// ============================================================
// fichas-op.js — Panel OP centrado en GRUPOS + editor de aliases
// ============================================================
import { gruposGlobal, aliasesGlobal, ptGlobal, fichasUI, STORAGE_URL, norm } from './fichas-state.js';
import { calcPVMax, fmtTag } from './fichas-logic.js';
import {
    guardarStatsGrupo, guardarLoreGrupo, guardarTagsGrupo, borrarPTDeTag,
    renombrarGrupo, eliminarGrupo,
    crearAlias, asignarAlias, eliminarAlias,
    aplicarDeltaPT, crearGrupo
} from './fichas-data.js';
import { activarFusion, terminarFusion, getFusionDe, cargarFusiones } from '../bnh-fusion.js';
import { supabase } from '../bnh-auth.js';
import { initMarkupTextarea } from './fichas-markup.js';
import { crearTagInput, TAGS_CANONICOS } from '../bnh-tags.js';

// ── Modal ─────────────────────────────────────────────────────
function abrirModal(titulo, html) {
    let ov = document.getElementById('op-overlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'op-overlay';
        ov.className = 'op-modal-overlay';
        ov.onclick = e => { if (e.target===ov) cerrarModal(); };
        document.body.appendChild(ov);
    }
    ov.innerHTML = `
    <div class="op-modal">
        <div class="op-modal-header">
            <span class="op-modal-title">${titulo}</span>
            <button class="op-modal-close" onclick="window._cerrarOP()">×</button>
        </div>
        <div id="op-body">${html}</div>
    </div>`;
    ov.style.display = 'flex';
}
function cerrarModal() {
    const ov = document.getElementById('op-overlay');
    if (ov) ov.style.display = 'none';
}
window._cerrarOP = cerrarModal;

function setMsg(id, txt, ok) {
    const el = document.getElementById(id);
    if (el) { el.className='op-msg '+(ok?'ok':'err'); el.textContent = txt; }
}

// ── Panel principal del GRUPO ─────────────────────────────────
export function abrirPanelOP(nombreGrupo) {
    const g = gruposGlobal.find(x => x.nombre_refinado === nombreGrupo);
    if (!g) return;

    const pot  = g.pot||0, agi = g.agi||0, ctl = g.ctl||0;
    const pvMax = calcPVMax(pot, agi, ctl);
    const potA  = g.pot_actual ?? pot;
    const agiA  = g.agi_actual ?? agi;
    const ctlA  = g.ctl_actual ?? ctl;

    const tabs = ['Stats','Tags & PT','Lore','Fusión','Grupo'].map((t,i)=>
        `<button class="op-tab${i===0?' active':''}" id="op-tab-${i}" onclick="window._opTab(${i})">${t}</button>`
    ).join('');

    const html = `
    <div class="op-tabs">${tabs}</div>

    <!-- TAB 0: STATS -->
    <div id="op-p0">
        <p class="stat-hint">
            <b>Total</b> = base permanente (determina Tier y PV Máx).<br>
            <b>Actual</b> = valor en este momento (puede variar en combate).<br>
            Si Actual = Total, la ficha muestra solo el número. Si difieren, muestra <span style="color:#2980b9;">Actual</span>/Total.
        </p>
        <div class="stats-grid">
            <div class="stat-field"><label>POT Total</label>
                <input id="op-pot-t" type="number" value="${pot}" oninput="window._opRecalcPV()"></div>
            <div class="stat-field"><label style="color:#2980b9;">POT Actual</label>
                <input id="op-pot-a" type="number" class="actual" value="${potA}"></div>
            <div class="stat-field"><label>AGI Total</label>
                <input id="op-agi-t" type="number" value="${agi}" oninput="window._opRecalcPV()"></div>
            <div class="stat-field"><label style="color:#2980b9;">AGI Actual</label>
                <input id="op-agi-a" type="number" class="actual" value="${agiA}"></div>
            <div class="stat-field"><label>CTL Total</label>
                <input id="op-ctl-t" type="number" value="${ctl}" oninput="window._opRecalcPV()"></div>
            <div class="stat-field"><label style="color:#2980b9;">CTL Actual</label>
                <input id="op-ctl-a" type="number" class="actual" value="${ctlA}"></div>
            <div class="stat-field"><label>PV Máx <span id="op-pvm" style="color:var(--green);">(${pvMax})</span></label>
                <input id="op-pv-max" type="number" value="${pvMax}" readonly
                    style="background:var(--gray-100);color:var(--gray-500);cursor:not-allowed;"></div>
            <div class="stat-field"><label style="color:#2980b9;">PV Actual</label>
                <input id="op-pv-a" type="number" class="actual" value="${g.pv_actual??pvMax}"></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="op-btn op-btn-green" onclick="window._opGuardarStats('${g.id}')">💾 Guardar</button>
            <button class="op-btn op-btn-blue"  onclick="window._opRestaurarPV('${g.id}')">↺ Restaurar PV</button>
            <button class="op-btn op-btn-gray"  onclick="window._opIgualarActualTotal('${g.id}')">= Igualar Actual a Total</button>
        </div>
        <div id="msg-stats" class="op-msg"></div>
    </div>

    <!-- TAB 1: TAGS & PT -->
    <div id="op-p1" style="display:none;">
        <div style="font-size:0.78em;font-weight:600;color:var(--gray-700);margin-bottom:6px;">Tags actuales</div>
        <div class="tags-chips" id="op-chips">${_chipsHTML(g.id, g.tags||[], ptGlobal[nombreGrupo]||{})}</div>
        <div id="op-tag-inp-wrap" style="margin-bottom:6px;"></div>

        <div style="font-size:0.72em;font-weight:600;color:var(--gray-500);margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px;">
            Tags a asignar <span style="font-weight:400;color:var(--gray-400);">(click para agregar)</span>
        </div>
        <div id="op-tags-pool" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;max-height:120px;overflow-y:auto;padding:4px 0;"></div>

        <div id="msg-tags" class="op-msg"></div>
        <hr style="border:none;border-top:1px solid var(--gray-200);margin:12px 0 10px;">

        <div style="font-size:0.78em;font-weight:600;color:var(--gray-700);margin-bottom:6px;">
            Delta PT Manual <span style="font-weight:400;color:var(--gray-400);font-size:0.9em;">(selecciona tags → aplica a todos)</span>
        </div>
        <div id="op-pt-pool" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;max-height:110px;overflow-y:auto;padding:4px 0;"></div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px;">
            <span class="op-label" style="flex:none;">Delta (±)</span>
            <input id="op-pt-d" type="number" class="op-input" value="1" style="width:70px;">
            <span class="op-label" style="flex:none;">Motivo</span>
            <select id="op-pt-m" class="op-select" style="flex:1;min-width:140px;">
                <option value="interaccion">Interacción</option>
                <option value="fusion">Fusión</option>
                <option value="gasto_stat">Gasto Stat (−50)</option>
                <option value="gasto_medalla">Gasto Medalla (−75)</option>
                <option value="gasto_mutacion">Gasto Mutación (−100)</option>
                <option value="manual">Manual libre</option>
            </select>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
            <button class="op-btn op-btn-blue" onclick="window._opAplicarPT('${nombreGrupo.replace(/'/g,"\\'")}')">Aplicar a seleccionados</button>
            <span id="op-pt-sel-count" style="font-size:0.78em;color:var(--gray-500);"></span>
        </div>
        <div id="msg-pt" class="op-msg"></div>
    </div>

    <!-- TAB 2: LORE -->
    <div id="op-p2" style="display:none;">
        <div style="font-size:0.72em;color:var(--gray-500);margin-bottom:8px;line-height:1.6;">
            <span style="color:var(--green);font-weight:700;">@Nombre</span> → ficha &nbsp;·&nbsp;
            <span style="color:var(--red);font-weight:700;">#Tag</span> → tags &nbsp;·&nbsp;
            <span style="color:#1a4a80;font-weight:700;">!Medalla</span> → medallas<br>
            <span style="color:var(--gray-400);">Tab/Enter = autocompletar · ↑↓ = navegar</span>
        </div>

        <label style="font-size:0.78em;font-weight:600;color:var(--gray-700);display:block;margin-bottom:4px;">Descripción</label>
        <textarea id="op-descripcion" rows="3" class="op-input" style="resize:vertical;line-height:1.6;font-family:monospace;margin-bottom:10px;">${escTA(g.descripcion||'')}</textarea>

        <label style="font-size:0.78em;font-weight:600;color:var(--gray-700);display:block;margin-bottom:4px;">Historia / Lore</label>
        <textarea id="op-lore" rows="5" class="op-input" style="resize:vertical;line-height:1.6;font-family:monospace;margin-bottom:10px;">${escTA(g.lore||'')}</textarea>

        <label style="font-size:0.78em;font-weight:600;color:var(--gray-700);display:block;margin-bottom:4px;">Personalidad</label>
        <textarea id="op-personalidad" rows="3" class="op-input" style="resize:vertical;line-height:1.6;font-family:monospace;margin-bottom:10px;">${escTA(g.personalidad||'')}</textarea>

        <label style="font-size:0.78em;font-weight:600;color:var(--gray-700);display:block;margin-bottom:4px;">Quirk / Habilidad</label>
        <textarea id="op-quirk" rows="4" class="op-input" style="resize:vertical;line-height:1.6;font-family:monospace;margin-bottom:12px;">${escTA(g.quirk||'')}</textarea>

        <hr style="border:none;border-top:1px solid var(--gray-200);margin:0 0 12px;">
        <div style="font-size:0.78em;font-weight:600;color:var(--gray-700);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">
            Información extra <span style="font-weight:400;color:var(--gray-400);">(opcional — solo aparece si tiene contenido)</span>
        </div>
        <div class="op-row" style="margin-bottom:6px;">
            <span class="op-label" style="min-width:110px;font-size:0.72em;">Estado</span>
            <input type="text" id="op-info-estado" class="op-input" placeholder="Opcional…"
                style="flex:1;padding:5px 8px;font-size:0.82em;"
                value="${escTA((g.info_extra||{})['estado']||'')}">
        </div>
        <div class="op-row" style="margin-bottom:6px;">
            <span class="op-label" style="min-width:110px;font-size:0.72em;">Edad</span>
            <input type="text" id="op-info-edad" class="op-input" placeholder="Opcional…"
                style="flex:1;padding:5px 8px;font-size:0.82em;"
                value="${escTA((g.info_extra||{})['edad']||'')}">
        </div>
        <div class="op-row" style="margin-bottom:6px;">
            <span class="op-label" style="min-width:110px;font-size:0.72em;">Altura</span>
            <input type="text" id="op-info-altura" class="op-input" placeholder="Opcional…"
                style="flex:1;padding:5px 8px;font-size:0.82em;"
                value="${escTA((g.info_extra||{})['altura']||'')}">
        </div>
        <div class="op-row" style="margin-bottom:6px;">
            <span class="op-label" style="min-width:110px;font-size:0.72em;">Peso</span>
            <input type="text" id="op-info-peso" class="op-input" placeholder="Opcional…"
                style="flex:1;padding:5px 8px;font-size:0.82em;"
                value="${escTA((g.info_extra||{})['peso']||'')}">
        </div>
        <div class="op-row" style="margin-bottom:6px;">
            <span class="op-label" style="min-width:110px;font-size:0.72em;">Género</span>
            <input type="text" id="op-info-genero" class="op-input" placeholder="Opcional…"
                style="flex:1;padding:5px 8px;font-size:0.82em;"
                value="${escTA((g.info_extra||{})['genero']||'')}">
        </div>
        <div class="op-row" style="margin-bottom:6px;">
            <span class="op-label" style="min-width:110px;font-size:0.72em;">Lugar de nacimiento</span>
            <input type="text" id="op-info-lugar_nac" class="op-input" placeholder="Opcional…"
                style="flex:1;padding:5px 8px;font-size:0.82em;"
                value="${escTA((g.info_extra||{})['lugar_nac']||'')}">
        </div>
        <div class="op-row" style="margin-bottom:6px;">
            <span class="op-label" style="min-width:110px;font-size:0.72em;">Ocupación</span>
            <input type="text" id="op-info-ocupacion" class="op-input" placeholder="Opcional…"
                style="flex:1;padding:5px 8px;font-size:0.82em;"
                value="${escTA((g.info_extra||{})['ocupacion']||'')}">
        </div>
        <div class="op-row" style="margin-bottom:6px;">
            <span class="op-label" style="min-width:110px;font-size:0.72em;">Afiliación</span>
            <input type="text" id="op-info-afiliacion" class="op-input" placeholder="Opcional…"
                style="flex:1;padding:5px 8px;font-size:0.82em;"
                value="${escTA((g.info_extra||{})['afiliacion']||'')}">
        </div>
        <div class="op-row" style="margin-bottom:6px;">
            <span class="op-label" style="min-width:110px;font-size:0.72em;">Familia</span>
            <input type="text" id="op-info-familia" class="op-input" placeholder="Opcional…"
                style="flex:1;padding:5px 8px;font-size:0.82em;"
                value="${escTA((g.info_extra||{})['familia']||'')}">
        </div>
        <div class="op-row" style="margin-bottom:6px;">
            <span class="op-label" style="min-width:110px;font-size:0.72em;">Nota extra</span>
            <input type="text" id="op-info-nota" class="op-input" placeholder="Opcional…"
                style="flex:1;padding:5px 8px;font-size:0.82em;"
                value="${escTA((g.info_extra||{})['nota']||'')}">
        </div>

        <button class="op-btn op-btn-green" style="margin-top:12px;" onclick="window._opGuardarLore('${g.id}')">💾 Guardar</button>
        <div id="msg-lore" class="op-msg"></div>
    </div>

        <!-- TAB 3: FUSIÓN -->
    <div id="op-p3" style="display:none;">${_fusionHTML(nombreGrupo)}</div>

    <!-- TAB 4: GRUPO (renombrar, aliases, fusionar grupos, eliminar) -->
    <div id="op-p4" style="display:none;">${_grupoHTML(g)}</div>`;

    abrirModal(`⚙️ ${g.nombre_refinado}`, html);

    ['op-pot-t','op-agi-t','op-ctl-t'].forEach(id => {
        setTimeout(()=>{ document.getElementById(id)?.addEventListener('input', window._opRecalcPV); }, 50);
    });

    // Montar tab 1: widget input + pool de tags sugeridos + pool PT
    setTimeout(() => {
        const wrap = document.getElementById('op-tag-inp-wrap');
        if (wrap) {
            const g2 = gruposGlobal.find(x => x.nombre_refinado === nombreGrupo);
            const widget = crearTagInput('op-tag-inp', g2?.tags || [], (tag) => {
                window._opAddTag(g.id, nombreGrupo, tag);
            });
            wrap.appendChild(widget.el);
        }
        window._opRefreshTab1Pools(g.id, nombreGrupo);
    }, 60);
}

// Construye y refresca los dos pools del tab 1
window._opRefreshTab1Pools = (grupoId, nombreGrupo) => {
    const g = gruposGlobal.find(x => x.id === grupoId);
    if (!g) return;
    const tagsActuales = new Set((g.tags||[]).map(t => t.startsWith('#')?t:'#'+t));

    // Índice de cuántos grupos tienen cada tag (para mostrar popularidad)
    const tagCount = {};
    gruposGlobal.forEach(gr => {
        (gr.tags||[]).forEach(t => {
            const k = t.startsWith('#')?t:'#'+t;
            tagCount[k] = (tagCount[k]||0)+1;
        });
    });

    // ── Pool de tags a asignar (40 aleatorios de los que NO tiene) ──
    const poolAsignar = document.getElementById('op-tags-pool');
    if (poolAsignar) {
        const disponibles = TAGS_CANONICOS
            .filter(t => !tagsActuales.has(t.startsWith('#')?t:'#'+t))
            .sort(() => Math.random() - 0.5)
            .slice(0, 40);

        poolAsignar.innerHTML = disponibles.length
            ? disponibles.map(t => {
                const cnt = tagCount[t.startsWith('#')?t:'#'+t] || 0;
                return `<span onclick="window._opAddTag('${grupoId}','${nombreGrupo.replace(/'/g,"\'")}','${t.replace(/'/g,"\'")}');window._opRefreshTab1Pools('${grupoId}','${nombreGrupo.replace(/'/g,"\'")}');"
                    style="background:#fdf2f2;border:1px solid #e74c3c;color:#c0392b;padding:2px 7px;
                    border-radius:8px;font-size:0.7em;cursor:pointer;white-space:nowrap;
                    transition:opacity .15s;" onmouseover="this.style.opacity='.7'" onmouseout="this.style.opacity='1'">
                    ${t}${cnt?' <span style=\"color:#aaa\">('+cnt+')</span>':''}
                </span>`;
            }).join('')
            : '<span style="color:var(--gray-400);font-size:0.78em;">Ya tiene todos los tags del catálogo</span>';
    }

    // ── Pool de tags para Delta PT (todos los tags del personaje, multiseleccionable) ──
    const poolPT = document.getElementById('op-pt-pool');
    if (poolPT) {
        if (!window._opPTSel) window._opPTSel = new Set();
        window._opPTSel.clear();
        const ptDePJ = ptGlobal[nombreGrupo] || {};

        poolPT.innerHTML = (g.tags||[]).length
            ? (g.tags||[]).map(t => {
                const tf = t.startsWith('#')?t:'#'+t;
                const pts = ptDePJ[t]||ptDePJ[tf]||0;
                return `<span id="op-ptchip-${tf.replace(/[^a-zA-Z0-9]/g,'_')}"
                    onclick="window._opTogglePTTag('${tf.replace(/'/g,"\'")}')"
                    style="background:#eaf4ff;border:1px solid #2980b9;color:#1a4a80;padding:2px 8px;
                    border-radius:8px;font-size:0.72em;cursor:pointer;transition:all .15s;">
                    ${tf} <span style="color:#888;font-size:0.85em;">${pts}pt</span>
                </span>`;
            }).join('')
            : '<span style="color:var(--gray-400);font-size:0.78em;">Sin tags</span>';

        const cnt = document.getElementById('op-pt-sel-count');
        if (cnt) cnt.textContent = '';
    }
};

window._opTogglePTTag = (tag) => {
    if (!window._opPTSel) window._opPTSel = new Set();
    const id = 'op-ptchip-' + tag.replace(/[^a-zA-Z0-9]/g,'_');
    const el = document.getElementById(id);
    if (window._opPTSel.has(tag)) {
        window._opPTSel.delete(tag);
        if (el) { el.style.background='#eaf4ff'; el.style.borderColor='#2980b9'; el.style.color='#1a4a80'; }
    } else {
        window._opPTSel.add(tag);
        if (el) { el.style.background='#1a4a80'; el.style.borderColor='#1a4a80'; el.style.color='white'; }
    }
    const cnt = document.getElementById('op-pt-sel-count');
    if (cnt) cnt.textContent = window._opPTSel.size ? `${window._opPTSel.size} tag(s) seleccionado(s)` : '';
};

function _chipsHTML(grupoId, tags, ptDePJ) {
    if (!tags.length) return `<span style="color:var(--gray-400);font-size:0.82em;">Sin tags</span>`;
    return tags.map(t => {
        const pts = ptDePJ[t]||0, tf = t.startsWith('#')?t:'#'+t;
        return `<span class="tag-chip">${tf} <span class="tag-chip-pts">${pts}pt</span>
            <button class="tag-chip-rm" onclick="window._opRmTag('${grupoId}','${t.replace(/'/g,"\\'")}')" title="Quitar">×</button>
        </span>`;
    }).join('');
}

function _fusionHTML(nombreGrupo) {
    const f = getFusionDe(nombreGrupo);
    if (f) {
        const comp = f.pj_a===nombreGrupo?f.pj_b:f.pj_a;
        return `<div class="fusion-card">
            <div class="fusion-card-title">⚡ En fusión con <b>${comp}</b></div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">
                ${(f.tags_fusionados||[]).map(t=>`<span style="background:#f5eeff;border:1px solid #9b59b6;color:#6c3483;padding:2px 8px;border-radius:8px;font-size:0.78em;">${t.startsWith('#')?t:'#'+t}</span>`).join('')}
            </div>
            <button class="op-btn op-btn-red" onclick="window._opTerminarFusion('${f.id}')">✕ Terminar Fusión</button>
        </div>`;
    }
    const disponibles = gruposGlobal
        .filter(x=>x.nombre_refinado!==nombreGrupo&&!getFusionDe(x.nombre_refinado))
        .map(x=>`<option value="${x.nombre_refinado}">${x.nombre_refinado}</option>`).join('');
    if (!disponibles) return `<p style="color:var(--gray-500);font-size:0.85em;">No hay grupos disponibles.</p>`;
    return `<p class="stat-hint">Al fusionar se combinan los tags de ambos grupos. El doble icono aparece en el catálogo.</p>
    <div class="op-row"><span class="op-label">Fusionar con</span>
        <select id="op-fus-t" class="op-select" style="flex:1;">
            <option value="">— Elige —</option>${disponibles}
        </select></div>
    <button class="op-btn" style="background:#6c3483;color:#fff;border-color:#6c3483;" onclick="window._opActivarFusion('${nombreGrupo.replace(/'/g,"\\'")}')")>⚡ Activar Fusión</button>
    <div id="msg-fus" class="op-msg"></div>`;
}

function _grupoHTML(g) {
    const misAliases = aliasesGlobal.filter(a => a.refinado_id === g.id);
    const sueltos    = aliasesGlobal.filter(a => !a.refinado_id);

    const aliasRows = misAliases.map(a => `
        <div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--gray-100);">
            <span style="flex:1;font-size:0.85em;">${a.nombre}</span>
            <button class="op-btn op-btn-red" style="padding:2px 8px;font-size:0.72em;"
                onclick="window._opDesasignarAlias('${a.id}')">Desvincular</button>
            <button class="op-btn op-btn-gray" style="padding:2px 8px;font-size:0.72em;"
                onclick="window._opEliminarAlias('${a.id}','${a.nombre.replace(/'/g,"\\'")}')")>🗑</button>
        </div>`).join('') || `<p style="color:var(--gray-400);font-size:0.82em;">Sin aliases asignados</p>`;

    const sueltosOpts = sueltos.map(a=>
        `<option value="${a.id}">${a.nombre}</option>`).join('');

    // Grupos disponibles para absorber (todos excepto este)
    const otrosGrupos = gruposGlobal
        .filter(x => x.id !== g.id)
        .map(x => `<option value="${x.nombre_refinado}">${x.nombre_refinado}</option>`)
        .join('');

    return `
    <!-- Renombrar -->
    <div style="margin-bottom:14px;">
        <div style="font-size:0.78em;font-weight:600;color:var(--gray-700);margin-bottom:5px;">Nombre del grupo</div>
        <div style="display:flex;gap:6px;">
            <input id="op-grp-nom" type="text" class="op-input" value="${g.nombre_refinado}" style="flex:1;">
            <button class="op-btn op-btn-green" onclick="window._opRenombrar('${g.id}')">Renombrar</button>
        </div>
        <div id="msg-renombrar" class="op-msg"></div>
    </div>

    <hr style="border:none;border-top:1px solid var(--gray-200);margin:12px 0;">

    <!-- Aliases asignados -->
    <div style="font-size:0.78em;font-weight:600;color:var(--gray-700);margin-bottom:6px;">
        Aliases en este grupo (${misAliases.length})
    </div>
    <div id="op-alias-lista" style="margin-bottom:12px;">${aliasRows}</div>

    <!-- Asignar alias suelto -->
    ${sueltosOpts ? `
    <div style="display:flex;gap:6px;margin-bottom:8px;">
        <select id="op-alias-suelto" class="op-select" style="flex:1;">
            <option value="">— Alias suelto —</option>${sueltosOpts}
        </select>
        <button class="op-btn op-btn-green" onclick="window._opAsignarAlias('${g.id}')">+ Asignar</button>
    </div>` : `<p style="color:var(--gray-400);font-size:0.78em;margin-bottom:8px;">No hay aliases sueltos disponibles.</p>`}

    <!-- Crear nuevo alias -->
    <div style="display:flex;gap:6px;margin-bottom:8px;">
        <input id="op-alias-nuevo" type="text" class="op-input" placeholder="Nombre del nuevo alias" style="flex:1;">
        <button class="op-btn op-btn-blue" onclick="window._opCrearYAsignarAlias('${g.id}')">Crear y asignar</button>
    </div>
    <div id="msg-alias" class="op-msg"></div>

    <hr style="border:none;border-top:1px solid var(--gray-200);margin:16px 0;">

    <!-- ★ FUSIONAR GRUPOS (absorción permanente) -->
    <div style="margin-bottom:14px;">
        <div style="font-size:0.78em;font-weight:600;color:#8e44ad;margin-bottom:4px;">
            🔀 Fusionar grupos (absorción permanente)
        </div>
        <p style="font-size:0.75em;color:var(--gray-500);margin:0 0 8px;">
            Absorbe otro grupo en este: sus tags y aliases pasan aquí, y ese grupo se elimina.
            Esta acción <b>no se puede deshacer</b>.
        </p>
        ${otrosGrupos ? `
        <div style="display:flex;gap:6px;align-items:center;">
            <select id="op-absorber-sel" class="op-select" style="flex:1;">
                <option value="">— Elige grupo a absorber —</option>${otrosGrupos}
            </select>
            <button class="op-btn" style="background:#8e44ad;color:#fff;border-color:#8e44ad;white-space:nowrap;"
                onclick="window._opAbsorberGrupo('${g.id}','${g.nombre_refinado.replace(/'/g,"\\'")}')")>
                🔀 Absorber
            </button>
        </div>
        <div id="msg-absorber" class="op-msg"></div>
        ` : `<p style="color:var(--gray-400);font-size:0.78em;">No hay otros grupos disponibles.</p>`}
    </div>

    <hr style="border:none;border-top:1px solid var(--gray-200);margin:16px 0;">

    <!-- Eliminar grupo -->
    <div>
        <div style="font-size:0.78em;font-weight:600;color:var(--red);margin-bottom:6px;">Zona de peligro</div>
        <button class="op-btn op-btn-red" onclick="window._opEliminarGrupo('${g.id}','${g.nombre_refinado.replace(/'/g,"\\'")}')")>🗑 Eliminar este grupo</button>
        <div style="font-size:0.72em;color:var(--gray-500);margin-top:4px;">Los aliases quedarán sueltos. No se borran los aliases ni los PT.</div>
    </div>`;
}

// ── Exponer globales ──────────────────────────────────────────
export function exponerGlobalesOP() {

    window._opTab = i => {
        // Montar markup en textareas de lore cuando se activa tab 2
        if (i === 2) {
            setTimeout(() => {
                ['op-descripcion','op-lore','op-personalidad','op-quirk'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) initMarkupTextarea(el);
                });
            }, 60);
        }
        [0,1,2,3,4].forEach(j=>{
            const p=document.getElementById(`op-p${j}`);
            const t=document.getElementById(`op-tab-${j}`);
            if(p) p.style.display=j===i?'block':'none';
            if(t) t.classList.toggle('active',j===i);
        });
    };

    window._opRecalcPV = () => {
        const pot=parseInt(document.getElementById('op-pot-t')?.value)||0;
        const agi=parseInt(document.getElementById('op-agi-t')?.value)||0;
        const ctl=parseInt(document.getElementById('op-ctl-t')?.value)||0;
        const pvm=calcPVMax(pot,agi,ctl);
        const el=document.getElementById('op-pvm'), el2=document.getElementById('op-pv-max');
        if(el) el.textContent=`(${pvm})`;
        if(el2) el2.value=pvm;
    };

    window._opGuardarStats = async (grupoId) => {
        const pot=parseInt(document.getElementById('op-pot-t')?.value)||0;
        const agi=parseInt(document.getElementById('op-agi-t')?.value)||0;
        const ctl=parseInt(document.getElementById('op-ctl-t')?.value)||0;
        const potA=parseInt(document.getElementById('op-pot-a')?.value);
        const agiA=parseInt(document.getElementById('op-agi-a')?.value);
        const ctlA=parseInt(document.getElementById('op-ctl-a')?.value);
        const pvA=parseInt(document.getElementById('op-pv-a')?.value)||0;
        const res=await guardarStatsGrupo(grupoId,{
            pot,agi,ctl,
            pot_actual: isNaN(potA)||potA===pot?null:potA,
            agi_actual: isNaN(agiA)||agiA===agi?null:agiA,
            ctl_actual: isNaN(ctlA)||ctlA===ctl?null:ctlA,
            pv_actual:  pvA
        });
        setMsg('msg-stats',res.ok?'✅ Guardado':'❌ '+res.msg,res.ok);
        if(res.ok) window.sincronizarVista?.();
    };

    window._opRestaurarPV = async (grupoId) => {
        const g=gruposGlobal.find(x=>x.id===grupoId); if(!g) return;
        const pvMax=calcPVMax(g.pot||0,g.agi||0,g.ctl||0);
        document.getElementById('op-pv-a').value=pvMax;
        const res=await guardarStatsGrupo(grupoId,{pot:g.pot,agi:g.agi,ctl:g.ctl,pv_actual:pvMax});
        setMsg('msg-stats',res.ok?`✅ PV → ${pvMax}`:'❌ '+res.msg,res.ok);
        if(res.ok) window.sincronizarVista?.();
    };

    window._opIgualarActualTotal = () => {
        const pot=document.getElementById('op-pot-t')?.value;
        const agi=document.getElementById('op-agi-t')?.value;
        const ctl=document.getElementById('op-ctl-t')?.value;
        if(document.getElementById('op-pot-a')) document.getElementById('op-pot-a').value=pot;
        if(document.getElementById('op-agi-a')) document.getElementById('op-agi-a').value=agi;
        if(document.getElementById('op-ctl-a')) document.getElementById('op-ctl-a').value=ctl;
    };

    window._opAddTag = async (grupoId, nombreGrupo, tagDirecto) => {
        const tag = tagDirecto || (() => {
            const raw=document.getElementById('op-tag-inp')?.value?.trim();
            return raw ? (raw.startsWith('#')?raw:'#'+raw) : null;
        })();
        if(!tag) return;
        const g=gruposGlobal.find(x=>x.id===grupoId); if(!g) return;
        if((g.tags||[]).includes(tag)){setMsg('msg-tags','Ya existe',false);return;}
        const nuevosTags=[...(g.tags||[]),tag];
        const res=await guardarTagsGrupo(grupoId,nuevosTags);
        setMsg('msg-tags',res.ok?`✅ ${tag} agregado`:'❌ '+res.msg,res.ok);
        if(res.ok){
            const inpEl = document.getElementById('op-tag-inp');
            if (inpEl) inpEl.value='';
            const chips=document.getElementById('op-chips');
            if(chips) chips.innerHTML=_chipsHTML(grupoId,nuevosTags,ptGlobal[nombreGrupo]||{});
            window._opRefreshTab1Pools?.(grupoId, nombreGrupo);
            window.sincronizarVista?.();
        }
    };

    window._opRmTag = async (grupoId, tag) => {
        const g=gruposGlobal.find(x=>x.id===grupoId); if(!g) return;
        const tf = tag.startsWith('#')?tag:'#'+tag;
        const pts = ptGlobal[g.nombre_refinado]?.[tag] || ptGlobal[g.nombre_refinado]?.[tf] || 0;
        const confirmar = pts > 0
            ? confirm(`¿Desasignar ${tf} de ${g.nombre_refinado}?\n\nEste personaje tiene ${pts} PT en ese tag.\nSe borrarán permanentemente.`)
            : confirm(`¿Desasignar ${tf} de ${g.nombre_refinado}?`);
        if (!confirmar) return;
        const nuevosTags=(g.tags||[]).filter(t=>t!==tag);
        const res=await guardarTagsGrupo(grupoId,nuevosTags);
        if(res.ok){
            // Borrar PT del tag si los había
            if (pts > 0) await borrarPTDeTag(g.nombre_refinado, tag);
            const chips=document.getElementById('op-chips');
            const nombre=g.nombre_refinado;
            if(chips) chips.innerHTML=_chipsHTML(grupoId,nuevosTags,ptGlobal[nombre]||{});
            window.sincronizarVista?.();
        }
    };

    window._opAplicarPT = async (nombreGrupo) => {
        const tags = window._opPTSel && window._opPTSel.size > 0
            ? [...window._opPTSel]
            : [];
        if (!tags.length) { setMsg('msg-pt', 'Selecciona al menos un tag', false); return; }
        const delta=parseInt(document.getElementById('op-pt-d')?.value)||0;
        const motivo=document.getElementById('op-pt-m')?.value||'manual';
        if (!delta) { setMsg('msg-pt', 'Delta no puede ser 0', false); return; }

        let errores = 0;
        for (const tag of tags) {
            const res = await aplicarDeltaPT(nombreGrupo, tag, delta, motivo);
            if (!res.ok) errores++;
        }

        const signo = delta > 0 ? '+' : '';
        setMsg('msg-pt',
            errores === 0
                ? `✅ ${signo}${delta} PT en ${tags.length} tag(s)`
                : `⚠ ${tags.length - errores} ok, ${errores} errores`,
            errores === 0);

        const g = gruposGlobal.find(x => x.nombre_refinado === nombreGrupo);
        const chips = document.getElementById('op-chips');
        if (chips && g) chips.innerHTML = _chipsHTML(g.id, g.tags||[], ptGlobal[nombreGrupo]||{});

        // Refrescar pool PT con los nuevos valores
        window._opRefreshTab1Pools(g?.id, nombreGrupo);
        window.sincronizarVista?.();
    };

    window._opGuardarLore = async (grupoId) => {
        const descripcion  = document.getElementById('op-descripcion')?.value||'';
        const lore         = document.getElementById('op-lore')?.value||'';
        const personalidad = document.getElementById('op-personalidad')?.value||'';
        const quirk        = document.getElementById('op-quirk')?.value||'';
        // Recoger campos de info_extra (solo los que tienen valor)
        const INFO_KEYS = ['estado','edad','altura','peso','genero','lugar_nac','ocupacion','afiliacion','familia','nota'];
        const info_extra = {};
        INFO_KEYS.forEach(k => {
            const v = document.getElementById('op-info-'+k)?.value?.trim();
            if (v) info_extra[k] = v;
        });
        const res=await guardarLoreGrupo(grupoId,{descripcion,lore,personalidad,quirk,info_extra});
        setMsg('msg-lore',res.ok?'✅ Guardado':'❌ '+res.msg,res.ok);
        if(res.ok) window.sincronizarVista?.();
    };

    window._opActivarFusion = async (nombreGrupo) => {
        const target=document.getElementById('op-fus-t')?.value;
        if(!target){setMsg('msg-fus','Elige grupo',false);return;}
        const gA=gruposGlobal.find(x=>x.nombre_refinado===nombreGrupo);
        const gB=gruposGlobal.find(x=>x.nombre_refinado===target);
        if(!gA||!gB) return;
        const res=await activarFusion(nombreGrupo,target,gA.tags||[],gB.tags||[]);
        setMsg('msg-fus',res.ok?'✅ Fusión activada':'❌ '+res.msg,res.ok);
        if(res.ok){await cargarFusiones();cerrarModal();window.sincronizarVista?.();}
    };

    window._opTerminarFusion = async (fusionId) => {
        if(!confirm('¿Terminar esta fusión?')) return;
        await terminarFusion(fusionId);
        cerrarModal(); window.sincronizarVista?.();
    };

    window._opRenombrar = async (grupoId) => {
        const nom=document.getElementById('op-grp-nom')?.value?.trim();
        const res=await renombrarGrupo(grupoId,nom);
        setMsg('msg-renombrar',res.ok?'✅ Renombrado':'❌ '+res.msg,res.ok);
        if(res.ok) window.sincronizarVista?.();
    };

    window._opAsignarAlias = async (grupoId) => {
        const aliasId=document.getElementById('op-alias-suelto')?.value;
        if(!aliasId){setMsg('msg-alias','Elige un alias',false);return;}
        const res=await asignarAlias(aliasId,grupoId);
        setMsg('msg-alias',res.ok?'✅ Alias asignado':'❌ '+res.msg,res.ok);
        if(res.ok) window.sincronizarVista?.();
    };

    window._opCrearYAsignarAlias = async (grupoId) => {
        const nom=document.getElementById('op-alias-nuevo')?.value?.trim();
        if(!nom){setMsg('msg-alias','Nombre vacío',false);return;}
        const r1=await crearAlias(nom);
        if(!r1.ok){setMsg('msg-alias','❌ '+r1.msg,false);return;}
        const r2=await asignarAlias(r1.alias.id,grupoId);
        setMsg('msg-alias',r2.ok?`✅ "${nom}" creado y asignado`:'❌ '+r2.msg,r2.ok);
        if(r2.ok){document.getElementById('op-alias-nuevo').value='';window.sincronizarVista?.();}
    };

    window._opDesasignarAlias = async (aliasId) => {
        await asignarAlias(aliasId, null);
        window.sincronizarVista?.();
    };

    window._opEliminarAlias = async (aliasId, nombre) => {
        await eliminarAlias(aliasId);
        // Quitar la fila del DOM sin recargar
        const row = document.getElementById(`alias-row-${aliasId}`);
        if (row) row.remove();
        // Si no quedan sueltos, mostrar mensaje vacío
        const lista = document.getElementById('lista-sueltos');
        if (lista && !lista.querySelector('[id^="alias-row-"]')) {
            lista.innerHTML = `<p style="color:var(--gray-400);font-size:0.82em;">No hay aliases sueltos.</p>`;
        }
    };

    window._opEliminarGrupo = async (grupoId, nombre) => {
        if(!confirm(`¿Eliminar el grupo "${nombre}"?\nLos aliases quedarán sueltos.`)) return;
        await eliminarGrupo(grupoId);
        cerrarModal(); window.sincronizarVista?.();
    };

    // ── Absorción permanente de grupos ────────────────────────
    // Toma el grupo fuente (sel) y lo absorbe en el destino (grupoId):
    //   1. Copia tags únicos de fuente → destino
    //   2. Reasigna todos los aliases de fuente → destino
    //   3. Elimina el grupo fuente (sus PT quedan en log_puntos_tag
    //      bajo su nombre original — el OP puede migrarlos manualmente
    //      si lo desea)
    window._opAbsorberGrupo = async (grupoDestinoId, nombreDestino) => {
        const nombreFuente = document.getElementById('op-absorber-sel')?.value;
        if (!nombreFuente) { setMsg('msg-absorber','Elige un grupo a absorber',false); return; }

        const gFuente  = gruposGlobal.find(x => x.nombre_refinado === nombreFuente);
        const gDestino = gruposGlobal.find(x => x.id === grupoDestinoId);
        if (!gFuente || !gDestino) { setMsg('msg-absorber','Grupo no encontrado',false); return; }

        const confirm1 = confirm(
            `¿Absorber "${nombreFuente}" en "${nombreDestino}"?\n\n` +
            `• Sus tags únicos se añadirán a "${nombreDestino}"\n` +
            `• Sus aliases pasarán a "${nombreDestino}"\n` +
            `• El grupo "${nombreFuente}" se eliminará\n\n` +
            `Esta acción NO se puede deshacer.`
        );
        if (!confirm1) return;

        setMsg('msg-absorber','⏳ Procesando…', true);

        try {
            // 1. Fusionar tags (union sin duplicados)
            const tagsDestino = new Set((gDestino.tags||[]).map(t=>t.startsWith('#')?t:'#'+t));
            const tagsFuente  = (gFuente.tags||[]).map(t=>t.startsWith('#')?t:'#'+t);
            tagsFuente.forEach(t => tagsDestino.add(t));
            const tagsUnidos  = [...tagsDestino];

            const r1 = await guardarTagsGrupo(grupoDestinoId, tagsUnidos);
            if (!r1.ok) { setMsg('msg-absorber','❌ Error al fusionar tags: '+r1.msg, false); return; }

            // 2. Reasignar aliases de la fuente al destino
            const aliasesFuente = aliasesGlobal.filter(a => a.refinado_id === gFuente.id);
            for (const a of aliasesFuente) {
                await asignarAlias(a.id, grupoDestinoId);
            }

            // 3. Eliminar el grupo fuente
            // (eliminarGrupo desasigna aliases primero, pero ya los reasignamos arriba)
            await supabase.from('personajes_refinados').delete().eq('id', gFuente.id);
            const idx = gruposGlobal.findIndex(g => g.id === gFuente.id);
            if (idx !== -1) gruposGlobal.splice(idx, 1);

            setMsg('msg-absorber',`✅ "${nombreFuente}" absorbido en "${nombreDestino}"`, true);

            // Refrescar vista y cerrar modal tras breve pausa
            setTimeout(async () => {
                cerrarModal();
                await window.sincronizarVista?.();
            }, 900);

        } catch(e) {
            setMsg('msg-absorber','❌ Error inesperado: '+e.message, false);
        }
    };
}

// ── Crear nuevo grupo ─────────────────────────────────────────
export function abrirCrearGrupo() {
    abrirModal('✨ Crear Grupo', `
    <p class="stat-hint">El grupo es el personaje público. Los aliases son los nombres del hilo de rol.</p>
    <div class="op-row"><span class="op-label">Nombre</span>
        <input id="cp-nom" type="text" class="op-input" style="flex:1;" placeholder="Ej: Elisa"></div>
    <div class="stats-grid">
        <div class="stat-field"><label>POT</label><input id="cp-pot" type="number" value="0"></div>
        <div class="stat-field"><label>AGI</label><input id="cp-agi" type="number" value="0"></div>
        <div class="stat-field"><label>CTL</label><input id="cp-ctl" type="number" value="0"></div>
    </div>
    <label style="font-size:0.78em;font-weight:600;color:var(--gray-700);display:block;margin-bottom:4px;">Tags</label>
    <div id="cp-tags-chips" class="tags-chips" style="margin-bottom:6px;"></div>
    <div id="cp-tag-inp-wrap" style="margin-bottom:10px;"></div>
    <button class="op-btn op-btn-green" onclick="window._cpCrearGrupo()">✨ Crear Grupo</button>
    <div id="msg-cp" class="op-msg"></div>`);

    const tagsSel = [];

    function renderChipsCp() {
        const chips = document.getElementById('cp-tags-chips');
        if (!chips) return;
        chips.innerHTML = tagsSel.map(t =>
            `<span class="tag-chip">${t}
                <button class="tag-chip-rm" onclick="window._cpRmTag('${t.replace(/'/g,"\\'")}')")>×</button>
            </span>`
        ).join('') || `<span style="color:var(--gray-400);font-size:0.82em;">Sin tags aún</span>`;
    }

    setTimeout(() => {
        const wrap = document.getElementById('cp-tag-inp-wrap');
        if (!wrap) return;
        const widget = crearTagInput('cp-tag-inp', TAGS_CANONICOS, (tag) => {
            if (!tagsSel.includes(tag)) { tagsSel.push(tag); renderChipsCp(); }
        });
        wrap.appendChild(widget.el);
        renderChipsCp();
    }, 60);

    window._cpRmTag = (tag) => {
        const idx = tagsSel.indexOf(tag);
        if (idx !== -1) { tagsSel.splice(idx, 1); renderChipsCp(); }
    };

    window._cpCrearGrupo = async () => {
        const nombre=document.getElementById('cp-nom')?.value?.trim();
        const pot=parseInt(document.getElementById('cp-pot')?.value)||0;
        const agi=parseInt(document.getElementById('cp-agi')?.value)||0;
        const ctl=parseInt(document.getElementById('cp-ctl')?.value)||0;
        const res=await crearGrupo({nombre,pot,agi,ctl,tags:[...tagsSel]});
        setMsg('msg-cp',res.ok?'✅ Grupo creado':'❌ '+res.msg,res.ok);
        if(res.ok) setTimeout(()=>{cerrarModal();window.sincronizarVista?.();},800);
    };
}

// Botón de gestor de aliases globales (aliases sueltos)
export function abrirGestorAliases() {
    const sueltos = aliasesGlobal.filter(a => !a.refinado_id);
    abrirModal('⚙ Aliases Sueltos', `
    <p class="stat-hint">Estos nombres no están asignados a ningún grupo. Solo visibles para el OP.<br>
    Crea un alias nuevo aquí, luego asígnalo desde el panel OP del grupo.</p>
    <div id="lista-sueltos" style="margin-bottom:12px;">
        ${sueltos.length
            ? sueltos.map(a=>`
            <div id="alias-row-${a.id}" style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--gray-100);">
                <span style="flex:1;font-size:0.85em;">${a.nombre}</span>
                <button class="op-btn op-btn-red" style="padding:2px 8px;font-size:0.72em;"
                    onclick="window._opEliminarAlias('${a.id}','${a.nombre.replace(/'/g,"\\'")}')")>🗑</button>
            </div>`).join('')
            : `<p style="color:var(--gray-400);font-size:0.82em;">No hay aliases sueltos.</p>`}
    </div>
    <div style="display:flex;gap:6px;">
        <input id="alias-nuevo-global" type="text" class="op-input" placeholder="Nombre del nuevo alias" style="flex:1;">
        <button class="op-btn op-btn-green" onclick="window._crearAliasSuelto()">Crear alias</button>
    </div>
    <div id="msg-alias-global" class="op-msg"></div>`);

    window._crearAliasSuelto = async () => {
        const nom=document.getElementById('alias-nuevo-global')?.value?.trim();
        const res=await crearAlias(nom);
        setMsg('msg-alias-global',res.ok?`✅ "${nom}" creado`:'❌ '+res.msg,res.ok);
        if(res.ok){document.getElementById('alias-nuevo-global').value='';}
    };
}

function escTA(s){return String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
