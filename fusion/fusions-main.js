// fusions/fusions-main.js
import { bnhAuth, supabase } from '../bnh-auth.js';
import {
    fusionsState, setPersonajes, setPtGlobales, setFusionesActivas, setRegistroFusiones,
    personajes, ptGlobales, fusionesActivas, STORAGE_URL,
} from './fusions-state.js';
import {
    renderSimulador, renderFusionesActivas, renderRegistro, renderResultado,
    renderOpciones, actualizarVsPanelPublic, actualizarSlotPublic, toast,
} from './fusions-ui.js';
import { calcularResultadoFusion, buildRegistroFusion } from './fusions-logic.js';
import { cargarOpciones, guardarOpciones, opcionesState } from './fusions-options.js';
import { cargarFusiones, activarFusion, terminarFusion } from '../bnh-fusion.js';

// ─── Init ──────────────────────────────────────────────────────
window.onload = async () => {
    const fav = document.getElementById('dynamic-favicon');
    if (fav) fav.href = `${STORAGE_URL}/imginterfaz/icon.png?v=${Date.now()}`;

    await bnhAuth.init();
    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();

    try {
        // Cargar todo en paralelo
        await Promise.all([cargarFusiones(), cargarOpciones()]);

        const [
            { data: pjData,  error: e1 },
            { data: ptData,  error: e2 },
            { data: faData,  error: e3 },
            { data: regData, error: e4 },
        ] = await Promise.all([
            supabase.from('personajes_refinados').select('*').order('nombre_refinado'),
            supabase.from('puntos_tag').select('personaje_nombre, tag, cantidad'),
            supabase.from('fusiones_activas').select('*').eq('activa', true).order('creado_en', { ascending: false }),
            supabase.from('registro_fusiones').select('*').order('creado_en', { ascending: false }).limit(50),
        ]);

        if (e1) throw new Error(e1.message);
        if (e2) throw new Error(e2.message);

        setPersonajes(pjData   || []);
        setPtGlobales(ptData   || []);
        setFusionesActivas(faData  || []);
        setRegistroFusiones(regData || []);
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

// ─── Navegación por tabs ───────────────────────────────────────
function _renderTab(tab) {
    fusionsState.tabActual = tab;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    ['simulador', 'activas', 'registro', 'opciones'].forEach(t => {
        document.getElementById(`vista-${t}`)?.classList.toggle('oculto', t !== tab);
    });
    if (tab === 'simulador') renderSimulador();
    if (tab === 'activas')   renderFusionesActivas();
    if (tab === 'registro')  renderRegistro();
    if (tab === 'opciones')  renderOpciones();
}

// ─── Globales ─────────────────────────────────────────────────
function _exponerGlobales() {
    window._fusionTab = _renderTab;

    // ── Pool: selección de personajes ────────────────────────
    window._fusionClickPJ = (nombre) => {
        if (fusionsState.pjA === nombre)           { fusionsState.pjA = null; actualizarSlotPublic('a'); return; }
        if (fusionsState.pjB === nombre)           { fusionsState.pjB = null; actualizarSlotPublic('b'); return; }
        if (!fusionsState.pjA)                     { fusionsState.pjA = nombre; actualizarSlotPublic('a'); return; }
        if (!fusionsState.pjB && nombre !== fusionsState.pjA) { fusionsState.pjB = nombre; actualizarSlotPublic('b'); return; }
        fusionsState.pjB = nombre;
        actualizarSlotPublic('b');
    };

    window._fusionClearSlot = (letra) => {
        if (letra === 'a') fusionsState.pjA = null;
        if (letra === 'b') fusionsState.pjB = null;
        actualizarSlotPublic(letra);
        fusionsState.resultadoCalculado = null;
        document.getElementById('resultado-fusion')?.classList.add('oculto');
    };

    // ── D100 ─────────────────────────────────────────────────
    window._fusionD100Change = (val) => {
        const n = parseInt(val);
        fusionsState.d100 = (!isNaN(n) && n >= 1 && n <= 100) ? n : null;
        const fill  = document.getElementById('compat-fill');
        const label = document.getElementById('compat-label');
        if (fill)  fill.style.width = (fusionsState.d100 || 0) + '%';
        if (label) label.textContent = fusionsState.d100 ? fusionsState.d100 + '% compatibilidad' : 'Ingresa el dado';
        actualizarVsPanelPublic();
        const inp = document.getElementById('inp-d100');
        if (inp && inp.value !== val) inp.value = val;
    };

    // ── Simular ──────────────────────────────────────────────
    window._fusionSimular = () => {
        const d100 = parseInt(document.getElementById('inp-d100')?.value);
        if (!fusionsState.pjA || !fusionsState.pjB)        { toast('Selecciona dos personajes.', 'error'); return; }
        if (fusionsState.pjA === fusionsState.pjB)          { toast('A y B no pueden ser el mismo personaje.', 'error'); return; }
        if (isNaN(d100) || d100 < 1 || d100 > 100)          { toast('Ingresa un rendimiento válido (1–100).', 'error'); return; }

        fusionsState.d100 = d100;
        const pjA = personajes.find(p => p.nombre === fusionsState.pjA);
        const pjB = personajes.find(p => p.nombre === fusionsState.pjB);
        fusionsState.resultadoCalculado = calcularResultadoFusion(pjA, pjB, d100, ptGlobales);
        fusionsState.statsEditadas = { pot: null, agi: null, ctl: null };
        fusionsState.tagFusionNombre = '';
        renderResultado(fusionsState.resultadoCalculado);
    };

    // ── Edición inline de stats ──────────────────────────────
    window._fusionEditStat = (stat, val) => {
        const n = parseInt(val);
        fusionsState.statsEditadas[stat] = isNaN(n) || n < 0 ? null : n;
        // Actualizar PAC sin re-render
        const r  = fusionsState.resultadoCalculado;
        const sf = fusionsState.statsEditadas;
        if (r) {
            const pot = sf.pot !== null ? sf.pot : r.statsFinales.pot;
            const agi = sf.agi !== null ? sf.agi : r.statsFinales.agi;
            const ctl = sf.ctl !== null ? sf.ctl : r.statsFinales.ctl;
            const el = document.getElementById('pac-display');
            if (el) el.textContent = pot + agi + ctl;
        }
    };

    // ── Tag de fusión ────────────────────────────────────────
    window._fusionTagNombreChange = (val) => {
        fusionsState.tagFusionNombre = val.trim();
    };

    // ── Oficializar ──────────────────────────────────────────
    window._fusionOficializar = async () => {
        if (!fusionsState.resultadoCalculado) return;
        const { pjA, pjB, d100 } = fusionsState.resultadoCalculado;

        // Validar tag de fusión si está activado
        if (opcionesState.crear_tag_fusion && !fusionsState.tagFusionNombre) {
            const inp = document.getElementById('inp-tag-fusion');
            if (inp) { inp.style.borderColor = 'var(--red)'; inp.focus(); }
            toast('Escribe el nombre del tag de fusión antes de oficializar.', 'error');
            return;
        }

        if (!confirm(`¿Oficializar la fusión de ${pjA} y ${pjB} con D100=${d100}?`)) return;

        const btn = document.querySelector('button[onclick*="fusionOficializar"]');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Procesando…'; }

        try {
            // Stats finales (con ediciones manuales del OP)
            const r  = fusionsState.resultadoCalculado;
            const sf = fusionsState.statsEditadas;
            const statsFinales = {
                pot: sf.pot !== null ? sf.pot : r.statsFinales.pot,
                agi: sf.agi !== null ? sf.agi : r.statsFinales.agi,
                ctl: sf.ctl !== null ? sf.ctl : r.statsFinales.ctl,
            };

            // Nombre del tag de fusión normalizado
            const tagFusionRaw = fusionsState.tagFusionNombre;
            const tagFusion = opcionesState.crear_tag_fusion && tagFusionRaw
                ? (tagFusionRaw.startsWith('#') ? tagFusionRaw : '#' + tagFusionRaw)
                : null;

            // 1. Crear la fusión activa
            const res = await activarFusion(pjA, pjB, d100, statsFinales);
            if (!res.ok) {
                toast('❌ ' + res.msg, 'error');
                if (btn) { btn.disabled = false; btn.textContent = '⚡ Oficializar en Base de Datos'; }
                return;
            }

            const fusionActivaId = res.fusion?.id || null;

            // 2. Si hay tag de fusión → crearlo en tags_catalogo y asignarlo a ambos PJs
            if (tagFusion) {
                const tagKey = tagFusion.slice(1);
                // Insertar en catálogo (ignorar si ya existe)
                await supabase.from('tags_catalogo')
                    .upsert({ nombre: tagKey, descripcion: `Tag temporal de fusión: ${pjA} ⚡ ${pjB}` }, { onConflict: 'nombre', ignoreDuplicates: true });

                // Asignar a PJ A
                const { data: gA } = await supabase.from('personajes_refinados').select('tags').eq('nombre_refinado', pjA).maybeSingle();
                if (gA) {
                    const tagsA = [...new Set([...(gA.tags || []), tagFusion])];
                    await supabase.from('personajes_refinados').update({ tags: tagsA }).eq('nombre_refinado', pjA);
                }
                // Asignar a PJ B
                const { data: gB } = await supabase.from('personajes_refinados').select('tags').eq('nombre_refinado', pjB).maybeSingle();
                if (gB) {
                    const tagsB = [...new Set([...(gB.tags || []), tagFusion])];
                    await supabase.from('personajes_refinados').update({ tags: tagsB }).eq('nombre_refinado', pjB);
                }

                // Insertar PT del tag de fusión a ambos
                const ptsFusion = opcionesState.pts_tag_fusion || 0;
                if (ptsFusion > 0) {
                    await supabase.from('puntos_tag').upsert([
                        { personaje_nombre: pjA, tag: tagFusion, cantidad: ptsFusion, actualizado_en: new Date().toISOString() },
                        { personaje_nombre: pjB, tag: tagFusion, cantidad: ptsFusion, actualizado_en: new Date().toISOString() },
                    ], { onConflict: 'personaje_nombre,tag' });
                }

                // Guardar en fusiones_activas el tag
                if (fusionActivaId) {
                    await supabase.from('fusiones_activas').update({ tag_fusion: tagFusion }).eq('id', fusionActivaId);
                }
            }

            // 3. Guardar en registro_fusiones
            const regPayload = buildRegistroFusion(
                r, statsFinales, tagFusion, opcionesState.pts_tag_fusion, fusionActivaId
            );
            await supabase.from('registro_fusiones').insert(regPayload);

            toast(`✅ Fusión ${pjA} + ${pjB} oficializada${tagFusion ? ' · Tag: ' + tagFusion : ''}`, 'ok');

            // 4. Refrescar todo
            const [{ data: faData }, { data: regData }, { data: pjData }, { data: ptData }] = await Promise.all([
                supabase.from('fusiones_activas').select('*').eq('activa', true).order('creado_en', { ascending: false }),
                supabase.from('registro_fusiones').select('*').order('creado_en', { ascending: false }).limit(50),
                supabase.from('personajes_refinados').select('*').order('nombre_refinado'),
                supabase.from('puntos_tag').select('personaje_nombre, tag, cantidad'),
            ]);
            setFusionesActivas(faData  || []);
            setRegistroFusiones(regData || []);
            setPersonajes(pjData || []);
            setPtGlobales(ptData || []);
            await cargarFusiones();

            // 5. Limpiar estado
            fusionsState.pjA = null; fusionsState.pjB = null; fusionsState.d100 = null;
            fusionsState.resultadoCalculado = null;
            fusionsState.statsEditadas = { pot: null, agi: null, ctl: null };
            fusionsState.tagFusionNombre = '';

            _renderTab('registro');
        } catch(e) {
            toast('❌ Error: ' + e.message, 'error');
            if (btn) { btn.disabled = false; btn.textContent = '⚡ Oficializar en Base de Datos'; }
        }
    };

    // ── Terminar fusión ──────────────────────────────────────
    window._fusionTerminar = async (id, pjA, pjB) => {
        if (!confirm(`¿Terminar la fusión de ${pjA} y ${pjB}?`)) return;
        try {
            await terminarFusion(id);

            // Si había tag de fusión, opcionalmente quitarlo de los PJs
            const fusion = fusionesActivas.find(f => f.id === id);
            if (fusion?.tag_fusion) {
                const tagFusion = fusion.tag_fusion;
                const quitarTag = confirm(`¿Quitar también el tag ${tagFusion} de ${pjA} y ${pjB}?`);
                if (quitarTag) {
                    for (const nombre of [pjA, pjB]) {
                        const { data: g } = await supabase.from('personajes_refinados').select('tags').eq('nombre_refinado', nombre).maybeSingle();
                        if (g) {
                            const nuevosTags = (g.tags || []).filter(t =>
                                (t.startsWith('#') ? t : '#' + t).toLowerCase() !== tagFusion.toLowerCase()
                            );
                            await supabase.from('personajes_refinados').update({ tags: nuevosTags }).eq('nombre_refinado', nombre);
                        }
                    }
                }
            }

            const [{ data: faData }, { data: pjData }] = await Promise.all([
                supabase.from('fusiones_activas').select('*').eq('activa', true).order('creado_en', { ascending: false }),
                supabase.from('personajes_refinados').select('*').order('nombre_refinado'),
            ]);
            setFusionesActivas(faData || []);
            setPersonajes(pjData || []);
            await cargarFusiones();
            renderFusionesActivas();
            toast(`Fusión ${pjA} + ${pjB} terminada.`, 'ok');
        } catch(e) {
            toast('❌ Error: ' + e.message, 'error');
        }
    };

    // ── Reset resultado ──────────────────────────────────────
    window._fusionResetResultado = () => {
        fusionsState.resultadoCalculado = null;
        fusionsState.statsEditadas = { pot: null, agi: null, ctl: null };
        fusionsState.tagFusionNombre = '';
        document.getElementById('resultado-fusion')?.classList.add('oculto');
    };

    // ── Opciones ─────────────────────────────────────────────
    window._fusionOpcionChange = (key, val) => {
        // Convertir booleanos y enteros
        let parsed = val;
        if (val === 'true')  parsed = true;
        if (val === 'false') parsed = false;
        if (!isNaN(val) && val !== '' && typeof val === 'string') parsed = Number(val);
        opcionesState[key] = parsed;
        // Re-renderizar las zonas si cambia la estructura de umbrales
        if (['num_umbrales', 'umbral_1', 'umbral_2', 'modo_stats', 'crear_tag_fusion'].includes(key)) {
            renderOpciones();
        }
    };

    window._fusionGuardarOpciones = async () => {
        const res = await guardarOpciones();
        if (res.ok) {
            toast('✅ Configuración guardada', 'ok');
        } else {
            toast('❌ Error al guardar: ' + res.msg, 'error');
        }
    };
}
