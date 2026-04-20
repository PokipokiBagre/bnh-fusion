// fusions/fusions-main.js
import { bnhAuth, supabase } from '../bnh-auth.js';
import { fusionsState, setPersonajes, setPtGlobales, setFusionesActivas,
         personajes, ptGlobales, fusionesActivas, STORAGE_URL } from './fusions-state.js';
import { renderSimulador, renderFusionesActivas, renderResultado,
         actualizarVsPanelPublic, actualizarSlotPublic, toast } from './fusions-ui.js';
import { calcularResultadoFusion, getRegla } from './fusions-logic.js';
import { cargarFusiones, activarFusion, terminarFusion, fusionState } from '../bnh-fusion.js';

// ─── Init ──────────────────────────────────────────────────────
window.onload = async () => {
    const fav = document.getElementById('dynamic-favicon');
    if (fav) fav.href = `${STORAGE_URL}/imginterfaz/icon.png?v=${Date.now()}`;

    await bnhAuth.init();
    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();

    try {
        await cargarFusiones();
        const [{ data: pjData, error: e1 }, { data: ptData, error: e2 }, { data: faData, error: e3 }] = await Promise.all([
            supabase.from('personajes_refinados').select('*').order('nombre_refinado'),
            supabase.from('puntos_tag').select('personaje_nombre, tag, cantidad'),
            supabase.from('fusiones_activas').select('*').eq('activa', true).order('creado_en', { ascending: false }),
        ]);
        if (e1 || e2) throw new Error((e1 || e2).message);
        setPersonajes(pjData || []);
        setPtGlobales(ptData || []);
        setFusionesActivas(faData || []);
    } catch(e) {
        document.getElementById('pantalla-carga').innerHTML =
            `<p style="color:red;font-weight:600;">Error de conexión: ${e.message}</p>`;
        return;
    }

    document.getElementById('pantalla-carga').classList.add('oculto');
    document.getElementById('interfaz-fusiones').classList.remove('oculto');

    _exponerGlobales();
    _renderTab('simulador');
};

// ─── Tabs ──────────────────────────────────────────────────────
function _renderTab(tab) {
    fusionsState.tabActual = tab;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    ['simulador', 'activas'].forEach(t => {
        document.getElementById(`vista-${t}`)?.classList.toggle('oculto', t !== tab);
    });
    if (tab === 'simulador')  renderSimulador();
    if (tab === 'activas')    renderFusionesActivas();
}

