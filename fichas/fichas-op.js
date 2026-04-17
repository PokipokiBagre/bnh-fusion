// ============================================================
// fichas-op.js — Panel OP completo
// ============================================================
import { fichasGlobal, gruposGlobal, ptGlobal, fichasUI, STORAGE_URL, norm } from './fichas-state.js';
import { calcPVMax, calcTier, fmtTag }   from './fichas-logic.js';
import { guardarStats, guardarLore, guardarTags, aplicarDeltaPT, crearPersonaje } from './fichas-data.js';
import { activarFusion, terminarFusion, getFusionDe, cargarFusiones } from '../bnh-fusion.js';
import { supabase } from '../bnh-auth.js';

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
    if (el) { el.className = 'op-msg '+(ok?'ok':'err'); el.textContent = txt; }
}

// ── Panel principal ───────────────────────────────────────────
export function abrirPanelOP(nombre) {
    const p = fichasGlobal.find(x => x.nombre === nombre);
    if (!p) return;

    const pvMax = calcPVMax(p.pot||0, p.agi||0, p.ctl||0);
    const grupo = gruposGlobal.find(g => g.id === p.refinado_id);
    const displayName = grupo ? grupo.nombre_refinado : nombre;

    const tabsHTML = ['Stats', 'Tags & PT', 'Lore', 'Fusión', 'Grupos'].map((t,i) =>
        `<button class="op-tab${i===0?' active':''}" id="op-tab-${i}" onclick="window._opTab(${i})">${t}</button>`
    ).join('');

    const html = `
    <div class="op-tabs">${tabsHTML}</div>

    <!-- TAB 0: STATS con actual/total -->
    <div id="op-p0">
        <p class="stat-hint">
            <b>Total</b> = valor base permanente (determina Tier y PV Máx).<br>
            <b>Actual</b> = valor en este momento (puede subir/bajar en combate).<br>
            Si Actual = Total, muestra solo el número. Si difieren, muestra Actual/Total.
        </p>
        <div class="stats-grid">
            <div class="stat-field">
                <label>POT Total</label>
                <input id="op-pot-t" type="number" value="${p.pot||0}" oninput="window._opRecalcPV()">
            </div>
            <div class="stat-field">
                <label style="color:#2980b9;">POT Actual</label>
                <input id="op-pot-a" type="number" class="actual" value="${p.pot_actual??p.pot??0}">
            </div>
            <div class="stat-field">
                <label>AGI Total</label>
                <input id="op-agi-t" type="number" value="${p.agi||0}" oninput="window._opRecalcPV()">
            </div>
            <div class="stat-field">
                <label style="color:#2980b9;">AGI Actual</label>
                <input id="op-agi-a" type="number" class="actual" value="${p.agi_actual??p.agi??0}">
            </div>
            <div class="stat-field">
                <label>CTL Total</label>
                <input id="op-ctl-t" type="number" value="${p.ctl||0}" oninput="window._opRecalcPV()">
            </div>
            <div class="stat-field">
                <label style="color:#2980b9;">CTL Actual</label>
                <input id="op-ctl-a" type="number" class="actual" value="${p.ctl_actual??p.ctl??0}">
            </div>
            <div class="stat-field">
                <label>PV Máx <span id="op-pvm" style="color:var(--green);">(${pvMax})</span></label>
                <input id="op-pv-max" type="number" value="${pvMax}" readonly
                    style="background:var(--gray-100); color:var(--gray-500); cursor:not-allowed;">
            </div>
            <div class="stat-field">
                <label style="color:#2980b9;">PV Actual</label>
                <input id="op-pv-a" type="number" class="actual" value="${p.pv_actual??pvMax}">
            </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="op-btn op-btn-green" onclick="window._opGuardarStats('${nombre.replace(/'/g,"\\'")}')">💾 Guardar Stats</button>
            <button class="op-btn op-btn-blue"  onclick="window._opRestaurarPV('${nombre.replace(/'/g,"\\'")}')">↺ Restaurar PV al máx</button>
        </div>
        <div id="msg-stats" class="op-msg"></div>
    </div>

    <!-- TAB 1: TAGS & PT -->
    <div id="op-p1" style="display:none;">
        <div style="font-size:0.78em; color:var(--gray-700); margin-bottom:8px; font-weight:600;">Tags actuales</div>
        <div class="tags-chips" id="op-chips">
            ${_chipsHTML(p.tags||[], ptGlobal[nombre]||{})}
        </div>
        <div style="display:flex; gap:6px; margin-bottom:14px;">
            <input id="op-tag-inp" type="text" class="op-input" placeholder="#NuevoTag" style="flex:1;">
            <button class="op-btn op-btn-green" onclick="window._opAddTag('${nombre.replace(/'/g,"\\'")}')">+ Agregar</button>
        </div>
        <div id="msg-tags" class="op-msg"></div>
        <hr style="border:none; border-top:1px solid var(--gray-200); margin:14px 0;">
        <div style="font-size:0.78em; color:var(--gray-700); margin-bottom:8px; font-weight:600;">Delta de PT Manual</div>
        <div class="op-row">
            <span class="op-label">Tag</span>
            <select id="op-pt-tag" class="op-select" style="flex:1;">
                <option value="">— Elige —</option>
                ${(p.tags||[]).map(t=>`<option value="${t}">${t.startsWith('#')?t:'#'+t}</option>`).join('')}
            </select>
        </div>
        <div class="op-row">
            <span class="op-label">Delta (±)</span>
            <input id="op-pt-d" type="number" class="op-input" value="1" style="flex:1;">
        </div>
        <div class="op-row">
            <span class="op-label">Motivo</span>
            <select id="op-pt-m" class="op-select" style="flex:1;">
                <option value="interaccion">Interacción (+1)</option>
                <option value="fusion">Fusión (+5)</option>
                <option value="gasto_stat">Gasto Stat (−50)</option>
                <option value="gasto_medalla">Gasto Medalla (−75)</option>
                <option value="gasto_mutacion">Gasto Mutación (−100)</option>
                <option value="manual">Manual libre</option>
            </select>
        </div>
        <button class="op-btn op-btn-blue" onclick="window._opAplicarPT('${nombre.replace(/'/g,"\\'")}')">Aplicar Delta</button>
        <div id="msg-pt" class="op-msg"></div>
    </div>

    <!-- TAB 2: LORE -->
    <div id="op-p2" style="display:none;">
        <label style="font-size:0.78em; font-weight:600; color:var(--gray-700); display:block; margin-bottom:5px;">Historia / Lore</label>
        <textarea id="op-lore" rows="7" class="op-input" style="resize:vertical; line-height:1.6;">${escTA(p.lore||'')}</textarea>
        <label style="font-size:0.78em; font-weight:600; color:var(--gray-700); display:block; margin:10px 0 5px;">Quirk / Habilidad</label>
        <textarea id="op-quirk" rows="5" class="op-input" style="resize:vertical; line-height:1.6;">${escTA(p.quirk||'')}</textarea>
        <button class="op-btn op-btn-green" style="margin-top:10px;" onclick="window._opGuardarLore('${nombre.replace(/'/g,"\\'")}')">💾 Guardar</button>
        <div id="msg-lore" class="op-msg"></div>
    </div>

    <!-- TAB 3: FUSIÓN -->
    <div id="op-p3" style="display:none;">
        ${_fusionHTML(nombre, p)}
    </div>

    <!-- TAB 4: GRUPOS NOMBRE -->
    <div id="op-p4" style="display:none;">
        ${_gruposHTML(p, nombre)}
    </div>`;

    abrirModal(`⚙️ ${displayName}`, html);

    // Recalc PV en tiempo real
    ['op-pot-t','op-agi-t','op-ctl-t'].forEach(id => {
        setTimeout(() => {
            document.getElementById(id)?.addEventListener('input', window._opRecalcPV);
        }, 50);
    });
}

