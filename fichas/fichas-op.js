// ============================================================
// fichas-op.js — Panel OP (solo admin)
// Edición de stats PAC, PV, tags, PT manual, lore/quirk, fusión
// ============================================================
import { fichasGlobal, ptGlobal, fichasUI, STORAGE_URL, norm } from './fichas-state.js';
import { calcPVMax, calcTier, fmtTag, normTag }                  from './fichas-logic.js';
import {
    guardarStats, guardarLore, guardarTags,
    aplicarDeltaPT, crearPersonaje
} from './fichas-data.js';
import {
    activarFusion, terminarFusion, getFusionDe,
    fusionState, cargarFusiones
} from '../bnh-fusion.js';

// ── Modal genérico ────────────────────────────────────────────
function abrirModal(titulo, htmlCuerpo) {
    let modal = document.getElementById('op-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'op-modal';
        modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.82);
            z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);`;
        modal.onclick = e => { if (e.target === modal) cerrarModal(); };
        document.body.appendChild(modal);
    }
    modal.innerHTML = `
        <div style="background:#0d0d0d; border:1.5px solid #333; border-radius:12px;
                    padding:24px; width:95%; max-width:680px; max-height:85vh;
                    overflow-y:auto; position:relative;">
            <div style="display:flex; justify-content:space-between; align-items:center;
                        border-bottom:1px solid #222; padding-bottom:12px; margin-bottom:18px;">
                <h2 style="margin:0; color:#a855f7; font-family:'Cinzel',serif; font-size:1.1em;">${titulo}</h2>
                <button onclick="window._cerrarModalOP()"
                    style="background:none; border:none; color:#666; font-size:1.4em; cursor:pointer;">×</button>
            </div>
            <div id="op-modal-body">${htmlCuerpo}</div>
        </div>`;
    modal.style.display = 'flex';
}

function cerrarModal() {
    const modal = document.getElementById('op-modal');
    if (modal) modal.style.display = 'none';
}

window._cerrarModalOP = cerrarModal;

// ── Helpers de UI ─────────────────────────────────────────────
function row(label, contenido) {
    return `<div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
        <label style="color:#888; font-size:0.82em; min-width:110px;">${label}</label>
        <div style="flex:1;">${contenido}</div>
    </div>`;
}

function inp(id, val, type = 'number', extra = '') {
    return `<input id="${id}" type="${type}" value="${val ?? ''}" ${extra}
        style="width:100%; background:#111; color:#fff; border:1px solid #333;
               padding:7px 10px; border-radius:6px; font-size:0.9em; box-sizing:border-box;">`;
}

function btn(label, onclick, color = '#a855f7') {
    return `<button onclick="${onclick}"
        style="background:#1a1a1a; border:1.5px solid ${color}; color:${color};
               padding:7px 14px; border-radius:6px; cursor:pointer; font-size:0.82em;
               font-weight:700; transition:0.15s;"
        onmouseover="this.style.background='${color}';this.style.color='#000';"
        onmouseout="this.style.background='#1a1a1a';this.style.color='${color}';">${label}</button>`;
}

function msg(id) {
    return `<div id="${id}" style="min-height:18px; font-size:0.8em; margin-top:6px;"></div>`;
}

function setMsg(id, texto, ok = true) {
    const el = document.getElementById(id);
    if (el) { el.style.color = ok ? '#4ade80' : '#ef4444'; el.textContent = texto; }
}