// ─── Globales expuestos al HTML ────────────────────────────────
function _exponerGlobales() {
    window._fusionTab = _renderTab;

    // Click en personaje del pool
    window._fusionClickPJ = (nombre) => {
        // Si ya está seleccionado como A → deseleccionar
        if (fusionsState.pjA === nombre) {
            fusionsState.pjA = null;
            actualizarSlotPublic('a');
            return;
        }
        // Si ya está seleccionado como B → deseleccionar
        if (fusionsState.pjB === nombre) {
            fusionsState.pjB = null;
            actualizarSlotPublic('b');
            return;
        }
        // Si slot A está vacío → asignar a A
        if (!fusionsState.pjA) {
            fusionsState.pjA = nombre;
            actualizarSlotPublic('a');
            return;
        }
        // Si slot B está vacío → asignar a B
        if (!fusionsState.pjB) {
            if (nombre === fusionsState.pjA) return; // mismo PJ
            fusionsState.pjB = nombre;
            actualizarSlotPublic('b');
            return;
        }
        // Ambos llenos → reemplazar B
        fusionsState.pjB = nombre;
        actualizarSlotPublic('b');
    };

    // Limpiar slot
    window._fusionClearSlot = (letra) => {
        if (letra === 'a') fusionsState.pjA = null;
        if (letra === 'b') fusionsState.pjB = null;
        actualizarSlotPublic(letra);
        fusionsState.resultadoCalculado = null;
        document.getElementById('resultado-fusion')?.classList.add('oculto');
    };

    // Cambio en el D100
    window._fusionD100Change = (val) => {
        const n = parseInt(val);
        fusionsState.d100 = (!isNaN(n) && n >= 1 && n <= 100) ? n : null;
        // Actualizar barra y badge sin re-renderizar todo el panel
        const fill  = document.getElementById('compat-fill');
        const label = document.getElementById('compat-label');
        if (fill)  fill.style.width = (fusionsState.d100 ? fusionsState.d100 : 0) + '%';
        if (label) label.textContent = fusionsState.d100 ? fusionsState.d100 + '% compatibilidad' : 'Ingresa el dado';
        // Actualizar badge de regla
        actualizarVsPanelPublic();
        // Restaurar el valor del input (evitar que se resetee)
        const inp = document.getElementById('inp-d100');
        if (inp && inp.value !== val) inp.value = val;
    };

    // Simular
    window._fusionSimular = () => {
        const d100raw = document.getElementById('inp-d100')?.value;
        const d100 = parseInt(d100raw);

        if (!fusionsState.pjA || !fusionsState.pjB) {
            toast('Selecciona dos personajes en el pool.', 'error'); return;
        }
        if (fusionsState.pjA === fusionsState.pjB) {
            toast('El Sujeto A y B no pueden ser el mismo personaje.', 'error'); return;
        }
        if (isNaN(d100) || d100 < 1 || d100 > 100) {
            toast('Ingresa un rendimiento válido (1-100).', 'error'); return;
        }

        fusionsState.d100 = d100;
        const pjA = personajes.find(p => p.nombre === fusionsState.pjA);
        const pjB = personajes.find(p => p.nombre === fusionsState.pjB);

        fusionsState.resultadoCalculado = calcularResultadoFusion(pjA, pjB, d100, ptGlobales);
        fusionsState.statsEditadas = { pot: null, agi: null, ctl: null }; // limpiar overrides
        renderResultado(fusionsState.resultadoCalculado);
    };

    // Edición inline de stats en el resultado
    window._fusionEditStat = (stat, val) => {
        const n = parseInt(val);
        fusionsState.statsEditadas[stat] = isNaN(n) || n < 0 ? null : n;
        // Actualizar PAC en tiempo real sin re-renderizar todo
        if (fusionsState.resultadoCalculado) {
            const r = fusionsState.resultadoCalculado;
            const sf = fusionsState.statsEditadas;
            const pot = sf.pot !== null ? sf.pot : r.statsFinales.pot;
            const agi = sf.agi !== null ? sf.agi : r.statsFinales.agi;
            const ctl = sf.ctl !== null ? sf.ctl : r.statsFinales.ctl;
            const pacEl = document.querySelector('[data-pac-display]');
            if (pacEl) pacEl.textContent = pot + agi + ctl;
        }
    };

    // Oficializar
    window._fusionOficializar = async () => {
        if (!fusionsState.resultadoCalculado) return;
        const { pjA, pjB, d100 } = fusionsState.resultadoCalculado;

        const ok = confirm(
            `¿Oficializar la fusión de ${pjA} y ${pjB} con D100=${d100}?\n\n` +
            `Esta acción escribirá en la base de datos. No se puede deshacer desde aquí.`
        );
        if (!ok) return;

        const btn = document.querySelector('[onclick="_fusionOficializar()"], button[onclick*="fusionOficializar"]');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Procesando…'; }

        try {
            // Calcular stats finales con ediciones
            const r  = fusionsState.resultadoCalculado;
            const sf = fusionsState.statsEditadas;
            const statsFinales = {
                pot: sf.pot !== null ? sf.pot : r.statsFinales.pot,
                agi: sf.agi !== null ? sf.agi : r.statsFinales.agi,
                ctl: sf.ctl !== null ? sf.ctl : r.statsFinales.ctl,
            };

            const res = await activarFusion(pjA, pjB, d100, statsFinales);

            if (!res.ok) {
                toast('❌ ' + res.msg, 'error');
                if (btn) { btn.disabled = false; btn.textContent = '⚡ Oficializar Fusión en Base de Datos'; }
                return;
            }

            toast(`✅ Fusión ${pjA} + ${pjB} oficializada`, 'ok');

            // Refrescar datos
            const { data: faData } = await supabase
                .from('fusiones_activas').select('*').eq('activa', true).order('creado_en', { ascending: false });
            setFusionesActivas(faData || []);
            await cargarFusiones();

            // Limpiar estado
            fusionsState.pjA = null;
            fusionsState.pjB = null;
            fusionsState.d100 = null;
            fusionsState.resultadoCalculado = null;
            fusionsState.statsEditadas = { pot: null, agi: null, ctl: null };

            _renderTab('simulador');
        } catch(e) {
            toast('❌ Error: ' + e.message, 'error');
            if (btn) { btn.disabled = false; btn.textContent = '⚡ Oficializar Fusión en Base de Datos'; }
        }
    };

    // Terminar fusión (desde tab Activas)
    window._fusionTerminar = async (id, pjA, pjB) => {
        if (!confirm(`¿Terminar la fusión de ${pjA} y ${pjB}?`)) return;
        try {
            await terminarFusion(id);
            const { data: faData } = await supabase
                .from('fusiones_activas').select('*').eq('activa', true).order('creado_en', { ascending: false });
            setFusionesActivas(faData || []);
            renderFusionesActivas();
            toast(`Fusión ${pjA} + ${pjB} terminada.`, 'ok');
        } catch(e) {
            toast('❌ Error: ' + e.message, 'error');
        }
    };

    // Reset resultado
    window._fusionResetResultado = () => {
        fusionsState.resultadoCalculado = null;
        fusionsState.statsEditadas = { pot: null, agi: null, ctl: null };
        document.getElementById('resultado-fusion')?.classList.add('oculto');
    };
}
