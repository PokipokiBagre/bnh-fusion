// ============================================================
// fichas-main.js — Versión Corregida (Deep Wake-Up)
// ============================================================
import { bnhAuth, currentConfig, supabase } from '../bnh-auth.js';
import { fichasUI, gruposGlobal, ptGlobal } from './fichas-state.js';
import { cargarTodo, getPosterNamesDelHilo } from './fichas-data.js';
import { cargarFusiones } from '../bnh-fusion.js';
import { renderSidebar, renderActiveTagsBar, renderCatalogo, renderDetalle, renderUploadPanel, cerrarUploadPanel } from './fichas-ui.js';
import { subirImagenGrupo } from './fichas-upload.js';
import { abrirPanelOP, abrirCrearGrupo, abrirGestorAliases, exponerGlobalesOP, abrirEditarLore } from './fichas-op.js';
import { guardarTagsGrupo, borrarPTDeTag, asignarAliasesDeGrupoNombre } from './fichas-data.js';
import { initMarkup, initMarkupTextarea } from './fichas-markup.js';
import { bnhPort } from '../bnh-port-principal.js';
import { setSupabaseRef } from '../bnh-pac.js';
import { initRecon } from '../bnh-recon.js';

let postersDelHilo = null;
let _scrollCatalogo = 0; 

