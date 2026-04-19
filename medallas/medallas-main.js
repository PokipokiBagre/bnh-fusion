// medallas/medallas-main.js
import { bnhAuth, currentConfig, supabase } from '../bnh-auth.js';
import { medallaState, medallas, grupos, STORAGE_URL } from './medallas-state.js';
import { cargarTodo, guardarMedalla, eliminarMedalla } from './medallas-data.js';
import {
    renderCatalogo, renderGrafo, renderPersonaje,
    renderDetalleMedalla, renderFormMedalla, renderProponerMedalla,
    _htmlReqRow, _htmlCondRow, toast, mountNewTagAC
} from './medallas-ui.js';
import { initMarkup } from '../bnh-markup.js';
import { initTags } from '../bnh-tags.js';

window.onload = async () => {
    const fav = document.getElementById('dynamic-favicon');
    if (fav) fav.href = `${STORAGE_URL}/imginterfaz/icon.png?v=${Date.now()}`;

    await bnhAuth.init();
    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();
    medallaState.esAdmin = bnhAuth.esAdmin();

    try {
        await Promise.all([ initTags(), cargarTodo() ]);
        initMarkup({ grupos, medallas });
    } catch(e) {
        document.getElementById('pantalla-carga').innerHTML = `<p style="color:red;">Error: ${e.message}</p>`;
        return;
    }

    document.getElementById('pantalla-carga').classList.add('oculto');
    document.getElementById('interfaz-medallas').classList.remove('oculto');
    _renderTab('catalogo');
    _exponerGlobales();
};

function _renderTab(tab) {
    medallaState.tabActual = tab;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    ['catalogo','grafo','personaje'].forEach(t =>
        document.getElementById(`vista-${t}`)?.classList.toggle('oculto', t !== tab)
    );
    if (tab === 'catalogo')  renderCatalogo();
    if (tab === 'grafo')     renderGrafo();
    if (tab === 'personaje') renderPersonaje();
}