function _chipsHTML(tags, ptDePJ) {
    if (!tags.length) return `<span style="color:var(--gray-400); font-size:0.82em;">Sin tags</span>`;
    return tags.map(t => {
        const pts = ptDePJ[t]||0;
        const tf  = t.startsWith('#') ? t : '#'+t;
        return `<span class="tag-chip">
            ${tf} <span class="tag-chip-pts">${pts}pt</span>
            <button class="tag-chip-rm" onclick="window._opRmTag(this,'${t.replace(/'/g,"\\'")}')" title="Quitar (sin gastar PT)">×</button>
        </span>`;
    }).join('');
}

function _fusionHTML(nombre, p) {
    const fusionActiva = getFusionDe(nombre);
    if (fusionActiva) {
        const comp = fusionActiva.pj_a===nombre ? fusionActiva.pj_b : fusionActiva.pj_a;
        return `<div class="fusion-card">
            <div class="fusion-card-title">⚡ En fusión con <b>${comp}</b></div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">
                ${(fusionActiva.tags_fusionados||[]).map(t=>
                    `<span style="background:#f5eeff;border:1px solid #9b59b6;color:#6c3483;padding:2px 8px;border-radius:8px;font-size:0.78em;">${t.startsWith('#')?t:'#'+t}</span>`
                ).join('')}
            </div>
            <button class="op-btn op-btn-red" onclick="window._opTerminarFusion('${fusionActiva.id}')">✕ Terminar Fusión</button>
        </div>`;
    }

    const disponibles = fichasGlobal
        .filter(x => x.nombre !== nombre && !getFusionDe(x.nombre))
        .map(x => {
            const g = gruposGlobal.find(g2 => g2.id === x.refinado_id);
            const dn = g ? g.nombre_refinado : x.nombre;
            return `<option value="${x.nombre}">${dn}</option>`;
        }).join('');

    if (!disponibles) return `<p style="color:var(--gray-500);font-size:0.85em;">No hay personajes disponibles para fusión.</p>`;

    return `<p style="color:var(--gray-500);font-size:0.82em;margin-bottom:12px;line-height:1.5;">
        Al activar la fusión se combinan los tags de ambos.<br>
        El doble icono aparece en el catálogo y ficha.
    </p>
    <div class="op-row">
        <span class="op-label">Fusionar con</span>
        <select id="op-fus-target" class="op-select" style="flex:1;">
            <option value="">— Elige —</option>${disponibles}
        </select>
    </div>
    <button class="op-btn" style="background:#6c3483;color:#fff;border-color:#6c3483;" onclick="window._opActivarFusion('${nombre.replace(/'/g,"\\'")}')")>⚡ Activar Fusión</button>
    <div id="msg-fus" class="op-msg"></div>`;
}

