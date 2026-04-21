// ============================================================
// tags/tags-main.js
// ============================================================
import { bnhAuth, currentConfig } from '../bnh-auth.js';
import { tagsState, STORAGE_URL, grupos, catalogoTags, solicitudes, medallasCat } from './tags-state.js';
import {
    cargarTodo, guardarDescripcionTag, guardarBaneoTag, renameTag, deleteTag,
    enviarSolicitud, aprobarSolicitud, cancelarSolicitud, editarSolicitudTresTags,
    cargarInventarioPJ,
} from './tags-data.js';
import { renderProgresion, renderCatalogo, renderEstadisticas, renderBaneados, renderTagDetalle, toast } from './tags-ui.js';
import { initMarkup } from '../bnh-markup.js';

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

    // ⚡ NUEVO: Leer la URL para ver si venimos desde un click del Markup
    const urlParams = new URLSearchParams(window.location.search);
    const tagParam = urlParams.get('tag');

    if (tagParam) {
        // Si hay tag en la URL, forzamos abrir la pestaña Catálogo
        if (typeof window._tagsTab === 'function') {
            window._tagsTab('catalogo'); 
        } else if (typeof renderTab === 'function') {
            renderTab('catalogo'); 
        }
        
        // Esperamos un instante a que el DOM del catálogo se dibuje y abrimos el detalle
        setTimeout(() => {
            if (window._tagsVerDetalle) window._tagsVerDetalle(tagParam);
        }, 50);
    } else {
        // Si no hay tag, iniciamos en progresión por defecto
        if (typeof renderTab === 'function') renderTab('progresion');
    }

    if (typeof _exponerGlobales === 'function') _exponerGlobales();
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
    window._initMarkupTA = window._initMarkupTA || (async (el) => {
        const { initMarkupTextarea } = await import('../bnh-markup.js');
        initMarkupTextarea(el);
    });

    window._attachTagAC_tags = (input) => {
        if (!input || input._acMounted) return;
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

    // ── Selección de personaje: carga el inventario antes de renderizar ──────
    window._tagsSelPJ = async (nombre) => {
        tagsState.pjSeleccionado = nombre;
        await cargarInventarioPJ(nombre);
        renderProgresion();
    };

    window._tagsVerDetalle = (tag) => { renderTagDetalle(tag); };
    window._tagsCloseDetalle = () => {
        const el = document.getElementById('tag-detalle-modal');
        if (el) el.style.display = 'none';
    };

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

    window._tagsToggleBan = async (nombre, baneado) => {
        const res = await guardarBaneoTag(nombre, baneado);
        if (res.ok) {
            toast(`${baneado?'🚫 Baneado':'✅ Desbaneado'}: #${nombre}`, 'ok');
            await cargarTodo(); await _refreshMarkup();
            renderBaneados();
        } else toast('❌ ' + res.msg, 'error');
    };

    window._tagsBuscarCat = (v) => { tagsState.busquedaCat = v; renderCatalogo(); };

    // ── Buscador de medallas accesibles: filtrado in-place sin re-render ─────
    // Opera directamente sobre el DOM existente → el input nunca pierde el foco,
    // no hay salto de scroll y no se destruye ningún nodo del árbol.
    window._tagsBuscarMedallasAcc = (v) => {
        tagsState.busquedaMedallasAcc = v;
        const q = v.trim().toLowerCase();
        const grid = document.getElementById('medallas-acc-grid');
        if (!grid) return; // Si el grid no existe aún, ignorar

        let visibles = 0;
        grid.querySelectorAll('.medalla-acc-card').forEach(card => {
            const nombre = (card.dataset.nombre || '').toLowerCase();
            const efecto = (card.dataset.efecto  || '').toLowerCase();
            const mostrar = !q || nombre.includes(q) || efecto.includes(q);
            card.style.display = mostrar ? '' : 'none';
            if (mostrar) visibles++;
        });

        // Actualiza el contador del encabezado sin tocar nada más del DOM
        const titulo = document.getElementById('medallas-acc-titulo');
        if (titulo) titulo.textContent = `Medallas Accesibles (${visibles})`;
    };

    // SOLICITUDES: Botones de Stats (POT/AGI/CTL)
    window._tagsCanjear = async (pj, tag, tipo) => {
        const labels = { stat_pot:'+1 POT', stat_agi:'+1 AGI', stat_ctl:'+1 CTL' };
        if (!confirm(`¿Proponer gastar 50 PT de ${tag} para obtener ${labels[tipo]}?`)) return;
        
        // Enviar con esAdmin para indicar si descuenta de inmediato o no
        const res = await enviarSolicitud(pj, tag, tipo, 50, {}, tagsState.esAdmin);
        if (res.ok) {
            toast(`✅ Solicitud enviada. PT restantes en ${tag}: ${res.nueva}`, 'ok');
            await cargarTodo(); await _refreshMarkup();
            renderProgresion();
        } else toast('❌ ' + res.msg, 'error');
    };

    // SOLICITUDES: OP Aprobar y Rechazar
    window._tagsAprobarReq = async (id) => {
        const btn = event.target;
        btn.disabled = true; btn.textContent = '⏳';
        const res = await aprobarSolicitud(id);
        if (res.ok) {
            toast('✅ Solicitud aprobada y aplicada', 'ok');
            await cargarTodo(); await _refreshMarkup();
            renderProgresion();
        } else {
            toast('❌ ' + res.msg, 'error');
            btn.disabled = false; btn.textContent = '✅ Aprobar';
        }
    };

    window._tagsCancelarReq = async (id) => {
        if (!confirm('¿Seguro que deseas retirar esta solicitud? Se devolverán los PT si aplica.')) return;
        const btn = event.target;
        btn.disabled = true; btn.textContent = '⏳';
        const res = await cancelarSolicitud(id);
        if (res.ok) {
            toast('🗑️ Solicitud eliminada/retirada.', 'ok');
            await cargarTodo(); await _refreshMarkup();
            renderProgresion();
        } else {
            toast('❌ ' + res.msg, 'error');
            btn.disabled = false;
        }
    };

    // ───────────────────────────────────────────────────────────
    window._tagsAbrirEditTresTags = (reqId) => {
        const req = solicitudes.find(s => s.id === reqId);
        if (!req) return;
        window._tagsAbrirCanjeTresTags(req.personaje_nombre, req.tag_origen, req.id);
    };

    window._tagsAbrirCanjeTresTags = (pj, tag, reqIdToEdit = null) => {
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
        const isEdit = !!reqIdToEdit;

        modal.innerHTML = `
        <div style="background:white;border-radius:12px;max-width:860px;width:95%;box-shadow:0 8px 32px rgba(0,0,0,0.25);overflow:hidden;max-height:90vh;display:flex;flex-direction:column;">
            <div style="background:var(--orange,#e67e22);color:white;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                <b style="font-family:'Cinzel',serif;">${isEdit?'✏️ Editar Solicitud Tags':'🎁 Canje Tags (−100 PT de '+tag+')'} — ${pj}</b>
                <button onclick="this.closest('[style*=fixed]').remove()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:1.1em;">×</button>
            </div>
            <div style="padding:8px 16px;background:#fef9f0;border-bottom:1px solid #fde0aa;font-size:0.78em;color:#888;flex-shrink:0;">
                Puedes <b>añadir</b> tags nuevos o <b>remover</b> tags actuales. <br>
                <b style="color:var(--orange);">Regla:</b> Máximo 6 operaciones totales. (Máximo 3 agregados y 3 removidos).
            </div>
            <div style="padding:16px;overflow-y:auto;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;flex:1;">
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
                <div>
                    <div style="font-size:0.75em;font-weight:700;color:var(--orange);text-transform:uppercase;margin-bottom:8px;">Cambios Programados</div>
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
                <span id="tres-contador" style="font-size:0.82em;color:#888;align-self:center;flex:1;">0 operaciones</span>
                <button onclick="this.closest('[style*=fixed]').remove()" style="padding:6px 14px;background:#f8f9fa;border:1px solid #dee2e6;border-radius:6px;cursor:pointer;font-size:0.82em;">Cancelar</button>
                <button id="tres-confirmar" onclick="window._treesTagsConfirmar('${esc(pj)}','${esc(tag)}',this.closest('[style*=fixed]'), ${reqIdToEdit})" disabled
                    style="padding:6px 14px;background:#ccc;border:none;border-radius:6px;color:white;cursor:not-allowed;font-size:0.82em;font-weight:600;">${isEdit?'💾 Guardar Cambios':'Enviar Propuesta'}</button>
            </div>
        </div>`;
        document.body.appendChild(modal);

        window._tresCambios  = [];
        window._tresPjActual = pj;
        window._tresTagSource= tag;

        if (isEdit) {
            const req = solicitudes.find(s => s.id === reqIdToEdit);
            if (req && req.datos && req.datos.cambios) {
                window._tresCambios = [...req.datos.cambios];
            }
        }

        window._tresBuscar = (q) => {
            const disp = document.getElementById('tres-disponibles');
            if (!disp) return;
            const filtrado = q ? tagsDisponibles.filter(t => t.toLowerCase().includes(q.toLowerCase())) : tagsDisponibles;
            disp.innerHTML = filtrado.slice(0,60).map(t =>
                `<div class="tres-disp-item" data-tag="${t}" onclick="window._treesTagsAnadir('${esc(t)}')"
                    style="padding:4px 8px;border-radius:5px;cursor:pointer;font-size:0.8em;background:#f0fff4;border:1px solid #d5f5e3;color:var(--green-dark);">${t}</div>`
            ).join('');
        };

        window._tresActualizarContador = () => {
            const el  = document.getElementById('tres-contador');
            const btn = document.getElementById('tres-confirmar');
            const n   = window._tresCambios.length;
            const ag  = window._tresCambios.filter(c => c.tipo==='anadir' || c.tipo==='nuevo').length;
            const rem = window._tresCambios.filter(c => c.tipo==='remover').length;
            
            if (el) el.innerHTML = `Total: ${n}/6 <span style="margin-left:8px;color:var(--green);">Agregados: ${ag}/3</span> <span style="margin-left:8px;color:var(--red);">Removidos: ${rem}/3</span>`;
            
            if (btn) {
                const listo = n > 0 && n <= 6 && ag <= 3 && rem <= 3;
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

        window._treesTagsAnadir = (nuevoTag) => {
            const ag = window._tresCambios.filter(c => c.tipo==='anadir' || c.tipo==='nuevo').length;
            if (ag >= 3) { toast('Máximo 3 tags agregados', 'info'); return; }
            if (window._tresCambios.length >= 6) { toast('Límite de 6 operaciones alcanzado', 'info'); return; }
            if (window._tresCambios.some(c => c.tag === nuevoTag)) return;
            window._tresCambios.push({ tipo: 'anadir', tag: nuevoTag });
            window._tresRenderCambios();
        };

        window._tresRemover = (tagViejo) => {
            const rem = window._tresCambios.filter(c => c.tipo==='remover').length;
            if (rem >= 3) { toast('Máximo 3 tags removidos', 'info'); return; }
            if (window._tresCambios.length >= 6) { toast('Límite de 6 operaciones alcanzado', 'info'); return; }
            if (window._tresCambios.some(c => c.tipo === 'remover' && c.tag === tagViejo)) return;
            window._tresCambios.push({ tipo: 'remover', tag: tagViejo });
            window._tresRenderCambios();
        };

        window._treesTagsNuevo = () => {
            const inp = document.getElementById('tres-nuevo-tag');
            if (!inp) return;
            const val = inp.value.trim().replace(/^#+/, '');
            if (!val) return;
            const ag = window._tresCambios.filter(c => c.tipo==='anadir' || c.tipo==='nuevo').length;
            if (ag >= 3) { toast('Máximo 3 tags agregados', 'info'); return; }
            if (window._tresCambios.length >= 6) { toast('Límite de 6 operaciones alcanzado', 'info'); return; }
            const tagNorm = '#' + val;
            if (window._tresCambios.some(c => c.tag === tagNorm)) return;
            window._tresCambios.push({ tipo: 'nuevo', tag: tagNorm });
            inp.value = '';
            window._tresRenderCambios();
        };

        window._treesTagsConfirmar = async (pjLocal, tagSource, modalEl, reqIdEdit) => {
            if (!window._tresCambios?.length) return;
            
            if (reqIdEdit) {
                const btn = event.target;
                btn.disabled = true; btn.textContent = '⏳';
                const res = await editarSolicitudTresTags(reqIdEdit, window._tresCambios);
                if (res.ok) {
                    toast('✅ Cambios guardados', 'ok');
                    modalEl.remove();
                    await cargarTodo(); await _refreshMarkup();
                    renderProgresion();
                } else toast('❌ ' + res.msg, 'error');
                return;
            }

            if (!confirm(`¿Confirmar solicitud y descontar 100 PT de ${tagSource}?`)) return;

            const btn = event.target;
            btn.disabled = true; btn.textContent = '⏳';

            const res = await enviarSolicitud(pjLocal, tagSource, 'tres_tags', 100, { cambios: window._tresCambios }, tagsState.esAdmin);
            if (!res.ok) { toast('❌ ' + res.msg, 'error'); btn.disabled = false; btn.textContent = 'Reintentar'; return; }

            toast(`✅ Solicitud de tags enviada. PT de ${tagSource}: ${res.nueva}`, 'ok');
            modalEl.remove();
            await cargarTodo(); await _refreshMarkup();
            renderProgresion();
        };

        if (isEdit) window._tresRenderCambios();
    };

    // EDICIÓN DE PROPUESTA DE MEDALLA
    window._tagsAbrirEditMedalla = (reqId) => {
        const req = solicitudes.find(s => s.id === reqId);
        if (!req || !req.datos.medalla_id) return;
        const m = medallasCat.find(x => x.id === req.datos.medalla_id);
        if (!m) return;
        window._tagsAbrirCanjeMedialla(req.personaje_nombre, req.tag_origen, req.id, m);
    };

    window._tagsAbrirCanjeMedialla = (pj, tag, reqIdToEdit = null, medToEdit = null) => {
        const modal = document.createElement('div');
        modal.id = 'modal-proponer-medalla-tags';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:20px 16px;overflow-y:auto;';
        modal.onclick = e => { if(e.target===modal) modal.remove(); };

        const isEdit = !!reqIdToEdit;
        const esc = s => String(s).replace(/'/g,"\\'");

        const reqsInitial = isEdit ? (medToEdit.requisitos_base || []) : [];
        const condsInitial = isEdit ? (medToEdit.efectos_condicionales || []) : [];

        modal.innerHTML = `
        <div style="background:white;border-radius:12px;max-width:700px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.25);overflow:hidden;border:2px solid #e67e22;">
            <div style="background:#e67e22;color:white;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;">
                <b style="font-family:'Cinzel',serif;">🏅 ${isEdit ? 'Editar Propuesta Medalla' : 'Proponer Medalla'} — ${pj}</b>
                <button onclick="document.getElementById('modal-proponer-medalla-tags').remove()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:1.1em;">×</button>
            </div>
            <div style="padding:20px;display:flex;flex-direction:column;gap:14px;">
                <p style="font-size:0.82em;color:#888;margin:0;">Propuesta para <b>${pj}</b>. El OP la revisará antes de aprobarla.<br>${isEdit ? 'Estás editando tu solicitud sin gastar PT adicionales.' : `Al confirmar se gastarán <b>75 PT de ${tag}</b>.`}</p>

                <div style="display:grid;grid-template-columns:1fr 120px;gap:12px;">
                    <div>
                        <label style="font-size:0.72em;font-weight:700;color:var(--gray-700);display:block;margin-bottom:3px;">NOMBRE *</label>
                        <input id="mprop-nombre" class="inp" placeholder="Nombre de la medalla…" value="${isEdit ? esc(medToEdit.nombre) : ''}">
                    </div>
                    <div>
                        <label style="font-size:0.72em;font-weight:700;color:var(--gray-700);display:block;margin-bottom:3px;">COSTO CTL *</label>
                        <input id="mprop-ctl" class="inp" type="number" min="1" max="20" value="${isEdit ? medToEdit.costo_ctl : 1}">
                    </div>
                </div>

                <div>
                    <label style="font-size:0.72em;font-weight:700;color:var(--gray-700);display:block;margin-bottom:3px;">TIPO</label>
                    <select id="mprop-tipo" class="inp" style="max-width:180px;">
                        <option value="activa" ${isEdit && medToEdit.tipo==='activa'?'selected':''}>⚡ Activa</option>
                        <option value="pasiva" ${isEdit && medToEdit.tipo==='pasiva'?'selected':''}>🛡 Pasiva</option>
                    </select>
                </div>

                <div>
                    <label style="font-size:0.72em;font-weight:700;color:var(--gray-700);display:block;margin-bottom:3px;">
                        EFECTO BASE
                        <span style="font-size:0.85em;color:#aaa;font-weight:400;">(@Personaje@ #Tag !Medalla! — Tab para autocompletar)</span>
                    </label>
                    <textarea id="mprop-efecto" class="inp" rows="3"
                        placeholder="Describe el efecto… @Personaje@ #Tag !Medalla!"
                        onmouseenter="if(window._initMarkupTA)window._initMarkupTA(this)">${isEdit ? esc(medToEdit.efecto_desc) : ''}</textarea>
                </div>

                <div>
                    <label style="font-size:0.72em;font-weight:700;color:var(--gray-700);display:block;margin-bottom:3px;">REQUISITOS (TAGS)</label>
                    <div style="font-size:0.72em;color:#aaa;margin-bottom:6px;">El PJ debe tener el tag con los PT mínimos. Escribe # para sugerencias.</div>
                    <div id="mprop-reqs"></div>
                    <button onclick="window._mpropAddReq()" class="btn btn-outline btn-sm" style="margin-top:4px;">+ Añadir requisito</button>
                </div>

                <div>
                    <label style="font-size:0.72em;font-weight:700;color:var(--gray-700);display:block;margin-bottom:3px;">EFECTOS CONDICIONALES</label>
                    <div style="font-size:0.72em;color:#aaa;margin-bottom:6px;">Se activan si el PJ cumple tag + PT al equipar.</div>
                    <div id="mprop-conds"></div>
                    <button onclick="window._mpropAddCond()" class="btn btn-outline btn-sm" style="margin-top:4px;">+ Añadir efecto condicional</button>
                </div>

                <div style="display:flex;gap:8px;margin-top:4px;">
                    <button onclick="window._tagsConfirmarMedalla('${pj.replace(/'/g,"\\'")}','${tag.replace(/'/g,"\\'")}',document.getElementById('modal-proponer-medalla-tags'), ${reqIdToEdit})"
                        style="padding:8px 16px;background:#e67e22;border:none;border-radius:6px;color:white;cursor:pointer;font-weight:600;">${isEdit ? '💾 Guardar Cambios' : '🏅 Proponer y canjear'}</button>
                    <button onclick="document.getElementById('modal-proponer-medalla-tags').remove()"
                        style="padding:8px 16px;background:#f8f9fa;border:1px solid #dee2e6;border-radius:6px;cursor:pointer;">Cancelar</button>
                </div>
                <div id="mprop-msg" style="font-size:0.82em;color:var(--red);"></div>
            </div>
        </div>`;
        document.body.appendChild(modal);

        window._mpropReqCount  = 0;
        window._mpropCondCount = 0;

        window._mpropAddReq = (r = {}) => {
            const idx = ++window._mpropReqCount;
            document.getElementById('mprop-reqs').insertAdjacentHTML('beforeend',
                `<div class="cond-row" id="mprop-req-row-${idx}" style="display:flex;gap:8px;margin-bottom:4px;">
                    <input class="inp" id="mprop-req-tag-${idx}" value="${r.tag || (isEdit?'':tag)}" placeholder="#Tag…" style="flex:1;" autocomplete="off"
                        onmouseenter="if(window._attachTagAC_tags)window._attachTagAC_tags(this)">
                    <input class="inp" id="mprop-req-pts-${idx}" type="number" value="${r.pts_minimos || 0}" placeholder="PT mín." style="width:80px;">
                    <button onclick="document.getElementById('mprop-req-row-${idx}').remove()" class="btn btn-red btn-sm">✕</button>
                </div>`
            );
        };

        window._mpropAddCond = (c = {}) => {
            const idx = ++window._mpropCondCount;
            document.getElementById('mprop-conds').insertAdjacentHTML('beforeend',
                `<div id="mprop-cond-row-${idx}" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;background:#fef9f0;border:1px solid #f39c12;border-radius:8px;padding:8px;">
                    <div style="display:flex;gap:8px;">
                        <input class="inp" id="mprop-cond-tag-${idx}" value="${c.tag || ''}" placeholder="#Tag condicional…" style="flex:1;" autocomplete="off"
                            onmouseenter="if(window._attachTagAC_tags)window._attachTagAC_tags(this)">
                        <input class="inp" id="mprop-cond-pts-${idx}" type="number" value="${c.pts_minimos || 0}" placeholder="PT mín." style="width:80px;">
                        <button onclick="document.getElementById('mprop-cond-row-${idx}').remove()" class="btn btn-red btn-sm">✕</button>
                    </div>
                    <textarea class="inp" id="mprop-cond-efecto-${idx}" rows="2" placeholder="Efecto si se cumple la condición…"
                        onmouseenter="if(window._initMarkupTA)window._initMarkupTA(this)">${c.efecto || ''}</textarea>
                </div>`
            );
        };

        if (isEdit) {
            reqsInitial.forEach(r => window._mpropAddReq(r));
            condsInitial.forEach(c => window._mpropAddCond(c));
        } else {
            window._mpropAddReq(); 
        }

        setTimeout(() => {
            const ef = document.getElementById('mprop-efecto');
            if (ef && window._initMarkupTA) window._initMarkupTA(ef);
        }, 100);
    };

    window._tagsConfirmarMedalla = async (pj, tag, modalEl, reqIdEdit) => {
        const nombre  = document.getElementById('mprop-nombre')?.value.trim();
        const ctl     = Number(document.getElementById('mprop-ctl')?.value) || 1;
        const tipo    = document.getElementById('mprop-tipo')?.value || 'activa';
        const efecto  = document.getElementById('mprop-efecto')?.value.trim() || '';
        const msgEl   = document.getElementById('mprop-msg');
        if (!nombre) { if(msgEl) msgEl.textContent='El nombre es obligatorio.'; return; }

        const reqs = [];
        document.querySelectorAll('#mprop-reqs [id^="mprop-req-tag-"]').forEach(el => {
            const idx = el.id.replace('mprop-req-tag-','');
            const t   = el.value.trim();
            const pts = Number(document.getElementById('mprop-req-pts-'+idx)?.value||0);
            if (t) reqs.push({ tag: t.startsWith('#')?t:'#'+t, pts_minimos: pts });
        });

        const conds = [];
        document.querySelectorAll('#mprop-conds [id^="mprop-cond-tag-"]').forEach(el => {
            const idx = el.id.replace('mprop-cond-tag-','');
            const t   = el.value.trim();
            const pts = Number(document.getElementById('mprop-cond-pts-'+idx)?.value||0);
            const efe = document.getElementById('mprop-cond-efecto-'+idx)?.value.trim()||'';
            if (t) conds.push({ tag: t.startsWith('#')?t:'#'+t, pts_minimos: pts, efecto: efe });
        });

        if (msgEl) msgEl.textContent = '⏳ Procesando…';
        const btn = event.target;
        btn.disabled = true;

        const { supabase } = await import('../bnh-auth.js');

        if (reqIdEdit) {
            const req = solicitudes.find(s => s.id === reqIdEdit);
            if (!req) return;
            
            const { error: eMed } = await supabase.from('medallas_catalogo').update({
                nombre, efecto_desc: efecto, costo_ctl: ctl, tipo, requisitos_base: reqs, efectos_condicionales: conds
            }).eq('id', req.datos.medalla_id);

            if (eMed) { if(msgEl) msgEl.textContent='❌ Error: '+eMed.message; btn.disabled=false; return; }

            req.datos.nombre_medalla = nombre;
            await supabase.from('solicitudes_tag').update({ datos: req.datos }).eq('id', reqIdEdit);

            toast(`🏅 Propuesta actualizada`, 'ok');
            modalEl.remove();
            await cargarTodo(); await _refreshMarkup();
            renderProgresion();
            return;
        }

        const { data: medData, error: eMed } = await supabase.from('medallas_catalogo').insert({
            nombre, efecto_desc: efecto, costo_ctl: ctl, tipo, requisitos_base: reqs, efectos_condicionales: conds, propuesta: true, propuesta_por: pj,
        }).select('id').single();

        if (eMed) { if(msgEl) msgEl.textContent='❌ Error medalla: '+eMed.message; btn.disabled = false; return; }

        const res = await enviarSolicitud(pj, tag, 'medalla', 75, { medalla_id: medData.id, nombre_medalla: nombre }, tagsState.esAdmin);
        if (!res.ok) { 
            if(msgEl) msgEl.textContent='Medalla propuesta, pero falló descuento PT: '+res.msg; 
            await supabase.from('medallas_catalogo').delete().eq('id', medData.id); 
            btn.disabled = false; return; 
        }

        toast(`🏅 Medalla propuesta registrada. PT restantes en ${tag}: ${res.nueva}`, 'ok');
        modalEl.remove();
        await cargarTodo(); await _refreshMarkup();
        renderProgresion();
    };

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
            window._tagsVerDetalle(tagNorm); 
        } else {
            toast('❌ ' + error.message, 'error');
        }
    };

    window._tagsQuitarDesdeDetalle = async (grupoId, nombreGrupo, tag) => {
        if (!confirm(`¿Quitar el tag ${tag} de ${nombreGrupo}?`)) return;
        const { supabase } = await import('../bnh-auth.js');
        const tagNorm = tag.startsWith('#') ? tag : '#' + tag;

        const { data: g } = await supabase.from('personajes_refinados')
            .select('tags').eq('id', grupoId).maybeSingle();
        if (!g) return;

        const nuevosTags = (g.tags || []).filter(t => (t.startsWith('#')?t:'#'+t).toLowerCase() !== tagNorm.toLowerCase());

        const { error } = await supabase.from('personajes_refinados')
            .update({ tags: nuevosTags }).eq('id', grupoId);

        if (!error) {
            const gLocal = grupos.find(x => x.id === grupoId);
            if (gLocal) gLocal.tags = nuevosTags;
            toast(`🗑️ ${tagNorm} removido de ${nombreGrupo}`, 'ok');
            window._tagsVerDetalle(tagNorm); 
        } else {
            toast('❌ ' + error.message, 'error');
        }
    };

    window._tagsIrAFichas = (tag) => {
        window.location.href = `../fichas/index.html?tag=${encodeURIComponent(tag)}`;
    };

    window._tagsModoMulti = (activo) => {
        window._tagsModoMultiActivo = activo;
        window._tagsModoMultiSel    = new Set();
        const btn = document.getElementById('btn-asignar-multi');
        if (btn) btn.style.display = activo ? '' : 'none';
        document.querySelectorAll('#sinTag-grid .char-thumb').forEach(el => {
            el.style.outline = '';
            el.style.opacity = '0.65';
        });
    };

    window._tagsAsignarClick = async (id, nombre, tag, el) => {
        if (window._tagsModoMultiActivo) {
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

    window._tagsFiltroRol    = (v) => { tagsState.filtroRol    = v; renderProgresion(); };
    window._tagsFiltroEstado = (v) => { tagsState.filtroEstado = v; renderProgresion(); };

    window._tagsRenombrar = async (tag) => {
        const nuevoNombre = prompt(`Renombrar ${tag} → nuevo nombre (sin #):`);
        if (!nuevoNombre || nuevoNombre.trim() === '' || nuevoNombre.trim() === tag.replace('#','')) return;
        const btn = event?.target;
        if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
        
        const { renameTag, cargarTodo } = await import('./tags-data.js');
        const res = await renameTag(tag, nuevoNombre.trim());
        
        if (res.ok) {
            toast(`✅ ${tag} renombrado a #${nuevoNombre.trim()} en ${res.afectados} personajes`, 'ok');
            await cargarTodo(); await _refreshMarkup();
            renderCatalogo();
        } else {
            toast('❌ ' + res.msg, 'error');
            if (btn) { btn.disabled = false; btn.textContent = '✏️'; }
        }
    };

    window._tagsEliminar = async (tag, count) => {
        const msg = count > 0
            ? `¿Eliminar ${tag}? Se quitará de ${count} personaje${count!==1?'s':''} y del catálogo. Esta acción no se puede deshacer.`
            : `¿Eliminar ${tag} del catálogo?`;
        if (!confirm(msg)) return;
        
        const { deleteTag, cargarTodo } = await import('./tags-data.js');
        const res = await deleteTag(tag);
        
        if (res.ok) {
            toast(`🗑️ ${tag} eliminado de ${res.afectados} personajes`, 'ok');
            await cargarTodo(); await _refreshMarkup();
            renderCatalogo();
        } else {
            toast('❌ ' + res.msg, 'error');
        }
    };

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

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') window._tagsCloseDetalle();
    });
    document.getElementById('tag-detalle-modal')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) window._tagsCloseDetalle();
    });
}
