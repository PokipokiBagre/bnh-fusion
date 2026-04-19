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

    window._tagsSelPJ = (nombre) => {
        tagsState.pjSeleccionado = tagsState.pjSeleccionado === nombre ? null : nombre;
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

        const tagsActuales = (g.tags||[]).map(t => t.startsWith('#')?t:'#'+t);
        // Tags disponibles para añadir (que no tiene el PJ)
        const tagsDisponibles = catalogoTags.filter(ct => !ct.baneado)
            .map(ct => ct.nombre.startsWith('#')?ct.nombre:'#'+ct.nombre)
            .filter(t => !tagsActuales.some(ta => ta.toLowerCase()===t.toLowerCase()))
            .sort();

        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
        modal.onclick = e => { if(e.target===modal) modal.remove(); };

        modal.innerHTML = `
        <div style="background:white;border-radius:12px;max-width:860px;width:95%;box-shadow:0 8px 32px rgba(0,0,0,0.25);overflow:hidden;max-height:90vh;display:flex;flex-direction:column;">
            <div style="background:var(--orange,#e67e22);color:white;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                <b style="font-family:'Cinzel',serif;">🎁 ${pj} — Canje 3 Tags (−100 PT de ${tag})</b>
                <button onclick="this.closest('[style*=fixed]').remove()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:1.1em;">×</button>
            </div>
            <div style="padding:16px;overflow-y:auto;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;flex:1;">
                <!-- Tags actuales -->
                <div>
                    <div style="font-size:0.75em;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:8px;">Tags actuales (${tagsActuales.length})</div>
                    <div id="tres-actuales" style="display:flex;flex-direction:column;gap:4px;max-height:300px;overflow-y:auto;">
                        ${tagsActuales.map(t => `
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:#f8f9fa;border-radius:6px;border:1px solid #dee2e6;font-size:0.8em;">
                            <span>${t}</span>
                            <button onclick="window._treesTagsQuitarActual('${t.replace(/'/g,"\\'")}','${pj.replace(/'/g,"\\'")}')" style="background:none;border:none;color:#c0392b;cursor:pointer;font-size:0.85em;" title="Cambiar este tag">↔</button>
                        </div>`).join('')}
                    </div>
                </div>
                <!-- Cambios programados -->
                <div>
                    <div style="font-size:0.75em;font-weight:700;color:var(--orange);text-transform:uppercase;margin-bottom:8px;">Cambios (máx. 3)</div>
                    <div id="tres-cambios" style="display:flex;flex-direction:column;gap:6px;min-height:80px;max-height:300px;overflow-y:auto;background:rgba(243,156,18,0.05);border:1.5px dashed #f39c12;border-radius:8px;padding:8px;margin-bottom:8px;">
                        <div id="tres-cambios-empty" style="color:#aaa;font-size:0.78em;text-align:center;padding:16px 0;">Arrastra o haz click en los tags para programar cambios</div>
                    </div>
                    <!-- Crear tag nuevo -->
                    <div style="font-size:0.72em;color:#888;margin-bottom:4px;">Crear tag nuevo:</div>
                    <div style="display:flex;gap:4px;">
                        <input id="tres-nuevo-tag" type="text" placeholder="#nuevo_tag…"
                            style="flex:1;padding:5px 8px;font-size:0.8em;border:1.5px solid #dee2e6;border-radius:6px;outline:none;"
                            onkeydown="if(event.key===' '||event.key==='Enter'){event.preventDefault();window._treesTagsNuevo();}">
                        <button onclick="window._treesTagsNuevo()" style="padding:4px 8px;font-size:0.78em;background:var(--green);border:none;border-radius:6px;color:white;cursor:pointer;">+</button>
                    </div>
                </div>
                <!-- Tags disponibles -->
                <div>
                    <div style="font-size:0.75em;font-weight:700;color:var(--green);text-transform:uppercase;margin-bottom:4px;">Tags disponibles</div>
                    <input id="tres-buscar" placeholder="Buscar…" oninput="window._tresBuscar(this.value)"
                        style="width:100%;padding:4px 8px;font-size:0.78em;border:1.5px solid #dee2e6;border-radius:6px;margin-bottom:6px;box-sizing:border-box;outline:none;">
                    <div id="tres-disponibles" style="display:flex;flex-direction:column;gap:3px;max-height:280px;overflow-y:auto;">
                        ${tagsDisponibles.slice(0,60).map(t => `
                        <div class="tres-disp-item" data-tag="${t}" onclick="window._treesTagsAnadir('${t.replace(/'/g,"\\'")}','${pj.replace(/'/g,"\\'")}')"
                            style="padding:4px 8px;border-radius:5px;cursor:pointer;font-size:0.8em;background:#f0fff4;border:1px solid #d5f5e3;color:var(--green-dark);">
                            ${t}
                        </div>`).join('')}
                    </div>
                </div>
            </div>
            <div style="padding:12px 16px;border-top:1px solid #f0f0f0;display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;">
                <span id="tres-contador" style="font-size:0.82em;color:#888;align-self:center;flex:1;">0/3 cambios programados</span>
                <button onclick="this.closest('[style*=fixed]').remove()" style="padding:6px 14px;background:#f8f9fa;border:1px solid #dee2e6;border-radius:6px;cursor:pointer;font-size:0.82em;">Cancelar</button>
                <button id="tres-confirmar" onclick="window._treesTagsConfirmar('${pj.replace(/'/g,"\\'")}','${tag.replace(/'/g,"\\'")}',this.closest('[style*=fixed]'))" disabled
                    style="padding:6px 14px;background:#ccc;border:none;border-radius:6px;color:white;cursor:not-allowed;font-size:0.82em;font-weight:600;">Confirmar canje</button>
            </div>
        </div>`;
        document.body.appendChild(modal);

        // Estado local del modal
        window._tresCambios    = [];  // [{tipo:'cambio'|'nuevo', viejo?, nuevo}]
        window._tresPjActual   = pj;
        window._tresTagSource  = tag;

        window._tresBuscar = (q) => {
            const disp = document.getElementById('tres-disponibles');
            if (!disp) return;
            const filtrado = q ? tagsDisponibles.filter(t=>t.toLowerCase().includes(q.toLowerCase())) : tagsDisponibles;
            disp.innerHTML = filtrado.slice(0,60).map(t =>
                `<div class="tres-disp-item" data-tag="${t}" onclick="window._treesTagsAnadir('${t.replace(/'/g,"\\'")}','${pj.replace(/'/g,"\\'")}')"
                    style="padding:4px 8px;border-radius:5px;cursor:pointer;font-size:0.8em;background:#f0fff4;border:1px solid #d5f5e3;color:var(--green-dark);">${t}</div>`
            ).join('');
        };

        window._tresActualizarContador = () => {
            const el = document.getElementById('tres-contador');
            const btn = document.getElementById('tres-confirmar');
            const n = window._tresCambios.length;
            if (el) el.textContent = `${n}/3 cambios programados`;
            if (btn) {
                const listo = n > 0 && n <= 3;
                btn.disabled = !listo;
                btn.style.background = listo ? 'var(--orange)' : '#ccc';
                btn.style.cursor = listo ? 'pointer' : 'not-allowed';
            }
        };

        window._tresRenderCambios = () => {
            const cont = document.getElementById('tres-cambios');
            const empty = document.getElementById('tres-cambios-empty');
            if (!cont) return;
            const items = window._tresCambios.map((c, i) => `
                <div style="background:white;border:1.5px solid #f39c12;border-radius:6px;padding:5px 8px;font-size:0.78em;display:flex;align-items:center;gap:4px;">
                    ${c.tipo==='cambio'
                        ? `<span style="color:#c0392b;text-decoration:line-through;">${c.viejo}</span><span style="color:#888;">→</span><span style="color:var(--green);">${c.nuevo}</span>`
                        : `<span style="color:#888;">Nuevo:</span><span style="color:var(--green);font-weight:700;">${c.nuevo}</span>`}
                    <button onclick="window._tresCambios.splice(${i},1);window._tresRenderCambios();window._tresActualizarContador();"
                        style="margin-left:auto;background:none;border:none;color:#c0392b;cursor:pointer;font-size:0.85em;">✕</button>
                </div>`).join('') || '';
            if (empty) empty.style.display = items ? 'none' : 'block';
            // Quitar items previos (no el empty)
            [...cont.children].forEach(ch => { if(ch.id !== 'tres-cambios-empty') ch.remove(); });
            cont.insertAdjacentHTML('beforeend', items);
            window._tresActualizarContador();
        };

        window._treesTagsAnadir = (nuevoTag, pjLocal) => {
            if (window._tresCambios.length >= 3) { alert('Máximo 3 cambios por canje.'); return; }
            if (window._tresCambios.some(c => c.nuevo === nuevoTag)) return;
            window._tresCambios.push({ tipo:'nuevo_add', nuevo: nuevoTag });
            window._tresRenderCambios();
        };

        window._treesTagsNuevo = () => {
            const inp = document.getElementById('tres-nuevo-tag');
            if (!inp) return;
            const val = inp.value.trim().replace(/^#*/,'');
            if (!val) return;
            if (window._tresCambios.length >= 3) { alert('Máximo 3 cambios por canje.'); return; }
            const tagNorm = '#' + val;
            if (window._tresCambios.some(c => c.nuevo === tagNorm)) return;
            window._tresCambios.push({ tipo:'nuevo_create', nuevo: tagNorm });
            inp.value = '';
            window._tresRenderCambios();
        };

        window._treesTagsQuitarActual = (tagViejo, pjLocal) => {
            // Marcar tag actual para cambio — abre quick-pick
            window._tresTagPendiente = tagViejo;
            alert(`Selecciona el tag de reemplazo para ${tagViejo} en la columna derecha, o crea uno nuevo.`);
        };

        window._treesTagsConfirmar = async (pjLocal, tagSource, modalEl) => {
            if (!window._tresCambios?.length) return;
            if (!confirm(`¿Confirmar ${window._tresCambios.length} cambio(s) y gastar 100 PT de ${tagSource}?`)) return;

            // 1. Descontar PT
            const res = await canjearPT(pjLocal, tagSource, 'tres_tags');
            if (!res.ok) { toast('❌ ' + res.msg, 'error'); return; }

            // 2. Aplicar cambios de tags al personaje
            const { supabase } = await import('../bnh-auth.js');
            const { data: gData } = await supabase.from('personajes_refinados')
                .select('tags').eq('nombre_refinado', pjLocal).maybeSingle();
            let tagsFinal = [...(gData?.tags || [])];

            for (const cambio of window._tresCambios) {
                const tagNorm = cambio.nuevo.startsWith('#') ? cambio.nuevo : '#' + cambio.nuevo;
                if (!tagsFinal.some(t => (t.startsWith('#')?t:'#'+t).toLowerCase()===tagNorm.toLowerCase())) {
                    tagsFinal.push(tagNorm);
                }
                // Si es 'cambio' quitar el viejo
                if (cambio.tipo === 'cambio' && cambio.viejo) {
                    tagsFinal = tagsFinal.filter(t => (t.startsWith('#')?t:'#'+t).toLowerCase() !== cambio.viejo.toLowerCase());
                }
                // Asegurar que el tag existe en el catálogo
                const tagKey = tagNorm.slice(1);
                await supabase.from('tags_catalogo').upsert({ nombre: tagKey }, { onConflict: 'nombre', ignoreDuplicates: true });
            }

            await supabase.from('personajes_refinados').update({ tags: tagsFinal }).eq('nombre_refinado', pjLocal);
            toast(`✅ ${window._tresCambios.length} tag(s) añadidos a ${pjLocal}`, 'ok');
            modalEl.remove();
            await cargarTodo(); await _refreshMarkup();
            renderProgresion();
        };
    };

    // Modal canje "Medalla" — proponer medalla desde el personaje
    window._tagsAbrirCanjeMedialla = (pj, tag) => {
        // Intentar abrir el modal de proponer medalla de medallas.js
        // Si no está disponible (otra página), redirigir
        if (window._medProponerModal) {
            window._medProponerModal();
            // Pre-rellenar el autor con el nombre del PJ
            setTimeout(() => {
                const autor = document.getElementById('prop-autor');
                if (autor) autor.value = pj;
                const msg = document.getElementById('prop-msg');
                if (msg) msg.textContent = `💡 Medalla para ${pj} — costará 75 PT de ${tag}`;
                // Guardar referencia para el canje automático al confirmar
                window._medallaCanjeData = { pj, tag };
            }, 100);
        } else {
            // Desde tags (sin medallas cargado): modal simple de propuesta
            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
            modal.onclick = e => { if(e.target===modal) modal.remove(); };
            modal.innerHTML = `
            <div style="background:white;border-radius:12px;max-width:500px;width:95%;box-shadow:0 8px 32px rgba(0,0,0,0.25);overflow:hidden;">
                <div style="background:#1a4a80;color:white;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;">
                    <b style="font-family:'Cinzel',serif;">🏅 Proponer Medalla — ${pj}</b>
                    <button onclick="this.closest('[style*=fixed]').remove()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:1.1em;">×</button>
                </div>
                <div style="padding:16px;display:flex;flex-direction:column;gap:12px;">
                    <p style="font-size:0.85em;color:#888;margin:0;">Propone una medalla para <b>${pj}</b>. El OP la revisará antes de aprobarla.<br>Al confirmar se gastarán 75 PT de ${tag}.</p>
                    <div>
                        <label style="font-size:0.75em;font-weight:700;color:#666;display:block;margin-bottom:4px;">Nombre de la medalla *</label>
                        <input id="med-prop-nombre" class="inp" placeholder="Nombre…">
                    </div>
                    <div>
                        <label style="font-size:0.75em;font-weight:700;color:#666;display:block;margin-bottom:4px;">Efecto base</label>
                        <textarea id="med-prop-efecto" class="inp" rows="3" placeholder="Describe el efecto…"></textarea>
                    </div>
                    <div>
                        <label style="font-size:0.75em;font-weight:700;color:#666;display:block;margin-bottom:4px;">Tag principal *</label>
                        <input id="med-prop-tag" class="inp" value="${tag}" placeholder="${tag}">
                    </div>
                    <div style="display:flex;gap:8px;justify-content:flex-end;">
                        <button onclick="this.closest('[style*=fixed]').remove()" style="padding:6px 14px;background:#f8f9fa;border:1px solid #dee2e6;border-radius:6px;cursor:pointer;font-size:0.82em;">Cancelar</button>
                        <button onclick="window._tagsProponerMedalla('${pj.replace(/'/g,"\\'")}','${tag.replace(/'/g,"\\'")}',this.closest('[style*=fixed]'))"
                            style="padding:6px 14px;background:#1a4a80;border:none;border-radius:6px;color:white;cursor:pointer;font-size:0.82em;font-weight:600;">🏅 Proponer y canjear</button>
                    </div>
                    <div id="med-prop-msg" style="font-size:0.82em;color:var(--red);"></div>
                </div>
            </div>`;
            document.body.appendChild(modal);
        }
    };

    window._tagsProponerMedalla = async (pj, tag, modalEl) => {
        const nombre  = document.getElementById('med-prop-nombre')?.value.trim();
        const efecto  = document.getElementById('med-prop-efecto')?.value.trim();
        const tagProp = document.getElementById('med-prop-tag')?.value.trim() || tag;
        const msgEl   = document.getElementById('med-prop-msg');
        if (!nombre) { if(msgEl) msgEl.textContent='El nombre es obligatorio.'; return; }

        const { supabase } = await import('../bnh-auth.js');
        // Insertar medalla como propuesta
        const { error: eMed } = await supabase.from('medallas_catalogo').insert({
            nombre,
            efecto_desc:     efecto || '',
            costo_ctl:       1,
            tipo:            'activa',
            requisitos_base: [{ tag: tagProp.startsWith('#')?tagProp:'#'+tagProp, pts_minimos: 0 }],
            efectos_condicionales: [],
            propuesta:       true,
            propuesta_por:   pj,
        });
        if (eMed) { if(msgEl) msgEl.textContent='❌ '+eMed.message; return; }

        // Gastar PT
        const res = await canjearPT(pj, tag, 'medalla');
        if (!res.ok) { if(msgEl) msgEl.textContent='Medalla guardada pero error en PT: '+res.msg; return; }

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
