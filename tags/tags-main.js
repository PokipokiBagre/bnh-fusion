// ============================================================
// tags/tags-main.js
// ============================================================
import { bnhAuth, currentConfig } from '../bnh-auth.js';
import { tagsState, STORAGE_URL, grupos, catalogoTags } from './tags-state.js';
import { cargarTodo, guardarDescripcionTag, guardarBaneoTag, canjearPT, renameTag, deleteTag } from './tags-data.js';
import { renderProgresion, renderCatalogo, renderEstadisticas, renderBaneados, renderTagDetalle, toast } from './tags-ui.js';
import { initMarkup } from '../bnh-markup.js';

// Lee medallasCat en el momento de la llamada (evita el problema de live bindings)
async function _refreshMarkup() {
    const state = await import('./tags-state.js');
    initMarkup({ grupos: state.grupos, medallas: state.medallasCat });
}

window.onload = async () => {
    const fav = document.getElementById('dynamic-favicon');
    if (fav) fav.href = `${STORAGE_URL}/imginterfaz/icon.png?v=${Date.now()}`;

    await bnhAuth.init();
    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();
    tagsState.esAdmin = bnhAuth.esAdmin();

    // Tab baneados: solo OP
    const tabBan = document.getElementById('tab-baneados');
    if (tabBan) tabBan.style.display = tagsState.esAdmin ? '' : 'none';

    try {
        await cargarTodo();
        await _refreshMarkup();
    } catch(e) {
        document.getElementById('pantalla-carga').innerHTML = `<p style="color:red;">Error: ${e.message}</p>`;
        return;
    }

    document.getElementById('pantalla-carga').classList.add('oculto');
    document.getElementById('interfaz-tags').classList.remove('oculto');
    renderTab('catalogo');
    _exponerGlobales();
};

function renderTab(tab) {
    tagsState.tabActual = tab;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    ['progresion','catalogo','estadisticas','baneados'].forEach(t => {
        document.getElementById(`vista-${t}`)?.classList.toggle('oculto', t !== tab);
    });
    if (tab === 'progresion')   renderProgresion();
    if (tab === 'catalogo')     renderCatalogo();
    if (tab === 'estadisticas') renderEstadisticas();
    if (tab === 'baneados')     renderBaneados();
}