function _gruposHTML(p, nombre) {
    const grupoActual = gruposGlobal.find(g => g.id === p.refinado_id);

    const optsGrupos = gruposGlobal
        .map(g => `<option value="${g.id}" ${g.id===p.refinado_id?'selected':''}>${g.nombre_refinado}</option>`)
        .join('');

    return `
    <p style="color:var(--gray-500);font-size:0.82em;margin-bottom:12px;line-height:1.5;">
        El <b>Grupo Nombre</b> es lo que ven los jugadores públicamente.<br>
        Asigna varios personajes DB al mismo grupo para que aparezcan como uno solo.<br>
        Sin grupo asignado, el personaje solo es visible para el OP.
    </p>
    <div style="background:var(--gray-100);border:1px solid var(--booru-border);border-radius:var(--radius);padding:10px;margin-bottom:12px;font-size:0.85em;">
        <b>Grupo actual:</b> ${grupoActual ? `<span style="color:var(--green-dark);">${grupoActual.nombre_refinado}</span>` : '<span style="color:var(--red);">Sin grupo (solo visible para OP)</span>'}
    </div>

    <div class="op-row">
        <span class="op-label">Asignar a</span>
        <select id="op-grupo-sel" class="op-select" style="flex:1;">
            <option value="">— Sin grupo —</option>
            ${optsGrupos}
        </select>
    </div>
    <button class="op-btn op-btn-green" onclick="window._opAsignarGrupo('${nombre.replace(/'/g,"\\'")}')")>💾 Guardar Grupo</button>
    <div id="msg-grupo" class="op-msg"></div>

    <hr style="border:none;border-top:1px solid var(--gray-200);margin:16px 0;">
    <div style="font-size:0.78em;font-weight:600;color:var(--gray-700);margin-bottom:8px;">Crear nuevo grupo nombre</div>
    <div style="display:flex;gap:6px;">
        <input id="op-grupo-nuevo" type="text" class="op-input" placeholder="Nombre del grupo" style="flex:1;">
        <button class="op-btn op-btn-green" onclick="window._opCrearGrupo()">Crear</button>
    </div>
    <div id="msg-grupo-nuevo" class="op-msg"></div>`;
}

