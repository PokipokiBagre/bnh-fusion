// ============================================================
// tags/tags-ui.js
// ============================================================
import { tagsState, grupos, puntosAll, catalogoTags, medallasCat, STORAGE_URL, norm, tagDetalle, setTagDetalle } from './tags-state.js';
import { getTagsConPuntos, estadoUmbral, tagsMasComunes, tagsCercaDeCanje, medallasDe, descDe, UMBRAL_MAX, rankingPorPT } from './tags-logic.js';
import { guardarDescripcionTag, guardarBaneoTag, canjearPT } from './tags-data.js';
import { renderMarkup } from '../bnh-markup.js';

const _esc = s => String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const fb = () => `${STORAGE_URL}/imginterfaz/no_encontrado.png`;

// ── Tab Progresión ────────────────────────────────────────────
export function renderProgresion() {
    const wrap = document.getElementById('vista-progresion');
    if (!wrap) return;
    const pj = tagsState.pjSeleccionado;
    const tagsConPts = pj ? getTagsConPuntos(pj) : [];

    // Filter by rol/estado
    const gruposFiltrados = grupos.filter(g => {
        const tags = (g.tags||[]).map(t => (t.startsWith('#')?t:'#'+t).toLowerCase());
        const rolOk = tagsState.filtroRol === 'todos' || tags.includes(tagsState.filtroRol.toLowerCase());
        const estOk = tagsState.filtroEstado === 'todos' || tags.includes(tagsState.filtroEstado.toLowerCase());
        return rolOk && estOk;
    });
    const btnRol = (val, label) => {
        const a = tagsState.filtroRol === val;
        return `<button class="btn btn-sm ${a?'btn-green':'btn-outline'}" style="padding:4px 10px;font-size:0.78em;" onclick="window._tagsFiltroRol('${val}')">${label}</button>`;
    };
    const btnEst = (val, label) => {
        const a = tagsState.filtroEstado === val;
        return `<button class="btn btn-sm ${a?'btn-green':'btn-outline'}" style="padding:4px 10px;font-size:0.78em;" onclick="window._tagsFiltroEstado('${val}')">${label}</button>`;
    };
    const charHtml = gruposFiltrados.map(g => {
        const img = `${STORAGE_URL}/imgpersonajes/${norm(g.nombre_refinado)}icon.png`;
        const activo = tagsState.pjSeleccionado === g.nombre_refinado;
        return `<div class="char-thumb ${activo?'active':''}" onclick="window._tagsSelPJ('${g.nombre_refinado.replace(/'/g,"\'")}')">
            <img src="${img}" onerror="this.onerror=null;this.src='${fb()}';">
            <span>${g.nombre_refinado}</span>
        </div>`;
    }).join('');

    let barrasHtml = '';
    if (!pj) {
        barrasHtml = `<div class="empty-state"><h3>Selecciona un personaje</h3><p>Click en uno de arriba para ver su progresión.</p></div>`;
    } else if (!tagsConPts.length) {
        barrasHtml = `<div class="empty-state"><h3>Sin tags</h3><p>${pj} no tiene tags asignados.</p></div>`;
    } else {
        barrasHtml = tagsConPts.map(({ tag, pts }) => {
            const tagKey = tag.startsWith('#') ? tag.slice(1) : tag;
            const catEntry = catalogoTags.find(t => t.nombre.toLowerCase() === tagKey.toLowerCase());
            const baneado = catEntry?.baneado;
            const pct   = Math.min((pts / UMBRAL_MAX) * 100, 100);
            const color = pts >= 75 ? 'prog-red' : pts >= 50 ? 'prog-orange' : 'prog-green';

            let canjeHtml = '';
            if (baneado) {
                canjeHtml = ''; // símbolo 🚫 ya aparece en el nombre del tag
            } else if (tagsState.esAdmin && pts > 0) {
                canjeHtml = `<div class="thresh-badges">`;
                if (pts >= 100) canjeHtml += `<button class="thresh done btn btn-sm" onclick="window._tagsCanjear('${_esc(pj)}','${tag}','tres_tags')">−100 → 🎁 3 tags</button>`;
                if (pts >= 75)  canjeHtml += `<button class="thresh done btn btn-sm" onclick="window._tagsCanjear('${_esc(pj)}','${tag}','medalla')">−75 → 🏅 Medalla</button>`;
                if (pts >= 50)  canjeHtml += `
                    <button class="thresh done btn btn-sm" onclick="window._tagsCanjear('${_esc(pj)}','${tag}','stat_pot')">−50→+POT</button>
                    <button class="thresh done btn btn-sm" onclick="window._tagsCanjear('${_esc(pj)}','${tag}','stat_agi')">−50→+AGI</button>
                    <button class="thresh done btn btn-sm" onclick="window._tagsCanjear('${_esc(pj)}','${tag}','stat_ctl')">−50→+CTL</button>`;
                canjeHtml += `</div>`;
            } else if (!tagsState.esAdmin) {
                canjeHtml = `<div class="thresh-badges">`;
                [[50,'🗡 +stat'],[75,'🏅 medalla'],[100,'🎁 3 tags']].forEach(([thr,lbl]) => {
                    const cl = pts>=thr?'done':pts>=thr*0.6?'close':'far';
                    canjeHtml += `<span class="thresh ${cl}">${thr}pt → ${lbl}</span>`;
                });
                canjeHtml += `</div>`;
            }

            return `<div class="prog-wrap">
                <div class="prog-label">
                    <span class="tag-name" style="cursor:pointer;" onclick="window._tagsVerDetalle('${tag.replace(/'/g,"\\'")}')">
                        ${tag}${baneado?' <span style="color:#888;font-size:0.75em;">🚫</span>':''}
                    </span>
                    <span class="tag-pts">${pts} / ${UMBRAL_MAX} PT</span>
                </div>
                <div class="prog-bar"><div class="prog-fill ${color}" style="width:${pct}%"></div></div>
                ${canjeHtml}
            </div>`;
        }).join('');
    }

    wrap.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 280px;gap:20px;align-items:start;">
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div class="card">
                    <div class="card-title">Personaje</div>
                    <div style="display:flex;gap:5px;margin-bottom:10px;flex-wrap:wrap;">
                        ${btnRol('todos','Todos')}${btnRol('#Jugador','Jugador')}${btnRol('#NPC','NPC')}
                        <span style="width:1px;background:var(--gray-200);margin:0 3px;display:inline-block;"></span>
                        ${btnEst('todos','Todos')}${btnEst('#Activo','Activo')}${btnEst('#Inactivo','Inactivo')}
                    </div>
                    <div class="char-grid">${charHtml}</div>
                </div>
                ${pj ? `<div class="card"><div class="card-title">Progresión — ${pj}</div>${barrasHtml}</div>` : barrasHtml}
            </div>
            <div style="display:flex;flex-direction:column;gap:14px;position:sticky;top:80px;">
                ${pj ? `<div class="card"><div class="card-title">Resumen</div>${_resumenPJ(pj)}</div>` : ''}
                <div class="card"><div class="card-title">⚡ Cerca de canje</div>${_cercaDeCanje()}</div>
            </div>
        </div>`;
}

function _resumenPJ(pj) {
    const g = grupos.find(x => x.nombre_refinado === pj);
    if (!g) return '';
    const ptsMapa = {};
    puntosAll.filter(p=>p.personaje_nombre===pj).forEach(p=>{ ptsMapa[p.tag]=p.cantidad; });
    const total  = Object.values(ptsMapa).reduce((a,b)=>a+b,0);
    const listos = Object.values(ptsMapa).filter(v=>v>=50).length;
    return `<div style="display:flex;flex-direction:column;gap:8px;font-size:0.85em;">
        <div style="display:flex;justify-content:space-between;"><span>PT totales</span><b>${total}</b></div>
        <div style="display:flex;justify-content:space-between;"><span>Tags ≥50 PT</span><b style="color:var(--green);">${listos}</b></div>
        <div style="display:flex;justify-content:space-between;"><span>Tags totales</span><b>${(g.tags||[]).length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span>POT/AGI/CTL</span><b>${g.pot||0}/${g.agi||0}/${g.ctl||0}</b></div>
    </div>`;
}

function _cercaDeCanje() {
    const lista = tagsCercaDeCanje().slice(0,8);
    if (!lista.length) return `<div class="empty-state" style="padding:12px;"><p>Nadie cerca aún.</p></div>`;
    return lista.map(({pj,tag,pts}) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--gray-100);font-size:0.82em;">
            <div><span style="font-weight:600;">${pj}</span>
                <span class="tag-pill" style="margin-left:5px;cursor:pointer;" onclick="window._tagsVerDetalle('${tag.replace(/'/g,"\\'")}')">
                    ${tag}
                </span>
            </div>
            <span style="font-weight:700;color:${pts>=100?'var(--red)':pts>=75?'var(--orange)':'var(--green)'};">${pts}</span>
        </div>`).join('');
}