function _exponerGlobales() {
    window._tagsTab = renderTab;
    // Exponer initMarkupTextarea para uso en modales dinámicos
    window._initMarkupTA = initMarkupTextarea;
    // Exponer attachTagAC para inputs dinámicos de tags en modales
    window._attachTagAC_tags = (input) => {
        if (!input || input._acMounted) return;
        // Reusar el mismo AC de bnh-tags
        const { sugerirTags } = window._sugerirTagsFn || {};
        if (!sugerirTags) return;
        input._acMounted = true;
        const dd = document.createElement('ul');
        dd.style.cssText = 'position:fixed;z-index:99999;background:#fff;border:2px solid var(--green);border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,0.18);margin:0;padding:4px 0;list-style:none;max-height:200px;overflow-y:auto;min-width:180px;font-size:0.85em;display:none';
        document.body.appendChild(dd);
        const hide = () => { dd.style.display='none'; };
        const pick = t => { input.value=t; hide(); input.focus(); };
        input.addEventListener('input', () => {
            const v = input.value.trim();
            if (!v) { hide(); return; }
            const items = sugerirTags(v,[],12);
            if (!items.length) { hide(); return; }
            const r = input.getBoundingClientRect();
            dd.style.top=(r.bottom+4)+'px'; dd.style.left=r.left+'px'; dd.style.width=Math.max(r.width,200)+'px';
            dd.innerHTML = items.map((t,i) => `<li data-i="${i}" style="padding:7px 14px;cursor:pointer;color:var(--blue);font-weight:600;">${t}</li>`).join('');
            dd.querySelectorAll('li').forEach(li => li.addEventListener('mousedown', e => { e.preventDefault(); pick(items[+li.dataset.i]); }));
            dd.style.display='block';
        });
        input.addEventListener('blur', () => setTimeout(hide,150));
    };

    window._tagsSelPJ = (nombre) => {
        tagsState.pjSeleccionado = nombre;
        renderProgresion();
    };

    // Abrir detalle de tag (modal)
    window._tagsVerDetalle = (tag) => {
        renderTagDetalle(tag);
    };

    window._tagsCloseDetalle = () => {
        const el = document.getElementById('tag-detalle-modal');
        if (el) el.style.display = 'none';
    };

    // Guardar descripción desde detalle modal
    window._tagsGuardarDescDetalle = async (tagKey) => {
        const el   = document.getElementById('detalle-desc-inp');
        const sel  = document.getElementById('detalle-tipo-sel');
        if (!el) return;
        const tipo = sel?.value || undefined;
        const res  = await guardarDescripcionTag(tagKey, el.value.trim(), tipo);
        if (res.ok) {
            toast('✅ Descripción guardada', 'ok');
            await cargarTodo(); await _refreshMarkup();
            renderTagDetalle('#' + tagKey);
            if (tagsState.tabActual === 'catalogo') renderCatalogo();
        } else toast('❌ ' + res.msg, 'error');
    };

    // Guardar descripción desde catálogo (inline)
    window._tagsGuardarDesc = async (tag) => {
        const key = tag.startsWith('#') ? tag.slice(1) : tag;
        const el  = document.getElementById(`desc-${key}`);
        if (!el) return;
        const res = await guardarDescripcionTag(key, el.value.trim());
        if (res.ok) {
            toast(`✅ Descripción de ${tag} guardada`, 'ok');
            await cargarTodo(); await _refreshMarkup();
            renderCatalogo();
        } else toast('❌ ' + res.msg, 'error');
    };

    // Banear/desbanear tag
    window._tagsToggleBan = async (nombre, baneado) => {
        const res = await guardarBaneoTag(nombre, baneado);
        if (res.ok) {
            toast(`${baneado?'🚫 Baneado':'✅ Desbaneado'}: #${nombre}`, 'ok');
            await cargarTodo(); await _refreshMarkup();
            renderBaneados();
        } else toast('❌ ' + res.msg, 'error');
    };

    // Buscar en catálogo
    window._tagsBuscarCat = (v) => {
        tagsState.busquedaCat = v;
        renderCatalogo();
    };

    // Canjear PT (stats)
    window._tagsCanjear = async (pj, tag, tipo) => {
        if (!tagsState.esAdmin) return;
        const costos = { stat_pot:50, stat_agi:50, stat_ctl:50, medalla:75, tres_tags:100 };
        const labels = { stat_pot:'+1 POT', stat_agi:'+1 AGI', stat_ctl:'+1 CTL', medalla:'Medalla', tres_tags:'3 tags nuevos' };
        if (!confirm(`Canjear ${costos[tipo]} PT de ${tag} de ${pj} por ${labels[tipo]}?`)) return;
        const res = await canjearPT(pj, tag, tipo);
        if (res.ok) {
            toast(`✅ Canje aplicado. PT restantes en ${tag}: ${res.nueva}`, 'ok');
            await cargarTodo(); await _refreshMarkup();
            renderProgresion();
        } else toast('❌ ' + res.msg, 'error');
    };

    // Modal canje "3 tags" — gestor visual de tags del PJ
    window._tagsAbrirCanjeTresTags = (pj, tag) => {
        const g = grupos.find(x => x.nombre_refinado === pj);
        if (!g) return;
        const tagsActuales    = (g.tags||[]).map(t => t.startsWith('#')?t:'#'+t);
        const tagsDisponibles = catalogoTags.filter(ct => !ct.baneado)
            .map(ct => ct.nombre.startsWith('#')?ct.nombre:'#'+ct.nombre)
            .filter(t => !tagsActuales.some(ta => ta.toLowerCase()===t.toLowerCase()))
            .sort();

        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
        modal.onclick = e => { if(e.target===modal) modal.remove(); };

        const esc = s => String(s).replace(/'/g,"\\'");
        modal.innerHTML = `
        <div style="background:white;border-radius:12px;max-width:860px;width:95%;box-shadow:0 8px 32px rgba(0,0,0,0.25);overflow:hidden;max-height:90vh;display:flex;flex-direction:column;">
            <div style="background:var(--orange,#e67e22);color:white;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                <b style="font-family:'Cinzel',serif;">🎁 ${pj} — Canje 3 Tags (−100 PT de ${tag})</b>
                <button onclick="this.closest('[style*=fixed]').remove()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:1.1em;">×</button>
            </div>
            <div style="padding:8px 16px;background:#fef9f0;border-bottom:1px solid #fde0aa;font-size:0.78em;color:#888;flex-shrink:0;">
                Puedes <b>añadir</b> tags nuevos o <b>remover</b> tags actuales. Máximo 3 operaciones.
            </div>
            <div style="padding:16px;overflow-y:auto;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;flex:1;">
                <!-- Columna izquierda: tags actuales -->
                <div>
                    <div style="font-size:0.75em;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:8px;">Tags actuales (${tagsActuales.length})</div>
                    <div style="display:flex;flex-direction:column;gap:3px;max-height:300px;overflow-y:auto;">
                        ${tagsActuales.map(t => `
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:#fff5f5;border-radius:6px;border:1px solid #f5c6cb;font-size:0.8em;">
                            <span>${t}</span>
                            <button onclick="window._tresRemover('${esc(t)}')" style="background:none;border:none;color:#c0392b;cursor:pointer;font-size:0.85em;font-weight:700;" title="Remover este tag">− Remover</button>
                        </div>`).join('')}
                    </div>
                </div>
                <!-- Columna central: cambios programados -->
                <div>
                    <div style="font-size:0.75em;font-weight:700;color:var(--orange);text-transform:uppercase;margin-bottom:8px;">Cambios (máx. 3)</div>
                    <div id="tres-cambios" style="display:flex;flex-direction:column;gap:6px;min-height:80px;max-height:260px;overflow-y:auto;background:rgba(243,156,18,0.05);border:1.5px dashed #f39c12;border-radius:8px;padding:8px;margin-bottom:10px;">
                        <div id="tres-cambios-empty" style="color:#aaa;font-size:0.78em;text-align:center;padding:16px 0;">
                            ← Haz click en "Remover" o en un tag disponible →
                        </div>
                    </div>
                    <div style="font-size:0.72em;color:#888;margin-bottom:4px;font-weight:600;">➕ Crear tag nuevo:</div>
                    <div style="display:flex;gap:4px;">
                        <input id="tres-nuevo-tag" type="text" placeholder="#nuevo_tag…"
                            style="flex:1;padding:5px 8px;font-size:0.8em;border:1.5px solid #dee2e6;border-radius:6px;outline:none;"
                            onkeydown="if(event.key===' '||event.key==='Enter'){event.preventDefault();window._treesTagsNuevo();}">
                        <button onclick="window._treesTagsNuevo()" style="padding:4px 10px;font-size:0.78em;background:var(--green);border:none;border-radius:6px;color:white;cursor:pointer;font-weight:600;">+</button>
                    </div>
                </div>
                <!-- Columna derecha: tags disponibles para añadir -->
                <div>
                    <div style="font-size:0.75em;font-weight:700;color:var(--green);text-transform:uppercase;margin-bottom:4px;">Añadir tag existente</div>
                    <input id="tres-buscar" placeholder="Buscar…" oninput="window._tresBuscar(this.value)"
                        style="width:100%;padding:4px 8px;font-size:0.78em;border:1.5px solid #dee2e6;border-radius:6px;margin-bottom:6px;box-sizing:border-box;outline:none;">
                    <div id="tres-disponibles" style="display:flex;flex-direction:column;gap:3px;max-height:280px;overflow-y:auto;">
                        ${tagsDisponibles.slice(0,60).map(t => `
                        <div class="tres-disp-item" data-tag="${t}"
                            onclick="window._treesTagsAnadir('${esc(t)}')"
                            style="padding:4px 8px;border-radius:5px;cursor:pointer;font-size:0.8em;background:#f0fff4;border:1px solid #d5f5e3;color:var(--green-dark);">
                            ${t}
                        </div>`).join('')}
                    </div>
                </div>
            </div>
            <div style="padding:12px 16px;border-top:1px solid #f0f0f0;display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;">
                <span id="tres-contador" style="font-size:0.82em;color:#888;align-self:center;flex:1;">0/3 operaciones</span>
                <button onclick="this.closest('[style*=fixed]').remove()" style="padding:6px 14px;background:#f8f9fa;border:1px solid #dee2e6;border-radius:6px;cursor:pointer;font-size:0.82em;">Cancelar</button>
                <button id="tres-confirmar" onclick="window._treesTagsConfirmar('${esc(pj)}','${esc(tag)}',this.closest('[style*=fixed]'))" disabled
                    style="padding:6px 14px;background:#ccc;border:none;border-radius:6px;color:white;cursor:not-allowed;font-size:0.82em;font-weight:600;">Confirmar canje</button>
            </div>
        </div>`;
        document.body.appendChild(modal);

        window._tresCambios  = [];
        window._tresPjActual = pj;
        window._tresTagSource= tag;

        window._tresBuscar = (q) => {
            const disp = document.getElementById('tres-disponibles');
            if (!disp) return;
            const filtrado = q
                ? tagsDisponibles.filter(t => t.toLowerCase().includes(q.toLowerCase()))
                : tagsDisponibles;
            disp.innerHTML = filtrado.slice(0,60).map(t =>
                `<div class="tres-disp-item" data-tag="${t}" onclick="window._treesTagsAnadir('${esc(t)}')"
                    style="padding:4px 8px;border-radius:5px;cursor:pointer;font-size:0.8em;background:#f0fff4;border:1px solid #d5f5e3;color:var(--green-dark);">${t}</div>`
            ).join('');
        };

        window._tresActualizarContador = () => {
            const el  = document.getElementById('tres-contador');
            const btn = document.getElementById('tres-confirmar');
            const n   = window._tresCambios.length;
            if (el)  el.textContent  = `${n}/3 operaciones`;
            if (btn) {
                const listo = n > 0 && n <= 3;
                btn.disabled         = !listo;
                btn.style.background = listo ? 'var(--orange,#e67e22)' : '#ccc';
                btn.style.cursor     = listo ? 'pointer' : 'not-allowed';
            }
        };

        window._tresRenderCambios = () => {
            const cont  = document.getElementById('tres-cambios');
            const empty = document.getElementById('tres-cambios-empty');
            if (!cont) return;
            const items = window._tresCambios.map((cam, i) => {
                const label = cam.tipo === 'remover'
                    ? `<span style="color:#c0392b;font-weight:700;">− Remover: ${cam.tag}</span>`
                    : cam.tipo === 'anadir'
                    ? `<span style="color:var(--green);font-weight:700;">+ Añadir: ${cam.tag}</span>`
                    : `<span style="color:#8e44ad;font-weight:700;">✨ Nuevo: ${cam.tag}</span>`;
                return `<div style="background:white;border:1.5px solid #f39c12;border-radius:6px;padding:5px 8px;font-size:0.78em;display:flex;align-items:center;gap:6px;">
                    ${label}
                    <button onclick="window._tresCambios.splice(${i},1);window._tresRenderCambios();"
                        style="margin-left:auto;background:none;border:none;color:#c0392b;cursor:pointer;">✕</button>
                </div>`;
            }).join('');
            if (empty) empty.style.display = items ? 'none' : 'block';
            [...cont.children].forEach(ch => { if (ch.id !== 'tres-cambios-empty') ch.remove(); });
            cont.insertAdjacentHTML('beforeend', items);
            window._tresActualizarContador();
        };

        // Añadir un tag existente de la columna derecha
        window._treesTagsAnadir = (nuevoTag) => {
            if (window._tresCambios.length >= 3) { toast('Máximo 3 operaciones', 'info'); return; }
            if (window._tresCambios.some(c => c.tag === nuevoTag)) return;
            window._tresCambios.push({ tipo: 'anadir', tag: nuevoTag });
            window._tresRenderCambios();
        };

        // Remover un tag actual
        window._tresRemover = (tagViejo) => {
            if (window._tresCambios.length >= 3) { toast('Máximo 3 operaciones', 'info'); return; }
            if (window._tresCambios.some(c => c.tipo === 'remover' && c.tag === tagViejo)) return;
            window._tresCambios.push({ tipo: 'remover', tag: tagViejo });
            window._tresRenderCambios();
        };

        // Crear un tag completamente nuevo
        window._treesTagsNuevo = () => {
            const inp = document.getElementById('tres-nuevo-tag');
            if (!inp) return;
            const val = inp.value.trim().replace(/^#+/, '');
            if (!val) return;
            if (window._tresCambios.length >= 3) { toast('Máximo 3 operaciones', 'info'); return; }
            const tagNorm = '#' + val;
            if (window._tresCambios.some(c => c.tag === tagNorm)) return;
            window._tresCambios.push({ tipo: 'nuevo', tag: tagNorm });
            inp.value = '';
            window._tresRenderCambios();
        };

        window._treesTagsConfirmar = async (pjLocal, tagSource, modalEl) => {
            if (!window._tresCambios?.length) return;
            if (!confirm(`¿Confirmar ${window._tresCambios.length} operación(es) y gastar 100 PT de ${tagSource}?`)) return;

            const res = await canjearPT(pjLocal, tagSource, 'tres_tags');
            if (!res.ok) { toast('❌ ' + res.msg, 'error'); return; }

            const { supabase } = await import('../bnh-auth.js');
            const { data: gData } = await supabase.from('personajes_refinados')
                .select('tags').eq('nombre_refinado', pjLocal).maybeSingle();
            let tagsFinal = [...(gData?.tags || [])];

            for (const cam of window._tresCambios) {
                const tagNorm = cam.tag.startsWith('#') ? cam.tag : '#' + cam.tag;
                if (cam.tipo === 'remover') {
                    tagsFinal = tagsFinal.filter(t =>
                        (t.startsWith('#')?t:'#'+t).toLowerCase() !== tagNorm.toLowerCase()
                    );
                } else {
                    // anadir o nuevo
                    if (!tagsFinal.some(t => (t.startsWith('#')?t:'#'+t).toLowerCase() === tagNorm.toLowerCase())) {
                        tagsFinal.push(tagNorm);
                    }
                    // Registrar en catálogo si es nuevo
                    if (cam.tipo === 'nuevo') {
                        const tagKey = tagNorm.slice(1);
                        await supabase.from('tags_catalogo').upsert(
                            { nombre: tagKey }, { onConflict: 'nombre', ignoreDuplicates: true }
                        );
                    }
                }
            }

            await supabase.from('personajes_refinados').update({ tags: tagsFinal }).eq('nombre_refinado', pjLocal);
            const resumen = window._tresCambios.map(c =>
                c.tipo === 'remover' ? `− ${c.tag}` : `+ ${c.tag}`
            ).join(', ');
            toast(`✅ ${resumen}`, 'ok');
            modalEl.remove();
            await cargarTodo(); await _refreshMarkup();
            renderProgresion();
        };
    };

    // Modal canje "Medalla" — propuesta completa con markup y todos los campos
    window._tagsAbrirCanjeMedialla = (pj, tag) => {
        const modal = document.createElement('div');
        modal.id = 'modal-proponer-medalla-tags';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:20px 16px;overflow-y:auto;';
        modal.onclick = e => { if(e.target===modal) modal.remove(); };

        // Contador de requisitos dinámico
        let reqCount = 0;

        modal.innerHTML = `
        <div style="background:white;border-radius:12px;max-width:700px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.25);overflow:hidden;border:2px solid #e67e22;">
            <div style="background:#e67e22;color:white;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;">
                <b style="font-family:'Cinzel',serif;">🏅 Proponer Medalla — ${pj}</b>
                <button onclick="document.getElementById('modal-proponer-medalla-tags').remove()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:1.1em;">×</button>
            </div>
            <div style="padding:20px;display:flex;flex-direction:column;gap:14px;">
                <p style="font-size:0.82em;color:#888;margin:0;">Propuesta para <b>${pj}</b>. El OP la revisará antes de aprobarla.<br>Al confirmar se gastarán <b>75 PT de ${tag}</b>.</p>

                <div style="display:grid;grid-template-columns:1fr 120px;gap:12px;">
                    <div>
                        <label style="font-size:0.72em;font-weight:700;color:var(--gray-700);display:block;margin-bottom:3px;">NOMBRE *</label>
                        <input id="mprop-nombre" class="inp" placeholder="Nombre de la medalla…">
                    </div>
                    <div>
                        <label style="font-size:0.72em;font-weight:700;color:var(--gray-700);display:block;margin-bottom:3px;">COSTO CTL *</label>
                        <input id="mprop-ctl" class="inp" type="number" min="1" max="20" value="1">
                    </div>
                </div>

                <div>
                    <label style="font-size:0.72em;font-weight:700;color:var(--gray-700);display:block;margin-bottom:3px;">TIPO</label>
                    <select id="mprop-tipo" class="inp" style="max-width:180px;">
                        <option value="activa">⚡ Activa</option>
                        <option value="pasiva">🛡 Pasiva</option>
                    </select>
                </div>

                <div>
                    <label style="font-size:0.72em;font-weight:700;color:var(--gray-700);display:block;margin-bottom:3px;">
                        EFECTO BASE
                        <span style="font-size:0.85em;color:#aaa;font-weight:400;">(@Personaje@ #Tag !Medalla! — Tab para autocompletar)</span>
                    </label>
                    <textarea id="mprop-efecto" class="inp" rows="3"
                        placeholder="Describe el efecto… @Personaje@ #Tag !Medalla!"
                        onmouseenter="if(window._initMarkupTA)window._initMarkupTA(this)"></textarea>
                </div>

                <div>
                    <label style="font-size:0.72em;font-weight:700;color:var(--gray-700);display:block;margin-bottom:3px;">REQUISITOS (TAGS)</label>
                    <div style="font-size:0.72em;color:#aaa;margin-bottom:6px;">El PJ debe tener el tag con los PT mínimos. Escribe # para sugerencias.</div>
                    <div id="mprop-reqs">
                        <div class="cond-row" id="mprop-req-row-0" style="display:flex;gap:8px;margin-bottom:4px;">
                            <input class="inp" id="mprop-req-tag-0" value="${tag}" placeholder="#Tag…" style="flex:1;" autocomplete="off"
                                onmouseenter="if(window._attachTagAC_tags)window._attachTagAC_tags(this)">
                            <input class="inp" id="mprop-req-pts-0" type="number" value="0" placeholder="PT mín." style="width:80px;">
                            <button onclick="document.getElementById('mprop-req-row-0').remove()" class="btn btn-red btn-sm">✕</button>
                        </div>
                    </div>
                    <button onclick="window._mpropAddReq()" class="btn btn-outline btn-sm" style="margin-top:4px;">+ Añadir requisito</button>
                </div>

                <div>
                    <label style="font-size:0.72em;font-weight:700;color:var(--gray-700);display:block;margin-bottom:3px;">EFECTOS CONDICIONALES</label>
                    <div style="font-size:0.72em;color:#aaa;margin-bottom:6px;">Se activan si el PJ cumple tag + PT al equipar.</div>
                    <div id="mprop-conds"></div>
                    <button onclick="window._mpropAddCond()" class="btn btn-outline btn-sm" style="margin-top:4px;">+ Añadir efecto condicional</button>
                </div>

                <div style="display:flex;gap:8px;margin-top:4px;">
                    <button onclick="window._tagsConfirmarMedalla('${pj.replace(/'/g,"\\'")}','${tag.replace(/'/g,"\\'")}',document.getElementById('modal-proponer-medalla-tags'))"
                        style="padding:8px 16px;background:#e67e22;border:none;border-radius:6px;color:white;cursor:pointer;font-weight:600;">🏅 Proponer y canjear</button>
                    <button onclick="document.getElementById('modal-proponer-medalla-tags').remove()"
                        style="padding:8px 16px;background:#f8f9fa;border:1px solid #dee2e6;border-radius:6px;cursor:pointer;">Cancelar</button>
                </div>
                <div id="mprop-msg" style="font-size:0.82em;color:var(--red);"></div>
            </div>
        </div>`;
        document.body.appendChild(modal);

        // Contadores para filas dinámicas
        window._mpropReqCount  = 0;
        window._mpropCondCount = 0;

        window._mpropAddReq = () => {
            const idx = ++window._mpropReqCount;
            document.getElementById('mprop-reqs').insertAdjacentHTML('beforeend',
                `<div class="cond-row" id="mprop-req-row-${idx}" style="display:flex;gap:8px;margin-bottom:4px;">
                    <input class="inp" id="mprop-req-tag-${idx}" placeholder="#Tag…" style="flex:1;" autocomplete="off"
                        onmouseenter="if(window._attachTagAC_tags)window._attachTagAC_tags(this)">
                    <input class="inp" id="mprop-req-pts-${idx}" type="number" value="0" placeholder="PT mín." style="width:80px;">
                    <button onclick="document.getElementById('mprop-req-row-${idx}').remove()" class="btn btn-red btn-sm">✕</button>
                </div>`
            );
        };

        window._mpropAddCond = () => {
            const idx = ++window._mpropCondCount;
            document.getElementById('mprop-conds').insertAdjacentHTML('beforeend',
                `<div id="mprop-cond-row-${idx}" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;background:#fef9f0;border:1px solid #f39c12;border-radius:8px;padding:8px;">
                    <div style="display:flex;gap:8px;">
                        <input class="inp" id="mprop-cond-tag-${idx}" placeholder="#Tag condicional…" style="flex:1;" autocomplete="off"
                            onmouseenter="if(window._attachTagAC_tags)window._attachTagAC_tags(this)">
                        <input class="inp" id="mprop-cond-pts-${idx}" type="number" value="0" placeholder="PT mín." style="width:80px;">
                        <button onclick="document.getElementById('mprop-cond-row-${idx}').remove()" class="btn btn-red btn-sm">✕</button>
                    </div>
                    <textarea class="inp" id="mprop-cond-efecto-${idx}" rows="2" placeholder="Efecto si se cumple la condición…"
                        onmouseenter="if(window._initMarkupTA)window._initMarkupTA(this)"></textarea>
                </div>`
            );
        };

        // Montar markup en efecto base al hover (lazy)
        setTimeout(() => {
            const ef = document.getElementById('mprop-efecto');
            if (ef && window._initMarkupTA) window._initMarkupTA(ef);
        }, 100);
    };

    window._tagsConfirmarMedalla = async (pj, tag, modalEl) => {
        const nombre  = document.getElementById('mprop-nombre')?.value.trim();
        const ctl     = Number(document.getElementById('mprop-ctl')?.value) || 1;
        const tipo    = document.getElementById('mprop-tipo')?.value || 'activa';
        const efecto  = document.getElementById('mprop-efecto')?.value.trim() || '';
        const msgEl   = document.getElementById('mprop-msg');
        if (!nombre) { if(msgEl) msgEl.textContent='El nombre es obligatorio.'; return; }

        // Recoger requisitos
        const reqs = [];
        document.querySelectorAll('#mprop-reqs [id^="mprop-req-tag-"]').forEach(el => {
            const idx = el.id.replace('mprop-req-tag-','');
            const t   = el.value.trim();
            const pts = Number(document.getElementById('mprop-req-pts-'+idx)?.value||0);
            if (t) reqs.push({ tag: t.startsWith('#')?t:'#'+t, pts_minimos: pts });
        });

        // Recoger condicionales
        const conds = [];
        document.querySelectorAll('#mprop-conds [id^="mprop-cond-tag-"]').forEach(el => {
            const idx = el.id.replace('mprop-cond-tag-','');
            const t   = el.value.trim();
            const pts = Number(document.getElementById('mprop-cond-pts-'+idx)?.value||0);
            const efe = document.getElementById('mprop-cond-efecto-'+idx)?.value.trim()||'';
            if (t) conds.push({ tag: t.startsWith('#')?t:'#'+t, pts_minimos: pts, efecto: efe });
        });

        if (msgEl) msgEl.textContent = '⏳ Enviando…';

        const { supabase } = await import('../bnh-auth.js');
        const { error: eMed } = await supabase.from('medallas_catalogo').insert({
            nombre,
            efecto_desc:           efecto,
            costo_ctl:             ctl,
            tipo,
            requisitos_base:       reqs,
            efectos_condicionales: conds,
            propuesta:             true,
            propuesta_por:         pj,
        });
        if (eMed) { if(msgEl) msgEl.textContent='❌ '+eMed.message; return; }

        const res = await canjearPT(pj, tag, 'medalla');
        if (!res.ok) { if(msgEl) msgEl.textContent='Medalla guardada pero error PT: '+res.msg; return; }

        toast(`🏅 Medalla "${nombre}" propuesta. PT de ${tag}: ${res.nueva}`, 'ok');
        modalEl.remove();
        await cargarTodo(); await _refreshMarkup();
        renderProgresion();
    };

// Asignar tag desde el detalle modal (OP)
    window._tagsAsignarDesdeDetalle = async (grupoId, nombreGrupo, tag) => {
        const { supabase } = await import('../bnh-auth.js');
        const tagNorm = tag.startsWith('#') ? tag : '#' + tag;
        
        const { data: g } = await supabase.from('personajes_refinados')
            .select('tags').eq('id', grupoId).maybeSingle();
        if (!g) return;
        
        const nuevosTags = [...new Set([...(g.tags||[]), tagNorm])];
        const { error } = await supabase.from('personajes_refinados')
            .update({ tags: nuevosTags }).eq('id', grupoId);
            
        if (!error) {
            const gLocal = grupos.find(x => x.id === grupoId);
            if (gLocal) gLocal.tags = nuevosTags;
            toast(`✅ ${tagNorm} asignado a ${nombreGrupo}`, 'ok');
            // Refresca la ventana para que el personaje suba a la lista inmediatamente
            window._tagsVerDetalle(tagNorm); 
        } else {
            toast('❌ ' + error.message, 'error');
        }
    };

    // Quitar tag desde el detalle modal (OP)
    window._tagsQuitarDesdeDetalle = async (grupoId, nombreGrupo, tag) => {
        if (!confirm(`¿Quitar el tag ${tag} de ${nombreGrupo}?`)) return;
        const { supabase } = await import('../bnh-auth.js');
        const tagNorm = tag.startsWith('#') ? tag : '#' + tag;

        const { data: g } = await supabase.from('personajes_refinados')
            .select('tags').eq('id', grupoId).maybeSingle();
        if (!g) return;

        // Filtramos para quitar el tag específico
        const nuevosTags = (g.tags || []).filter(t => (t.startsWith('#')?t:'#'+t).toLowerCase() !== tagNorm.toLowerCase());

        const { error } = await supabase.from('personajes_refinados')
            .update({ tags: nuevosTags }).eq('id', grupoId);

        if (!error) {
            const gLocal = grupos.find(x => x.id === grupoId);
            if (gLocal) gLocal.tags = nuevosTags;
            toast(`🗑️ ${tagNorm} removido de ${nombreGrupo}`, 'ok');
            // Refresca la ventana para que el personaje baje a la lista inmediatamente
            window._tagsVerDetalle(tagNorm); 
        } else {
            toast('❌ ' + error.message, 'error');
        }
    };

    // Ir a fichas filtrado por tag
    window._tagsIrAFichas = (tag) => {
        window.location.href = `../fichas/index.html?tag=${encodeURIComponent(tag)}`;
    };

    // Multi-select asignación desde detalle
    window._tagsModoMulti = (activo) => {
        window._tagsModoMultiActivo = activo;
        window._tagsModoMultiSel    = new Set();
        const btn = document.getElementById('btn-asignar-multi');
        if (btn) btn.style.display = activo ? '' : 'none';
        // Reset visual selection
        document.querySelectorAll('#sinTag-grid .char-thumb').forEach(el => {
            el.style.outline = '';
            el.style.opacity = '0.65';
        });
    };

    window._tagsAsignarClick = async (id, nombre, tag, el) => {
        if (window._tagsModoMultiActivo) {
            // Toggle selection
            if (window._tagsModoMultiSel.has(id)) {
                window._tagsModoMultiSel.delete(id);
                el.style.outline = '';
                el.style.opacity = '0.65';
            } else {
                window._tagsModoMultiSel.add(id);
                el.style.outline = '2px solid var(--green)';
                el.style.opacity = '1';
            }
            const btn = document.getElementById('btn-asignar-multi');
            if (btn) btn.textContent = `✅ Asignar seleccionados (${window._tagsModoMultiSel.size})`;
        } else {
            // Single assign
            await window._tagsAsignarDesdeDetalle(id, nombre, tag);
        }
    };

    window._tagsAsignarMulti = async (tag) => {
        if (!window._tagsModoMultiSel?.size) return;
        const { supabase } = await import('../bnh-auth.js');
        const tagNorm = tag.startsWith('#') ? tag : '#' + tag;
        const btn = document.getElementById('btn-asignar-multi');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Asignando…'; }
        let ok = 0;
        for (const id of window._tagsModoMultiSel) {
            const { data: g } = await supabase.from('personajes_refinados')
                .select('tags, nombre_refinado').eq('id', id).maybeSingle();
            if (!g) continue;
            const nuevosTags = [...new Set([...(g.tags||[]), tagNorm])];
            const { error } = await supabase.from('personajes_refinados')
                .update({ tags: nuevosTags }).eq('id', id);
            if (!error) {
                const gLocal = grupos.find(x => x.id === id);
                if (gLocal) gLocal.tags = nuevosTags;
                const elDiv = document.getElementById('assign-' + id);
                if (elDiv) { elDiv.style.opacity='0.2'; elDiv.style.pointerEvents='none'; elDiv.querySelector('span').textContent='✅'; }
                ok++;
            }
        }
        toast(`✅ ${tagNorm} asignado a ${ok} personaje${ok!==1?'s':''}`, 'ok');
        window._tagsModoMultiSel = new Set();
        if (btn) { btn.disabled = false; btn.textContent = '✅ Asignar seleccionados'; }
    };

    // Filtros rol/estado en progresión
    window._tagsFiltroRol    = (v) => { tagsState.filtroRol    = v; renderProgresion(); };
    window._tagsFiltroEstado = (v) => { tagsState.filtroEstado = v; renderProgresion(); };

    // Renombrar tag (drop y actualiza en toda la BD)
    window._tagsRenombrar = async (tag) => {
        const nuevoNombre = prompt(`Renombrar ${tag} → nuevo nombre (sin #):`);
        if (!nuevoNombre || nuevoNombre.trim() === '' || nuevoNombre.trim() === tag.replace('#','')) return;
        const btn = event?.target;
        if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
        const res = await renameTag(tag, nuevoNombre.trim());
        if (res.ok) {
            toast(`✅ ${tag} renombrado a #${nuevoNombre.trim()} en ${res.afectados} personajes`, 'ok');
            await cargarTodo(); await _refreshMarkup();
            renderCatalogo();
        } else {
            toast('❌ ' + res.msg, 'error');
        }
    };

    // Eliminar tag de todos los personajes y el catálogo
    window._tagsEliminar = async (tag, count) => {
        const msg = count > 0
            ? `¿Eliminar ${tag}? Se quitará de ${count} personaje${count!==1?'s':''} y del catálogo. Esta acción no se puede deshacer.`
            : `¿Eliminar ${tag} del catálogo?`;
        if (!confirm(msg)) return;
        const res = await deleteTag(tag);
        if (res.ok) {
            toast(`🗑️ ${tag} eliminado de ${res.afectados} personajes`, 'ok');
            await cargarTodo(); await _refreshMarkup();
            renderCatalogo();
        } else {
            toast('❌ ' + res.msg, 'error');
        }
    };

    // Descargar lista de tags como .txt
    window._tagsDescargar = (orden) => {
        const tagMapa = {};
        grupos.forEach(g => (g.tags||[]).forEach(t => {
            const k = (t.startsWith('#') ? t.slice(1) : t);
            tagMapa[k] = (tagMapa[k]||0) + 1;
        }));
        let lista = Object.entries(tagMapa).map(([nombre, count]) => ({ nombre, count }));
        if (orden === 'alfabetico') {
            lista.sort((a,b) => a.nombre.localeCompare(b.nombre));
        } else {
            lista.sort((a,b) => b.count - a.count || a.nombre.localeCompare(b.nombre));
        }
        const sep = '\n';
        const texto = orden === 'alfabetico'
            ? lista.map(t => '#' + t.nombre).join(sep)
            : lista.map(t => '#' + t.nombre + ' (' + t.count + ')').join(sep);
        const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `tags-bnh-${orden}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Cerrar modal con ESC o click en fondo
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') window._tagsCloseDetalle();
    });
    document.getElementById('tag-detalle-modal')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) window._tagsCloseDetalle();
    });
}
