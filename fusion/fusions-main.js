// fusions/fusions-main.js
import { bnhAuth, supabase } from '../bnh-auth.js';
import {
    fusionsState, setPersonajes, setPtGlobales, setFusionesActivas, setRegistroFusiones,
    personajes, ptGlobales, fusionesActivas, STORAGE_URL, 
    bannedTags, setBannedTags // NUEVAS IMPORTACIONES
} from './fusions-state.js';
import {
    renderSimulador, renderFusionesActivas, renderRegistro, renderResultado,
    renderOpciones, actualizarVsPanelPublic, actualizarSlotPublic, toast,
    actualizarCompatibilidadDisplay,
} from './fusions-ui.js';
import { calcularResultadoFusion, buildRegistroFusion, calcCompatibilidadTags, getRegla } from './fusions-logic.js';
import { cargarOpciones, guardarOpciones, opcionesState } from './fusions-options.js';
import { cargarFusiones, activarFusion, terminarFusion } from '../bnh-fusion.js';

export let esAdmin = false;

// ─── Init ──────────────────────────────────────────────────────
window.onload = async () => {
    const fav = document.getElementById('dynamic-favicon');
    if (fav) fav.href = `${STORAGE_URL}/imginterfaz/icon.png?v=${Date.now()}`;

    await bnhAuth.init();
    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();
    esAdmin = bnhAuth.esAdmin();
    fusionsState.esAdmin = esAdmin;

    const tabOpc = document.getElementById('tab-opciones');
    if (tabOpc) tabOpc.style.display = esAdmin ? '' : 'none';

    try {
        await Promise.all([cargarFusiones(), cargarOpciones()]);

        // NUEVO: Agregamos la consulta e5 para los tags baneados
        const [
            { data: pjData,  error: e1 },
            { data: ptData,  error: e2 },
            { data: faData,  error: e3 },
            { data: regData, error: e4 },
            { data: tagsData, error: e5 } 
        ] = await Promise.all([
            supabase.from('personajes_refinados').select('nombre_refinado, pot, agi, ctl, tags').order('nombre_refinado'),
            supabase.from('puntos_tag').select('personaje_nombre, tag, cantidad'),
            supabase.from('fusiones_activas').select('*').eq('activa', true).order('creado_en', { ascending: false }),
            supabase.from('registro_fusiones').select('*').order('creado_en', { ascending: false }).limit(50),
            supabase.from('tags_catalogo').select('nombre').eq('baneado', true) // <-- CONSULTA BANEADOS
        ]);

        if (e1) throw new Error(e1.message);
        if (e2) throw new Error(e2.message);

        // Guardamos los tags baneados en el estado local
        setBannedTags((tagsData || []).map(t => t.nombre));

        const pjNorm = (pjData || []).map(p => ({
            nombre: p.nombre_refinado,
            pot:    p.pot   || 0,
            agi:    p.agi   || 0,
            ctl:    p.ctl   || 0,
            tags:   p.tags  || [],
        }));

        const ptNorm = (ptData || []).map(p => ({
            personaje_nombre: p.personaje_nombre,
            tag:              p.tag,
            cantidad:         p.cantidad,
        }));

        setPersonajes(pjNorm);
        setPtGlobales(ptNorm);
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

// ─── Tabs ──────────────────────────────────────────────────────
function _renderTab(tab) {
    if (tab === 'opciones' && !fusionsState.esAdmin) return;

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

// ─── Helpers de compatibilidad ────────────────────────────────
function _recalcCompatibilidad() {
    const pjA = personajes.find(p => p.nombre === fusionsState.pjA);
    const pjB = personajes.find(p => p.nombre === fusionsState.pjB);
    if (!pjA || !pjB) {
        fusionsState.compatTags = 0;
        fusionsState.compatPct  = 0;
    } else {
        const tagsA = (pjA.tags || []).map(t => (t.startsWith('#') ? t : '#' + t).toLowerCase());
        const tagsB = (pjB.tags || []).map(t => (t.startsWith('#') ? t : '#' + t).toLowerCase());
        
        // NUEVO: Limpiamos los arrays de cualquier tag que esté baneado ANTES de cruzar
        const tagsALimpios = tagsA.filter(t => !bannedTags.includes(t));
        const compartidos = tagsALimpios.filter(t => tagsB.includes(t)).length;
        
        fusionsState.compatTags = compartidos;
        fusionsState.compatPct = calcCompatibilidadTags(compartidos);
    }
    actualizarCompatibilidadDisplay();
}

// ─── Globales ─────────────────────────────────────────────────
function _exponerGlobales() {
    window._fusionTab = _renderTab;

    window._fusionClickPJ = (nombre) => {
        if (fusionsState.pjA === nombre) { fusionsState.pjA = null; actualizarSlotPublic('a'); _recalcCompatibilidad(); return; }
        if (fusionsState.pjB === nombre) { fusionsState.pjB = null; actualizarSlotPublic('b'); _recalcCompatibilidad(); return; }
        if (!fusionsState.pjA) { fusionsState.pjA = nombre; actualizarSlotPublic('a'); _recalcCompatibilidad(); return; }
        if (!fusionsState.pjB && nombre !== fusionsState.pjA) { fusionsState.pjB = nombre; actualizarSlotPublic('b'); _recalcCompatibilidad(); return; }
        fusionsState.pjB = nombre;
        actualizarSlotPublic('b');
        _recalcCompatibilidad();
    };

    window._fusionClearSlot = (letra) => {
        if (letra === 'a') fusionsState.pjA = null;
        if (letra === 'b') fusionsState.pjB = null;
        actualizarSlotPublic(letra);
        fusionsState.resultadoCalculado = null;
        _recalcCompatibilidad();
        document.getElementById('resultado-fusion')?.classList.add('oculto');
    };

    window._fusionD100Init = () => {
        const inp = document.getElementById('inp-d100');
        if (!inp || inp._d100init) return;
        inp._d100init = true;
        inp.addEventListener('input', () => {
            const n = parseInt(inp.value);
            fusionsState.d100 = (!isNaN(n) && n >= 1 && n <= 100) ? n : null;
            _actualizarBarraD100();
        });
    };

    window._fusionSimular = () => {
        const d100raw = parseInt(document.getElementById('inp-d100')?.value);
        if (!fusionsState.pjA || !fusionsState.pjB)        { toast('Selecciona dos personajes.', 'error'); return; }
        if (fusionsState.pjA === fusionsState.pjB)          { toast('A y B no pueden ser el mismo personaje.', 'error'); return; }
        if (isNaN(d100raw) || d100raw < 1 || d100raw > 100) { toast('Ingresa un rendimiento válido (1–100).', 'error'); return; }

        const bonus = fusionsState.compatPct || 0;
        const rendTotal = d100raw + bonus;
        fusionsState.d100      = d100raw;
        fusionsState.rendTotal = rendTotal;

        const pjA = personajes.find(p => p.nombre === fusionsState.pjA);
        const pjB = personajes.find(p => p.nombre === fusionsState.pjB);

        // NUEVO: Mandamos el array bannedTags a la lógica
        fusionsState.resultadoCalculado = calcularResultadoFusion(pjA, pjB, rendTotal, ptGlobales, opcionesState, bannedTags);
        
        fusionsState.resultadoCalculado.d100Base  = d100raw;
        fusionsState.resultadoCalculado.d100Bonus = bonus;
        fusionsState.statsEditadas = { pot: null, agi: null, ctl: null };
        fusionsState.tagFusionNombre = '';
        renderResultado(fusionsState.resultadoCalculado);
    };
    
window._fusionTagModeChange = (val) => {
        fusionsState.modoTagLocal = val;
        const uin = document.getElementById('ui-tag-nuevo');
        const uic = document.getElementById('ui-tag-compartido');
        if (uin) uin.style.display = val === 'nuevo' ? 'flex' : 'none';
        if (uic) uic.style.display = val === 'compartido' ? 'block' : 'none';
    };

    
    window._fusionEditStat = (stat, val) => {
        const n = parseInt(val);
        fusionsState.statsEditadas[stat] = isNaN(n) || n < 0 ? null : n;
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

    window._fusionTagNombreChange = (val) => {
        fusionsState.tagFusionNombre = val.trim();
    };

window._fusionOficializar = async () => {
        if (!fusionsState.resultadoCalculado) return;
        if (!fusionsState.esAdmin) { toast('Solo el OP puede oficializar fusiones.', 'error'); return; }

        const r = fusionsState.resultadoCalculado;
        const { pjA, pjB, d100 } = r;
        const modoTag = fusionsState.modoTagLocal || 'ninguno';
        let tagFusion = null;

        if (modoTag === 'nuevo') {
            const tagRaw = fusionsState.tagFusionNombre;
            tagFusion = tagRaw ? (tagRaw.startsWith('#') ? tagRaw : '#' + tagRaw) : null;
            if (!tagFusion) {
                const inp = document.getElementById('inp-tag-fusion');
                if (inp) { inp.style.borderColor = 'var(--red)'; inp.focus(); }
                toast('Escribe el nombre del tag nuevo.', 'error'); return;
            }
        } else if (modoTag === 'compartido') {
            tagFusion = r.maxTagCompartido;
            if (!tagFusion) { toast('No hay tag compartido para potenciar.', 'error'); return; }
        }

        if (!confirm(`¿Oficializar la fusión de ${pjA} y ${pjB}?`)) return;

        const btn = document.querySelector('button[onclick*="fusionOficializar"]');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Procesando…'; }

        try {
            const sf = fusionsState.statsEditadas;
            const statsFinales = {
                pot: sf.pot !== null ? sf.pot : r.statsFinales.pot,
                agi: sf.agi !== null ? sf.agi : r.statsFinales.agi,
                ctl: sf.ctl !== null ? sf.ctl : r.statsFinales.ctl,
            };

            const res = await activarFusion(pjA, pjB, d100, statsFinales);
            if (!res.ok) {
                toast('❌ ' + res.msg, 'error');
                if (btn) { btn.disabled = false; btn.textContent = '⚡ Oficializar en Base de Datos'; }
                return;
            }

            const fusionActivaId = res.fusion?.id || null;

            if (tagFusion) {
                const tagKey = tagFusion.slice(1);
                
                // Si es nuevo, forzamos que se guarde como quirk y sin descripción
                if (modoTag === 'nuevo') {
                    await supabase.from('tags_catalogo')
                        .upsert({ nombre: tagKey, descripcion: '', tipo: 'quirk' }, { onConflict: 'nombre', ignoreDuplicates: true });
                }

                for (const nombre of [pjA, pjB]) {
                    const { data: g } = await supabase.from('personajes_refinados')
                        .select('tags').eq('nombre_refinado', nombre).maybeSingle();
                    if (g) {
                        const nuevosTags = [...new Set([...(g.tags || []), tagFusion])];
                        await supabase.from('personajes_refinados').update({ tags: nuevosTags }).eq('nombre_refinado', nombre);
                    }
                }

                // Asignar los 20 pt a ambos personajes
                await supabase.from('puntos_tag').upsert([
                    { personaje_nombre: pjA, tag: tagFusion, cantidad: 20, actualizado_en: new Date().toISOString() },
                    { personaje_nombre: pjB, tag: tagFusion, cantidad: 20, actualizado_en: new Date().toISOString() },
                ], { onConflict: 'personaje_nombre,tag' });

                if (fusionActivaId) {
                    await supabase.from('fusiones_activas').update({ tag_fusion: tagFusion }).eq('id', fusionActivaId);
                }
            }

            const regPayload = buildRegistroFusion(r, statsFinales, tagFusion, tagFusion ? 20 : 0, fusionActivaId);
            await supabase.from('registro_fusiones').insert(regPayload);

            toast(`✅ Fusión ${pjA} + ${pjB} oficializada${tagFusion ? ' · Tag: ' + tagFusion : ''}`, 'ok');

            await _refrescarTodo();
            fusionsState.pjA = null; fusionsState.pjB = null; fusionsState.d100 = null;
            fusionsState.resultadoCalculado = null;
            fusionsState.statsEditadas = { pot: null, agi: null, ctl: null };
            fusionsState.tagFusionNombre = '';
            fusionsState.modoTagLocal = 'ninguno';

            _renderTab('registro');
        } catch(e) {
            toast('❌ Error: ' + e.message, 'error');
            if (btn) { btn.disabled = false; btn.textContent = '⚡ Oficializar en Base de Datos'; }
        }
    };

    window._fusionEnviarSugerencia = async () => {
        if (!fusionsState.resultadoCalculado) return;
        const r = fusionsState.resultadoCalculado;
        const { pjA, pjB } = r;
        
        const modoTag = fusionsState.modoTagLocal || 'ninguno';
        let tagFusion = null;

        if (modoTag === 'nuevo') {
            const tagRaw = fusionsState.tagFusionNombre;
            tagFusion = tagRaw ? (tagRaw.startsWith('#') ? tagRaw : '#' + tagRaw) : null;
            if (!tagFusion) { toast('Escribe el nombre del tag nuevo.', 'error'); return; }
        } else if (modoTag === 'compartido') {
            tagFusion = r.maxTagCompartido;
        }

        const d100raw = r.d100Base || r.d100;
        const sf = fusionsState.statsEditadas;
        const statsFinales = {
            pot: sf.pot !== null ? sf.pot : r.statsFinales.pot,
            agi: sf.agi !== null ? sf.agi : r.statsFinales.agi,
            ctl: sf.ctl !== null ? sf.ctl : r.statsFinales.ctl,
        };

        const payload = {
            pj_a:           pjA,
            pj_b:           pjB,
            rendimiento:    d100raw,
            rend_total:     r.d100,
            compat_bonus:   r.d100Bonus || 0,
            tag_fusion:     tagFusion, // Se manda al OP
            stats_pot:      statsFinales.pot,
            stats_agi:      statsFinales.agi,
            stats_ctl:      statsFinales.ctl,
            tags_resultado: Object.entries(r.tags).map(([tag, d]) => ({
                tag, pts: d.pts, tipo: d.tipo, aportaA: d.aportaA, aportaB: d.aportaB,
            })),
            estado:         'pendiente',
            creado_en:      new Date().toISOString(),
        };

        const { error } = await supabase.from('sugerencias_fusion').insert(payload);
        if (error) { toast('❌ Error al enviar sugerencia: ' + error.message, 'error'); return; }

        toast('✅ Sugerencia enviada. El OP la revisará pronto.', 'ok');
        fusionsState.resultadoCalculado = null;
        fusionsState.statsEditadas = { pot: null, agi: null, ctl: null };
        fusionsState.tagFusionNombre = '';
        fusionsState.modoTagLocal = 'ninguno';
        document.getElementById('resultado-fusion')?.classList.add('oculto');
    };

    window._fusionAprobarSugerencia = async (id) => {
        if (!fusionsState.esAdmin) return;
        const { data: sug } = await supabase.from('sugerencias_fusion').select('*').eq('id', id).maybeSingle();
        if (!sug) return;

        const res = await activarFusion(sug.pj_a, sug.pj_b, sug.rend_total || sug.rendimiento);
        if (!res.ok) { toast('❌ ' + res.msg, 'error'); return; }

        const fusionActivaId = res.fusion?.id;

if (sug.tag_fusion) {
            const tagKey = sug.tag_fusion.slice(1);
            
            // Asumimos que si no existe, se insertará como quirk
            await supabase.from('tags_catalogo')
                .upsert({ nombre: tagKey, descripcion: '', tipo: 'quirk' }, { onConflict: 'nombre', ignoreDuplicates: true });

            for (const nombre of [sug.pj_a, sug.pj_b]) {
                const { data: g } = await supabase.from('personajes_refinados').select('tags').eq('nombre_refinado', nombre).maybeSingle();
                if (g) {
                    const nuevosTags = [...new Set([...(g.tags || []), sug.tag_fusion])];
                    await supabase.from('personajes_refinados').update({ tags: nuevosTags }).eq('nombre_refinado', nombre);
                }
            }

            // Asignar los 20 pt explícitamente
            await supabase.from('puntos_tag').upsert([
                { personaje_nombre: sug.pj_a, tag: sug.tag_fusion, cantidad: 20, actualizado_en: new Date().toISOString() },
                { personaje_nombre: sug.pj_b, tag: sug.tag_fusion, cantidad: 20, actualizado_en: new Date().toISOString() },
            ], { onConflict: 'personaje_nombre,tag' });

            if (fusionActivaId) {
                await supabase.from('fusiones_activas').update({ tag_fusion: sug.tag_fusion }).eq('id', fusionActivaId);
            }
        }

        await supabase.from('registro_fusiones').insert({
        pj_a: sug.pj_a, pj_b: sug.pj_b,
            rendimiento: sug.rend_total || sug.rendimiento, regla_aplicada: 'sugerencia_aprobada',
            tag_fusion: sug.tag_fusion || null, tag_fusion_pts: opcionesState.pts_tag_fusion || 0,
            stats_pot: sug.stats_pot, stats_agi: sug.stats_agi, stats_ctl: sug.stats_ctl,
            tags_resultado: sug.tags_resultado || [],
            fusion_activa_id: fusionActivaId || null,
        });

        await supabase.from('sugerencias_fusion').update({ estado: 'aprobada' }).eq('id', id);
        toast(`✅ Sugerencia de ${sug.pj_a} + ${sug.pj_b} aprobada`, 'ok');
        await _refrescarTodo();
        renderRegistro();
    };

    window._fusionRechazarSugerencia = async (id) => {
        if (!fusionsState.esAdmin) return;
        if (!confirm('¿Rechazar esta sugerencia de fusión?')) return;
        await supabase.from('sugerencias_fusion').update({ estado: 'rechazada' }).eq('id', id);
        toast('Sugerencia rechazada.', 'info');
        await _refrescarTodo();
        renderRegistro();
    };

    window._fusionTerminar = async (id, pjA, pjB) => {
        if (!fusionsState.esAdmin) { toast('Solo el OP puede terminar fusiones.', 'error'); return; }
        if (!confirm(`¿Terminar la fusión de ${pjA} y ${pjB}?`)) return;
        try {
            await terminarFusion(id);
            const fusion = fusionesActivas.find(f => f.id === id);
            if (fusion?.tag_fusion) {
                if (confirm(`¿Quitar también el tag ${fusion.tag_fusion} de ${pjA} y ${pjB}?`)) {
                    for (const nombre of [pjA, pjB]) {
                        const { data: g } = await supabase.from('personajes_refinados').select('tags').eq('nombre_refinado', nombre).maybeSingle();
                        if (g) {
                            const nuevosTags = (g.tags || []).filter(t =>
                                (t.startsWith('#') ? t : '#' + t).toLowerCase() !== fusion.tag_fusion.toLowerCase()
                            );
                            await supabase.from('personajes_refinados').update({ tags: nuevosTags }).eq('nombre_refinado', nombre);
                        }
                    }
                }
            }
            const [{ data: faData }, { data: pjData }] = await Promise.all([
                supabase.from('fusiones_activas').select('*').eq('activa', true).order('creado_en', { ascending: false }),
                supabase.from('personajes_refinados').select('nombre_refinado, pot, agi, ctl, tags').order('nombre_refinado'),
            ]);
            setFusionesActivas(faData || []);
            const pjNorm = (pjData || []).map(p => ({ nombre: p.nombre_refinado, pot: p.pot||0, agi: p.agi||0, ctl: p.ctl||0, tags: p.tags||[] }));
            setPersonajes(pjNorm);
            await cargarFusiones();
            renderFusionesActivas();
            toast(`Fusión ${pjA} + ${pjB} terminada.`, 'ok');
        } catch(e) { toast('❌ Error: ' + e.message, 'error'); }
    };

    window._fusionBorrarRegistro = async (id) => {
        if (!fusionsState.esAdmin) return;
        if (!confirm('¿Eliminar este registro del historial? No deshace la fusión en sí.')) return;
        const { error } = await supabase.from('registro_fusiones').delete().eq('id', id);
        if (error) { toast('❌ ' + error.message, 'error'); return; }
        const { data } = await supabase.from('registro_fusiones').select('*').order('creado_en', { ascending: false }).limit(50);
        setRegistroFusiones(data || []);
        renderRegistro();
        toast('Registro eliminado.', 'ok');
    };

    window._fusionResetResultado = () => {
        fusionsState.resultadoCalculado = null;
        fusionsState.statsEditadas = { pot: null, agi: null, ctl: null };
        fusionsState.tagFusionNombre = '';
        document.getElementById('resultado-fusion')?.classList.add('oculto');
    };

    window._fusionOpcionChange = (key, val) => {
        if (!fusionsState.esAdmin) return;
        let parsed = val;
        if (val === 'true')  parsed = true;
        if (val === 'false') parsed = false;
        if (!isNaN(val) && val !== '' && typeof val === 'string') parsed = Number(val);
        opcionesState[key] = parsed;
        if (['num_umbrales', 'umbral_1', 'umbral_2', 'modo_stats', 'crear_tag_fusion'].includes(key)) {
            renderOpciones();
        }
    };

    window._fusionGuardarOpciones = async () => {
        if (!fusionsState.esAdmin) { toast('Solo el OP puede guardar opciones.', 'error'); return; }
        const res = await guardarOpciones();
        if (res.ok) toast('✅ Configuración guardada', 'ok');
        else toast('❌ Error al guardar: ' + res.msg, 'error');
    };
}

async function _refrescarTodo() {
    const [{ data: faData }, { data: regData }, { data: pjData }, { data: ptData }, { data: tagsData }] = await Promise.all([
        supabase.from('fusiones_activas').select('*').eq('activa', true).order('creado_en', { ascending: false }),
        supabase.from('registro_fusiones').select('*').order('creado_en', { ascending: false }).limit(50),
        supabase.from('personajes_refinados').select('nombre_refinado, pot, agi, ctl, tags').order('nombre_refinado'),
        supabase.from('puntos_tag').select('personaje_nombre, tag, cantidad'),
        supabase.from('tags_catalogo').select('nombre').eq('baneado', true) // <-- CONSULTA BANEADOS
    ]);
    
    setBannedTags((tagsData || []).map(t => t.nombre));
    
    setFusionesActivas(faData || []);
    setRegistroFusiones(regData || []);
    const pjNorm = (pjData || []).map(p => ({ nombre: p.nombre_refinado, pot: p.pot||0, agi: p.agi||0, ctl: p.ctl||0, tags: p.tags||[] }));
    setPersonajes(pjNorm);
    setPtGlobales(ptData || []);
    await cargarFusiones();
}

function _actualizarBarraD100() {
    const val   = fusionsState.d100 || 0;
    const bonus = fusionsState.compatPct || 0;
    const total = val + bonus;

    const fill    = document.getElementById('compat-fill');
    const fillB   = document.getElementById('compat-fill-bonus');
    const label   = document.getElementById('compat-label');
    const totalEl = document.getElementById('rend-total-display');
    const reglaEl = document.getElementById('regla-badge-display');
    const sobreEl = document.getElementById('sobrecarga-display');

    if (fill)    fill.style.width    = Math.min(val, 100) + '%';
    if (fillB)   fillB.style.width   = (total > 100 ? (total - 100) * 0.5 : bonus > 0 ? Math.min(bonus, 100 - val) : 0) + '%';
    if (label)   label.textContent   = val ? `D100: ${val} + ${bonus}% tags = ${total}%` : 'Ingresa el dado';
    if (totalEl) totalEl.textContent = total;

    if (reglaEl) {
        if (val > 0) {
            const regla = getRegla(total);
            reglaEl.style.display = 'block';
            reglaEl.className = `regla-badge ${regla?.clase || ''}`;
            reglaEl.textContent = regla?.label || '';
        } else {
            reglaEl.style.display = 'none';
        }
    }
    
    if (sobreEl) {
        sobreEl.style.display = total > 100 ? 'block' : 'none';
    }
}
