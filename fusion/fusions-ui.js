// fusions/fusions-ui.js
import { fusionsState, personajes, fusionesActivas, STORAGE_URL, norm } from './fusions-state.js';
import { getRegla } from './fusions-logic.js';
import { estaEnFusion } from '../bnh-fusion.js';

const _esc  = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const fb    = () => `${STORAGE_URL}/imginterfaz/no_encontrado.png`;
const imgPJ = n => `${STORAGE_URL}/imgpersonajes/${norm(n)}icon.png`;

// ─── Tab: Simulador ───────────────────────────────────────────
export function renderSimulador() {
    const wrap = document.getElementById('vista-simulador');
    if (!wrap) return;

    wrap.innerHTML = `
    <!-- Pool de personajes -->
    <div class="card" style="margin-bottom:16px;">
        <div class="card-title">Pool de Personajes</div>
        <div class="char-pool" id="char-pool">
            ${renderCharPool()}
        </div>
        <div style="margin-top:10px;font-size:0.78em;color:var(--gray-500);">
            Click para seleccionar <span style="color:var(--fp);font-weight:700;">Sujeto A</span> (primero) y 
            <span style="color:var(--fa);font-weight:700;">Sujeto B</span> (segundo).
            Los personajes ⚡ ya están en una fusión activa.
        </div>
    </div>

    <!-- Grid fusión -->
    <div class="fusion-layout" style="margin-bottom:16px;">
        <div id="slot-a" class="slot-card">
            ${renderSlot('a')}
        </div>
        <div class="vs-panel">
            ${renderVsPanel()}
        </div>
        <div id="slot-b" class="slot-card">
            ${renderSlot('b')}
        </div>
    </div>

    <!-- Resultado -->
    <div id="resultado-fusion" class="oculto"></div>
    `;

    // Re-aplicar estado si ya había selección
    _actualizarClasesPool();
    _actualizarSlot('a');
    _actualizarSlot('b');
    _actualizarVsPanel();

    // Restaurar resultado si existía
    if (fusionsState.resultadoCalculado) {
        renderResultado(fusionsState.resultadoCalculado);
    }
}