// ── Exponer globales ──────────────────────────────────────────
export function exponerGlobalesOP() {

    window._opTab = i => {
        [0,1,2,3,4].forEach(j => {
            const p = document.getElementById(`op-p${j}`);
            const t = document.getElementById(`op-tab-${j}`);
            if (p) p.style.display = j===i?'block':'none';
            if (t) t.classList.toggle('active', j===i);
        });
    };

    window._opRecalcPV = () => {
        const pot = parseInt(document.getElementById('op-pot-t')?.value)||0;
        const agi = parseInt(document.getElementById('op-agi-t')?.value)||0;
        const ctl = parseInt(document.getElementById('op-ctl-t')?.value)||0;
        const pvm = calcPVMax(pot,agi,ctl);
        const el = document.getElementById('op-pvm');
        const el2 = document.getElementById('op-pv-max');
        if (el)  el.textContent  = `(${pvm})`;
        if (el2) el2.value = pvm;
    };

    window._opGuardarStats = async (nombre) => {
        const pot   = parseInt(document.getElementById('op-pot-t')?.value)||0;
        const agi   = parseInt(document.getElementById('op-agi-t')?.value)||0;
        const ctl   = parseInt(document.getElementById('op-ctl-t')?.value)||0;
        const potA  = parseInt(document.getElementById('op-pot-a')?.value)||0;
        const agiA  = parseInt(document.getElementById('op-agi-a')?.value)||0;
        const ctlA  = parseInt(document.getElementById('op-ctl-a')?.value)||0;
        const pvA   = parseInt(document.getElementById('op-pv-a')?.value)||0;
        const pvMax = calcPVMax(pot,agi,ctl);

        const res = await guardarStats(nombre, {
            pot, agi, ctl,
            pv_actual: Math.min(pvA, pvMax)
        });
        // También guardar actuales en columnas separadas si existen
        await supabase.from('personajes').update({
            pot_actual: potA, agi_actual: agiA, ctl_actual: ctlA
        }).eq('nombre', nombre).then(()=>{});

        setMsg('msg-stats', res.ok ? '✅ Stats guardados' : '❌ '+res.msg, res.ok);
        if (res.ok) window.sincronizarVista?.();
    };

    window._opRestaurarPV = async (nombre) => {
        const p = fichasGlobal.find(x=>x.nombre===nombre); if(!p) return;
        const pvMax = calcPVMax(p.pot||0,p.agi||0,p.ctl||0);
        document.getElementById('op-pv-a').value = pvMax;
        const res = await guardarStats(nombre, { pot:p.pot, agi:p.agi, ctl:p.ctl, pv_actual:pvMax });
        setMsg('msg-stats', res.ok ? `✅ PV → ${pvMax}` : '❌ '+res.msg, res.ok);
        if (res.ok) window.sincronizarVista?.();
    };

    window._opAddTag = async (nombre) => {
        const raw = document.getElementById('op-tag-inp')?.value?.trim(); if(!raw) return;
        const tag = raw.startsWith('#') ? raw : '#'+raw;
        const p = fichasGlobal.find(x=>x.nombre===nombre); if(!p) return;
        if ((p.tags||[]).includes(tag)) { setMsg('msg-tags','Ya existe',false); return; }
        const nuevosTags = [...(p.tags||[]), tag];
        const res = await guardarTags(nombre, nuevosTags);
        setMsg('msg-tags', res.ok?`✅ ${tag} agregado`:'❌ '+res.msg, res.ok);
        if (res.ok) {
            document.getElementById('op-tag-inp').value='';
            const chips = document.getElementById('op-chips');
            if (chips) chips.innerHTML = _chipsHTML(nuevosTags, ptGlobal[nombre]||{});
            const sel = document.getElementById('op-pt-tag');
            if (sel) sel.innerHTML = `<option value="">— Elige —</option>`+
                nuevosTags.map(t=>`<option value="${t}">${t.startsWith('#')?t:'#'+t}</option>`).join('');
            window.sincronizarVista?.();
        }
    };

    window._opRmTag = async (btnEl, tag) => {
        const nombre = fichasUI.seleccionado; if(!nombre) return;
        const p = fichasGlobal.find(x=>x.nombre===nombre); if(!p) return;
        const nuevosTags = (p.tags||[]).filter(t=>t!==tag);
        const res = await guardarTags(nombre, nuevosTags);
        if (res.ok) {
            const chips = document.getElementById('op-chips');
            if (chips) chips.innerHTML = _chipsHTML(nuevosTags, ptGlobal[nombre]||{});
            window.sincronizarVista?.();
        }
    };

    window._opAplicarPT = async (nombre) => {
        const tag    = document.getElementById('op-pt-tag')?.value; if(!tag) { setMsg('msg-pt','Elige un tag',false); return; }
        const delta  = parseInt(document.getElementById('op-pt-d')?.value)||0;
        const motivo = document.getElementById('op-pt-m')?.value||'manual';
        if (!delta) { setMsg('msg-pt','El delta no puede ser 0',false); return; }
        const res = await aplicarDeltaPT(nombre, tag, delta, motivo);
        const signo = delta>0?'+':'';
        setMsg('msg-pt', res.ok?`✅ ${signo}${delta} PT en ${tag}`:'❌ '+res.msg, res.ok);
        if (res.ok) {
            const chips = document.getElementById('op-chips');
            const p = fichasGlobal.find(x=>x.nombre===nombre);
            if (chips && p) chips.innerHTML = _chipsHTML(p.tags||[], ptGlobal[nombre]||{});
            window.sincronizarVista?.();
        }
    };

    window._opGuardarLore = async (nombre) => {
        const lore  = document.getElementById('op-lore')?.value||'';
        const quirk = document.getElementById('op-quirk')?.value||'';
        const res = await guardarLore(nombre, {lore, quirk});
        setMsg('msg-lore', res.ok?'✅ Guardado':'❌ '+res.msg, res.ok);
        if (res.ok) window.sincronizarVista?.();
    };

    window._opActivarFusion = async (nombre) => {
        const target = document.getElementById('op-fus-target')?.value;
        if (!target) { setMsg('msg-fus','Elige personaje',false); return; }
        const pA = fichasGlobal.find(x=>x.nombre===nombre);
        const pB = fichasGlobal.find(x=>x.nombre===target);
        if (!pA||!pB) return;
        const res = await activarFusion(nombre, target, pA.tags||[], pB.tags||[]);
        setMsg('msg-fus', res.ok?'✅ Fusión activada':'❌ '+res.msg, res.ok);
        if (res.ok) { await cargarFusiones(); cerrarModal(); window.sincronizarVista?.(); }
    };

    window._opTerminarFusion = async (fusionId) => {
        if (!confirm('¿Terminar esta fusión?')) return;
        await terminarFusion(fusionId);
        cerrarModal();
        window.sincronizarVista?.();
    };

    window._opAsignarGrupo = async (nombre) => {
        const grupoId = document.getElementById('op-grupo-sel')?.value || null;
        const { error } = await supabase.from('personajes')
            .update({ refinado_id: grupoId || null }).eq('nombre', nombre);
        const p = fichasGlobal.find(x=>x.nombre===nombre);
        if (p) p.refinado_id = grupoId || null;
        setMsg('msg-grupo', error ? '❌ '+error.message : '✅ Grupo actualizado', !error);
        if (!error) window.sincronizarVista?.();
    };

    window._opCrearGrupo = async () => {
        const nombre = document.getElementById('op-grupo-nuevo')?.value?.trim();
        if (!nombre) return;
        const { data, error } = await supabase.from('personajes_refinados')
            .insert({ nombre_refinado: nombre }).select('*').single();
        if (error) { setMsg('msg-grupo-nuevo','❌ '+error.message,false); return; }
        // Agregar al array local
        const { gruposGlobal: gg } = await import('./fichas-state.js');
        gg.push(data);
        setMsg('msg-grupo-nuevo', '✅ Grupo creado', true);
        document.getElementById('op-grupo-nuevo').value = '';
        // Recargar el select
        const sel = document.getElementById('op-grupo-sel');
        if (sel) sel.innerHTML = `<option value="">— Sin grupo —</option>` +
            gg.map(g=>`<option value="${g.id}">${g.nombre_refinado}</option>`).join('');
    };
}

