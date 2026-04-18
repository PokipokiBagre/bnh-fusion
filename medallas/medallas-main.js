// medallas/medallas-main.js
import { bnhAuth, currentConfig } from '../bnh-auth.js';
import { medallaState, medallas, grupos, STORAGE_URL } from './medallas-state.js';
import { cargarTodo, guardarMedalla, eliminarMedalla, crearTag } from './medallas-data.js';
import { renderCatalogo, renderGrafo, renderPersonaje, renderDetalleMedalla, renderFormMedalla, _htmlReqRow, _htmlCondRow, toast, mountNewTagInput } from './medallas-ui.js';
import { buildGraph } from './medallas-grafo.js';
import { initMarkup } from '../bnh-markup.js';

window.onload = async () => {
    const fav = document.getElementById('dynamic-favicon');
    if (fav) fav.href = `${STORAGE_URL}/imginterfaz/icon.png?v=${Date.now()}`;

    await bnhAuth.init();
    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();
    medallaState.esAdmin = bnhAuth.esAdmin();

    try {
        await cargarTodo();
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
    if (tab === 'catalogo')   renderCatalogo();
    if (tab === 'grafo')      renderGrafo();
    if (tab === 'personaje')  renderPersonaje();
}

function _exponerGlobales() {
    window._medTab = _renderTab;

    window._medBuscar = (v) => { medallaState.busqueda = v; renderCatalogo(); };
    window._medFiltroTag = (v) => { medallaState.filtroTag = v; renderCatalogo(); };
    window._medSelPJ = (n) => { medallaState.pjSeleccionado = medallaState.pjSeleccionado === n ? null : n; renderPersonaje(); };

    window._medGrafoReset = () => { const { resetGrafoView } = window._medGrafoExports || {}; buildGraph(); };

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

    // CRUD (OP)
    window._medallasNueva  = () => renderFormMedalla(null);
    window._medallasEditar = (m) => {
        window._medallasCloseModal();
        setTimeout(() => renderFormMedalla(m), 80);
    };
    window._medallasEliminar = async (id) => {
        if (!confirm('¿Eliminar esta medalla permanentemente?')) return;
        const ok = await eliminarMedalla(id);
        if (ok) {
            toast('🗑️ Medalla eliminada', 'ok');
            await cargarTodo(); initMarkup({ grupos, medallas });
            window._medallasCloseModal();
            _renderTab(medallaState.tabActual);
        } else toast('❌ Error al eliminar', 'error');
    };

    // Formulario helpers
    window._medAddReq = () => {
        const c = window._fm_reqCount = (window._fm_reqCount||0) + 1;
        document.getElementById('fm-reqs').insertAdjacentHTML('beforeend', _htmlReqRow({}, c));
        setTimeout(() => mountNewTagInput('req-tag-' + c), 30);
    };
    window._medAddCond = () => {
        const c = window._fm_condCount = (window._fm_condCount||0) + 1;
        document.getElementById('fm-conds').insertAdjacentHTML('beforeend', _htmlCondRow({}, c));
        setTimeout(() => mountNewTagInput('cond-tag-' + c), 30);
    };

    // Crear tag nuevo desde el formulario de medalla
    window._medCrearTag = () => {
        const nombre = prompt('Nombre del nuevo tag (con o sin #):');
        if (!nombre || !nombre.trim()) return;
        const tag = nombre.trim().startsWith('#') ? nombre.trim() : '#' + nombre.trim();
        crearTag(tag).then(res => {
            if (res.ok) {
                toast('🏷️ Tag "' + res.tag + '" listo para usar', 'ok');
                // Auto-append to fm-tags field if open
                const fmTags = document.getElementById('fm-tags');
                if (fmTags) {
                    const cur = fmTags.value.trim();
                    fmTags.value = cur ? cur + ', ' + res.tag : res.tag;
                }
            } else {
                toast('❌ Error al crear tag', 'error');
            }
        });
    };

    window._medGuardar = async () => {
        const nombre = document.getElementById('fm-nombre')?.value.trim();
        if (!nombre) { document.getElementById('fm-msg').textContent = 'El nombre es obligatorio.'; return; }

        const tagsRaw = document.getElementById('fm-tags')?.value || '';
        const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
            .map(t => t.startsWith('#') ? t : '#'+t);

        // Recoger requisitos_base
        const reqs = [];
        document.querySelectorAll('[id^="req-tag-"]').forEach(el => {
            const idx = el.id.replace('req-tag-','');
            const tag = el.value.trim();
            const pts = Number(document.getElementById('req-pts-'+idx)?.value||0);
            if (tag) reqs.push({ tag: tag.startsWith('#')?tag:'#'+tag, pts_minimos: pts });
        });

        // Recoger efectos_condicionales
        const conds = [];
        document.querySelectorAll('[id^="cond-tag-"]').forEach(el => {
            const idx = el.id.replace('cond-tag-','');
            const tag = el.value.trim();
            const pts = Number(document.getElementById('cond-pts-'+idx)?.value||0);
            const efe = document.getElementById('cond-efecto-'+idx)?.value.trim()||'';
            if (tag) conds.push({ tag: tag.startsWith('#')?tag:'#'+tag, pts_minimos: pts, efecto: efe });
        });

        const datos = {
            id:                    document.getElementById('fm-id')?.value || undefined,
            nombre,
            tags,
            costo_ctl:             Number(document.getElementById('fm-ctl')?.value||1),
            efecto_base:           document.getElementById('fm-efecto')?.value.trim()||'',
            tipo:                  document.getElementById('fm-tipo')?.value||'ofensiva',
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

    // Cerrar modal con ESC o click en fondo
    document.addEventListener('keydown', e => { if (e.key==='Escape') window._medallasCloseModal(); });
    document.getElementById('medalla-modal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('medalla-modal')) window._medallasCloseModal();
    });
}