// ── Tag Detalle (modal/vista) ─────────────────────────────────
export function renderTagDetalle(tagNombre) {
    const tag = tagNombre.startsWith('#') ? tagNombre : '#' + tagNombre;
    const tagKey = tag.slice(1);
    const catEntry = catalogoTags.find(t => t.nombre.toLowerCase() === tagKey.toLowerCase());
    const baneado  = catEntry?.baneado || false;
    const desc     = catEntry?.descripcion || '';
    const tipo     = catEntry?.tipo || 'extra';
    const medallas = medallasDe(tag);
    const personajes = grupos.filter(g =>
        (g.tags||[]).some(t => (t.startsWith('#')?t:'#'+t).toLowerCase() === tag.toLowerCase())
    );

    const el = document.getElementById('tag-detalle-modal');
    if (!el) return;

    const tipoColor = { quirk:'#6c3483', atributo:'#1a4a80', extra:'#1e8449' };
    const tipoBg    = { quirk:'#f5eeff',  atributo:'#ebf5fb',  extra:'#d5f5e3' };
    const tipoLabel = { quirk:'⚡ Quirk', atributo:'📊 Atributo', extra:'🏷 Extra' };

    const adminDescForm = tagsState.esAdmin ? `
        <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">
            <label style="font-size:0.75em;font-weight:700;color:var(--gray-500);white-space:nowrap;">Tipo:</label>
            <select id="detalle-tipo-sel" class="inp" style="max-width:140px;padding:5px 8px;font-size:0.82em;">
                <option value="quirk"    ${tipo==='quirk'   ?'selected':''}>⚡ Quirk</option>
                <option value="atributo" ${tipo==='atributo'?'selected':''}>📊 Atributo</option>
                <option value="extra"    ${tipo==='extra'   ?'selected':''}>🏷 Extra</option>
            </select>
        </div>
        <div style="display:flex;gap:8px;align-items:flex-start;">
            <textarea id="detalle-desc-inp" class="inp" rows="3"
                placeholder="Descripción… @Nombre@, #Tag, !Medalla"
                style="flex:1;font-family:monospace;font-size:0.85em;resize:vertical;">${_esc(desc)}</textarea>
            <button class="btn btn-green btn-sm" style="margin-top:2px;"
                onclick="window._tagsGuardarDescDetalle('${tagKey.replace(/'/g,"\\'")}')">💾</button>
        </div>
        <div style="font-size:0.7em;color:var(--gray-400);margin-top:3px;">
            <span style="color:var(--green);font-weight:700;">@Nombre@</span> ·
            <span style="color:var(--red);font-weight:700;">#Tag</span> ·
            <span style="color:#1a4a80;font-weight:700;">!Medalla!</span>
        </div>` :
        `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="font-size:0.75em;font-weight:700;padding:2px 8px;border-radius:6px;
                background:${tipoBg[tipo]};color:${tipoColor[tipo]};border:1px solid ${tipoColor[tipo]};">
                ${tipoLabel[tipo]||tipo}
            </span>
        </div>
        ${desc ? `<div style="font-size:0.9em;color:var(--gray-700);line-height:1.6;">${renderMarkup(desc)}</div>`
               : `<p style="font-size:0.85em;color:var(--gray-400);font-style:italic;">Sin descripción aún.</p>`}`;

    const medallaCards = medallas.map(m => {
        const reqsEsteTag  = (m.requisitos_base||[]).filter(r =>
            ('#'+(r.tag.startsWith('#')?r.tag.slice(1):r.tag)).toLowerCase() === tag.toLowerCase());
        const condsEsteTag = (m.efectos_condicionales||[]).filter(ec =>
            ('#'+(ec.tag.startsWith('#')?ec.tag.slice(1):ec.tag)).toLowerCase() === tag.toLowerCase());
        return `<div style="background:var(--blue-pale);border:1.5px solid var(--blue);
                    border-radius:var(--radius);padding:10px 12px;flex:1;min-width:160px;max-width:230px;">
            <div style="font-weight:700;color:var(--blue);font-size:0.85em;margin-bottom:4px;">🏅 ${m.nombre}</div>
            ${m.costo_ctl?`<div style="font-size:0.72em;color:var(--gray-500);margin-bottom:3px;">${m.costo_ctl} CTL</div>`:''}
            ${m.efecto_desc?`<div style="font-size:0.78em;color:var(--gray-700);line-height:1.4;margin-bottom:3px;">${m.efecto_desc}</div>`:''}
            ${reqsEsteTag.length?`<div style="font-size:0.72em;background:#d5f5e3;color:var(--green-dark);padding:2px 6px;border-radius:4px;margin-top:3px;">📋 Req: ${reqsEsteTag.map(r=>r.pts_minimos+' PT').join(', ')}</div>`:''}
            ${condsEsteTag.length?`<div style="font-size:0.72em;background:var(--orange-pale);color:var(--orange);padding:3px 6px;border-radius:4px;margin-top:3px;">⚡ ${condsEsteTag[0].efecto||'Efecto condicional'}</div>`:''}
        </div>`;
    }).join('');

    const sinTag = grupos.filter(g =>
        !(g.tags||[]).some(t => (t.startsWith('#')?t:'#'+t).toLowerCase() === tag.toLowerCase())
    );

    const asignacionSection = tagsState.esAdmin ? `
        <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <div style="font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500);">
                    Sin este tag (${sinTag.length})
                </div>
                ${sinTag.length ? `<div style="display:flex;gap:8px;align-items:center;">
                    <label style="font-size:0.78em;color:var(--gray-700);display:flex;align-items:center;gap:4px;cursor:pointer;">
                        <input type="checkbox" id="modo-multi-assign" onchange="window._tagsModoMulti(this.checked)">
                        Selección múltiple
                    </label>
                    <button id="btn-asignar-multi" class="btn btn-green btn-sm" style="display:none;"
                        onclick="window._tagsAsignarMulti('${tag.replace(/'/g,"\\'")}')">✅ Asignar seleccionados</button>
                </div>` : ''}
            </div>
            ${sinTag.length ? `<div id="sinTag-grid" style="display:flex;flex-wrap:wrap;gap:8px;max-height:200px;overflow-y:auto;background:var(--gray-100);border-radius:var(--radius);padding:10px;">
                ${sinTag.map(g => {
                    const img2 = STORAGE_URL+'/imgpersonajes/'+norm(g.nombre_refinado)+'icon.png';
                    const safeN = g.nombre_refinado.replace(/'/g,"\\'");
                    const safeT = tag.replace(/'/g,"\\'");
                    return '<div class="char-thumb" id="assign-'+g.id+'" style="cursor:pointer;opacity:0.65;"'+
                        ' onclick="window._tagsAsignarClick(\''+g.id+'\',\''+safeN+'\',\''+safeT+'\',this)">'+
                        '<img src="'+img2+'" onerror="this.onerror=null;this.src=\''+fb()+'\';"><span>'+g.nombre_refinado+'</span></div>';
                }).join('')}
            </div>` : `<div style="font-size:0.82em;color:var(--green-dark);">✅ Todos tienen este tag.</div>`}
        </div>` : '';

    el.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;"
            onclick="if(event.target===this)window._tagsCloseDetalle()">
            <div style="background:white;border-radius:var(--radius-lg);max-width:760px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.18);overflow:hidden;">
                <div style="background:var(--green-dark);color:white;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <div style="font-size:1.3em;font-weight:800;font-family:'Cinzel',serif;">${tag}</div>
                        ${baneado?'<div style="font-size:0.75em;background:#c0392b;display:inline-block;padding:2px 8px;border-radius:4px;margin-top:4px;">🚫 Baneado</div>':''}
                    </div>
                    <button onclick="window._tagsCloseDetalle()" style="background:rgba(255,255,255,0.2);border:none;color:white;font-size:1.4em;cursor:pointer;border-radius:50%;width:32px;height:32px;line-height:1;">×</button>
                </div>
                <div style="padding:20px;display:flex;flex-direction:column;gap:16px;">
                    <div>
                        <div style="font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500);margin-bottom:6px;">Descripción</div>
                        ${adminDescForm}
                    </div>
                    ${medallas.length ? `<div>
                        <div style="font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500);margin-bottom:8px;">Medallas (${medallas.length})</div>
                        <div style="display:flex;flex-wrap:wrap;gap:8px;max-height:280px;overflow-y:auto;">${medallaCards}</div>
                    </div>` : ''}
                    <div>
                        <div style="font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500);margin-bottom:8px;">Tienen este tag (${personajes.length})</div>
                        <div style="display:flex;flex-wrap:wrap;gap:8px;max-height:160px;overflow-y:auto;padding:2px;">
                            ${personajes.map(g => {
                                const img = STORAGE_URL+'/imgpersonajes/'+norm(g.nombre_refinado)+'icon.png';
                                return '<div class="char-thumb" style="cursor:pointer;" onclick="window._tagsIrAFichas(\''+tag.replace(/'/g,"\\'")+'\');window._tagsCloseDetalle();">'+
                                    '<img src="'+img+'" onerror="this.onerror=null;this.src=\''+fb()+'\';">'+
                                    '<span>'+g.nombre_refinado+'</span></div>';
                            }).join('') || '<span style="color:var(--gray-400);font-size:0.85em;">Ninguno aún.</span>'}
                        </div>
                    </div>
                    ${asignacionSection}
                </div>
            </div>
        </div>`;
    el.style.display = 'block';

    // Mount markup textarea for OP
    if (tagsState.esAdmin) {
        setTimeout(() => {
            const ta = document.getElementById('detalle-desc-inp');
            if (ta && window.initMarkupTextarea) window.initMarkupTextarea(ta);
        }, 60);
    }

    // Multi-select state
    window._tagsModoMultiActivo = false;
    window._tagsModoMultiSel    = new Set();
}

// ── Tab Catálogo ──────────────────────────────────────────────
export function renderCatalogo() {
    const wrap = document.getElementById('vista-catalogo');
    if (!wrap) return;

    const tagMapa = {};
    grupos.forEach(g => (g.tags||[]).forEach(t => {
        const k = t.startsWith('#') ? t : '#'+t;
        if (!tagMapa[k]) tagMapa[k] = { count: 0 };
        tagMapa[k].count++;
    }));

    let entradas = Object.entries(tagMapa)
        .map(([tag, info]) => ({
            tag, count: info.count,
            desc: descDe(tag),
            medallas: medallasDe(tag),
            baneado: catalogoTags.find(t => ('#'+t.nombre).toLowerCase()===tag.toLowerCase())?.baneado || false,
        }))
        .filter(e => !e.baneado) // hide banned from public catalog
        .sort((a,b) => b.count-a.count || a.tag.localeCompare(b.tag));

    if (tagsState.busquedaCat) {
        const q = tagsState.busquedaCat.toLowerCase();
        entradas = entradas.filter(e => e.tag.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q));
    }

    // Grid of tag cards (4 columns)
    const cards = entradas.map(({ tag, count, desc, medallas }) => `
        <div onclick="window._tagsVerDetalle('${tag.replace(/'/g,"\\'")}');"
            style="background:white;border:1.5px solid var(--gray-200);border-radius:var(--radius);
                   padding:12px;cursor:pointer;transition:0.15s;"
            onmouseover="this.style.borderColor='var(--blue)';this.style.transform='translateY(-2px)'"
            onmouseout="this.style.borderColor='var(--gray-200)';this.style.transform=''">
            <div style="font-weight:700;color:var(--blue);font-size:0.88em;margin-bottom:3px;">${tag}</div>
            <div style="font-size:0.72em;color:var(--gray-500);margin-bottom:${desc?'5px':'0'};">
                ${count} personaje${count!==1?'s':''}
                ${medallas.length ? `· 🏅${medallas.length}` : ''}
            </div>
            ${desc ? `<div style="font-size:0.76em;color:var(--gray-700);line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${desc}</div>` : ''}
        </div>`).join('');

    wrap.innerHTML = `
        <div style="display:flex;gap:12px;margin-bottom:16px;align-items:center;">
            <input class="inp" id="cat-search" placeholder="🔍 Buscar tag o descripción…"
                value="${_esc(tagsState.busquedaCat)}"
                oninput="window._tagsBuscarCat(this.value)"
                style="max-width:360px;">
            <span style="color:var(--gray-500);font-size:0.85em;">${entradas.length} tags</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">
            ${cards || `<div class="empty-state" style="grid-column:1/-1;"><h3>Sin resultados</h3></div>`}
        </div>`;

    setTimeout(() => {
        const el = document.getElementById('cat-search');
        if (el && tagsState.busquedaCat) el.focus();
    }, 10);
}

// ── Tab Tags Baneados (solo OP) ───────────────────────────────
export function renderBaneados() {
    const wrap = document.getElementById('vista-baneados');
    if (!wrap) return;

    // All tags that exist in grupos (with count) marked as baneado or not
    const tagMapa = {};
    grupos.forEach(g => (g.tags||[]).forEach(t => {
        const k = (t.startsWith('#') ? t.slice(1) : t);
        tagMapa[k] = (tagMapa[k]||0) + 1;
    }));

    // Merge with catalogoTags
    const allTags = Object.entries(tagMapa).map(([nombre, count]) => {
        const cat = catalogoTags.find(c => c.nombre.toLowerCase() === nombre.toLowerCase());
        return { nombre, count, baneado: cat?.baneado||false, desc: cat?.descripcion||'' };
    }).sort((a,b) => (b.baneado?1:0)-(a.baneado?1:0) || b.count-a.count);

    const baneadosCount = allTags.filter(t=>t.baneado).length;

    const rows = allTags.map(({ nombre, count, baneado, desc }) => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--gray-100);">
            <div style="min-width:180px;">
                <span style="font-weight:700;color:${baneado?'#c0392b':'var(--blue)'};font-size:0.9em;">#${nombre}</span>
                <span style="color:var(--gray-500);font-size:0.75em;margin-left:6px;">${count} PJ</span>
                ${baneado?'<span style="margin-left:6px;font-size:0.72em;background:#fdecea;color:#c0392b;border:1px solid #c0392b;border-radius:4px;padding:1px 5px;">BANEADO</span>':''}
            </div>
            <div style="flex:1;font-size:0.82em;color:var(--gray-700);">${desc||'—'}</div>
            <button class="btn btn-sm ${baneado?'btn-outline':'btn-red'}"
                onclick="window._tagsToggleBan('${nombre.replace(/'/g,"\\'")}', ${!baneado})">
                ${baneado ? '✅ Desbanear' : '🚫 Banear'}
            </button>
        </div>`).join('');

    wrap.innerHTML = `
        <div class="stats-banner" style="margin-bottom:16px;">
            <div class="stat-box"><div class="num" style="color:var(--red);">${baneadosCount}</div><div class="lbl">Tags baneados</div></div>
            <div class="stat-box"><div class="num">${allTags.length - baneadosCount}</div><div class="lbl">Tags activos</div></div>
        </div>
        <div class="card">
            <div class="card-title">Gestión de Tags Baneados</div>
            <p style="font-size:0.82em;color:var(--gray-500);margin-bottom:12px;">
                Los tags baneados pueden asignarse normalmente pero no generan canjes (PT no se pueden gastar en ellos).
            </p>
            ${rows || `<div class="empty-state"><p>No hay tags registrados.</p></div>`}
        </div>`;
}