async function init() {
    setSupabaseRef(supabase);

    const favicon = document.getElementById('dynamic-favicon');
    if (favicon && currentConfig) favicon.href = `${currentConfig.storageUrl}/imginterfaz/icon.png?v=${Date.now()}`;

    await bnhAuth.init();
    fichasUI.esAdmin = bnhAuth.esAdmin();

    const badge = document.getElementById('bnh-session-badge');
    if (badge) badge.innerHTML = bnhAuth.renderStatusBadge();

    await Promise.all([cargarTodo(), cargarFusiones()]);

    let medallasCargadas = [];
    try {
        const { data: med } = await supabase.from('medallas_catalogo')
            .select('nombre').eq('propuesta', false).order('nombre');
        medallasCargadas = med || [];
    } catch(e) { /* silencioso */ }

    initMarkup({ grupos: gruposGlobal, medallas: medallasCargadas });
    exponerGlobalesOP();
    exponerGlobales();

    const urlParams = new URLSearchParams(window.location.search);
    const fichaParam = urlParams.get('ficha');
    if (fichaParam) {
        const decoded = decodeURIComponent(fichaParam);
        const g = gruposGlobal.find(x =>
            x.nombre_refinado.toLowerCase() === decoded.toLowerCase() ||
            x.nombre_refinado.toLowerCase().replace(/ /g,'_') === decoded.toLowerCase().replace(/ /g,'_')
        );
        if (g) {
            fichasUI.vistaActual  = 'detalle';
            fichasUI.seleccionado = g.nombre_refinado;
        }
    }

sincronizarVista();
    bnhPort.init().catch(console.error);

    // ⚡ SISTEMA DE AUTO-RESCATE DE DATOS V2 (Universal)
    setTimeout(() => {
        const rescateStr = sessionStorage.getItem('bnh_rescate_v2');
        if (rescateStr) {
            sessionStorage.removeItem('bnh_rescate_v2'); // Consumir el rescate
            try {
                const rescate = JSON.parse(rescateStr);
                // Restauramos solo si el cuelgue ocurrió hace menos de 10 minutos
                if (Date.now() - rescate.timestamp < 10 * 60 * 1000) {
                    
                    // --- A. Restaurar Catálogo ---
                    if (rescate.catalog) {
                        if (rescate.catalog.search && window._fichaNombreSearch) {
                            const searchInp = document.getElementById('nombre-buscar-inp');
                            if (searchInp) searchInp.value = rescate.catalog.search;
                            window._fichaNombreSearch(rescate.catalog.search);
                        }
                        if (rescate.catalog.tags && rescate.catalog.tags.length > 0 && window._fichaToggleTag) {
                            rescate.catalog.tags.forEach(tag => window._fichaToggleTag(tag));
                        }
                    }

                    // --- B. Restaurar Modal ---
                    if (rescate.modal) {
                        window.abrirFicha(rescate.modal.charName); // Fondo
                        
                        if (rescate.modal.type === 'lore') {
                            window.abrirEditarLore(rescate.modal.charName);
                        } else if (rescate.modal.type === 'op') {
                            // Le pasamos el activeTab al panel OP para que abra la pestaña correcta
                            window.abrirPanelOP(rescate.modal.charName, rescate.modal.activeTab);
                        }

                        // Esperar a que el modal se dibuje e inyectar valores
                        setTimeout(() => {
                            Object.keys(rescate.modal.data).forEach(id => {
                                const el = document.getElementById(id);
                                if (el) {
                                    if (el.type === 'checkbox' || el.type === 'radio') {
                                        el.checked = rescate.modal.data[id];
                                    } else {
                                        el.value = rescate.modal.data[id];
                                    }
                                }
                            });
                            
                            const opBody = document.getElementById('op-body');
                            if (opBody) {
                                const alerta = document.createElement('div');
                                alerta.style.cssText = 'background:#d5f5e3; border:1px solid #27ae60; color:#1e8449; padding:6px; border-radius:6px; font-size:0.82em; font-weight:700; text-align:center; margin-bottom:12px; transition: opacity 0.5s;';
                                alerta.innerHTML = '✅ Datos recuperados.';
                                opBody.insertBefore(alerta, opBody.firstChild);
                                
                                // Desaparece suavemente después de 3 segundos
                                setTimeout(() => {
                                    alerta.style.opacity = '0';
                                    setTimeout(() => alerta.remove(), 500);
                                }, 3000);
                            }
                        }, 150);
                    }
                }
            } catch (e) { console.error('Error restaurando datos:', e); }
        }
    }, 500);
    
    window.addEventListener('popstate', () => {
        const params = new URLSearchParams(window.location.search);
        const ficha  = params.get('ficha');
        if (ficha) {
            _scrollCatalogo = window.scrollY || document.documentElement.scrollTop;
            const g = gruposGlobal.find(x =>
                x.nombre_refinado.toLowerCase() === ficha.toLowerCase() ||
                x.nombre_refinado.toLowerCase().replace(/ /g,'_') === ficha.toLowerCase().replace(/ /g,'_')
            );
            fichasUI.vistaActual  = g ? 'detalle' : 'catalogo';
            fichasUI.seleccionado = g ? g.nombre_refinado : null;
            sincronizarVista();
        } else {
            fichasUI.vistaActual  = 'catalogo';
            fichasUI.seleccionado = null;
            sincronizarVista();
            requestAnimationFrame(() => window.scrollTo(0, _scrollCatalogo));
        }
    });

    // ⚡ NUEVA RECONEXIÓN PROFUNDA
    initRecon({
        supabaseClient: supabase,
        umbralMs: 3000,
        onReconectar: async () => {
            await Promise.all([cargarTodo(), cargarFusiones()]);
            window._equipCache = {};
            cerrarUploadPanel();
            sincronizarVista();
        }
    });
}

function sincronizarVista() {
    if (fichasUI.vistaActual === 'detalle' && fichasUI.seleccionado) {
        document.getElementById('fichas-layout').style.display = 'none';
        document.getElementById('fichas-detalle-wrap').style.display = 'block';
        window.scrollTo(0, 0); 
        const _gDet = gruposGlobal.find(x => x.nombre_refinado === fichasUI.seleccionado);
        if (_gDet) renderDetalle(_gDet).catch(console.error);
    } else {
        document.getElementById('fichas-layout').style.display = 'grid';
        document.getElementById('fichas-detalle-wrap').style.display = 'none';
        renderSidebar();
        renderActiveTagsBar();
        renderCatalogo(postersDelHilo);
    }
}

window._equipCache = window._equipCache || {};