// ── PANEL OP principal ────────────────────────────────────────
export function abrirPanelOP(nombre) {
    const p = fichasGlobal.find(x => x.nombre === nombre);
    if (!p) return;

    const pvMax = calcPVMax(p.pot || 0, p.agi || 0, p.ctl || 0);

    const html = `
    <!-- TABS -->
    <div style="display:flex; gap:6px; margin-bottom:18px; flex-wrap:wrap;" id="op-tabs">
        ${['Stats', 'Tags & PT', 'Lore', 'Fusión'].map((t, i) =>
            `<button onclick="window._opTab(${i})"
                id="op-tab-${i}"
                style="padding:6px 14px; border-radius:6px; cursor:pointer; font-size:0.82em;
                       font-weight:700; border:1.5px solid #333;
                       background:${i===0?'#a855f7':'#111'}; color:${i===0?'#000':'#888'};">
                ${t}
            </button>`
        ).join('')}
    </div>

    <!-- TAB 0: STATS -->
    <div id="op-panel-0">
        <p style="color:#666; font-size:0.8em; margin-bottom:14px;">
            Actual = PV/PT en este momento. Total = máximo base del stat.<br>
            POT/AGI/CTL Total son los valores base que determinan el Tier y PV Máximo.
        </p>
        ${row('POT Total', inp('op-pot', p.pot))}
        ${row('AGI Total', inp('op-agi', p.agi))}
        ${row('CTL Total', inp('op-ctl', p.ctl))}
        ${row('PV Actual', inp('op-pva', p.pv_actual ?? pvMax))}
        <div style="color:#555; font-size:0.78em; margin-bottom:14px;">
            PV Máximo calculado: <span id="op-pv-max-display" style="color:#00b4d8;">${pvMax}</span>
            (se recalcula al guardar)
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${btn('💾 Guardar Stats', `window._opGuardarStats('${nombre.replace(/'/g,"\\'")}')`, '#4ade80')}
            ${btn('↺ Restaurar PV al máximo', `window._opRestaurarPV('${nombre.replace(/'/g,"\\'")}')`, '#00b4d8')}
        </div>
        ${msg('op-stats-msg')}
    </div>

    <!-- TAB 1: TAGS & PT -->
    <div id="op-panel-1" style="display:none;">

        <h4 style="color:#aaa; margin:0 0 10px 0; font-size:0.85em; text-transform:uppercase;">Tags actuales</h4>
        <div id="op-tags-lista" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px; min-height:32px;">
            ${_renderTagsEditables(p.tags || [], ptGlobal[nombre] || {})}
        </div>

        <div style="display:flex; gap:8px; margin-bottom:18px;">
            <input id="op-tag-nuevo" type="text" placeholder="#NuevoTag"
                style="flex:1; background:#111; color:#fff; border:1px solid #333;
                       padding:7px 10px; border-radius:6px; font-size:0.88em;">
            ${btn('+ Agregar', `window._opAgregarTag('${nombre.replace(/'/g,"\\'")}')`, '#4ade80')}
        </div>
        ${msg('op-tags-msg')}

        <hr style="border-color:#1a1a1a; margin:18px 0;">

        <h4 style="color:#aaa; margin:0 0 10px 0; font-size:0.85em; text-transform:uppercase;">PT Manual</h4>
        <p style="color:#555; font-size:0.78em; margin-bottom:12px;">
            Usa esto para dar/quitar PT manualmente. Delta negativo = gasto.<br>
            Los tags de fusión (+5 por interacción) también se registran aquí.
        </p>
        ${row('Tag', `<select id="op-pt-tag" style="width:100%; background:#111; color:#fff;
                border:1px solid #333; padding:7px 10px; border-radius:6px;">
            <option value="">— Elige tag —</option>
            ${(p.tags || []).map(t => `<option value="${t}">${fmtTag(t)}</option>`).join('')}
        </select>`)}
        ${row('Delta (±)', inp('op-pt-delta', 1))}
        ${row('Motivo', `<select id="op-pt-motivo" style="width:100%; background:#111; color:#fff;
                border:1px solid #333; padding:7px 10px; border-radius:6px;">
            <option value="interaccion">Interacción (+1)</option>
            <option value="fusion">Fusión (+5)</option>
            <option value="gasto_stat">Gasto — +1 Stat (−50)</option>
            <option value="gasto_medalla">Gasto — Medalla (−75)</option>
            <option value="gasto_mutacion">Gasto — Mutación (−100)</option>
            <option value="manual">Manual (libre)</option>
        </select>`)}
        <div style="display:flex; gap:8px; margin-top:4px;">
            ${btn('Aplicar Delta PT', `window._opAplicarPT('${nombre.replace(/'/g,"\\'")}')`, '#00b4d8')}
        </div>
        ${msg('op-pt-msg')}
    </div>

    <!-- TAB 2: LORE -->
    <div id="op-panel-2" style="display:none;">
        <div style="margin-bottom:14px;">
            <label style="color:#888; font-size:0.82em; display:block; margin-bottom:6px;">Historia / Lore</label>
            <textarea id="op-lore" rows="8"
                style="width:100%; background:#111; color:#ddd; border:1px solid #333;
                       padding:10px; border-radius:6px; font-size:0.88em; resize:vertical;
                       box-sizing:border-box; line-height:1.6;">${escapeTA(p.lore || '')}</textarea>
        </div>
        <div style="margin-bottom:14px;">
            <label style="color:#888; font-size:0.82em; display:block; margin-bottom:6px;">Quirk / Habilidad</label>
            <textarea id="op-quirk" rows="6"
                style="width:100%; background:#111; color:#ddd; border:1px solid #333;
                       padding:10px; border-radius:6px; font-size:0.88em; resize:vertical;
                       box-sizing:border-box; line-height:1.6;">${escapeTA(p.quirk || '')}</textarea>
        </div>
        ${btn('💾 Guardar Lore', `window._opGuardarLore('${nombre.replace(/'/g,"\\'")}')`, '#4ade80')}
        ${msg('op-lore-msg')}
    </div>

    <!-- TAB 3: FUSIÓN -->
    <div id="op-panel-3" style="display:none;">
        ${_renderPanelFusion(nombre, p)}
    </div>`;

    abrirModal(`⚙️ Panel OP — ${nombre}`, html);

    // Recalcular PV max en tiempo real al cambiar PAC
    ['op-pot','op-agi','op-ctl'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            const pot = parseInt(document.getElementById('op-pot')?.value) || 0;
            const agi = parseInt(document.getElementById('op-agi')?.value) || 0;
            const ctl = parseInt(document.getElementById('op-ctl')?.value) || 0;
            const pvm = calcPVMax(pot, agi, ctl);
            const disp = document.getElementById('op-pv-max-display');
            if (disp) disp.textContent = pvm;
        });
    });
}

// ── Render tags editables ─────────────────────────────────────
function _renderTagsEditables(tags, ptDePJ) {
    if (!tags.length) return `<span style="color:#444; font-size:0.82em;">Sin tags</span>`;
    return tags.map(t => {
        const pts = ptDePJ[t] || 0;
        return `<span style="background:#111; border:1px solid #333; color:#00b4d8;
                             padding:3px 8px 3px 10px; border-radius:10px; font-size:0.78em;
                             display:inline-flex; align-items:center; gap:5px;">
            ${fmtTag(t)} <span style="color:#555;">${pts}pt</span>
            <button onclick="window._opQuitarTag(this, '${t.replace(/'/g,"\\'")}', false)"
                title="Quitar sin gastar PT"
                style="background:none; border:none; color:#ef4444; cursor:pointer;
                       font-size:0.9em; padding:0; line-height:1;">×</button>
        </span>`;
    }).join('');
}

// ── Panel de fusión ───────────────────────────────────────────
function _renderPanelFusion(nombre, p) {
    const fusionActiva = getFusionDe(nombre);

    if (fusionActiva) {
        const compañero = fusionActiva.pj_a === nombre ? fusionActiva.pj_b : fusionActiva.pj_a;
        return `
        <div style="background:#1a0040; border:1px solid #a855f7; border-radius:8px; padding:16px; margin-bottom:16px;">
            <p style="color:#c084fc; font-weight:700; margin:0 0 8px 0;">⚡ Fusión activa con <b>${compañero}</b></p>
            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:12px;">
                ${(fusionActiva.tags_fusionados || []).map(t =>
                    `<span style="background:#2d1b69; border:1px solid #7c3aed; color:#c084fc;
                                  padding:2px 8px; border-radius:8px; font-size:0.75em;">${fmtTag(t)}</span>`
                ).join('')}
            </div>
            ${btn('✕ Terminar Fusión', `window._opTerminarFusion('${fusionActiva.id}')`, '#ef4444')}
        </div>`;
    }

    const otrosPJ = fichasGlobal
        .filter(x => x.nombre !== nombre && !getFusionDe(x.nombre))
        .map(x => `<option value="${x.nombre}">${x.nombre}</option>`)
        .join('');

    if (!otrosPJ) return `<p style="color:#555; font-size:0.85em;">No hay otros personajes disponibles para fusión.</p>`;

    return `
    <p style="color:#888; font-size:0.82em; margin-bottom:14px; line-height:1.5;">
        Al activar la fusión:<br>
        • Los tags de ambos personajes se combinan.<br>
        • El doble icono aparece en el catálogo y ficha.<br>
        • El multiplicador ×5 de PT aplica cuando otorgues PT manualmente.
    </p>
    ${row('Fusionar con', `<select id="op-fusion-target"
        style="width:100%; background:#111; color:#fff; border:1px solid #333;
               padding:7px 10px; border-radius:6px;">
        <option value="">— Elige personaje —</option>
        ${otrosPJ}
    </select>`)}
    ${btn('⚡ Activar Fusión', `window._opActivarFusion('${nombre.replace(/'/g,"\\'")}')`, '#a855f7')}
    ${msg('op-fusion-msg')}`;
}

// ── Exponer funciones globales para onclick ───────────────────
export function exponerGlobalesOP() {

    window._opTab = (i) => {
        [0,1,2,3].forEach(j => {
            const panel = document.getElementById(`op-panel-${j}`);
            const tab   = document.getElementById(`op-tab-${j}`);
            if (panel) panel.style.display = j === i ? 'block' : 'none';
            if (tab) {
                tab.style.background = j === i ? '#a855f7' : '#111';
                tab.style.color      = j === i ? '#000'    : '#888';
            }
        });
    };

    window._opGuardarStats = async (nombre) => {
        const pot = parseInt(document.getElementById('op-pot')?.value) || 0;
        const agi = parseInt(document.getElementById('op-agi')?.value) || 0;
        const ctl = parseInt(document.getElementById('op-ctl')?.value) || 0;
        const pva = parseInt(document.getElementById('op-pva')?.value) || 0;
        const pvMax = calcPVMax(pot, agi, ctl);
        const res = await guardarStats(nombre, { pot, agi, ctl, pv_actual: Math.min(pva, pvMax) });
        setMsg('op-stats-msg', res.ok ? '✅ Stats guardados' : '❌ ' + res.msg, res.ok);
        if (res.ok) window.sincronizarVista?.();
    };

    window._opRestaurarPV = async (nombre) => {
        const p   = fichasGlobal.find(x => x.nombre === nombre);
        if (!p) return;
        const pvMax = calcPVMax(p.pot || 0, p.agi || 0, p.ctl || 0);
        document.getElementById('op-pva').value = pvMax;
        const res = await guardarStats(nombre, { pot: p.pot, agi: p.agi, ctl: p.ctl, pv_actual: pvMax });
        setMsg('op-stats-msg', res.ok ? `✅ PV restaurado a ${pvMax}` : '❌ ' + res.msg, res.ok);
        if (res.ok) window.sincronizarVista?.();
    };

    window._opAgregarTag = async (nombre) => {
        const inp = document.getElementById('op-tag-nuevo');
        const raw = inp?.value?.trim();
        if (!raw) return;
        const tag = raw.startsWith('#') ? raw : '#' + raw;
        const p   = fichasGlobal.find(x => x.nombre === nombre);
        if (!p) return;
        if ((p.tags || []).includes(tag)) {
            setMsg('op-tags-msg', 'Ese tag ya existe', false); return;
        }
        const nuevosTags = [...(p.tags || []), tag];
        const res = await guardarTags(nombre, nuevosTags);
        setMsg('op-tags-msg', res.ok ? `✅ Tag ${tag} agregado` : '❌ ' + res.msg, res.ok);
        if (res.ok) {
            inp.value = '';
            const lista = document.getElementById('op-tags-lista');
            if (lista) lista.innerHTML = _renderTagsEditables(nuevosTags, ptGlobal[nombre] || {});
            // Actualizar select de PT
            const sel = document.getElementById('op-pt-tag');
            if (sel) sel.innerHTML = `<option value="">— Elige tag —</option>` +
                nuevosTags.map(t => `<option value="${t}">${fmtTag(t)}</option>`).join('');
            window.sincronizarVista?.();
        }
    };

    // Quitar tag — sinPT=false quita sin gastar, sinPT=true quita consumiendo 100PT
    window._opQuitarTag = async (btnEl, tag, conGasto) => {
        const nombre = fichasUI.seleccionado;
        const p = fichasGlobal.find(x => x.nombre === nombre);
        if (!p) return;

        if (conGasto) {
            const ptActual = ptGlobal[nombre]?.[tag] || 0;
            if (ptActual < 100) {
                setMsg('op-tags-msg', `Necesitas 100 PT en ${fmtTag(tag)} para mutar (tienes ${ptActual})`, false);
                return;
            }
            if (!confirm(`¿Gastar 100 PT de ${fmtTag(tag)} para remover este tag?`)) return;
            await aplicarDeltaPT(nombre, tag, -100, 'gasto_mutacion');
        }

        const nuevosTags = (p.tags || []).filter(t => t !== tag);
        const res = await guardarTags(nombre, nuevosTags);
        setMsg('op-tags-msg', res.ok ? `✅ Tag ${fmtTag(tag)} quitado` : '❌ ' + res.msg, res.ok);
        if (res.ok) {
            const lista = document.getElementById('op-tags-lista');
            if (lista) lista.innerHTML = _renderTagsEditables(nuevosTags, ptGlobal[nombre] || {});
            window.sincronizarVista?.();
        }
    };

    window._opAplicarPT = async (nombre) => {
        const tag    = document.getElementById('op-pt-tag')?.value;
        const delta  = parseInt(document.getElementById('op-pt-delta')?.value) || 0;
        const motivo = document.getElementById('op-pt-motivo')?.value || 'manual';
        if (!tag)   { setMsg('op-pt-msg', 'Elige un tag', false); return; }
        if (!delta) { setMsg('op-pt-msg', 'El delta no puede ser 0', false); return; }
        const res = await aplicarDeltaPT(nombre, tag, delta, motivo);
        const signo = delta > 0 ? '+' : '';
        setMsg('op-pt-msg',
            res.ok ? `✅ ${signo}${delta} PT en ${fmtTag(tag)} (${motivo})` : '❌ ' + res.msg,
            res.ok);
        if (res.ok) {
            // Actualizar lista de tags con nuevos PT
            const p = fichasGlobal.find(x => x.nombre === nombre);
            const lista = document.getElementById('op-tags-lista');
            if (lista && p) lista.innerHTML = _renderTagsEditables(p.tags || [], ptGlobal[nombre] || {});
            window.sincronizarVista?.();
        }
    };

    window._opGuardarLore = async (nombre) => {
        const lore  = document.getElementById('op-lore')?.value  || '';
        const quirk = document.getElementById('op-quirk')?.value || '';
        const res = await guardarLore(nombre, { lore, quirk });
        setMsg('op-lore-msg', res.ok ? '✅ Lore guardado' : '❌ ' + res.msg, res.ok);
        if (res.ok) window.sincronizarVista?.();
    };

    window._opActivarFusion = async (nombre) => {
        const target = document.getElementById('op-fusion-target')?.value;
        if (!target) { setMsg('op-fusion-msg', 'Elige un personaje', false); return; }
        const pA = fichasGlobal.find(x => x.nombre === nombre);
        const pB = fichasGlobal.find(x => x.nombre === target);
        if (!pA || !pB) return;
        const res = await activarFusion(nombre, target, pA.tags || [], pB.tags || []);
        setMsg('op-fusion-msg', res.ok ? `✅ Fusión activada` : '❌ ' + res.msg, res.ok);
        if (res.ok) {
            await cargarFusiones();
            cerrarModal();
            window.sincronizarVista?.();
        }
    };

    window._opTerminarFusion = async (fusionId) => {
        if (!confirm('¿Terminar esta fusión?')) return;
        await terminarFusion(fusionId);
        cerrarModal();
        window.sincronizarVista?.();
    };

    // Exponer también el que usa renderDetalle para el botón directo
    window.terminarFusionUI = window._opTerminarFusion;
}

// ── Formulario de creación de personaje ───────────────────────
export function abrirCrearPersonaje() {
    const html = `
    <p style="color:#888; font-size:0.82em; margin-bottom:16px;">
        El nombre puede contener múltiples aliases separados por coma:<br>
        <code style="color:#00b4d8;">HEOP, Sakataka, Fufu</code>
    </p>
    ${row('Nombre / Aliases', inp('cp-nombre', '', 'text', 'placeholder="Ej: HEOP, Sakataka, Fufu"'))}
    ${row('POT', inp('cp-pot', 0))}
    ${row('AGI', inp('cp-agi', 0))}
    ${row('CTL', inp('cp-ctl', 0))}
    <div style="margin-bottom:12px;">
        <label style="color:#888; font-size:0.82em; display:block; margin-bottom:5px;">
            Tags (separados por coma)
        </label>
        <input id="cp-tags" type="text" placeholder="#Eldritch, #Horror, #Oscuridad"
            style="width:100%; background:#111; color:#fff; border:1px solid #333;
                   padding:7px 10px; border-radius:6px; font-size:0.88em; box-sizing:border-box;">
    </div>
    ${btn('✨ Crear Personaje', `window._cpCrear()`, '#4ade80')}
    ${msg('cp-msg')}`;

    abrirModal('✨ Crear Personaje', html);

    window._cpCrear = async () => {
        const nombre = document.getElementById('cp-nombre')?.value?.trim();
        const pot    = parseInt(document.getElementById('cp-pot')?.value) || 0;
        const agi    = parseInt(document.getElementById('cp-agi')?.value) || 0;
        const ctl    = parseInt(document.getElementById('cp-ctl')?.value) || 0;
        const rawTags = document.getElementById('cp-tags')?.value || '';
        const tags = rawTags.split(',').map(t => {
            const s = t.trim();
            return s ? (s.startsWith('#') ? s : '#' + s) : null;
        }).filter(Boolean);

        const res = await crearPersonaje({ nombre, pot, agi, ctl, tags });
        setMsg('cp-msg', res.ok ? '✅ Personaje creado' : '❌ ' + res.msg, res.ok);
        if (res.ok) { setTimeout(() => { cerrarModal(); window.sincronizarVista?.(); }, 800); }
    };
}

function escapeTA(str) {
    return String(str || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
