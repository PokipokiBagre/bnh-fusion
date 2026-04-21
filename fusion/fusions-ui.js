// fusions/fusions-ui.js
import { fusionsState, personajes, fusionesActivas, registroFusiones, STORAGE_URL, norm } from './fusions-state.js';
import { getRegla, getReglas, calcCompatibilidadTags } from './fusions-logic.js';
import { opcionesState, renderOpciones } from './fusions-options.js';
import { estaEnFusion } from '../bnh-fusion.js';

export { renderOpciones };

const _esc  = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const fb    = () => `${STORAGE_URL}/imginterfaz/no_encontrado.png`;
const imgPJ = n => `${STORAGE_URL}/imgpersonajes/${norm(n)}icon.png`;

// ═══════════════════════════════════════════════════════════════
// TAB: SIMULADOR
// ═══════════════════════════════════════════════════════════════
export function renderSimulador() {
    const wrap = document.getElementById('vista-simulador');
    if (!wrap) return;

    const btnRol = (v, l) => `<button class="btn btn-sm ${fusionsState.filtroRol === v ? 'btn-green' : 'btn-outline'}" style="padding:2px 8px;font-size:0.85em;" onclick="window._fusionFiltroRol('${v}')">${l}</button>`;
    const btnEst = (v, l) => `<button class="btn btn-sm ${fusionsState.filtroEstado === v ? 'btn-green' : 'btn-outline'}" style="padding:2px 8px;font-size:0.85em;" onclick="window._fusionFiltroEst('${v}')">${l}</button>`;

    wrap.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
            <div class="card-title" style="margin:0;">Pool de Personajes</div>
            <div style="display:flex; gap:6px; align-items:center;">
                <div style="display:flex; gap:3px;">
                    ${btnRol('todos', 'Todos')} ${btnRol('#Jugador', 'Jugador')} ${btnRol('#NPC', 'NPC')}
                </div>
                <div style="width:1px; height:16px; background:var(--gray-300); margin:0 4px;"></div>
                <div style="display:flex; gap:3px;">
                    ${btnEst('todos', 'Todos')} ${btnEst('#Activo', 'Activo')} ${btnEst('#Inactivo', 'Inactivo')}
                </div>
            </div>
        </div>
        <div class="char-pool" id="char-pool">${renderCharPool()}</div>
        <div style="margin-top:10px;font-size:0.78em;color:var(--gray-500);">
            Click para seleccionar <span style="color:var(--fp);font-weight:700;">Sujeto A</span> y 
            <span style="color:var(--fa);font-weight:700;">Sujeto B</span>.
            ⚡ = ya en fusión activa.
        </div>
    </div>

    <div class="fusion-layout" style="margin-bottom:16px;">
        <div id="slot-a" class="slot-card">${renderSlot('a')}</div>
        <div class="vs-panel" id="vs-panel-wrap">${renderVsPanel()}</div>
        <div id="slot-b" class="slot-card">${renderSlot('b')}</div>
    </div>

    <div id="resultado-fusion" class="oculto"></div>
    `;

    _actualizarClasesPool();
    _actualizarSlot('a');
    _actualizarSlot('b');
    // Inicializar listener del D100 sin oninput en el HTML (evita pérdida de foco)
    requestAnimationFrame(() => {
        window._fusionD100Init?.();
    });

    if (fusionsState.resultadoCalculado) renderResultado(fusionsState.resultadoCalculado);
}

function renderCharPool() {
    if (!personajes.length) {
        return `<div style="color:var(--gray-500);font-size:0.85em;padding:12px 0;">Cargando personajes…</div>`;
    }

    // ⚡ FILTROS APLICADOS AQUÍ
    let pjs = personajes;
    if (fusionsState.filtroRol && fusionsState.filtroRol !== 'todos') {
        pjs = pjs.filter(p => (p.tags||[]).some(t => (t.startsWith('#')?t:'#'+t).toLowerCase() === fusionsState.filtroRol.toLowerCase()));
    }
    if (fusionsState.filtroEstado && fusionsState.filtroEstado !== 'todos') {
        pjs = pjs.filter(p => (p.tags||[]).some(t => (t.startsWith('#')?t:'#'+t).toLowerCase() === fusionsState.filtroEstado.toLowerCase()));
    }

    if (!pjs.length) {
        return `<div style="padding:10px;color:var(--gray-500);font-size:0.85em;text-align:center;width:100%;">No hay personajes que coincidan con los filtros actuales</div>`;
    }

    return pjs.map(p => {
        const enFusion = estaEnFusion(p.nombre);
        const isA = fusionsState.pjA === p.nombre;
        const isB = fusionsState.pjB === p.nombre;
        let cls = '';
        if (isA) cls = 'sel-a';
        else if (isB) cls = 'sel-b';
        else if (enFusion) cls = 'en-fusion';

        return `<div class="char-thumb ${cls}"
                    onclick="window._fusionClickPJ('${p.nombre.replace(/'/g,"\\'")}')">
            <img src="${imgPJ(p.nombre)}" onerror="this.onerror=null;this.src='${fb()}'">
            <span>${_esc(p.nombre)}</span>
            ${enFusion && !isA && !isB ? `<span class="badge-fusion-mini">⚡</span>` : ''}
            ${isA ? `<span style="font-size:0.6em;font-weight:700;color:var(--fp);background:var(--fp-pale);border:1px solid var(--fp);padding:1px 5px;border-radius:6px;">A</span>` : ''}
            ${isB ? `<span style="font-size:0.6em;font-weight:700;color:var(--fa);background:rgba(224,64,251,0.1);border:1px solid var(--fa);padding:1px 5px;border-radius:6px;">B</span>` : ''}
        </div>`;
    }).join('');
}

function renderSlot(letra) {
    const nombre = letra === 'a' ? fusionsState.pjA : fusionsState.pjB;
    const color  = letra === 'a' ? 'var(--fp)' : 'var(--fa)';
    const label  = letra === 'a' ? 'SUJETO A' : 'SUJETO B';

    if (!nombre) return `
        <div class="slot-label">${label}</div>
        <div style="font-size:2.5em;opacity:0.15;">👤</div>
        <div style="font-size:0.8em;color:var(--gray-500);">Click un personaje del pool</div>`;

    const pj = personajes.find(p => p.nombre === nombre);
    if (!pj) return '';
    const pac  = (pj.pot||0) + (pj.agi||0) + (pj.ctl||0);
    const tags = (pj.tags || []).slice(0, 10).map(t => {
        const tn = t.startsWith('#') ? t : '#' + t;
        return `<span class="stag">${_esc(tn)}</span>`;
    }).join('');

    return `
    <button class="slot-clear" onclick="window._fusionClearSlot('${letra}')" title="Quitar">×</button>
    <div class="slot-label" style="color:${color};">${label}</div>
    <img class="slot-img" src="${imgPJ(nombre)}" onerror="this.onerror=null;this.src='${fb()}'">
    <div class="slot-name">${_esc(nombre)}</div>
    <div class="slot-stats">
        <div class="slot-stat"><span class="s-lbl">POT</span><span class="s-val" style="color:var(--orange);">${pj.pot||0}</span></div>
        <div class="slot-stat"><span class="s-lbl">AGI</span><span class="s-val" style="color:#2980b9;">${pj.agi||0}</span></div>
        <div class="slot-stat"><span class="s-lbl">CTL</span><span class="s-val" style="color:var(--green-light);">${pj.ctl||0}</span></div>
        <div class="slot-stat"><span class="s-lbl">PAC</span><span class="s-val" style="color:var(--fp);">${pac}</span></div>
    </div>
    <div class="slot-tag-cloud">${tags}</div>`;
}

function renderVsPanel() {
    const d100   = fusionsState.d100 || '';
    const bonus  = fusionsState.compatPct || 0;
    const nTags  = fusionsState.compatTags || 0;
    const total  = (parseInt(d100) || 0) + bonus;
    const regla  = total ? getRegla(total) : null;
    const pct    = d100 ? Math.min(parseInt(d100), 100) : 0;
    // El bonus de tags llena la barra como un segundo color encima
    const bonusPx = bonus > 0 ? Math.min(bonus, 100 - pct) : 0;
    // Si el total supera 100, la barra entera + un indicador de sobrerecarga
    const sobreRecarga = total > 100;

    return `
    <div class="vs-orb">${sobreRecarga ? '🔥' : 'VS'}</div>

    <div class="d100-wrap">
        <div class="d100-label">Rendimiento D100</div>
        <input type="number" id="inp-d100"
            min="1" max="100" placeholder="—"
            value="${d100}"
            style="
                width:90px;text-align:center;font-size:1.8em;font-weight:800;
                color:var(--fp);border:2px solid var(--fp);border-radius:var(--radius);
                padding:6px;outline:none;font-family:inherit;
                transition:box-shadow 0.2s;background:white;
            "
            onfocus="this.style.boxShadow='0 0 0 3px var(--fp-glow)'"
            onblur="this.style.boxShadow=''">

        ${(fusionsState.pjA && fusionsState.pjB) ? `
        <div style="
            display:flex;align-items:center;gap:6px;
            background:${sobreRecarga ? 'rgba(224,64,251,0.12)' : 'var(--fp-pale)'};
            border:1px solid ${sobreRecarga ? 'var(--fa)' : 'var(--fp)'};
            border-radius:8px;padding:5px 10px;width:100%;
            font-size:0.78em;font-weight:700;color:var(--fp-dark);">
            <span style="font-size:1em;">${sobreRecarga ? '🔥' : '🔗'}</span>
            <div>
                <div>${nTags} tag${nTags!==1?'s':''} compartido${nTags!==1?'s':''} = <span style="color:var(--fp);font-weight:800;">+${bonus}%</span></div>
                ${sobreRecarga ? `<div style="color:var(--fa);font-size:0.9em;">¡Sobrecarga! Stats y PT ×1.5</div>` : ''}
            </div>
        </div>` : `
        <div style="font-size:0.72em;color:var(--gray-500);text-align:center;">
            Selecciona ambos PJs para ver compatibilidad
        </div>`}

            <div style="width:100%;display:flex;flex-direction:column;gap:3px;">
            <div style="width:100%;height:10px;background:var(--gray-200);border-radius:5px;overflow:hidden;position:relative;">
                <div id="compat-fill" style="
                    position:absolute;left:0;top:0;bottom:0;
                    width:${pct}%;background:var(--fp);
                    transition:width 0.3s ease;border-radius:5px;"></div>
                <div id="compat-fill-bonus" style="
                    position:absolute;top:0;bottom:0;
                    left:${pct}%;width:${bonusPx}%;
                    background:var(--fa);opacity:0.8;
                    transition:all 0.3s ease;"></div>
                ${sobreRecarga ? `<div style="position:absolute;right:2px;top:50%;transform:translateY(-50%);font-size:8px;">🔥</div>` : ''}
            </div>
            <div id="compat-label" style="font-size:0.7em;color:var(--gray-500);text-align:center;">
                ${d100 ? `D100: ${d100} + ${bonus}% tags = <b>${total}%</b>` : 'Ingresa el dado'}
            </div>
        </div>

        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;min-height:36px;">
            <div id="regla-badge-display" class="regla-badge ${regla ? regla.clase : ''}" style="width:100%;text-align:center;display:${regla ? 'block' : 'none'};">${regla ? regla.label : ''}</div>
            <div id="sobrecarga-display" style="font-size:0.7em;font-weight:700;color:var(--fa); display:${sobreRecarga ? 'block' : 'none'};">
                Rendimiento total: <b id="rend-total-display">${total}</b>% (×1.5 activo)
            </div>
        </div>
    </div>

    <button class="btn btn-fusion btn-lg" style="width:100%;margin-top:4px;" onclick="window._fusionSimular()">⚡ Simular</button>`;
}

// ── Actualizar el panel VS en-place (sin re-render total) ──────
export function actualizarCompatibilidadDisplay() {
    // Solo actualizamos el panel VS completo para mostrar el bonus de tags
    const panel = document.getElementById('vs-panel-wrap');
    if (!panel) return;
    panel.innerHTML = renderVsPanel();
    // Re-inicializar el listener del input D100 (se perdió al re-renderizar)
    requestAnimationFrame(() => window._fusionD100Init?.());
}

function _actualizarClasesPool() {
    const pool = document.getElementById('char-pool');
    if (pool) pool.innerHTML = renderCharPool();
}
function _actualizarSlot(letra) {
    const el = document.getElementById(`slot-${letra}`);
    if (!el) return;
    const nombre = letra === 'a' ? fusionsState.pjA : fusionsState.pjB;
    el.className = `slot-card ${nombre ? 'filled-' + letra : ''}`;
    el.innerHTML = renderSlot(letra);
}
export function actualizarVsPanelPublic() { /* ya no se usa el panel viejo */ }
export function actualizarSlotPublic(letra) { _actualizarSlot(letra); _actualizarClasesPool(); }

// ─── Resultado ────────────────────────────────────────────────
export function renderResultado(resultado) {
    const wrap = document.getElementById('resultado-fusion');
    if (!wrap) return;
    wrap.classList.remove('oculto');

    const { regla, statsBase, statsFinales, tags, pjA, pjB, d100,
            maxTagCompartido, maxPtsCompartidos, d100Base, d100Bonus } = resultado;
    const sobreRecarga = (d100 || 0) > 100;

    const sf  = fusionsState.statsEditadas;
    const pot = sf.pot !== null ? sf.pot : statsFinales.pot;
    const agi = sf.agi !== null ? sf.agi : statsFinales.agi;
    const ctl = sf.ctl !== null ? sf.ctl : statsFinales.ctl;

    const dL = d => d === 0 ? '' : (d > 0 ? `+${d}` : `${d}`);
    const dC = d => d === 0 ? 'sdelta-neu' : (d > 0 ? 'sdelta-pos' : 'sdelta-neg');

    const tagsHtml = Object.entries(tags)
        .filter(([, d]) => d.pts > 0)
        .sort((a, b) => b[1].pts - a[1].pts)
        .map(([tag, data]) => {
            const cls  = `tag-res-${data.tipo}`;
            const icon = data.tipo === 'suma' ? '⊕' : data.tipo === 'sinergia' ? '↑' : data.tipo === 'herencia' ? '→' : '≡';
            return `<span class="tag-res ${cls}" title="${data.tipo}: A=${data.aportaA} B=${data.aportaB}">
                <span style="opacity:0.6;font-size:0.85em;">${icon}</span>
                ${_esc(tag)} <span class="tag-pts">${data.pts}pt</span>
            </span>`;
        }).join('');

    fusionsState.modoTagLocal = fusionsState.modoTagLocal || 'ninguno';
    const isN = fusionsState.modoTagLocal === 'ninguno';
    const isNew = fusionsState.modoTagLocal === 'nuevo';
    const isC = fusionsState.modoTagLocal === 'compartido';
    const hasShared = maxTagCompartido ? true : false;

    const tagFusionSection = `
    <div style="padding:14px 20px;border-top:1px solid var(--border);">
        <div style="font-size:0.72em;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--gray-500);margin-bottom:8px;">✨ Tag de Fusión (Opcional)</div>
        
        <div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:12px;font-size:0.85em;color:var(--gray-700);">
            <label style="cursor:pointer;display:flex;align-items:center;gap:6px;">
                <input type="radio" name="tag_mode" value="ninguno" ${isN ? 'checked' : ''} onchange="window._fusionTagModeChange(this.value)"> 
                <span>1. No hacer nada</span>
            </label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:6px;">
                <input type="radio" name="tag_mode" value="nuevo" ${isNew ? 'checked' : ''} onchange="window._fusionTagModeChange(this.value)"> 
                <span>2. Crear Tag Nuevo (Quirk)</span>
            </label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:6px;opacity:${hasShared ? 1 : 0.5}">
                <input type="radio" name="tag_mode" value="compartido" ${isC ? 'checked' : ''} ${hasShared ? '' : 'disabled'} onchange="window._fusionTagModeChange(this.value)"> 
                <span>3. Potenciar Compartido</span>
            </label>
        </div>

        <div id="ui-tag-nuevo" style="display:${isNew ? 'flex' : 'none'};gap:8px;align-items:center;flex-wrap:wrap;">
            <div style="flex:1;min-width:200px;">
                <input class="inp" type="text" id="inp-tag-fusion"
                    placeholder="Escribe el nuevo tag (ej: VaporFusion)"
                    value="${_esc(fusionsState.tagFusionNombre || '')}"
                    oninput="window._fusionTagNombreChange(this.value)"
                    style="font-weight:700;color:var(--fp);">
            </div>
            <div style="font-size:0.8em;color:var(--gray-500);">Se asignarán <b>20 PT</b></div>
        </div>

        <div id="ui-tag-compartido" style="display:${isC ? 'block' : 'none'};font-size:0.85em;color:var(--gray-600);">
            Se asignarán <b>20 PT</b> al tag más compartido: <b style="color:var(--fp);">${_esc(maxTagCompartido || '')}</b>
        </div>
    </div>`;

    // Botón de acción según rol
    const esAdmin = fusionsState.esAdmin;
    const accionBtn = esAdmin
        ? `<button class="btn btn-fusion btn-lg" style="flex:1;min-width:180px;" onclick="window._fusionOficializar()">⚡ Oficializar en Base de Datos</button>`
        : `<button class="btn btn-outline-fusion btn-lg" style="flex:1;min-width:180px;" onclick="window._fusionEnviarSugerencia()">📨 Enviar como Sugerencia al OP</button>`;

    wrap.innerHTML = `
    <div class="resultado-section">
        <div class="resultado-header">
            <h3>⚡ ${_esc(pjA)} + ${_esc(pjB)}</h3>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
                <div class="regla-badge ${regla.clase}">${regla.label}</div>
                <div style="font-size:0.72em;color:rgba(255,255,255,0.8);">
                    D${d100Base||d100}${d100Bonus ? ` + ${d100Bonus}% tags` : ''}
                    ${sobreRecarga ? ' · <b style="color:#f0abfc;">🔥 ×1.5 activo</b>' : ''}
                </div>
            </div>
        </div>

        ${sobreRecarga ? `
        <div style="padding:10px 20px;background:rgba(224,64,251,0.1);border-bottom:1px solid rgba(224,64,251,0.3);">
            <div style="font-size:0.82em;font-weight:700;color:var(--fa);">
                🔥 Sobrecarga de Compatibilidad — Stats y PTs base multiplicados por ×1.5
            </div>
            <div style="font-size:0.75em;color:var(--gray-500);margin-top:2px;">
                Rendimiento total: ${d100} (supera el 100%). Los valores base ya incluyen el multiplicador.
            </div>
        </div>` : ''}

        <div style="padding:16px 20px;border-bottom:1px solid var(--border);">
            <div style="font-size:0.72em;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--gray-500);margin-bottom:10px;">
                Stats Resultantes <span style="font-weight:400;text-transform:none;letter-spacing:0;margin-left:6px;color:var(--gray-400);">(edita si necesitas ajuste manual)</span>
            </div>
            <div class="stat-edit-grid">
                <div class="stat-edit-box">
                    <span class="slbl">POT</span>
                    <input class="sinp" type="number" id="edit-pot" value="${pot}" min="0" style="color:var(--orange);" oninput="window._fusionEditStat('pot',this.value)">
                    ${dL(pot - statsBase.pot) ? `<span class="sdelta ${dC(pot - statsBase.pot)}">${dL(pot - statsBase.pot)}</span>` : '<span style="height:18px;"></span>'}
                </div>
                <div class="stat-edit-box">
                    <span class="slbl">AGI</span>
                    <input class="sinp" type="number" id="edit-agi" value="${agi}" min="0" style="color:#2980b9;" oninput="window._fusionEditStat('agi',this.value)">
                    ${dL(agi - statsBase.agi) ? `<span class="sdelta ${dC(agi - statsBase.agi)}">${dL(agi - statsBase.agi)}</span>` : '<span style="height:18px;"></span>'}
                </div>
                <div class="stat-edit-box">
                    <span class="slbl">CTL</span>
                    <input class="sinp" type="number" id="edit-ctl" value="${ctl}" min="0" style="color:var(--green-light);" oninput="window._fusionEditStat('ctl',this.value)">
                    ${dL(ctl - statsBase.ctl) ? `<span class="sdelta ${dC(ctl - statsBase.ctl)}">${dL(ctl - statsBase.ctl)}</span>` : '<span style="height:18px;"></span>'}
                </div>
            </div>
            <div style="margin-top:8px;font-size:0.75em;color:var(--gray-500);">
                Base (modo <b>${resultado.opciones.modo_stats}</b>): POT ${statsBase.pot} · AGI ${statsBase.agi} · CTL ${statsBase.ctl}
                &nbsp;·&nbsp; PAC: <b id="pac-display">${pot + agi + ctl}</b>
            </div>
        </div>

        ${tagFusionSection}

        <div class="res-body">
            <div>
                <div style="font-size:0.72em;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--gray-500);margin-bottom:8px;">
                    Tags y Puntos Resultantes
                    ${maxTagCompartido ? `<span style="font-weight:400;text-transform:none;letter-spacing:0;margin-left:6px;">· Mayor compartido: <b style="color:var(--fp);">${_esc(maxTagCompartido)} (${maxPtsCompartidos}pt)</b></span>` : ''}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;font-size:0.7em;color:var(--gray-500);">
                    <span>⊕ suma</span><span>↑ sinergia/mayor</span><span>→ herencia</span><span>≡ base</span>
                </div>
                <div class="tags-resultado">
                    ${tagsHtml || '<span style="color:var(--gray-500);font-size:0.85em;">Sin tags resultantes.</span>'}
                </div>
            </div>

            <div style="display:flex;gap:10px;padding-top:4px;border-top:1px solid var(--border);flex-wrap:wrap;">
                ${accionBtn}
                <button class="btn btn-outline btn-lg" onclick="window._fusionResetResultado()">Reiniciar</button>
            </div>
        </div>
    </div>`;

    requestAnimationFrame(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

// ═══════════════════════════════════════════════════════════════
// TAB: FUSIONES ACTIVAS
// ═══════════════════════════════════════════════════════════════
export function renderFusionesActivas() {
    const wrap = document.getElementById('vista-activas');
    if (!wrap) return;

    if (!fusionesActivas.length) {
        wrap.innerHTML = `<div class="card"><div class="card-title">Fusiones Activas</div>
        <div class="empty-state"><div style="font-size:2.5em;margin-bottom:12px;">⚡</div>
        <h3>Sin fusiones activas</h3><p>Cuando se oficialice una fusión aparecerá aquí.</p></div></div>`;
        return;
    }

    const cards = fusionesActivas.map(f => {
        const rend    = f.rendimiento || 0;
        const rendCls = rend <= 33 ? 'rend-bajo' : rend <= 66 ? 'rend-medio' : 'rend-alto';
        const regla   = getRegla(rend);
        const fecha   = f.creado_en ? new Date(f.creado_en).toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric' }) : '—';

        const terminBtn = fusionsState.esAdmin
            ? `<button class="btn btn-red btn-sm" onclick="window._fusionTerminar('${f.id}','${f.pj_a.replace(/'/g,"\\'")}','${f.pj_b.replace(/'/g,"\\'")}')">Terminar</button>`
            : '';

        return `
        <div class="fusion-activa-card">
            <div class="fusion-activa-imgs">
                <img src="${imgPJ(f.pj_a)}" onerror="this.onerror=null;this.src='${fb()}'">
                <img src="${imgPJ(f.pj_b)}" onerror="this.onerror=null;this.src='${fb()}'">
            </div>
            <div class="fusion-activa-info">
                <div class="fusion-activa-names">${_esc(f.pj_a)} ⚡ ${_esc(f.pj_b)}</div>
                <div class="fusion-activa-meta">
                    <span class="regla-badge ${regla.clase}" style="font-size:0.68em;">${regla.label}</span>
                    ${f.tag_fusion ? `&nbsp;·&nbsp;<span style="color:var(--fp);font-weight:700;font-size:0.8em;">${_esc(f.tag_fusion)}</span>` : ''}
                    &nbsp;·&nbsp; Desde ${fecha}
                </div>
            </div>
            <div class="rendimiento-pill ${rendCls}">${rend}</div>
            ${terminBtn}
        </div>`;
    }).join('');

    wrap.innerHTML = `<div class="card"><div class="card-title">Fusiones Activas (${fusionesActivas.length})</div>
    <div style="display:flex;flex-direction:column;gap:10px;">${cards}</div></div>`;
}

