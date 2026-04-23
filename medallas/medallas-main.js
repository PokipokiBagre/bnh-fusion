// ============================================================
// medallas/medallas-main.js
// ============================================================
import { bnhAuth, currentConfig, supabase } from '../bnh-auth.js';
import { medallaState, medallas, grupos, puntosAll, STORAGE_URL } from './medallas-state.js';
import { cargarTodo, guardarMedalla, eliminarMedalla } from './medallas-data.js';
import {
    renderCatalogo, renderGrafo, renderPersonaje,
    renderDetalleMedalla, renderFormMedalla, renderProponerMedalla,
    renderFormsMultiple,
    _htmlReqRow, _htmlCondRow, toast, mountNewTagAC
} from './medallas-ui.js';
import { initMarkup } from '../bnh-markup.js';
import { setSupabaseRef, invalidarCacheEquipacion } from '../bnh-pac.js';
import { initTags } from '../bnh-tags.js';

window.onload = async () => {
    const fav = document.getElementById('dynamic-favicon');
    if (fav) fav.href = `${STORAGE_URL}/imginterfaz/icon.png?v=${Date.now()}`;

    await bnhAuth.init();
    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();
    medallaState.esAdmin = bnhAuth.esAdmin();
    
    // Inyectar supabase en bnh-pac para que pueda consultar equipación
    setSupabaseRef(supabase);

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

    // Leer la URL para abrir medallas por parámetro
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
                // Filtrar medallas normales (no propuestas)
                const rawEquip = data
                    .filter(r => !r.propuesta)
                    .map(row => medallas.find(m => m.id === row.medalla_id))
                    .filter(Boolean);
                    
                try {
                    const { limpiarInventarioInvalido } = await import('../bnh-medal.js');
                    const { proyectarPJ } = await import('./medallas-logic.js');
                    
                    const proy = proyectarPJ(n); // Aplicar lente de fusión
                    
                    // Validamos usando los tags, pt y CTL Proyectados
                    medallaState.equipacion = await limpiarInventarioInvalido(
                        n, rawEquip, proy.tags, proy.ptsMapa, proy.ctl
                    );
                } catch (err) {
                    console.error("Error en validación, cargando datos brutos:", err);
                    medallaState.equipacion = rawEquip; 
                }

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

    window._medEquiparToggle = async (id, mObj) => {
        const eq = medallaState.equipacion || [];
        const idx = eq.findIndex(e => e.id === id);
        if (idx >= 0) {
            eq.splice(idx, 1);
            if (medallaState.equipacionDetalleId === id) medallaState.equipacionDetalleId = null;
        } else {
            const m = mObj || medallas.find(x => x.id === id);
            if (m) {
                // --- 1. VALIDACIÓN DE TAGS Y PT ---
                const { estadoMedallaPJ, proyectarPJ } = await import('./medallas-logic.js');
                const estado = estadoMedallaPJ(m, medallaState.pjSeleccionado);
                
                if (estado !== 'activable') {
                    toast('❌ No cumples los requisitos de Tags o PT para esta medalla.', 'error');
                    return;
                }

                // --- 2. VALIDACIÓN DE LÍMITE DE CTL (Usando Lente de Fusión) ---
                const proy = proyectarPJ(medallaState.pjSeleccionado);
                const ctlUsado = eq.reduce((a, b) => a + (Number(b.costo_ctl) || 0), 0);
                
                if (ctlUsado + (Number(m.costo_ctl) || 0) > proy.ctl) {
                    toast('❌ No tienes suficiente CTL (Incluso con la fusión activa)', 'error');
                    return;
                }

                eq.push(m);
            }
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
        
        // ⚡ LENTE DE FUSIÓN: Leemos el CTL Proyectado en lugar de la base de datos estática
        const { proyectarPJ } = await import('./medallas-logic.js');
        const proy = proyectarPJ(medallaState.pjSeleccionado);
        const ctl = proy ? proy.ctl : 0;

        let ctlAcum = 0;
        const validas = (medallaState.equipacion || []).filter(m => {
            const cabe = (ctlAcum + (m.costo_ctl||0)) <= ctl;
            if (cabe) ctlAcum += (m.costo_ctl||0);
            return cabe;
        });

        const sobran = (medallaState.equipacion||[]).length - validas.length;
        if (sobran > 0) {
            const ok = confirm(`⚠ ${sobran} medalla(s) exceden el límite de CTL (${ctl} CTL) y serán descartadas.\n\n¿Guardar solo las ${validas.length} que caben?`);
            if (!ok) return;
        }
        medallaState.equipacion = validas;
        
        // Borramos equipación actual
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
        
        // Actualizar cache global (Módulo bnh-pac) para que PAC se recalcule de inmediato
        invalidarCacheEquipacion(medallaState.pjSeleccionado);
        
        toast(`✅ Equipación guardada (${validas.length} medallas, ${ctlAcum} CTL)`, 'ok');
        renderPersonaje();
    };
    
    window._medGuardarEquipacion = window._medGuardarEquipacionValida;

    window._medProponerEquipacion = async () => { 
        if (!medallaState.pjSeleccionado) { toast('Selecciona un personaje primero', 'error'); return; }
        
        // ⚡ LENTE DE FUSIÓN
        const { proyectarPJ } = await import('./medallas-logic.js');
        const proy = proyectarPJ(medallaState.pjSeleccionado);
        const ctl = proy ? proy.ctl : 0;

        let ctlAcum = 0;
        const validas = (medallaState.equipacion || []).filter(m => {
            const cabe = (ctlAcum + (m.costo_ctl||0)) <= ctl;
            if (cabe) ctlAcum += (m.costo_ctl||0);
            return cabe;
        });

        const sobran = (medallaState.equipacion||[]).length - validas.length;
        if (sobran > 0) {
            const ok = confirm(`⚠ ${sobran} medalla(s) exceden el límite de CTL (${ctl} CTL).\n\n¿Proponer solo las ${validas.length} que caben?`);
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
        
        invalidarCacheEquipacion(pj); // Invalidar caché PAC
        
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

    window._medToggleFiltroTagPJ = (tag) => {
        medallaState.filtroTagsPJ = medallaState.filtroTagsPJ || [];
        const idx = medallaState.filtroTagsPJ.indexOf(tag);
        if (idx > -1) medallaState.filtroTagsPJ.splice(idx, 1);
        else medallaState.filtroTagsPJ.push(tag);
        renderPersonaje();
    };

    window._medLimpiarFiltrosTagPJ = () => {
        medallaState.filtroTagsPJ = [];
        renderPersonaje();
    };
    
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
        const url = new URL(window.location);
        url.searchParams.delete('medalla');
        window.history.replaceState({}, '', url);
    };

    window._medallasNueva  = () => renderFormMedalla(null);
    window._medallasEditar = m => { window._medallasCloseModal(); setTimeout(() => renderFormMedalla(m), 80); };

    // ── Multi-select en catálogo ──────────────────────────────
    window._medToggleModoSel = () => {
        medallaState.modoSeleccion = !medallaState.modoSeleccion;
        if (!medallaState.modoSeleccion) medallaState.seleccionados = [];
        renderCatalogo();
    };
    window._medToggleSel = (id) => {
        medallaState.seleccionados = medallaState.seleccionados || [];
        const idx = medallaState.seleccionados.indexOf(id);
        if (idx >= 0) medallaState.seleccionados.splice(idx, 1);
        else medallaState.seleccionados.push(id);
        renderCatalogo();
    };
    window._medDeselAll = () => { medallaState.seleccionados = []; renderCatalogo(); };
    window._medSelAll   = () => {
        let lista = filtrarMedallas({ busqueda: medallaState.busqueda, tag: medallaState.filtroTag });
        if (medallaState.filtroPropuestas) lista = lista.filter(m => m.propuesta);
        medallaState.seleccionados = lista.map(m => m.id);
        renderCatalogo();
    };
    window._medEliminarSeleccion = async () => {
        const ids = medallaState.seleccionados || [];
        if (!ids.length) return;
        if (!confirm(`¿Eliminar ${ids.length} medalla${ids.length!==1?'s':''} permanentemente?`)) return;
        let ok = 0, fail = 0;
        for (const id of ids) {
            const r = await eliminarMedalla(id);
            if (r) ok++; else fail++;
        }
        medallaState.seleccionados = [];
        medallaState.modoSeleccion = false;
        toast(`🗑️ ${ok} eliminada${ok!==1?'s':''}${fail>0?' ('+fail+' fallaron)':''}`, ok>0?'ok':'error');
        await cargarTodo(); initMarkup({ grupos, medallas });
        _renderTab(medallaState.tabActual);
    };

    // ── Creación / propuesta múltiple (6 formularios) ─────────
    window._medNuevaMultiple    = () => renderFormsMultiple(false);
    window._medProponerMultiple = () => renderFormsMultiple(true);
    window._mfGuardarTodos = async (prefix, N, esPropuesta) => {
        const btn = document.getElementById('mf-guardar-todos');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando…'; }

        let guardadas = 0, omitidas = 0, errores = [];

        for (let i = 0; i < N; i++) {
            const fid = `${prefix}${i}`;
            const nombre = document.getElementById(`mf-nombre-${fid}`)?.value.trim();
            const msgEl  = document.getElementById(`mf-msg-${fid}`);
            const badge  = document.getElementById(`mf-badge-${fid}`);

            if (!nombre) { omitidas++; continue; } // formulario vacío

            // Recoger requisitos
            const reqs = [];
            document.querySelectorAll(`#mf-reqs-${fid} [id^="mf-rtag-${fid}-"]`).forEach(el => {
                const c = el.id.replace(`mf-rtag-${fid}-`, '');
                const tag = el.value.trim();
                const pts = Number(document.getElementById(`mf-rpts-${fid}-${c}`)?.value || 0);
                if (tag) reqs.push({ tag: tag.startsWith('#') ? tag : '#'+tag, pts_minimos: pts });
            });

            const datos = {
                nombre,
                costo_ctl:    Number(document.getElementById(`mf-ctl-${fid}`)?.value || 1),
                efecto_base:  document.getElementById(`mf-efecto-${fid}`)?.value.trim() || '',
                tipo:         document.getElementById(`mf-tipo-${fid}`)?.value || 'activa',
                requisitos_base: reqs,
                efectos_condicionales: [],
                propuesta:    esPropuesta,
                propuesta_por: esPropuesta ? (document.getElementById(`mf-autor-${fid}`)?.value.trim() || '') : '',
            };

            const res = await guardarMedalla(datos);
            if (res.ok) {
                guardadas++;
                if (msgEl) msgEl.textContent = '';
                if (badge) { badge.textContent = '✅'; badge.style.display = 'inline-block'; badge.style.background = 'rgba(39,174,96,0.1)'; badge.style.color = 'var(--green-dark)'; badge.style.border = '1px solid var(--green)'; }
            } else {
                errores.push(`${nombre}: ${res.msg}`);
                if (msgEl) msgEl.textContent = '❌ ' + res.msg;
                if (badge) { badge.textContent = '❌'; badge.style.display = 'inline-block'; badge.style.background = '#fef2f2'; badge.style.color = '#c0392b'; badge.style.border = '1px solid #e74c3c'; }
            }
        }

        const resumen = document.getElementById('mf-resumen');
        if (resumen) {
            resumen.style.display = 'block';
            if (errores.length === 0) {
                resumen.style.background = 'rgba(39,174,96,0.08)';
                resumen.style.border = '1.5px solid var(--green)';
                resumen.style.color = 'var(--green-dark)';
                resumen.textContent = `✅ ${guardadas} medalla${guardadas!==1?'s':''} guardada${guardadas!==1?'s':''}${omitidas>0?' ('+omitidas+' vacías omitidas)':''}.`;
            } else {
                resumen.style.background = '#fef2f2';
                resumen.style.border = '1.5px solid #e74c3c';
                resumen.style.color = '#c0392b';
                resumen.textContent = `${guardadas} guardadas, ${errores.length} con error. Revisa los formularios marcados.`;
            }
        }

        if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar todas'; }

        if (guardadas > 0) {
            toast(`✅ ${guardadas} medalla${guardadas!==1?'s':''} guardada${guardadas!==1?'s':''}`, 'ok');
            await cargarTodo(); initMarkup({ grupos, medallas });
            // No cerramos el modal para que puedan ver los errores si los hay
            if (errores.length === 0) {
                window._medallasCloseModal();
                _renderTab(medallaState.tabActual);
            } else {
                renderCatalogo(); // Actualizar fondo
            }
        }
    };
    
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