// ── Tab Estadísticas ──────────────────────────────────────────
export function renderEstadisticas() {
    const wrap = document.getElementById('vista-estadisticas');
    if (!wrap) return;

    const comunes  = tagsMasComunes(20);
    const ranking  = rankingPorPT().slice(0, 10);
    const totalPTs = puntosAll.reduce((a,b)=>a+b.cantidad,0);
    const totalTagsUnicos = new Set(grupos.flatMap(g=>g.tags||[])).size;
    const totalPJs  = grupos.length;
    const tagsPorPJ = totalPJs ? (grupos.reduce((a,g)=>a+(g.tags||[]).length,0)/totalPJs).toFixed(1) : 0;
    const barMax    = comunes[0]?.count || 1;

    wrap.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;">
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div class="stats-banner">
                    <div class="stat-box"><div class="num">${totalTagsUnicos}</div><div class="lbl">Tags únicos</div></div>
                    <div class="stat-box"><div class="num">${totalPTs}</div><div class="lbl">PT totales</div></div>
                    <div class="stat-box"><div class="num">${tagsPorPJ}</div><div class="lbl">Tags / PJ</div></div>
                    <div class="stat-box"><div class="num">${totalPJs}</div><div class="lbl">Personajes</div></div>
                </div>
                <div class="card">
                    <div class="card-title">Tags más comunes</div>
                    ${comunes.map(({ tag, count }) => {
                        const pct = Math.round((count/barMax)*100);
                        return `<div class="prog-wrap">
                            <div class="prog-label">
                                <span class="tag-name" style="cursor:pointer;" onclick="window._tagsVerDetalle('${tag.replace(/'/g,"\\'")}')">
                                    ${tag}
                                </span>
                                <span class="tag-pts">${count} PJ${count!==1?'s':''}</span>
                            </div>
                            <div class="prog-bar"><div class="prog-fill prog-green" style="width:${pct}%"></div></div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div class="card">
                    <div class="card-title">🏆 Ranking por PT totales</div>
                    ${ranking.map(({ nombre, total }, i) => {
                        const medal = ['🥇','🥈','🥉'][i] || `${i+1}.`;
                        const img   = `${STORAGE_URL}/imgpersonajes/${norm(nombre)}icon.png`;
                        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--gray-100);">
                            <span style="width:26px;text-align:center;font-size:1.1em;">${medal}</span>
                            <img src="${img}" onerror="this.onerror=null;this.src='${fb()}';"
                                style="width:30px;height:30px;border-radius:50%;object-fit:cover;object-position:top;">
                            <span style="flex:1;font-weight:600;font-size:0.88em;">${nombre}</span>
                            <span style="font-weight:800;color:var(--green-dark);">${total} PT</span>
                        </div>`;
                    }).join('')}
                </div>
                <div class="card">
                    <div class="card-title">⚡ Próximos a canjear (≥75 PT)</div>
                    ${tagsCercaDeCanje().slice(0,10).map(({pj,tag,pts}) => `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--gray-100);font-size:0.83em;">
                            <div>
                                <span style="font-weight:600;">${pj}</span>
                                <span class="tag-pill" style="margin-left:5px;cursor:pointer;" onclick="window._tagsVerDetalle('${tag.replace(/'/g,"\\'")}')">
                                    ${tag}
                                </span>
                            </div>
                            <span style="font-weight:700;color:${pts>=100?'var(--red)':'var(--orange)'};">${pts} PT</span>
                        </div>`).join('') || `<div class="empty-state" style="padding:12px;"><p>Nadie cerca todavía.</p></div>`}
                </div>
            </div>
        </div>`;
}

export function toast(msg, tipo='ok') {
    const el = document.getElementById('toast-msg');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast-' + tipo;
    setTimeout(() => { el.className = ''; }, 3000);
}