// ═══════════════════════════════════════════════════════════════
// TAB: REGISTRO (incluye sugerencias pendientes para el OP)
// ═══════════════════════════════════════════════════════════════
export async function renderRegistro() {
    const wrap = document.getElementById('vista-registro');
    if (!wrap) return;

    // Si es OP, cargar también sugerencias pendientes
    let sugerencias = [];
    if (fusionsState.esAdmin) {
        const { supabase: sb } = await import('../bnh-auth.js');
        const { data } = await sb.from('sugerencias_fusion')
            .select('*').eq('estado', 'pendiente').order('creado_en', { ascending: false });
        sugerencias = data || [];
    }

    // Sección de sugerencias (solo visible para OP)
    let sugSection = '';
    if (fusionsState.esAdmin && sugerencias.length) {
        const sugCards = sugerencias.map(s => {
            const fecha = new Date(s.creado_en).toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric' });
            const rendTotal = s.rend_total || s.rendimiento;
            const regla = getRegla(rendTotal);

            // Tags top 5
            const tagsArr = (Array.isArray(s.tags_resultado) ? s.tags_resultado : []).sort((a,b) => b.pts - a.pts).slice(0, 5);
            const tagsHtml = tagsArr.map(t => `<span class="tag-res tag-res-${t.tipo}" style="font-size:0.72em;">${_esc(t.tag)} <span class="tag-pts">${t.pts}pt</span></span>`).join('');

            return `
            <div style="background:rgba(214,137,16,0.04);border:1.5px solid var(--orange);border-radius:var(--radius-lg);padding:14px 16px;display:flex;flex-direction:column;gap:8px;">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:200px;">
                        <div style="position:relative;width:52px;height:36px;flex-shrink:0;">
                            <img src="${imgPJ(s.pj_a)}" onerror="this.onerror=null;this.src='${fb()}'" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid white;position:absolute;left:0;z-index:2;">
                            <img src="${imgPJ(s.pj_b)}" onerror="this.onerror=null;this.src='${fb()}'" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid white;position:absolute;left:16px;z-index:1;opacity:0.9;">
                        </div>
                        <div>
                            <div style="font-weight:700;font-size:0.9em;">${_esc(s.pj_a)} ⚡ ${_esc(s.pj_b)}</div>
                            <div style="font-size:0.75em;color:var(--gray-500);">Sugerido el ${fecha}</div>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span class="regla-badge ${regla?.clase||'regla-basica'}" style="font-size:0.68em;">${regla?.label||'—'}</span>
                        <span style="font-size:0.78em;color:var(--gray-500);">D${s.rendimiento}${s.compat_bonus?` +${s.compat_bonus}%`:''}=${rendTotal}%</span>
                        ${s.tag_fusion ? `<span style="font-size:0.78em;font-weight:700;color:var(--fp);background:var(--fp-pale);border:1px solid var(--fp);padding:2px 8px;border-radius:8px;">${_esc(s.tag_fusion)}</span>` : ''}
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,auto) 1fr;gap:8px;align-items:center;">
                    ${[['POT',s.stats_pot,'var(--orange)'],['AGI',s.stats_agi,'#2980b9'],['CTL',s.stats_ctl,'var(--green-light)']].map(([l,v,c]) =>
                        `<div style="font-size:0.78em;text-align:center;background:white;border:1px solid var(--border);border-radius:6px;padding:4px 8px;">
                            <div style="font-size:0.7em;color:var(--gray-500);">${l}</div><div style="font-weight:800;color:${c};">${v}</div>
                        </div>`).join('')}
                    <div></div>
                </div>
                ${tagsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:4px;">${tagsHtml}</div>` : ''}
                <div style="display:flex;gap:8px;padding-top:6px;border-top:1px solid var(--border);">
                    <button class="btn btn-green btn-sm" style="flex:1;" onclick="window._fusionAprobarSugerencia(${s.id})">✅ Aprobar</button>
                    <button class="btn btn-red btn-sm" style="flex:1;" onclick="window._fusionRechazarSugerencia(${s.id})">❌ Rechazar</button>
                </div>
            </div>`;
        }).join('');

        sugSection = `
        <div class="card" style="margin-bottom:16px;border-color:var(--orange);">
            <div class="card-title" style="color:var(--orange);">⏳ Sugerencias de Fusión Pendientes (${sugerencias.length})</div>
            <div style="display:flex;flex-direction:column;gap:10px;">${sugCards}</div>
        </div>`;
    }

    // Historial
    if (!registroFusiones.length) {
        wrap.innerHTML = sugSection + `<div class="card"><div class="card-title">Registro de Fusiones</div>
        <div class="empty-state"><div style="font-size:2.5em;margin-bottom:12px;">📋</div>
        <h3>Sin fusiones registradas</h3><p>El historial aparecerá aquí una vez se oficialice la primera fusión.</p></div></div>`;
        return;
    }

    const rows = registroFusiones.map(f => {
        const fecha   = f.creado_en ? new Date(f.creado_en).toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
        const reglaKey = { basica:'regla-basica', sinergia:'regla-sinergia', perfecta:'regla-perfecta', z1:'regla-basica', z2:'regla-sinergia', z3:'regla-perfecta', sugerencia_aprobada:'regla-sinergia' }[f.regla_aplicada] || 'regla-basica';
        const rend    = f.rendimiento || 0;
        const rendCls = rend <= 33 ? 'rend-bajo' : rend <= 66 ? 'rend-medio' : 'rend-alto';

        const tagsArr = (Array.isArray(f.tags_resultado) ? f.tags_resultado : []).sort((a, b) => b.pts - a.pts).slice(0, 5);
        const tagsHtml = tagsArr.map(t => {
            const cls = `tag-res-${t.tipo}`;
            return `<span class="tag-res ${cls}" style="font-size:0.72em;">${_esc(t.tag)} <span class="tag-pts">${t.pts}pt</span></span>`;
        }).join('');

        const borrarBtn = fusionsState.esAdmin
            ? `<button class="btn btn-outline btn-sm" style="border-color:var(--red);color:var(--red);" onclick="window._fusionBorrarRegistro('${f.id}')">🗑️</button>`
            : '';

        // ⚡ REGISTRO LIMPIO: Eliminada la referencia a f.tag_fusion_pts
        return `
        <div style="background:white;border:1.5px solid var(--border);border-radius:var(--radius-lg);padding:14px 16px;display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;">
                <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:200px;">
                    <div style="position:relative;width:52px;height:36px;flex-shrink:0;">
                        <img src="${imgPJ(f.pj_a)}" onerror="this.onerror=null;this.src='${fb()}'" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid white;position:absolute;left:0;z-index:2;">
                        <img src="${imgPJ(f.pj_b)}" onerror="this.onerror=null;this.src='${fb()}'" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid white;position:absolute;left:16px;z-index:1;opacity:0.9;">
                    </div>
                    <div>
                        <div style="font-weight:700;font-size:0.9em;">${_esc(f.pj_a)} ⚡ ${_esc(f.pj_b)}</div>
                        <div style="font-size:0.75em;color:var(--gray-500);">${fecha}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <div class="rendimiento-pill ${rendCls}" style="width:36px;height:36px;font-size:0.72em;">${rend}</div>
                    <span class="regla-badge ${reglaKey}" style="font-size:0.7em;">${f.regla_aplicada}</span>
                    ${f.tag_fusion ? `<span style="font-size:0.78em;font-weight:700;color:var(--fp);background:var(--fp-pale);border:1px solid var(--fp);padding:2px 8px;border-radius:8px;">${_esc(f.tag_fusion)}</span>` : ''}
                    ${borrarBtn}
                </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(4,auto) 1fr;gap:8px;align-items:center;flex-wrap:wrap;">
                ${[['POT',f.stats_pot,'rgba(214,137,16,0.08)','rgba(214,137,16,0.3)','var(--orange)'],
                   ['AGI',f.stats_agi,'rgba(41,128,185,0.08)','rgba(41,128,185,0.3)','#2980b9'],
                   ['CTL',f.stats_ctl,'rgba(39,174,96,0.08)','rgba(39,174,96,0.3)','var(--green-light)']].map(([l,v,bg,brd,c]) =>
                    `<div style="font-size:0.78em;text-align:center;background:${bg};border:1px solid ${brd};border-radius:6px;padding:4px 8px;">
                        <div style="font-size:0.7em;color:var(--gray-500);">${l}</div>
                        <div style="font-weight:800;color:${c};">${v}</div>
                    </div>`).join('')}
                <div style="font-size:0.78em;text-align:center;background:var(--fp-pale);border:1px solid var(--fp);border-radius:6px;padding:4px 8px;">
                    <div style="font-size:0.7em;color:var(--gray-500);">PAC</div>
                    <div style="font-weight:800;color:var(--fp-dark);">${f.stats_pac || (f.stats_pot + f.stats_agi + f.stats_ctl)}</div>
                </div>
                ${f.max_tag_compartido ? `<div style="font-size:0.75em;color:var(--gray-500);">Mayor compartido: <b style="color:var(--fp-dark);">${_esc(f.max_tag_compartido)}</b> · ${f.max_pts_compartidos}pt</div>` : '<div></div>'}
            </div>

            ${tagsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:4px;">${tagsHtml}</div>` : ''}
        </div>`;
    }).join('');

    wrap.innerHTML = sugSection + `
    <div class="card">
        <div class="card-title">Registro de Fusiones (${registroFusiones.length})</div>
        <div style="display:flex;flex-direction:column;gap:10px;">${rows}</div>
    </div>`;
}

// ─── Toast ────────────────────────────────────────────────────
export function toast(msg, tipo = 'ok') {
    const el = document.getElementById('toast-msg');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast-' + tipo;
    setTimeout(() => { el.className = ''; }, 3200);
}