function _exponerGlobales() {
    window._medTab        = _renderTab;
    window._medBuscar     = v => { medallaState.busqueda  = v; renderCatalogo(); };
    window._medFiltroTag  = v => { medallaState.filtroTag = v; renderCatalogo(); };
    window._medSelPJ      = n => {
        medallaState.pjSeleccionado = medallaState.pjSeleccionado === n ? null : n;
        renderPersonaje();
    };

    // Filtros personaje
    window._medFiltroRolPJ = v => { medallaState.filtroRolPJ = v; renderPersonaje(); };
    window._medFiltroEstPJ = v => { medallaState.filtroEstadoPJ = v; renderPersonaje(); };

    // Filtros bloques
    window._medBloquesFiltroRol = v => { medallaState.filtroRolBloques = v; renderGrafo(); };
    window._medBloquesFiltroEst = v => { medallaState.filtroEstBloques = v; renderGrafo(); };

    // Seleccionar PJ en bloques → activa sus tags
    window._medBloqueSelPJ = nombre => {
        if (!nombre) {
            // Quitar PJ: limpiar tags del PJ del selector
            if (medallaState.pjBloquesSel) {
                const g = grupos.find(x => x.nombre_refinado === medallaState.pjBloquesSel);
                const tagsDelPJ = (g?.tags||[]).map(t => t.startsWith('#') ? t : '#'+t);
                medallaState.grafoTagsSel = medallaState.grafoTagsSel.filter(t => !tagsDelPJ.includes(t));
            }
            medallaState.pjBloquesSel = null;
            renderGrafo();
            return;
        }
        const g = grupos.find(x => x.nombre_refinado === nombre);
        if (!g) return;
        const tagsDelPJ = (g.tags||[]).map(t => t.startsWith('#') ? t : '#'+t);
        if (medallaState.pjBloquesSel === nombre) {
            // Click de nuevo en el mismo PJ → quitar sus tags
            medallaState.grafoTagsSel = medallaState.grafoTagsSel.filter(t => !tagsDelPJ.includes(t));
            medallaState.pjBloquesSel = null;
        } else {
            // Nuevo PJ: añadir sus tags a los seleccionados (sin duplicar)
            medallaState.pjBloquesSel = nombre;
            tagsDelPJ.forEach(t => {
                if (!medallaState.grafoTagsSel.includes(t)) medallaState.grafoTagsSel.push(t);
            });
        }
        renderGrafo();
    };

    // Equipación
    window._medEquiparToggle = (id, mObj) => {
        const eq = medallaState.equipacion || [];
        const idx = eq.findIndex(e => e.id === id);
        if (idx >= 0) {
            eq.splice(idx, 1);
            // Si se quita la medalla del detalle, limpiar detalle
            if (medallaState.equipacionDetalleId === id) medallaState.equipacionDetalleId = null;
        } else {
            const m = mObj || medallas.find(x => x.id === id);
            if (m) eq.push(m);
        }
        medallaState.equipacion = eq;
        renderPersonaje();
    };

    // Seleccionar medalla del panel para ver su detalle
    window._medEquipSelDetalle = (id) => {
        medallaState.equipacionDetalleId = (medallaState.equipacionDetalleId === id) ? null : id;
        renderPersonaje();
    };

    window._medLimpiarEquipacion = () => {
        medallaState.equipacion = [];
        medallaState.equipacionDetalleId = null;
        renderPersonaje();
    };

    // Guardar solo las medallas que caben dentro del CTL (de arriba a abajo)
    window._medGuardarEquipacionValida = async () => {
        if (!medallaState.pjSeleccionado) { toast('Selecciona un personaje primero', 'error'); return; }
        const g   = grupos.find(x => x.nombre_refinado === medallaState.pjSeleccionado);
        const ctl = g?.ctl || 0;
        let ctlAcum = 0;
        const validas = (medallaState.equipacion || []).filter(m => {
            const cabe = (ctlAcum + (m.costo_ctl||0)) <= ctl;
            if (cabe) ctlAcum += (m.costo_ctl||0);
            return cabe;
        });
        const sobran = (medallaState.equipacion||[]).length - validas.length;
        if (sobran > 0) {
            const ok = confirm(`⚠ ${sobran} medalla${sobran>1?'s':''} excede${sobran>1?'n':''} el límite de CTL y ${sobran>1?'serán':'será'} descartada${sobran>1?'s':''}.\n\n¿Guardar solo las ${validas.length} que caben?`);
            if (!ok) return;
        }
        medallaState.equipacion = validas;
        const ids = validas.map(m => m.id);
        const { error } = await supabase.from('personajes_refinados')
            .update({ equipacion: ids })
            .eq('nombre_refinado', medallaState.pjSeleccionado);
        if (error) { toast('❌ Error guardando: ' + error.message, 'error'); return; }
        toast(`✅ Equipación guardada (${validas.length} medallas, ${ctlAcum} CTL)`, 'ok');
        renderPersonaje();
    };

    window._medGuardarEquipacion = window._medGuardarEquipacionValida; // alias por compatibilidad

    window._medProponerEquipacion = () => {
        if (!medallaState.pjSeleccionado) { toast('Selecciona un personaje primero', 'error'); return; }
        const eq = medallaState.equipacion || [];
        if (!eq.length) { toast('No hay medallas equipadas que proponer', 'info'); return; }
        const lista = eq.map(m => `• ${m.nombre} (${m.costo_ctl} CTL)`).join('\n');
        alert(`Propuesta de equipación para ${medallaState.pjSeleccionado}:\n\n${lista}\n\nCopia este mensaje y envíalo al OP.`);
    };

    window._medPJBuscar = v => {
        medallaState.pjBusqueda = v;
        renderPersonaje();
    };

    // Propuestas
    window._medTogglePropuestas = () => {
        medallaState.filtroPropuestas = !medallaState.filtroPropuestas;
        renderCatalogo();
    };

    window._medAprobar = async (id) => {
        const { error } = await supabase.from('medallas_catalogo')
            .update({ propuesta: false, propuesta_por: '' })
            .eq('id', id);
        if (error) { toast('❌ Error al aprobar', 'error'); return; }
        toast('✅ Medalla aprobada', 'ok');
        await cargarTodo(); initMarkup({ grupos, medallas });
        renderCatalogo();
    };

    window._medProponerModal = () => renderProponerMedalla();

    window._medEnviarPropuesta = async () => {
        const nombre = document.getElementById('prop-nombre')?.value.trim();
        const msg    = document.getElementById('prop-msg');
        if (!nombre) { if (msg) msg.textContent = 'El nombre es obligatorio.'; return; }

        const reqs = [];
        document.querySelectorAll('#prop-reqs [id^="req-tag-"]').forEach(el => {
            const idx = el.id.replace('req-tag-', '');
            const tag = el.value.trim();
            const pts = Number(document.getElementById('req-pts-' + idx)?.value || 0);
            if (tag) reqs.push({ tag: tag.startsWith('#') ? tag : '#'+tag, pts_minimos: pts });
        });

        const conds = [];
        document.querySelectorAll('#prop-conds [id^="cond-tag-"]').forEach(el => {
            const idx = el.id.replace('cond-tag-', '');
            const tag = el.value.trim();
            const pts = Number(document.getElementById('cond-pts-' + idx)?.value || 0);
            const efe = document.getElementById('cond-efecto-' + idx)?.value.trim() || '';
            if (tag) conds.push({ tag: tag.startsWith('#') ? tag : '#'+tag, pts_minimos: pts, efecto: efe });
        });

        const datos = {
            nombre,
            costo_ctl:       Number(document.getElementById('prop-ctl')?.value || 1),
            efecto_base:     document.getElementById('prop-efecto')?.value.trim() || '',
            tipo:            document.getElementById('prop-tipo')?.value || 'activa',
            requisitos_base: reqs,
            efectos_condicionales: conds,
            propuesta:       true,
            propuesta_por:   document.getElementById('prop-autor')?.value.trim() || '',
        };

        if (msg) msg.textContent = '⏳ Enviando…';
        const res = await guardarMedalla(datos);
        if (res.ok) {
            toast('✅ Propuesta enviada. El OP la revisará pronto.', 'ok');
            await cargarTodo(); initMarkup({ grupos, medallas });
            window._medallasCloseModal();
            renderCatalogo();
        } else {
            if (msg) msg.textContent = '❌ ' + res.msg;
        }
    };

    // Grafo — controles de tags seleccionados
    window._medGrafoToggleTag = tag => {
        const idx = medallaState.grafoTagsSel.indexOf(tag);
        if (idx >= 0) medallaState.grafoTagsSel.splice(idx, 1);
        else medallaState.grafoTagsSel.push(tag);
        renderGrafo();
    };

    window._medGrafoClearTags = () => {
        medallaState.grafoTagsSel = [];
        renderGrafo();
    };

    window._medGrafoBuscarTag = v => {
        medallaState.grafoBusqueda  = v;
        medallaState.grafoTagPagina = 0;
        renderGrafo();
    };

    window._medGrafoPag = p => {
        medallaState.grafoTagPagina = p;
        renderGrafo();
    };

    window._medGrafoReset = () => {
        const { resetGrafoView } = window._medGrafoExports || {};
        import('./medallas-grafo.js').then(m => m.resetGrafoView());
    };

    // Mostrar info del tag al hacer click en un nodo tag del grafo
    window._medGrafoTagClick = tag => {
        // Abrir modal de info del tag (mostrar cuántas medallas tiene y cuáles)
        const medallasDeltag = medallas.filter(m =>
            (!m.propuesta || medallaState.esAdmin) &&
            (m.requisitos_base||[]).some(r => {
                const t = r.tag.startsWith('#') ? r.tag : '#'+r.tag;
                return t.toLowerCase() === tag.toLowerCase();
            })
        );
        const el = document.getElementById('medalla-modal');
        if (!el) return;
        el.innerHTML = `
            <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;">
                <div style="background:white;border-radius:12px;max-width:520px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.2);overflow:hidden;">
                    <div style="background:#f39c12;color:white;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;">
                        <b style="font-family:'Cinzel',serif;font-size:1.1em;">${tag}</b>
                        <button onclick="window._medallasCloseModal()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:1.1em;">×</button>
                    </div>
                    <div style="padding:16px;">
                        <p style="font-size:0.85em;color:#888;margin-bottom:12px;">${medallasDeltag.length} medalla${medallasDeltag.length!==1?'s':''} con este tag</p>
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            ${medallasDeltag.map(m => `
                                <div style="background:#f8f9fa;border-radius:8px;padding:8px 12px;cursor:pointer;border:1px solid #dee2e6;"
                                    onclick="window._medallasCloseModal();setTimeout(()=>window._medallasAbrirDetalle(${JSON.stringify(m).replace(/"/g,'&quot;')}),80)">
                                    <b style="font-size:0.88em;">${m.nombre}</b>
                                    <span style="color:#888;font-size:0.78em;margin-left:8px;">${m.costo_ctl} CTL</span>
                                    ${m.propuesta ? '<span style="background:#fef3e2;color:#e67e22;font-size:0.7em;padding:1px 5px;border-radius:4px;margin-left:4px;">Propuesta</span>' : ''}
                                    <div style="font-size:0.78em;color:#666;margin-top:3px;">${m.efecto_desc||''}</div>
                                </div>`).join('')}
                        </div>
                    </div>
                </div>
            </div>`;
        el.style.display = 'block';
    };

    // Detalle modal
    window._medallasAbrirDetalle = (m, pj = null) => {
        if (typeof m === 'string') m = medallas.find(x => x.id === m);
        if (!m) return;
        renderDetalleMedalla(m, pj || medallaState.pjSeleccionado);
    };
    window._medallasCloseModal = () => {
        const el = document.getElementById('medalla-modal');
        if (el) el.style.display = 'none';
    };

    // CRUD
    window._medallasNueva  = () => renderFormMedalla(null);
    window._medallasEditar = m => { window._medallasCloseModal(); setTimeout(() => renderFormMedalla(m), 80); };
    window._medallasEliminar = async id => {
        if (!confirm('¿Eliminar esta medalla permanentemente?')) return;
        const ok = await eliminarMedalla(id);
        if (ok) {
            toast('🗑️ Medalla eliminada', 'ok');
            await cargarTodo(); initMarkup({ grupos, medallas });
            window._medallasCloseModal();
            _renderTab(medallaState.tabActual);
        } else toast('❌ Error al eliminar', 'error');
    };

    // Formulario dinámico
    window._medAddReq = () => {
        const c = window._fm_reqCount = (window._fm_reqCount||0) + 1;
        document.getElementById('fm-reqs').insertAdjacentHTML('beforeend', _htmlReqRow({}, c));
        requestAnimationFrame(() => mountNewTagAC('req-tag-' + c));
    };
    window._medAddCond = () => {
        const c = window._fm_condCount = (window._fm_condCount||0) + 1;
        document.getElementById('fm-conds').insertAdjacentHTML('beforeend', _htmlCondRow({}, c));
        requestAnimationFrame(() => mountNewTagAC('cond-tag-' + c));
    };

    window._medGuardar = async () => {
        const nombre = document.getElementById('fm-nombre')?.value.trim();
        if (!nombre) { document.getElementById('fm-msg').textContent = 'El nombre es obligatorio.'; return; }
        const reqs = [];
        document.querySelectorAll('[id^="req-tag-"]').forEach(el => {
            const idx = el.id.replace('req-tag-', '');
            const tag = el.value.trim();
            const pts = Number(document.getElementById('req-pts-' + idx)?.value || 0);
            if (tag) reqs.push({ tag: tag.startsWith('#') ? tag : '#'+tag, pts_minimos: pts });
        });
        const conds = [];
        document.querySelectorAll('[id^="cond-tag-"]').forEach(el => {
            const idx = el.id.replace('cond-tag-', '');
            const tag = el.value.trim();
            const pts = Number(document.getElementById('cond-pts-' + idx)?.value || 0);
            const efe = document.getElementById('cond-efecto-' + idx)?.value.trim() || '';
            if (tag) conds.push({ tag: tag.startsWith('#') ? tag : '#'+tag, pts_minimos: pts, efecto: efe });
        });
        const datos = {
            id:                    document.getElementById('fm-id')?.value || undefined,
            nombre,
            costo_ctl:             Number(document.getElementById('fm-ctl')?.value || 1),
            efecto_base:           document.getElementById('fm-efecto')?.value.trim() || '',
            tipo:                  document.getElementById('fm-tipo')?.value || 'activa',
            requisitos_base:       reqs,
            efectos_condicionales: conds,
        };
        if (!datos.id) delete datos.id;

        const btn = document.querySelector('#medalla-modal .btn-green');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando…'; }
        const res = await guardarMedalla(datos);
        if (res.ok) {
            toast('✅ Medalla guardada', 'ok');
            await cargarTodo(); initMarkup({ grupos, medallas });
            window._medallasCloseModal();
            _renderTab(medallaState.tabActual);
        } else {
            document.getElementById('fm-msg').textContent = '❌ ' + res.msg;
            if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Medalla'; }
        }
    };

    document.addEventListener('keydown', e => { if (e.key === 'Escape') window._medallasCloseModal(); });
    document.getElementById('medalla-modal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('medalla-modal')) window._medallasCloseModal();
    });
}