// ── Formulario crear personaje ────────────────────────────────
export function abrirCrearPersonaje() {
    abrirModal('✨ Crear Personaje', `
    <p class="stat-hint">El nombre puede tener aliases separados por coma: <code>HEOP, Sakataka</code></p>
    <div class="op-row"><span class="op-label">Nombre</span>
        <input id="cp-nombre" type="text" class="op-input" style="flex:1;" placeholder="Ej: HEOP, Sakataka, Fufu"></div>
    <div class="stats-grid">
        <div class="stat-field"><label>POT Total</label><input id="cp-pot" type="number" value="0"></div>
        <div class="stat-field"><label>AGI Total</label><input id="cp-agi" type="number" value="0"></div>
        <div class="stat-field"><label>CTL Total</label><input id="cp-ctl" type="number" value="0"></div>
    </div>
    <div style="margin-bottom:10px;">
        <label style="font-size:0.78em;font-weight:600;color:var(--gray-700);display:block;margin-bottom:4px;">Tags (con coma)</label>
        <input id="cp-tags" type="text" class="op-input" placeholder="#Eldritch, #Horror">
    </div>
    <button class="op-btn op-btn-green" onclick="window._cpCrear()">✨ Crear</button>
    <div id="msg-cp" class="op-msg"></div>`);

    window._cpCrear = async () => {
        const nombre  = document.getElementById('cp-nombre')?.value?.trim();
        const pot     = parseInt(document.getElementById('cp-pot')?.value)||0;
        const agi     = parseInt(document.getElementById('cp-agi')?.value)||0;
        const ctl     = parseInt(document.getElementById('cp-ctl')?.value)||0;
        const rawTags = document.getElementById('cp-tags')?.value||'';
        const tags    = rawTags.split(',').map(t=>{const s=t.trim();return s?(s.startsWith('#')?s:'#'+s):null;}).filter(Boolean);
        const res = await crearPersonaje({nombre,pot,agi,ctl,tags});
        setMsg('msg-cp', res.ok?'✅ Creado':'❌ '+res.msg, res.ok);
        if (res.ok) setTimeout(()=>{ cerrarModal(); window.sincronizarVista?.(); }, 800);
    };
}

function escTA(s) { return String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