function exponerGlobales() {
    window.abrirFicha = (nombreGrupo) => {
        _scrollCatalogo = window.scrollY || document.documentElement.scrollTop;
        const url = new URL(window.location.href);
        url.searchParams.set('ficha', nombreGrupo);
        window.history.pushState(null, '', url.toString());
        fichasUI.vistaActual  = 'detalle';
        fichasUI.seleccionado = nombreGrupo;
        sincronizarVista();
    };

    window.volverCatalogo = () => {
        const url = new URL(window.location.href);
        url.searchParams.delete('ficha');
        window.history.pushState(null, '', url.toString());
        fichasUI.vistaActual  = 'catalogo';
        fichasUI.seleccionado = null;
        sincronizarVista();
        requestAnimationFrame(() => window.scrollTo(0, _scrollCatalogo));
    };

    window.abrirPanelOP         = abrirPanelOP;
    window.abrirCrearGrupo      = abrirCrearGrupo;
    window.abrirGestorAliases   = abrirGestorAliases;
    window.abrirEditarLore      = abrirEditarLore;

    window.sincronizarVista = async () => {
        await Promise.all([cargarTodo(), cargarFusiones()]);
        try {
            const { data: med } = await supabase.from('medallas_catalogo')
                .select('nombre').eq('propuesta', false).order('nombre');
            initMarkup({ grupos: gruposGlobal, medallas: med || [] });
        } catch(e) {
            initMarkup({ grupos: gruposGlobal });
        }
        sincronizarVista();
    };

    window._fichaToggleTag = (tag) => {
        const idx = fichasUI.tagsFiltro.indexOf(tag);
        idx === -1 ? fichasUI.tagsFiltro.push(tag) : fichasUI.tagsFiltro.splice(idx, 1);
        sincronizarVista();
    };

    window._fichaToggleTagYVolver = (tag) => {
        fichasUI.vistaActual = 'catalogo';
        fichasUI.seleccionado = null;
        if (!fichasUI.tagsFiltro.includes(tag)) fichasUI.tagsFiltro.push(tag);
        sincronizarVista();
        window.scrollTo(0, 0);
    };

    window._fichaClearTags = () => { fichasUI.tagsFiltro = []; sincronizarVista(); };

    let _nombreSearchTimer = null;
    window._fichaNombreSearch = (v) => {
        fichasUI.nombreBusqueda = v;
        clearTimeout(_nombreSearchTimer);
        _nombreSearchTimer = setTimeout(() => {
            renderCatalogo(postersDelHilo);
        }, 180);
    };

    window._fichaClearAll = () => {
        fichasUI.tagsFiltro     = [];
        fichasUI.nombreBusqueda = '';
        sincronizarVista();
    };

    window._fichaTagSearch = (v) => {
        fichasUI.tagBusqueda = v;
        _renderTagListOnly(); 
    };

    window._fichaModoAsignar = () => {
        if (!fichasUI.modoAsignar && !fichasUI.modoInverso) {
            fichasUI.modoAsignar = true;
        } else if (fichasUI.modoAsignar && !fichasUI.modoInverso) {
            fichasUI.modoAsignar = false;
            fichasUI.modoInverso = true;
            fichasUI.tagsAsignar.clear();
            fichasUI.grupoAsignar = null;
        } else {
            fichasUI.modoInverso = false;
            fichasUI.grupoAsignar = null;
        }
        sincronizarVista();
    };

    window._fichaAsignarTagClick = async (nombreGrupo) => {
        const tags = [...fichasUI.tagsAsignar];
        if (!tags.length) return;
        const g = gruposGlobal.find(x => x.nombre_refinado === nombreGrupo);
        if (!g) return;

        for (const tag of tags) {
            const tieneTag = (g.tags||[]).some(t =>
                (t.startsWith('#')?t:'#'+t).toLowerCase() === tag.toLowerCase()
            );

            if (tieneTag) {
                const nuevosTags = (g.tags||[]).filter(t =>
                    (t.startsWith('#')?t:'#'+t).toLowerCase() !== tag.toLowerCase()
                );
                const res = await guardarTagsGrupo(g.id, nuevosTags);
                if (res.ok) {
                    const pts = (ptGlobal[nombreGrupo]||{})[tag] || 0;
                    if (pts > 0) await borrarPTDeTag(nombreGrupo, tag);
                }
            } else {
                const tagNorm = tag.startsWith('#') ? tag : '#' + tag;
                const nuevosTags = [...(g.tags||[]), tagNorm];
                await guardarTagsGrupo(g.id, nuevosTags);
            }
        }
        await Promise.resolve();
        renderCatalogo(postersDelHilo);
        _renderTagListOnly();
    };

    const _originalToggleTag = window._fichaToggleTag;
    window._fichaToggleTag = async (tag) => {
        if (fichasUI.modoInverso) {
            if (!fichasUI.grupoAsignar) return; 
            const g = gruposGlobal.find(x => x.nombre_refinado === fichasUI.grupoAsignar);
            if (!g) return;
            const tagNorm = tag.startsWith('#') ? tag : '#' + tag;
            const tieneTag = (g.tags||[]).some(t =>
                (t.startsWith('#')?t:'#'+t).toLowerCase() === tag.toLowerCase()
            );
            if (tieneTag) {
                const nuevosTags = (g.tags||[]).filter(t =>
                    (t.startsWith('#')?t:'#'+t).toLowerCase() !== tag.toLowerCase()
                );
                const res = await guardarTagsGrupo(g.id, nuevosTags);
                if (res.ok) {
                    const pts = (ptGlobal[fichasUI.grupoAsignar]||{})[tag]||0;
                    if (pts > 0) await borrarPTDeTag(fichasUI.grupoAsignar, tag);
                }
            } else {
                const nuevosTags = [...(g.tags||[]), tagNorm];
                await guardarTagsGrupo(g.id, nuevosTags);
            }
            await Promise.resolve();
            _renderTagListOnly();
            renderCatalogo(postersDelHilo);
        } else if (fichasUI.modoAsignar) {
            if (fichasUI.tagsAsignar.has(tag)) fichasUI.tagsAsignar.delete(tag);
            else fichasUI.tagsAsignar.add(tag);
            _renderTagListOnly();
            renderCatalogo(postersDelHilo);
        } else {
            _originalToggleTag(tag);
        }
    };

    window._fichaAsignarAliasesGrupo = async () => {
        if (!confirm('¿Asignar alias de grupo nombre a todos los grupos?')) return;
        const res = await asignarAliasesDeGrupoNombre();
        alert(`✅ Aliases asignados\nCreados: ${res.creados}\nReasignados: ${res.reasignados}`);
        await sincronizarVista();
    };

    window._fichasAbrirUpload = (nombreGrupo) => {
        const panel = document.getElementById('fichas-upload-panel');
        if (panel) panel.dataset.grupo = ''; 
        renderUploadPanel(nombreGrupo);
        setTimeout(() => {
            document.getElementById('fichas-upload-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
    };

    window._fichasCerrarUpload = () => cerrarUploadPanel();

    window._fichaInversoClick = (nombreGrupo) => {
        fichasUI.grupoAsignar = fichasUI.grupoAsignar === nombreGrupo ? null : nombreGrupo;
        renderSidebar();
        renderCatalogo(postersDelHilo);
    };

    window._fichasSetTipo = (tipo) => {
        const panel = document.getElementById('fichas-upload-panel');
        if (!panel || panel.style.display === 'none') return;
        panel.dataset.tipo = tipo;
        const nombreGrupo = panel.dataset.grupo;
        if (!nombreGrupo) return;
        panel.dataset.grupo = ''; 
        renderUploadPanel(nombreGrupo);
    };

    window._fichasHandleDrop = async (e) => {
        e.preventDefault();
        e.currentTarget.style.borderColor = '';
        const file = e.dataTransfer.files[0];
        if (file?.type.startsWith('image/')) await _ejecutarSubidaFicha(file);
    };

    window._fichasHandleFile = async (e) => {
        const file = e.target.files[0];
        if (file) await _ejecutarSubidaFicha(file);
        e.target.value = '';
    };

    async function _ejecutarSubidaFicha(file) {
        const panel = document.getElementById('fichas-upload-panel');
        const nombreGrupo = panel?.dataset.grupo;
        const tipo = panel?.dataset.tipo || 'icon';
        if (!nombreGrupo) return;

        const prog = () => document.getElementById('fichas-upload-progress');
        const fill = () => document.getElementById('fichas-prog-fill');
        const msg  = () => document.getElementById('fichas-prog-msg');

        const p = prog(); if (p) p.style.display = 'block';
        const f = fill(); if (f) f.style.width = '0%';
        const m = msg();  if (m) { m.textContent = 'Preparando…'; m.style.color = ''; }

        try {
            const url = await subirImagenGrupo(file, nombreGrupo, tipo, (pct, txt) => {
                const f2 = fill(); if (f2) f2.style.width = pct + '%';
                const m2 = msg();  if (m2) m2.textContent = txt;
            });
            const preview = document.getElementById('upload-preview-img');
            if (preview) preview.src = url;
            const m3 = msg(); if (m3) { m3.textContent = '✅ ¡Imagen actualizada!'; m3.style.color = 'var(--green)'; }
            setTimeout(() => {
                renderCatalogo(postersDelHilo);
                if (fichasUI.vistaActual === 'detalle') {
                    const _gDet = gruposGlobal.find(x => x.nombre_refinado === fichasUI.seleccionado);
                    if (_gDet) renderDetalle(_gDet).catch(console.error);
                }
            }, 800);
        } catch(e) {
            const m4 = msg();  if (m4) { m4.textContent = '❌ ' + e.message; m4.style.color = 'var(--red)'; }
            const f4 = fill(); if (f4) f4.style.width = '0%';
            setTimeout(() => { const p4 = prog(); if (p4) p4.style.display = 'none'; }, 3500);
        }
    }

    function _renderTagListOnly() {
        const ul = document.getElementById('sidebar-tag-list');
        if (!ul) { renderSidebar(); return; }
        const tagMap = {};
        gruposGlobal.forEach(g => {
            (g.tags||[]).forEach(t => {
                const k = t.startsWith('#') ? t : '#'+t;
                tagMap[k] = (tagMap[k]||0) + 1;
            });
        });
        let entries = Object.entries(tagMap).sort((a,b) => b[1]!==a[1] ? b[1]-a[1] : a[0].localeCompare(b[0]));
        if (fichasUI.tagBusqueda) {
            const q = fichasUI.tagBusqueda.toLowerCase();
            entries = entries.filter(([t]) => t.toLowerCase().includes(q));
        }
        ul.innerHTML = entries.map(([tag, cnt]) => {
            const activo = fichasUI.tagsFiltro.includes(tag);
            const esTagAsignar = fichasUI.modoAsignar && fichasUI.tagsAsignar.has(tag);
            const grupoSel = fichasUI.modoInverso && fichasUI.grupoAsignar
                ? gruposGlobal.find(g => g.nombre_refinado === fichasUI.grupoAsignar) : null;
            const grupoTieneTag = grupoSel && (grupoSel.tags||[]).some(t =>
                (t.startsWith('#')?t:'#'+t).toLowerCase() === tag.toLowerCase()
            );
            const click = `onclick="window._fichaToggleTag('${tag.replace(/'/g,"\'")}')"`; 
            const estilo = fichasUI.modoInverso && grupoSel
                ? grupoTieneTag ? 'color:var(--green);font-weight:700;' : ''
                : (esTagAsignar || activo) ? 'color:var(--red);font-weight:700;' : '';
            return `<li class="${activo||esTagAsignar||grupoTieneTag?'active':''}" ${click}>
                <span class="tag-link" style="${estilo}">${tag}</span>
                <span class="tag-count">${cnt}</span>
            </li>`;
        }).join('') || '<li style="color:var(--gray-500);font-size:0.82em;padding:4px;">Sin tags</li>';
    }

    window._fichaFiltroRol = (val) => {
        fichasUI.filtroRol = val;
        sincronizarVista();
    };

    window._fichaFiltroEstado = (val) => {
        fichasUI.filtroEstado = val;
        sincronizarVista();
    };

    window._fichaSetHilo = async (val) => {
        fichasUI.hiloFiltro = val;
        postersDelHilo = val === 'todos' ? null : await getPosterNamesDelHilo(val);
        sincronizarVista();
    };
}

init().catch(console.error);
