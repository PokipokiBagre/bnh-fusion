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
    renderTab('progresion');
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

    // Canjear PT
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