function renderCharPool() {
    return personajes.map(p => {
        const enFusion = estaEnFusion(p.nombre);
        const isA = fusionsState.pjA === p.nombre;
        const isB = fusionsState.pjB === p.nombre;
        let cls = '';
        if (isA) cls = 'sel-a';
        else if (isB) cls = 'sel-b';
        else if (enFusion) cls = 'en-fusion';
        const tags = (p.tags || []).slice(0, 3).map(t => t.startsWith('#') ? t : '#' + t).join(' ');

        return `<div class="char-thumb ${cls}" data-nombre="${_esc(p.nombre)}"
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

    if (!nombre) {
        return `
        <div class="slot-label">${label}</div>
        <div style="font-size:2.5em;opacity:0.18;">👤</div>
        <div style="font-size:0.8em;color:var(--gray-500);">Click un personaje</div>`;
    }

    const pj = personajes.find(p => p.nombre === nombre);
    if (!pj) return '';

    const tags = (pj.tags || []).slice(0, 8).map(t => {
        const tn = t.startsWith('#') ? t : '#' + t;
        return `<span class="stag">${_esc(tn)}</span>`;
    }).join('');

    const pac = (pj.pot || 0) + (pj.agi || 0) + (pj.ctl || 0);

    return `
    <button class="slot-clear" onclick="window._fusionClearSlot('${letra}')" title="Quitar">×</button>
    <div class="slot-label" style="color:${color};">${label}</div>
    <img class="slot-img" src="${imgPJ(nombre)}" onerror="this.onerror=null;this.src='${fb()}'">
    <div class="slot-name">${_esc(nombre)}</div>
    <div class="slot-stats">
        <div class="slot-stat">
            <span class="s-lbl">POT</span>
            <span class="s-val" style="color:var(--orange);">${pj.pot || 0}</span>
        </div>
        <div class="slot-stat">
            <span class="s-lbl">AGI</span>
            <span class="s-val" style="color:#2980b9;">${pj.agi || 0}</span>
        </div>
        <div class="slot-stat">
            <span class="s-lbl">CTL</span>
            <span class="s-val" style="color:var(--green-light);">${pj.ctl || 0}</span>
        </div>
        <div class="slot-stat">
            <span class="s-lbl">PAC</span>
            <span class="s-val" style="color:var(--fp);">${pac}</span>
        </div>
    </div>
    <div class="slot-tag-cloud">${tags}</div>
    `;
}

function renderVsPanel() {
    const d100 = fusionsState.d100 || '';
    const regla = d100 ? getRegla(parseInt(d100)) : null;
    const pct   = d100 ? Math.min(100, parseInt(d100)) : 0;

    return `
    <div class="vs-orb">VS</div>
    <div class="d100-wrap">
        <div class="d100-label">Rendimiento D100</div>
        <input type="number" class="d100-input" id="inp-d100"
            min="1" max="100" placeholder="—"
            value="${d100}"
            oninput="window._fusionD100Change(this.value)">
        <div class="compat-bar-wrap">
            <div class="compat-bar">
                <div class="compat-fill" id="compat-fill" style="width:${pct}%;"></div>
            </div>
            <div class="compat-label" id="compat-label">${pct ? pct + '% compatibilidad' : 'Ingresa el dado'}</div>
        </div>
        ${regla ? `<div class="regla-badge ${regla.clase}">${regla.label}</div>` : ''}
        ${regla ? `<div style="font-size:0.7em;color:var(--gray-500);text-align:center;">${regla.desc}</div>` : ''}
    </div>
    <button class="btn btn-fusion btn-lg" style="width:100%;margin-top:4px;" onclick="window._fusionSimular()">
        ⚡ Simular
    </button>
    `;
}

function _actualizarClasesPool() {
    const pool = document.getElementById('char-pool');
    if (!pool) return;
    pool.innerHTML = renderCharPool();
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
    if (!el) return;
    el.innerHTML = renderVsPanel();
}

export function actualizarVsPanelPublic() {
    _actualizarVsPanel();
}

export function actualizarSlotPublic(letra) {
    _actualizarSlot(letra);
    _actualizarClasesPool();
}

// ─── Resultado de simulación ───────────────────────────────────
export function renderResultado(resultado) {
    const wrap = document.getElementById('resultado-fusion');
    if (!wrap) return;
    wrap.classList.remove('oculto');

    const { regla, statsBase, statsFinales, tags, pjA, pjB, d100 } = resultado;

    // Usar overrides editados si existen
    const sf = fusionsState.statsEditadas;
    const pot = sf.pot !== null ? sf.pot : statsFinales.pot;
    const agi = sf.agi !== null ? sf.agi : statsFinales.agi;
    const ctl = sf.ctl !== null ? sf.ctl : statsFinales.ctl;

    const deltaPot = pot - statsBase.pot;
    const deltaAgi = agi - statsBase.agi;
    const deltaCtl = ctl - statsBase.ctl;
    const deltaLabel = d => d === 0 ? '' : (d > 0 ? `+${d}` : `${d}`);
    const deltaCls   = d => d === 0 ? 'sdelta-neu' : (d > 0 ? 'sdelta-pos' : 'sdelta-neg');

    // Tags ordenados por pts desc
    const tagsOrdenados = Object.entries(tags)
        .filter(([, d]) => d.pts > 0)
        .sort((a, b) => b[1].pts - a[1].pts);

    const tagsHtml = tagsOrdenados.map(([tag, data]) => {
        const cls = `tag-res-${data.tipo}`;
        const tipoIcon = data.tipo === 'suma' ? '⊕' : data.tipo === 'sinergia' ? '↑' : data.tipo === 'herencia' ? '→' : '≡';
        return `<span class="tag-res ${cls}" title="${data.tipo}: A=${data.aportaA} B=${data.aportaB}">
            <span style="opacity:0.6;font-size:0.85em;">${tipoIcon}</span>
            ${_esc(tag)}
            <span class="tag-pts">${data.pts}pt</span>
        </span>`;
    }).join('');

    wrap.innerHTML = `
    <div class="resultado-section">
        <div class="resultado-header">
            <h3>⚡ Resultado: ${_esc(pjA)} + ${_esc(pjB)}</h3>
            <div class="regla-badge ${regla.clase}" style="font-size:0.75em;">${regla.label} · D${d100}</div>
        </div>

        <!-- Stats con edición inline -->
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);">
            <div style="font-size:0.72em;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--gray-500);margin-bottom:10px;">
                Stats Resultantes
                <span style="font-weight:400;color:var(--gray-400);text-transform:none;letter-spacing:0;margin-left:6px;">(edita los valores si necesitas ajuste manual)</span>
            </div>
            <div class="stat-edit-grid">
                <div class="stat-edit-box">
                    <span class="slbl">POT</span>
                    <input class="sinp" type="number" id="edit-pot" value="${pot}" min="0"
                        style="color:var(--orange);"
                        oninput="window._fusionEditStat('pot',this.value)">
                    ${deltaLabel(deltaPot) ? `<span class="sdelta ${deltaCls(deltaPot)}">${deltaLabel(deltaPot)}</span>` : '<span style="height:18px;"></span>'}
                </div>
                <div class="stat-edit-box">
                    <span class="slbl">AGI</span>
                    <input class="sinp" type="number" id="edit-agi" value="${agi}" min="0"
                        style="color:#2980b9;"
                        oninput="window._fusionEditStat('agi',this.value)">
                    ${deltaLabel(deltaAgi) ? `<span class="sdelta ${deltaCls(deltaAgi)}">${deltaLabel(deltaAgi)}</span>` : '<span style="height:18px;"></span>'}
                </div>
                <div class="stat-edit-box">
                    <span class="slbl">CTL</span>
                    <input class="sinp" type="number" id="edit-ctl" value="${ctl}" min="0"
                        style="color:var(--green-light);"
                        oninput="window._fusionEditStat('ctl',this.value)">
                    ${deltaLabel(deltaCtl) ? `<span class="sdelta ${deltaCls(deltaCtl)}">${deltaLabel(deltaCtl)}</span>` : '<span style="height:18px;"></span>'}
                </div>
            </div>
            <div style="margin-top:8px;font-size:0.75em;color:var(--gray-500);">
                Base calculada: POT ${statsBase.pot} · AGI ${statsBase.agi} · CTL ${statsBase.ctl}
                &nbsp;·&nbsp; PAC: <b>${pot + agi + ctl}</b>
            </div>
        </div>

        <!-- Tags -->
        <div class="res-body">
            <div>
                <div style="font-size:0.72em;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--gray-500);margin-bottom:8px;">
                    Tags y Puntos Resultantes
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
                    <span style="font-size:0.7em;display:flex;align-items:center;gap:4px;color:var(--green-dark);"><span>⊕</span> suma</span>
                    <span style="font-size:0.7em;display:flex;align-items:center;gap:4px;color:#7d5a00;"><span>↑</span> sinergia (mayor)</span>
                    <span style="font-size:0.7em;display:flex;align-items:center;gap:4px;color:var(--fp-dark);"><span>→</span> herencia (uno solo)</span>
                    <span style="font-size:0.7em;display:flex;align-items:center;gap:4px;color:var(--gray-500);"><span>≡</span> base</span>
                </div>
                <div class="tags-resultado">
                    ${tagsHtml || '<span style="color:var(--gray-500);font-size:0.85em;">Sin tags resultantes.</span>'}
                </div>
            </div>

            <!-- Acción -->
            <div style="display:flex;gap:10px;padding-top:4px;border-top:1px solid var(--border);flex-wrap:wrap;">
                <button class="btn btn-fusion btn-lg" style="flex:1;min-width:180px;" onclick="window._fusionOficializar()">
                    ⚡ Oficializar Fusión en Base de Datos
                </button>
                <button class="btn btn-outline btn-lg" onclick="window._fusionResetResultado()">
                    Reiniciar
                </button>
            </div>
        </div>
    </div>
    `;

    // Scroll suave al resultado
    requestAnimationFrame(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

// ─── Tab: Fusiones Activas ─────────────────────────────────────
export function renderFusionesActivas() {
    const wrap = document.getElementById('vista-activas');
    if (!wrap) return;

    if (!fusionesActivas.length) {
        wrap.innerHTML = `
        <div class="card">
            <div class="card-title">Fusiones Activas</div>
            <div class="empty-state">
                <div style="font-size:2.5em;margin-bottom:12px;">⚡</div>
                <h3>Sin fusiones activas</h3>
                <p>Cuando se oficialice una fusión aparecerá aquí.</p>
            </div>
        </div>`;
        return;
    }

    const cards = fusionesActivas.map(f => {
        const imgA = imgPJ(f.pj_a);
        const imgB = imgPJ(f.pj_b);
        const rend = f.rendimiento || 0;
        const rendCls = rend <= 33 ? 'rend-bajo' : rend <= 66 ? 'rend-medio' : 'rend-alto';
        const regla = getRegla(rend);
        const fecha = f.creado_en ? new Date(f.creado_en).toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric' }) : '—';

        return `
        <div class="fusion-activa-card">
            <div class="fusion-activa-imgs">
                <img src="${imgA}" onerror="this.onerror=null;this.src='${fb()}'">
                <img src="${imgB}" onerror="this.onerror=null;this.src='${fb()}'">
            </div>
            <div class="fusion-activa-info">
                <div class="fusion-activa-names">${_esc(f.pj_a)} ⚡ ${_esc(f.pj_b)}</div>
                <div class="fusion-activa-meta">
                    <span class="regla-badge ${regla.clase}" style="font-size:0.68em;">${regla.label}</span>
                    &nbsp;·&nbsp; Desde ${fecha}
                </div>
            </div>
            <div class="rendimiento-pill ${rendCls}" title="Rendimiento D100">${rend}</div>
            <button class="btn btn-red btn-sm" onclick="window._fusionTerminar(${f.id},'${f.pj_a.replace(/'/g,"\\'")}','${f.pj_b.replace(/'/g,"\\'")}')">
                Terminar
            </button>
        </div>`;
    }).join('');

    wrap.innerHTML = `
    <div class="card">
        <div class="card-title">Fusiones Activas (${fusionesActivas.length})</div>
        <div style="display:flex;flex-direction:column;gap:10px;">${cards}</div>
    </div>`;
}

export function toast(msg, tipo = 'ok') {
    const el = document.getElementById('toast-msg');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast-' + tipo;
    setTimeout(() => { el.className = ''; }, 3200);
}
