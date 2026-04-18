// ============================================================
// tags/tags-main.js
// ============================================================
import { bnhAuth, currentConfig } from '../bnh-auth.js';
import { tagsState, STORAGE_URL, grupos } from './tags-state.js';
import { cargarTodo, guardarDescripcionTag, canjearPT } from './tags-data.js';
import { renderProgresion, renderCatalogo, renderEstadisticas, toast } from './tags-ui.js';
import { initMarkup } from '../bnh-markup.js';

window.onload = async () => {
    // Favicon dinámico
    const fav = document.getElementById('dynamic-favicon');
    if (fav) fav.href = `${STORAGE_URL}/imginterfaz/icon.png?v=${Date.now()}`;

    // Auth
    await bnhAuth.init();
    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();
    tagsState.esAdmin = bnhAuth.esAdmin();

    // Cargar datos
    try {
        await cargarTodo();
        initMarkup({ grupos });
    } catch (e) {
        document.getElementById('pantalla-carga').innerHTML =
            `<p style="color:red;">Error de carga: ${e.message}</p>`;
        return;
    }

    document.getElementById('pantalla-carga').classList.add('oculto');
    document.getElementById('interfaz-tags').classList.remove('oculto');

    // Render inicial
    renderTab('progresion');
    _exponerGlobales();
};

function renderTab(tab) {
    tagsState.tabActual = tab;

    // Tabs nav
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');

    // Vistas
    ['progresion','catalogo','estadisticas'].forEach(t => {
        document.getElementById(`vista-${t}`)?.classList.toggle('oculto', t !== tab);
    });

    if (tab === 'progresion')   renderProgresion();
    if (tab === 'catalogo')     renderCatalogo();
    if (tab === 'estadisticas') renderEstadisticas();
}

function _exponerGlobales() {
    // Nav tabs
    window._tagsTab = (tab) => renderTab(tab);

    // Seleccionar PJ en progresión
    window._tagsSelPJ = (nombre) => {
        tagsState.pjSeleccionado = tagsState.pjSeleccionado === nombre ? null : nombre;
        renderProgresion();
    };

    // Canjear PT (solo OP)
    window._tagsCanjear = async (pj, tag, tipo) => {
        if (!tagsState.esAdmin) return;
        const labels = {
            stat_pot: '+1 POT',  stat_agi: '+1 AGI',  stat_ctl: '+1 CTL',
            medalla: 'Medalla',  tres_tags: '3 tags nuevos'
        };
        const costos = { stat_pot:50, stat_agi:50, stat_ctl:50, medalla:75, tres_tags:100 };
        if (!confirm(`Canjear ${costos[tipo]} PT de ${tag} de ${pj} por ${labels[tipo]}?`)) return;
        const res = await canjearPT(pj, tag, tipo);
        if (res.ok) {
            toast(`✅ Canje aplicado. PT restantes en ${tag}: ${res.nueva}`, 'ok');
            await cargarTodo();
            initMarkup({ grupos });
            renderProgresion();
            if (tagsState.tabActual === 'estadisticas') renderEstadisticas();
        } else {
            toast('❌ ' + res.msg, 'error');
        }
    };

    // Guardar descripción de tag (catálogo)
    window._tagsGuardarDesc = async (tag) => {
        const key = tag.startsWith('#') ? tag.slice(1) : tag;
        const el  = document.getElementById(`desc-${key}`);
        if (!el) return;
        const res = await guardarDescripcionTag(key, el.value.trim());
        if (res.ok) {
            toast(`✅ Descripción de ${tag} guardada`, 'ok');
            await cargarTodo();
            renderCatalogo();
        } else {
            toast('❌ ' + res.msg, 'error');
        }
    };

    // Buscar en catálogo (preserva foco)
    window._tagsBuscarCat = (v) => {
        tagsState.busquedaCat = v;
        renderCatalogo();
    };

    // Ir a fichas filtrado por tag
    window._tagsIrAFichas = (tag) => {
        window.location.href = `../fichas/index.html?tag=${encodeURIComponent(tag)}`;
    };
}
