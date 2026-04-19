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
    
    _exponerGlobales();
    _renderTab(medallaState.tabActual);

    // Leer la URL para abrir medallas con !Medalla!
    const params = new URLSearchParams(window.location.search);
    const mQuery = params.get('medalla');
    if (mQuery) {
        window._medallasAbrirDetalleByName(mQuery);
    }
};

function _renderTab(tab) {
    medallaState.tabActual = tab;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    ['catalogo','grafo','personaje'].forEach(t =>
        document.getElementById(`vista-${t}`)?.classList.toggle('oculto', t !== tab)
    );
    if (tab === 'catalogo')  renderCatalogo();
    if (tab === 'grafo') {
        renderGrafo();
        setTimeout(() => {
            const main = document.querySelector('.app-main');
            if (main) main.scrollTop = main.scrollHeight;
            window.scrollTo(0, document.body.scrollHeight);
        }, 60);
    }
    if (tab === 'personaje') renderPersonaje();
}

function _exponerGlobales() {
    window._medTab        = _renderTab;
    window._medBuscar     = v => { medallaState.busqueda  = v; renderCatalogo(); };
    window._medFiltroTag  = v => { medallaState.filtroTag = v; renderCatalogo(); };
    window._medSelPJ      = async n => {
        if (medallaState.pjSeleccionado === n) {
            medallaState.pjSeleccionado = null;
            medallaState.equipacion = [];
            medallaState.equipacionPropuesta = [];
            medallaState.equipacionDetalleId = null;
            renderPersonaje();
        } else {
            medallaState.pjSeleccionado = n;
            medallaState.equipacion = []; 
            medallaState.equipacionPropuesta = [];
            medallaState.equipacionDetalleId = null;
            renderPersonaje(); 
            
            const { data, error } = await supabase
                .from('medallas_inventario')
                .select('medalla_id, propuesta')
                .eq('personaje_nombre', n)
                .eq('equipada', true)
                .order('slot_orden');
                
            if (!error && data) {
                medallaState.equipacion = data
                    .filter(r => !r.propuesta)
                    .map(row => medallas.find(m => m.id === row.medalla_id))
                    .filter(Boolean);
                medallaState.equipacionPropuesta = data
                    .filter(r => r.propuesta)
                    .map(row => medallas.find(m => m.id === row.medalla_id))
                    .filter(Boolean);
                renderPersonaje(); 
            }
        }
    };

    window._medFiltroRolPJ = v => { medallaState.filtroRolPJ = v; renderPersonaje(); };
    window._medFiltroEstPJ = v => { medallaState.filtroEstadoPJ = v; renderPersonaje(); };

    window._medBloquesFiltroRol = v => { medallaState.filtroRolBloques = v; renderGrafo(); };
    window._medBloquesFiltroEst = v => { medallaState.filtroEstBloques = v; renderGrafo(); };

    window._medBloqueSelPJ = nombre => {
        if (!nombre) {
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
            medallaState.grafoTagsSel = medallaState.grafoTagsSel.filter(t => !tagsDelPJ.includes(t));
            medallaState.pjBloquesSel = null;
        } else {
            medallaState.pjBloquesSel = nombre;
            tagsDelPJ.forEach(t => {
                if (!medallaState.grafoTagsSel.includes(t)) medallaState.grafoTagsSel.push(t);
            });
        }
        renderGrafo();
    };

    window._medEquiparToggle = (id, mObj) => {
        const eq = medallaState.equipacion || [];
        const idx = eq.findIndex(e => e.id === id);
        if (idx >= 0) {
            eq.splice(idx, 1);
            if (medallaState.equipacionDetalleId === id) medallaState.equipacionDetalleId = null;
        } else {
            const m = mObj || medallas.find(x => x.id === id);
            if (m) eq.push(m);
        }
        medallaState.equipacion = eq;
        renderPersonaje();
    };

    window._medEquipSelDetalle = (id) => {
        medallaState.equipacionDetalleId = (medallaState.equipacionDetalleId === id) ? null : id;
        renderPersonaje();
    };

    window._medLimpiarEquipacion = () => {
        medallaState.equipacion = [];
        medallaState.equipacionDetalleId = null;
        renderPersonaje();
    };

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
            const ok = confirm(`⚠ ${sobran} medalla(s) exceden el límite de CTL y serán descartadas.\\n\\n¿Guardar solo las ${validas.length} que caben?`);
            if (!ok) return;
        }
        medallaState.equipacion = validas;
        
        await supabase.from('medallas_inventario').delete().eq('personaje_nombre', medallaState.pjSeleccionado).eq('propuesta', false);

        if (validas.length > 0) {
            const inserts = validas.map((m, index) => ({
                personaje_nombre: medallaState.pjSeleccionado,
                medalla_id: m.id,
                slot_orden: index + 1,
                equipada: true,
                propuesta: false
            }));
            const { error } = await supabase.from('medallas_inventario').insert(inserts);
            if (error) { toast('❌ Error guardando: ' + error.message, 'error'); return; }
        }
        toast(`✅ Equipación guardada (${validas.length} medallas, ${ctlAcum} CTL)`, 'ok');
        renderPersonaje();
    };
    window._medGuardarEquipacion = window._medGuardarEquipacionValida; 

    window._medProponerEquipacion = () => {
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
            const ok = confirm(`⚠ ${sobran} medalla(s) exceden el límite de CTL.\\n\\n¿Proponer solo las ${validas.length} que caben?`);
            if (!ok) return;
        }

        if (validas.length === 0) { toast('No hay medallas que quepan para proponer', 'info'); return; }

        const el = document.getElementById('medalla-modal');
        el.innerHTML = `
            <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;" onclick="if(event.target===this)window._medallasCloseModal()">
                <div style="background:white;border-radius:var(--radius-lg);max-width:450px;width:100%;box-shadow:var(--shadow-lg);overflow:hidden;border:2px solid #e67e22;">
                    <div style="background:#e67e22;color:white;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;">
                        <h3 style="margin:0;font-family:'Cinzel',serif;">📝 Enviar Propuesta</h3>
                        <button onclick="window._medallasCloseModal()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;">×</button>
                    </div>
                    <div style="padding:20px;">
                        <p style="font-size:0.9em;color:var(--gray-700);margin-bottom:15px;">Se enviará una propuesta con <b>${validas.length} medallas</b> para <b>${medallaState.pjSeleccionado}</b>.</p>
                        <label class="form-label">Tu nombre (opcional)</label>
                        <input class="inp" id="prop-eq-autor" placeholder="¿Cómo te llamamos?" autocomplete="off" onkeydown="if(event.key==='Enter')window._medEjecutarPropuestaEq()">
                        <div style="display:flex;gap:10px;margin-top:20px;">
                            <button class="btn btn-sm" style="background:#e67e22;border-color:#e67e22;color:white;" onclick="window._medEjecutarPropuestaEq()">Enviar propuesta</button>
                            <button class="btn btn-outline btn-sm" onclick="window._medallasCloseModal()">Cancelar</button>
                        </div>
                    </div>
                </div>
            </div>`;
        el.style.display = 'block';
        window._tempValidasEq = validas; 
        setTimeout(() => document.getElementById('prop-eq-autor')?.focus(), 50);
    };

    window._medEjecutarPropuestaEq = async () => {
        const autor = document.getElementById('prop-eq-autor')?.value.trim() || 'Anónimo';
        const validas = window._tempValidasEq || [];
        const btn = event.target;
        btn.disabled = true; btn.textContent = '⏳ Enviando...';

        await supabase.from('medallas_inventario').delete().eq('personaje_nombre', medallaState.pjSeleccionado).eq('propuesta', true);

        const inserts = validas.map((m, index) => ({
            personaje_nombre: medallaState.pjSeleccionado,
            medalla_id: m.id,
            slot_orden: index + 1,
            equipada: true,
            propuesta: true,
            propuesta_por: autor
        }));
        
        const { error } = await supabase.from('medallas_inventario').insert(inserts);
        if (error) { toast('❌ Error enviando propuesta', 'error'); btn.disabled = false; btn.textContent = 'Enviar propuesta'; return; }
        
        toast(`✅ Propuesta enviada (${validas.length} medallas)`, 'ok');
        window._medallasCloseModal();
        window._medSelPJ(medallaState.pjSeleccionado);
    };

    window._medAprobarPropuestaEq = async () => {
        const pj = medallaState.pjSeleccionado;
        const btn = event.target;
        btn.textContent = '⏳'; btn.disabled = true;
        await supabase.from('medallas_inventario').delete().eq('personaje_nombre', pj).eq('propuesta', false);
        await supabase.from('medallas_inventario').update({ propuesta: false, propuesta_por: null }).eq('personaje_nombre', pj).eq('propuesta', true);
        toast('✅ Propuesta de equipación aprobada', 'ok');
        window._medSelPJ(pj); 
    };

    window._medRechazarPropuestaEq = async () => {
        const pj = medallaState.pjSeleccionado;
        if (!confirm('¿Seguro que deseas eliminar/retirar esta propuesta de equipación?')) return;
        await supabase.from('medallas_inventario').delete().eq('personaje_nombre', pj).eq('propuesta', true);
        toast('🗑️ Propuesta eliminada', 'ok');
        window._medSelPJ(pj); 
    };

    window._medPJBuscar = v => { medallaState.pjBusqueda = v; renderPersonaje(); };

    window._medTogglePropuestas = () => { medallaState.filtroPropuestas = !medallaState.filtroPropuestas; renderCatalogo(); };

    window._medAprobar = async (id) => {
        const { error } = await supabase.from('medallas_catalogo').update({ propuesta: false, propuesta_por: '' }).eq('id', id);
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
            nombre, costo_ctl: Number(document.getElementById('prop-ctl')?.value || 1),
            efecto_base: document.getElementById('prop-efecto')?.value.trim() || '',
            tipo: document.getElementById('prop-tipo')?.value || 'activa',
            requisitos_base: reqs, efectos_condicionales: conds, propuesta: true,
            propuesta_por: document.getElementById('prop-autor')?.value.trim() || '',
        };

        if (msg) msg.textContent = '⏳ Enviando…';
        const res = await guardarMedalla(datos);
        if (res.ok) {
            toast('✅ Propuesta enviada', 'ok');
            await cargarTodo(); initMarkup({ grupos, medallas });
            window._medallasCloseModal();
            renderCatalogo();
        } else { if (msg) msg.textContent = '❌ ' + res.msg; }
    };

    window._medGrafoToggleTag = tag => {
        const idx = medallaState.grafoTagsSel.indexOf(tag);
        if (idx >= 0) medallaState.grafoTagsSel.splice(idx, 1);
        else medallaState.grafoTagsSel.push(tag);
        renderGrafo();
    };

    window._medGrafoClearTags = () => { medallaState.grafoTagsSel = []; renderGrafo(); };
    window._medGrafoBuscarTag = v => { medallaState.grafoBusqueda  = v; medallaState.grafoTagPagina = 0; renderGrafo(); };
    window._medGrafoPag = p => { medallaState.grafoTagPagina = p; renderGrafo(); };

    // Función para abrir la medalla desde el markup
    window._medallasAbrirDetalleByName = (nombre) => {
        const m = medallas.find(x => x.nombre.toLowerCase() === nombre.toLowerCase());
        if (m) window._medallasAbrirDetalle(m.id);
    };

    window._medallasAbrirDetalle = (m, pj = null) => {
        if (typeof m === 'string') m = medallas.find(x => x.id === m);
        if (!m) return;
        renderDetalleMedalla(m, pj || medallaState.pjSeleccionado);
    };
    
    window._medallasCloseModal = () => {
        const el = document.getElementById('medalla-modal');
        if (el) el.style.display = 'none';
        // Limpiamos la URL para no reabrir accidentalmente
        const url = new URL(window.location);
        url.searchParams.delete('medalla');
        window.history.replaceState({}, '', url);
    };

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
            id: document.getElementById('fm-id')?.value || undefined,
            nombre, costo_ctl: Number(document.getElementById('fm-ctl')?.value || 1),
            efecto_base: document.getElementById('fm-efecto')?.value.trim() || '',
            tipo: document.getElementById('fm-tipo')?.value || 'activa',
            requisitos_base: reqs, efectos_condicionales: conds,
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
}
