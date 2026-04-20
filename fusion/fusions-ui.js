// fusions/fusions-ui.js
import { fusionsState, personajes, fusionesActivas, registroFusiones, STORAGE_URL, norm } from './fusions-state.js';
import { getRegla, getReglas } from './fusions-logic.js';
import { opcionesState, renderOpciones } from './fusions-options.js';
import { estaEnFusion } from '../bnh-fusion.js';

export { renderOpciones };  // re-exportar para fusions-main.js

const _esc  = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const fb    = () => `${STORAGE_URL}/imginterfaz/no_encontrado.png`;
const imgPJ = n => `${STORAGE_URL}/imgpersonajes/${norm(n)}icon.png`;

// ═══════════════════════════════════════════════════════════════
// TAB: SIMULADOR
// ═══════════════════════════════════════════════════════════════
export function renderSimulador() {
    const wrap = document.getElementById('vista-simulador');
    if (!wrap) return;

    wrap.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
        <div class="card-title">Pool de Personajes</div>
        <div class="char-pool" id="char-pool">${renderCharPool()}</div>
        <div style="margin-top:10px;font-size:0.78em;color:var(--gray-500);">
            Click para seleccionar <span style="color:var(--fp);font-weight:700;">Sujeto A</span> y 
            <span style="color:var(--fa);font-weight:700;">Sujeto B</span>.
            ⚡ = ya en fusión activa.
        </div>
    </div>

    <div class="fusion-layout" style="margin-bottom:16px;">
        <div id="slot-a" class="slot-card">${renderSlot('a')}</div>
        <div class="vs-panel">${renderVsPanel()}</div>
        <div id="slot-b" class="slot-card">${renderSlot('b')}</div>
    </div>

    <div id="resultado-fusion" class="oculto"></div>
    `;

    _actualizarClasesPool();
    _actualizarSlot('a');
    _actualizarSlot('b');
    _actualizarVsPanel();

    if (fusionsState.resultadoCalculado) renderResultado(fusionsState.resultadoCalculado);
}

function renderCharPool() {
    if (!personajes.length) {
        return `<div style="color:var(--gray-500);font-size:0.85em;padding:12px 0;">Cargando personajes…</div>`;
    }
    return personajes.map(p => {
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
    const d100  = fusionsState.d100 || '';
    const regla = d100 ? getRegla(parseInt(d100)) : null;
    const pct   = d100 ? Math.min(100, parseInt(d100)) : 0;

    return `
    <div class="vs-orb">VS</div>
    <div class="d100-wrap">
        <div class="d100-label">Rendimiento D100</div>
        <input type="number" class="d100-input" id="inp-d100"
            min="1" max="100" placeholder="—" value="${d100}"
            oninput="window._fusionD100Change(this.value)">
        <div class="compat-bar-wrap">
            <div class="compat-bar"><div class="compat-fill" id="compat-fill" style="width:${pct}%;"></div></div>
            <div class="compat-label" id="compat-label">${pct ? pct + '% compatibilidad' : 'Ingresa el dado'}</div>
        </div>
        ${regla ? `<div class="regla-badge ${regla.clase}">${regla.label}</div>` : ''}
    </div>
    <button class="btn btn-fusion btn-lg" style="width:100%;margin-top:4px;" onclick="window._fusionSimular()">⚡ Simular</button>`;
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
function _actualizarVsPanel() {
    const el = document.querySelector('.vs-panel');
    if (el) el.innerHTML = renderVsPanel();
}
export function actualizarVsPanelPublic()    { _actualizarVsPanel(); }
export function actualizarSlotPublic(letra)  { _actualizarSlot(letra); _actualizarClasesPool(); }

// ─── Resultado ────────────────────────────────────────────────
export function renderResultado(resultado) {
    const wrap = document.getElementById('resultado-fusion');
    if (!wrap) return;
    wrap.classList.remove('oculto');

    const { regla, statsBase, statsFinales, tags, pjA, pjB, d100, maxTagCompartido, maxPtsCompartidos } = resultado;
    const sf  = fusionsState.statsEditadas;
    const pot = sf.pot !== null ? sf.pot : statsFinales.pot;
    const agi = sf.agi !== null ? sf.agi : statsFinales.agi;
    const ctl = sf.ctl !== null ? sf.ctl : statsFinales.ctl;

    const dL  = d => d === 0 ? '' : (d > 0 ? `+${d}` : `${d}`);
    const dC  = d => d === 0 ? 'sdelta-neu' : (d > 0 ? 'sdelta-pos' : 'sdelta-neg');

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

    // Input para el tag de fusión (si está activado en opciones)
    const tagFusionSection = opcionesState.crear_tag_fusion ? `
    <div style="padding:14px 20px;border-top:1px solid var(--border);">
        <div style="font-size:0.72em;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--gray-500);margin-bottom:8px;">
            ✨ Tag de Fusión Temporal
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <div style="flex:1;min-width:200px;">
                <input class="inp" type="text" id="inp-tag-fusion"
                    placeholder="#VaporFusion, #CieloLlama, etc."
                    value="${_esc(fusionsState.tagFusionNombre || '')}"
                    oninput="window._fusionTagNombreChange(this.value)"
                    style="font-weight:700;color:var(--fp);">
            </div>
            <div style="font-size:0.8em;color:var(--gray-500);">
                ${opcionesState.pts_tag_fusion} PT iniciales
            </div>
        </div>
        <div style="font-size:0.75em;color:var(--gray-500);margin-top:4px;">
            Este tag se asignará a ambos personajes al oficializar. El # se añade automáticamente.
            ${maxTagCompartido ? `<b>Inspiración:</b> el tag más compartido fue ${_esc(maxTagCompartido)} con ${maxPtsCompartidos} PT.` : ''}
        </div>
    </div>` : '';

    wrap.innerHTML = `
    <div class="resultado-section">
        <div class="resultado-header">
            <h3>⚡ ${_esc(pjA)} + ${_esc(pjB)}</h3>
            <div class="regla-badge ${regla.clase}">${regla.label} · D${d100}</div>
        </div>

        <!-- Stats editables -->
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
                Base calculada (modo <b>${resultado.opciones.modo_stats}</b>): POT ${statsBase.pot} · AGI ${statsBase.agi} · CTL ${statsBase.ctl}
                &nbsp;·&nbsp; PAC: <b id="pac-display">${pot + agi + ctl}</b>
            </div>
        </div>

        ${tagFusionSection}

        <!-- Tags -->
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
                <button class="btn btn-fusion btn-lg" style="flex:1;min-width:180px;" onclick="window._fusionOficializar()">
                    ⚡ Oficializar en Base de Datos
                </button>
                <button class="btn btn-outline btn-lg" onclick="window._fusionResetResultado()">
                    Reiniciar
                </button>
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
        const rend = f.rendimiento || 0;
        const rendCls = rend <= 33 ? 'rend-bajo' : rend <= 66 ? 'rend-medio' : 'rend-alto';
        const regla = getRegla(rend);
        const fecha = f.creado_en ? new Date(f.creado_en).toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric' }) : '—';

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
                    ${f.tag_fusion ? `&nbsp;·&nbsp; <span style="color:var(--fp);font-weight:700;font-size:0.8em;">${_esc(f.tag_fusion)}</span>` : ''}
                    &nbsp;·&nbsp; Desde ${fecha}
                </div>
            </div>
            <div class="rendimiento-pill ${rendCls}">${rend}</div>
            <button class="btn btn-red btn-sm" onclick="window._fusionTerminar(${f.id},'${f.pj_a.replace(/'/g,"\\'")}','${f.pj_b.replace(/'/g,"\\'")}')">
                Terminar
            </button>
        </div>`;
    }).join('');

    wrap.innerHTML = `<div class="card"><div class="card-title">Fusiones Activas (${fusionesActivas.length})</div>
    <div style="display:flex;flex-direction:column;gap:10px;">${cards}</div></div>`;
}

// ═══════════════════════════════════════════════════════════════
// TAB: REGISTRO
// ═══════════════════════════════════════════════════════════════
export function renderRegistro() {
    const wrap = document.getElementById('vista-registro');
    if (!wrap) return;

    if (!registroFusiones.length) {
        wrap.innerHTML = `<div class="card"><div class="card-title">Registro de Fusiones</div>
        <div class="empty-state"><div style="font-size:2.5em;margin-bottom:12px;">📋</div>
        <h3>Sin fusiones registradas</h3><p>El historial aparecerá aquí una vez se oficialice la primera fusión.</p></div></div>`;
        return;
    }

    const rows = registroFusiones.map(f => {
        const fecha = f.creado_en ? new Date(f.creado_en).toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
        const regla = { basica:'regla-basica', sinergia:'regla-sinergia', perfecta:'regla-perfecta', z1:'regla-basica', z2:'regla-sinergia', z3:'regla-perfecta' }[f.regla_aplicada] || 'regla-basica';
        const rend = f.rendimiento || 0;
        const rendCls = rend <= 33 ? 'rend-bajo' : rend <= 66 ? 'rend-medio' : 'rend-alto';

        // Top 5 tags del resultado
        const tagsArr = (Array.isArray(f.tags_resultado) ? f.tags_resultado : [])
            .sort((a, b) => b.pts - a.pts)
            .slice(0, 5);
        const tagsHtml = tagsArr.map(t => {
            const cls = `tag-res-${t.tipo}`;
            return `<span class="tag-res ${cls}" style="font-size:0.72em;">${_esc(t.tag)} <span class="tag-pts">${t.pts}pt</span></span>`;
        }).join('');

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
                    <span class="regla-badge ${regla}" style="font-size:0.7em;">${f.regla_aplicada}</span>
                    ${f.tag_fusion ? `<span style="font-size:0.78em;font-weight:700;color:var(--fp);background:var(--fp-pale);border:1px solid var(--fp);padding:2px 8px;border-radius:8px;">${_esc(f.tag_fusion)} · ${f.tag_fusion_pts}pt</span>` : ''}
                </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(4,auto) 1fr;gap:8px;align-items:center;flex-wrap:wrap;">
                <div style="font-size:0.78em;text-align:center;background:rgba(214,137,16,0.08);border:1px solid rgba(214,137,16,0.3);border-radius:6px;padding:4px 8px;">
                    <div style="font-size:0.7em;color:var(--gray-500);">POT</div>
                    <div style="font-weight:800;color:var(--orange);">${f.stats_pot}</div>
                </div>
                <div style="font-size:0.78em;text-align:center;background:rgba(41,128,185,0.08);border:1px solid rgba(41,128,185,0.3);border-radius:6px;padding:4px 8px;">
                    <div style="font-size:0.7em;color:var(--gray-500);">AGI</div>
                    <div style="font-weight:800;color:#2980b9;">${f.stats_agi}</div>
                </div>
                <div style="font-size:0.78em;text-align:center;background:rgba(39,174,96,0.08);border:1px solid rgba(39,174,96,0.3);border-radius:6px;padding:4px 8px;">
                    <div style="font-size:0.7em;color:var(--gray-500);">CTL</div>
                    <div style="font-weight:800;color:var(--green-light);">${f.stats_ctl}</div>
                </div>
                <div style="font-size:0.78em;text-align:center;background:var(--fp-pale);border:1px solid var(--fp);border-radius:6px;padding:4px 8px;">
                    <div style="font-size:0.7em;color:var(--gray-500);">PAC</div>
                    <div style="font-weight:800;color:var(--fp-dark);">${f.stats_pac || (f.stats_pot + f.stats_agi + f.stats_ctl)}</div>
                </div>
                ${f.max_tag_compartido ? `
                <div style="font-size:0.75em;color:var(--gray-500);">
                    Mayor compartido: <b style="color:var(--fp-dark);">${_esc(f.max_tag_compartido)}</b> · ${f.max_pts_compartidos}pt
                </div>` : '<div></div>'}
            </div>

            ${tagsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:4px;">${tagsHtml}</div>` : ''}
        </div>`;
    }).join('');

    wrap.innerHTML = `
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
