// ============================================================
// tags/tags-ui.js
// ============================================================
import { tagsState, grupos, puntosAll, catalogoTags, medallasCat, STORAGE_URL, norm, tagDetalle, setTagDetalle } from './tags-state.js';
import { getTagsConPuntos, estadoUmbral, tagsMasComunes, tagsCercaDeCanje, medallasDe, descDe, UMBRAL_MAX, rankingPorPT } from './tags-logic.js';
import { guardarDescripcionTag, guardarBaneoTag, canjearPT } from './tags-data.js';
import { renderMarkup, initMarkupTextarea } from '../bnh-markup.js';

const _esc = s => String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const fb = () => `${STORAGE_URL}/imginterfaz/no_encontrado.png`;

// Recarga invisible del catálogo: recarga datos y re-renderiza
// manteniendo la posición del scroll y el estado multi-select.
async function _recargarCatalogo() {
    const scrollY = document.getElementById('vista-catalogo')?.closest('.app-main')?.scrollTop
        ?? window.scrollY;
    const { cargarTodo } = await import('./tags-data.js');
    const { initMarkup } = await import('../bnh-markup.js');
    const { grupos: g2 } = await import('./tags-state.js');
    await cargarTodo();
    initMarkup({ grupos: g2 });
    renderCatalogo();
    requestAnimationFrame(() => {
        const main = document.getElementById('vista-catalogo')?.closest('.app-main');
        if (main) main.scrollTop = scrollY;
        else window.scrollTo(0, scrollY);
    });
}

// ── Tab Progresión ────────────────────────────────────────────
export function renderProgresion() {
    const wrap = document.getElementById('vista-progresion');
    if (!wrap) return;
    const pj = tagsState.pjSeleccionado;
    const tagsConPts = pj ? getTagsConPuntos(pj) : [];

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
        return `<div class="char-thumb ${activo?'active':''}" onclick="window._tagsSelPJ('${g.nombre_refinado.replace(/'/g,"\\'")}')">
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
                canjeHtml = '';
            } else if (tagsState.esAdmin && pts > 0) {
                canjeHtml = `<div class="thresh-badges">`;
                if (pts >= 100) canjeHtml += `<button class="thresh done btn btn-sm" style="background:var(--orange);border-color:var(--orange);color:white;" onclick="window._tagsAbrirCanjeTresTags('${_esc(pj)}','${tag}')">−100 → 🎁 3 tags</button>`;
                if (pts >= 75)  canjeHtml += `<button class="thresh done btn btn-sm" style="background:#1a4a80;border-color:#1a4a80;color:white;" onclick="window._tagsAbrirCanjeMedialla('${_esc(pj)}','${tag}')">−75 → 🏅 Medalla</button>`;
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
    const total   = Object.values(ptsMapa).reduce((a,b)=>a+b,0);
    const listos  = Object.values(ptsMapa).filter(v=>v>=50).length;
    const pot = g.pot||0, agi = g.agi||0, ctl = g.ctl||0;
    const pac = pot+agi+ctl;
    const tierData = (() => {
        if (pac>=100) return { tier:4, label:'TIER 4', color:'#f39c12' };
        if (pac>=80)  return { tier:3, label:'TIER 3', color:'#8e44ad' };
        if (pac>=60)  return { tier:2, label:'TIER 2', color:'#2980b9' };
        return              { tier:1, label:'TIER 1', color:'#27ae60' };
    })();
    const cambios = Math.floor(agi/4);
    // Bono correcto: TIER 1=5, TIER 2=10, TIER 3=15, TIER 4=20
    const bonoPV  = [5,10,15,20][tierData.tier-1] || 5;
    const pvMax   = Math.floor(pot/4)+Math.floor(agi/4)+Math.floor(ctl/4)+bonoPV + (g.pv_max_delta||0);
    const pvActual = g.pv_actual ?? pvMax;
    // Imagen profile
    const norm = s => s.toString().trim().toLowerCase()
        .replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e').replace(/[íìïî]/g,'i')
        .replace(/[óòöô]/g,'o').replace(/[úùüû]/g,'u').replace(/ñ/g,'n')
        .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    const profileUrl = STORAGE_URL + '/imgpersonajes/' + norm(pj) + 'profile.png';
    const iconUrl    = STORAGE_URL + '/imgpersonajes/' + norm(pj) + 'icon.png';
    const noImg      = STORAGE_URL + '/imginterfaz/no_encontrado.png';
    return `
    <div style="display:flex;flex-direction:column;gap:0;">
        <!-- Imagen profile extendible -->
        <div style="border-radius:8px;overflow:hidden;background:#f8f9fa;margin-bottom:12px;max-height:320px;">
            <img src="${profileUrl}" onerror="this.src='${iconUrl}';this.onerror=()=>this.src='${noImg}'"
                style="width:100%;display:block;object-fit:cover;object-position:top;">
        </div>
        <!-- Tier destacado -->
        <div style="text-align:center;font-family:'Cinzel',serif;font-size:1em;font-weight:800;
            color:${tierData.color};letter-spacing:1px;margin-bottom:10px;">${tierData.label}</div>
        <!-- Stats individuales -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
            <div style="background:#fef9f0;border:1px solid #f39c12;border-radius:6px;padding:6px;text-align:center;">
                <div style="font-size:0.65em;color:#888;text-transform:uppercase;letter-spacing:.5px;">POT</div>
                <div style="font-size:1.1em;font-weight:800;color:#d68910;">${pot}</div>
            </div>
            <div style="background:#f0f8fe;border:1px solid #2980b9;border-radius:6px;padding:6px;text-align:center;">
                <div style="font-size:0.65em;color:#888;text-transform:uppercase;letter-spacing:.5px;">AGI</div>
                <div style="font-size:1.1em;font-weight:800;color:#2980b9;">${agi}</div>
            </div>
            <div style="background:#f0fff4;border:1px solid #27ae60;border-radius:6px;padding:6px;text-align:center;">
                <div style="font-size:0.65em;color:#888;text-transform:uppercase;letter-spacing:.5px;">CTL</div>
                <div style="font-size:1.1em;font-weight:800;color:#27ae60;">${ctl}</div>
            </div>
        </div>
        <!-- Línea de datos clave -->
        <div style="display:flex;flex-direction:column;gap:5px;font-size:0.82em;border-top:1px solid var(--gray-200);padding-top:8px;">
            <div style="display:flex;justify-content:space-between;"><span>PAC</span><b>${pac}</b></div>
            <div style="display:flex;justify-content:space-between;"><span>PV</span><b>${pvActual} / ${pvMax}</b></div>
            <div style="display:flex;justify-content:space-between;"><span>Cambios/t</span><b>${cambios}</b></div>
            <div style="display:flex;justify-content:space-between;border-top:1px solid #f0f0f0;padding-top:5px;margin-top:2px;">
                <span>PT totales</span><b style="color:var(--green);">${total}</b>
            </div>
            <div style="display:flex;justify-content:space-between;">
                <span>Tags ≥50 PT</span><b style="color:var(--orange);">${listos}</b>
            </div>
            <div style="display:flex;justify-content:space-between;">
                <span>Tags totales</span><b>${(g.tags||[]).length}</b>
            </div>
        </div>
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

// ── Tag Detalle (modal) ───────────────────────────────────────
export function renderTagDetalle(tagNombre) {
    const tag    = tagNombre.startsWith('#') ? tagNombre : '#' + tagNombre;
    const tagKey = tag.slice(1);
    const catEntry  = catalogoTags.find(t => t.nombre.toLowerCase() === tagKey.toLowerCase());
    const baneado   = catEntry?.baneado || false;
    const desc      = catEntry?.descripcion || '';
    const tipo      = catEntry?.tipo || 'extra';
    const medallas  = medallasDe(tag);
    const personajes = grupos.filter(g =>
        (g.tags||[]).some(t => (t.startsWith('#')?t:'#'+t).toLowerCase() === tag.toLowerCase())
    );

    const el = document.getElementById('tag-detalle-modal');
    if (!el) return;

    const tipoColor = { quirk:'#6c3483', atributo:'#1a4a80', extra:'#1e8449' };
    const tipoBg    = { quirk:'#f5eeff',  atributo:'#ebf5fb',  extra:'#d5f5e3' };
    const tipoLabel = { quirk:'⚡ Quirk', atributo:'📊 Atributo', extra:'🏷 Extra' };

const adminDescForm = tagsState.esAdmin ? `
        <div style="display:flex;gap:12px;margin-bottom:8px;align-items:center;">
            <div style="flex:1;">
                <label style="font-size:0.75em;font-weight:700;color:var(--gray-500);display:block;margin-bottom:4px;">Nombre:</label>
                <input id="detalle-nombre-inp" class="inp" value="#${_esc(tagKey)}" style="font-weight:bold;color:var(--blue);width:100%;font-size:0.85em;">
            </div>
            <div>
                <label style="font-size:0.75em;font-weight:700;color:var(--gray-500);display:block;margin-bottom:4px;">Tipo:</label>
                <select id="detalle-tipo-sel" class="inp" style="min-width:140px;padding:5px 8px;font-size:0.82em;">
                    <option value="quirk"    ${tipo==='quirk'   ?'selected':''}>⚡ Quirk</option>
                    <option value="atributo" ${tipo==='atributo'?'selected':''}>📊 Atributo</option>
                    <option value="extra"    ${tipo==='extra'   ?'selected':''}>🏷 Extra</option>
                </select>
            </div>
        </div>
        <div style="display:flex;gap:8px;align-items:flex-start;">
            <textarea id="detalle-desc-inp" class="inp" rows="3"
                placeholder="Descripción… @Nombre@, #Tag, !Medalla"
                style="flex:1;font-family:monospace;font-size:0.85em;resize:vertical;">${_esc(desc)}</textarea>
            <button class="btn btn-green" style="margin-top:2px;padding:8px 12px;"
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

    // ── Medallas: hasta 15, con detalle de req/cond del tag actual ──
    const medallaCards = medallas.slice(0, 15).map(m => {
        const reqsEsteTag  = (m.requisitos_base||[]).filter(r =>
            ('#'+(r.tag.startsWith('#')?r.tag.slice(1):r.tag)).toLowerCase() === tag.toLowerCase());
        const condsEsteTag = (m.efectos_condicionales||[]).filter(ec =>
            ('#'+(ec.tag.startsWith('#')?ec.tag.slice(1):ec.tag)).toLowerCase() === tag.toLowerCase());
        const otrosTags = (m.requisitos_base||[])
            .filter(r => ('#'+(r.tag.startsWith('#')?r.tag.slice(1):r.tag)).toLowerCase() !== tag.toLowerCase())
            .map(r => `<span style="font-size:0.68em;background:var(--gray-100);color:var(--blue);border:1px solid var(--gray-300);padding:1px 5px;border-radius:4px;">${r.tag.startsWith('#')?r.tag:'#'+r.tag}</span>`)
            .join(' ');
        return `<div style="background:var(--blue-pale);border:1.5px solid var(--blue);
                    border-radius:var(--radius);padding:10px 12px;flex:1;min-width:160px;max-width:230px;cursor:pointer;"
                onclick="window.open('../medallas/index.html#${encodeURIComponent(m.nombre)}','_blank')">
            <div style="font-weight:700;color:var(--blue);font-size:0.85em;margin-bottom:3px;">🏅 ${_esc(m.nombre)}</div>
            ${m.costo_ctl?`<div style="font-size:0.72em;color:var(--gray-500);margin-bottom:3px;">${m.costo_ctl} CTL</div>`:''}
            ${otrosTags?`<div style="margin-bottom:4px;">${otrosTags}</div>`:''}
            ${m.efecto_desc?`<div style="font-size:0.78em;color:var(--gray-700);line-height:1.4;margin-bottom:3px;">${_esc(m.efecto_desc)}</div>`:''}
            ${reqsEsteTag.length?`<div style="font-size:0.72em;background:#d5f5e3;color:var(--green-dark);padding:2px 6px;border-radius:4px;margin-top:3px;">📋 Req: ${reqsEsteTag.map(r=>r.pts_minimos+' PT').join(', ')}</div>`:''}
            ${condsEsteTag.length?`<div style="font-size:0.72em;background:var(--orange-pale);color:var(--orange);padding:3px 6px;border-radius:4px;margin-top:3px;">⚡ ${_esc(condsEsteTag[0].efecto||'Efecto condicional')}</div>`:''}
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

    // overflow-x:hidden en el wrapper elimina el scroll horizontal fantasma
    el.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;overflow-x:hidden;"
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
                        <div style="font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500);margin-bottom:8px;">Medallas (${medallas.length}${medallas.length>15?' — mostrando 15':''})</div>
                        <div style="display:flex;flex-wrap:wrap;gap:8px;max-height:320px;overflow-y:auto;">${medallaCards}</div>
                    </div>` : ''}
                        <div>
                        <div style="font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500);margin-bottom:8px;">Tienen este tag (${personajes.length})</div>
                        <div style="display:flex;flex-wrap:wrap;gap:8px;max-height:160px;overflow-y:auto;padding:2px;">
                            ${personajes.map(g => {
                                const img = STORAGE_URL+'/imgpersonajes/'+norm(g.nombre_refinado)+'icon.png';
                                const safeN = g.nombre_refinado.replace(/'/g,"\\'");
                                const safeT = tag.replace(/'/g,"\\'");
                                
                                // El botón de "x" que solo se muestra para los OP
                                const btnQuitar = tagsState.esAdmin 
                                    ? '<b onclick="event.stopPropagation();window._tagsQuitarDesdeDetalle(\''+g.id+'\',\''+safeN+'\',\''+safeT+'\')" style="color:var(--red);margin-left:6px;font-size:1.2em;line-height:0.8;padding:0 2px;" title="Quitar tag">×</b>' 
                                    : '';
                                    
                                return '<div class="char-thumb" style="cursor:pointer;" onclick="window._tagsIrAFichas(\''+safeT+'\');window._tagsCloseDetalle();">'+
                                    '<img src="'+img+'" onerror="this.onerror=null;this.src=\''+fb()+'\';">'+
                                    '<span>'+g.nombre_refinado+'</span>'+btnQuitar+'</div>';
                            }).join('') || '<span style="color:var(--gray-400);font-size:0.85em;">Ninguno aún.</span>'}
                        </div>
                    </div>
                    ${asignacionSection}
                </div>
            </div>
        </div>`;
    el.style.display = 'block';

    // ── Montar markup textarea con autocompletado real ────────
    if (tagsState.esAdmin) {
        setTimeout(() => {
            const ta = document.getElementById('detalle-desc-inp');
            if (ta) initMarkupTextarea(ta);
        }, 60);
    }

    window._tagsModoMultiActivo = false;
    window._tagsModoMultiSel    = new Set();
}


// Filtrado in-place: oculta/muestra cards sin re-renderizar el DOM.
// Evita que el input pierda el foco y los caracteres lleguen invertidos.
window._catFiltrarInPlace = (v) => {
    tagsState.busquedaCat = v;
    const q = v.trim().toLowerCase();
    const grid = document.getElementById('cat-grid');
    if (!grid) { renderCatalogo(); return; }
    let visible = 0;
    grid.querySelectorAll('[data-cat-card]').forEach(card => {
        const tag  = (card.dataset.catCard  || '').toLowerCase();
        const desc = (card.dataset.catDesc  || '').toLowerCase();
        const show = !q || tag.includes(q) || desc.includes(q);
        card.style.display = show ? '' : 'none';
        if (show) visible++;
    });
    const countEl = document.querySelector('#vista-catalogo .cat-count');
    if (countEl) countEl.textContent = visible + ' tags';
};

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
    // Include catalog tags with 0 personajes
    catalogoTags.forEach(ct => {
        const k = '#' + (ct.nombre.startsWith('#') ? ct.nombre.slice(1) : ct.nombre);
        if (!tagMapa[k]) tagMapa[k] = { count: 0 };
    });

    let entradas = Object.entries(tagMapa)
        .map(([tag, info]) => ({
            tag, count: info.count,
            desc: descDe(tag),
            medallas: medallasDe(tag),
            baneado: catalogoTags.find(t => ('#'+t.nombre).toLowerCase()===tag.toLowerCase())?.baneado || false,
            tipo: catalogoTags.find(t => ('#'+t.nombre).toLowerCase()===tag.toLowerCase())?.tipo || 'extra',
        }))
        .filter(e => !e.baneado)
        .sort((a,b) => b.count-a.count || a.tag.localeCompare(b.tag));

    if (tagsState.busquedaCat) {
        const q = tagsState.busquedaCat.toLowerCase();
        entradas = entradas.filter(e => e.tag.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q));
    }

    const tipoColor = { quirk:'#6c3483', atributo:'var(--blue)', extra:'var(--green-dark)' };
    const tipoBg    = { quirk:'#f5eeff',  atributo:'var(--blue-pale)', extra:'var(--green-pale)' };
    const tipoLabel = { quirk:'⚡ Quirk', atributo:'📊 Atrib.', extra:'🏷 Extra' };

    // ── Toolbar selección múltiple (solo OP) ──────────────────
    const multiToolbar = tagsState.esAdmin ? `
        <div id="cat-multi-toolbar" style="display:none;background:var(--green-pale);border:1.5px solid var(--green);
            border-radius:var(--radius);padding:10px 14px;margin-bottom:12px;align-items:center;gap:10px;flex-wrap:wrap;
            position:sticky;top:130px;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,0.10);">
            <span id="cat-multi-count" style="font-weight:700;font-size:0.88em;color:var(--green-dark);">0 seleccionados</span>
            <div style="display:flex;gap:6px;align-items:center;">
                <span style="font-size:0.78em;color:var(--gray-700);font-weight:600;">Tipo:</span>
                <label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:0.82em;user-select:none;">
                    <input type="radio" name="cat-tipo-radio" value="quirk"
                        onclick="if(this.dataset.prev==='1'){this.checked=false;this.dataset.prev='0';}else{document.querySelectorAll('input[name=cat-tipo-radio]').forEach(r=>{r.dataset.prev='0';});this.dataset.prev='1';window._catTipoRadio('quirk');}"> ⚡ Quirk
                </label>
                <label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:0.82em;user-select:none;">
                    <input type="radio" name="cat-tipo-radio" value="atributo"
                        onclick="if(this.dataset.prev==='1'){this.checked=false;this.dataset.prev='0';}else{document.querySelectorAll('input[name=cat-tipo-radio]').forEach(r=>{r.dataset.prev='0';});this.dataset.prev='1';window._catTipoRadio('atributo');}"> 📊 Atributo
                </label>
                <label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:0.82em;user-select:none;">
                    <input type="radio" name="cat-tipo-radio" value="extra"
                        onclick="if(this.dataset.prev==='1'){this.checked=false;this.dataset.prev='0';}else{document.querySelectorAll('input[name=cat-tipo-radio]').forEach(r=>{r.dataset.prev='0';});this.dataset.prev='1';window._catTipoRadio('extra');}"> 🏷 Extra
                </label>
            </div>
            <button class="btn btn-sm" style="background:#6c3483;color:white;border-color:#6c3483;"
                onclick="window._catCombinarTags()">🔀 Combinar</button>
            <button class="btn btn-red btn-sm" onclick="window._catEliminarSeleccionados()">🗑️ Eliminar</button>
            <button class="btn btn-outline btn-sm" onclick="window._catCancelMulti()">✕ Cancelar</button>
        </div>` : '';

    const cards = entradas.map(({ tag, count, desc, medallas, tipo }) => {
        const tagKey = tag.startsWith('#') ? tag.slice(1) : tag;
        const adminBtns = tagsState.esAdmin ? `
            <div class="cat-card-actions" style="display:none;position:absolute;top:6px;right:6px;gap:4px;z-index:2;">
                <button class="btn btn-sm btn-outline" style="padding:3px 7px;font-size:0.72em;"
                    onclick="event.stopPropagation();window._catEditarInline('${_esc(tagKey)}')">✏️</button>
                <button class="btn btn-sm" style="padding:3px 7px;font-size:0.72em;background:var(--red-pale);color:var(--red);border-color:var(--red);"
                    onclick="event.stopPropagation();window._tagsEliminar('${_esc(tag)}',${count})">🗑️</button>
            </div>
            <div class="cat-card-check" style="display:none;position:absolute;top:8px;right:8px;z-index:2;">
                <input type="checkbox" id="chk-${_esc(tag)}" data-tag="${_esc(tag)}"
                    onchange="window._catToggleCheck('${_esc(tag)}',this.checked)"
                    onclick="event.stopPropagation()"
                    style="width:17px;height:17px;cursor:pointer;accent-color:var(--green);">
            </div>` : '';

        return `
        <div data-cat-card="${_esc(tag)}" data-cat-desc="${_esc(descDe(tag))}"
            onclick="if(window._catMultiActivo){var cb=this.querySelector('input[type=checkbox]');if(cb){cb.checked=!cb.checked;window._catToggleCheck(cb.dataset.tag,cb.checked);}}else{window._tagsVerDetalle('${tag.replace(/'/g,"\\'")}')}"
            style="background:white;border:1.5px solid var(--gray-200);border-radius:var(--radius);
                   padding:12px;cursor:pointer;transition:border-color 0.15s,transform 0.15s;position:relative;"
            onmouseover="
                this.style.borderColor='var(--blue)';
                this.style.transform='translateY(-2px)';
                ${tagsState.esAdmin ? `var a=this.querySelector('.cat-card-actions');if(a&&!window._catMultiActivo)a.style.display='flex';` : ''}
            "
            onmouseout="
                this.style.borderColor='var(--gray-200)';
                this.style.transform='';
                ${tagsState.esAdmin ? `var a=this.querySelector('.cat-card-actions');if(a&&!window._catMultiActivo)a.style.display='none';` : ''}
            ">
            ${adminBtns}
            <div style="font-weight:700;color:var(--blue);font-size:0.88em;margin-bottom:2px;">${tag}</div>
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:${desc?'5px':'0'};">
                <span style="font-size:0.7em;color:var(--gray-500);">${count} personaje${count!==1?'s':''}</span>
                ${medallas.length ? `<span style="font-size:0.7em;">· 🏅${medallas.length}</span>` : ''}
                <span style="font-size:0.68em;padding:1px 5px;border-radius:4px;font-weight:700;
                    background:${tipoBg[tipo]||'var(--gray-100)'};color:${tipoColor[tipo]||'var(--gray-500)'};">
                    ${tipoLabel[tipo]||'🏷 Extra'}
                </span>
            </div>
            ${desc ? `<div style="font-size:0.76em;color:var(--gray-700);line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${renderMarkup(desc)}</div>` : ''}
        </div>`;
    }).join('');

    wrap.innerHTML = `
        <div style="display:flex;gap:12px;margin-bottom:12px;align-items:center;flex-wrap:wrap;">
            <input class="inp" id="cat-search" placeholder="🔍 Buscar tag o descripción…"
                value="${_esc(tagsState.busquedaCat)}"
                oninput="window._catFiltrarInPlace(this.value)"
                style="max-width:360px;">
            <span class="cat-count" style="color:var(--gray-500);font-size:0.85em;">${entradas.length} tags</span>
            ${tagsState.esAdmin ? `
                <button class="btn btn-green btn-sm" onclick="window._catNuevoTag()">✨ Nuevo tag</button>
                <button class="btn btn-outline btn-sm" id="btn-cat-multi"
                    onclick="window._catIniciarMulti()">☑️ Selección múltiple</button>
            ` : ''}
        </div>
        ${multiToolbar}
        <div id="cat-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">
            ${cards || `<div class="empty-state" style="grid-column:1/-1;"><h3>Sin resultados</h3></div>`}
        </div>
        <div id="cat-inline-modal"></div>`;

    setTimeout(() => {
        const el = document.getElementById('cat-search');
        if (el && tagsState.busquedaCat) el.focus();
    }, 10);

    // Restaurar modo multi si estaba activo
    if (window._catMultiActivo) {
        requestAnimationFrame(() => {
            const toolbar = document.getElementById('cat-multi-toolbar');
            if (toolbar) toolbar.style.display = 'flex';
            document.querySelectorAll('.cat-card-check').forEach(el => el.style.display = 'block');
            document.querySelectorAll('.cat-card-actions').forEach(el => el.style.display = 'none');
            const btn = document.getElementById('btn-cat-multi');
            if (btn) btn.style.display = 'none';
            // Remarcar los ya seleccionados
            window._catMultiSel.forEach(t => {
                const cb = document.querySelector(`[data-cat-card="${_esc(t)}"] .cat-card-check input`);
                if (cb) cb.checked = true;
            });
            _catUpdateCount();
        });
    }
}


// ── Catálogo OP: crear nuevo tag ─────────────────────────────
window._catNuevoTag = () => {
    const container = document.getElementById('cat-inline-modal');
    if (!container) return;

    // Lista de grupos para asignación múltiple
    const { grupos: gList, STORAGE_URL: SU, norm: normFn } = window._tagsUiImports || {};
    const gruposDisp = gList || [];
    const fb2 = `${STORAGE_URL}/imginterfaz/no_encontrado.png`;

    container.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:2000;display:flex;align-items:flex-start;
                    justify-content:center;padding:40px 16px;overflow-y:auto;"
            onclick="if(event.target===this)document.getElementById('cat-inline-modal').innerHTML=''">
            <div style="background:white;border-radius:var(--radius-lg);max-width:600px;width:100%;
                        box-shadow:0 8px 40px rgba(0,0,0,0.22);overflow:hidden;">
                <div style="background:var(--green-dark);color:white;padding:14px 18px;
                            display:flex;justify-content:space-between;align-items:center;">
                    <b style="font-family:'Cinzel',serif;font-size:1.05em;">✨ Nuevo Tag</b>
                    <button onclick="document.getElementById('cat-inline-modal').innerHTML=''"
                        style="background:rgba(255,255,255,0.2);border:none;color:white;border-radius:50%;
                               width:28px;height:28px;cursor:pointer;font-size:1.1em;line-height:1;">×</button>
                </div>
                <div style="padding:18px;display:flex;flex-direction:column;gap:12px;">
                    <div style="display:flex;gap:12px;flex-wrap:wrap;">
                        <div style="flex:1;min-width:180px;">
                            <label style="font-size:0.78em;font-weight:700;color:var(--gray-700);display:block;margin-bottom:4px;">Nombre del tag *</label>
                            <input id="nt-nombre" class="inp" placeholder="#NuevoTag" autocomplete="off"
                                onkeydown="if(event.key==='Enter')document.getElementById('nt-desc').focus()">
                            <div style="font-size:0.72em;color:var(--gray-400);margin-top:2px;">El # se añade automáticamente.</div>
                        </div>
                        <div style="min-width:160px;">
                            <label style="font-size:0.78em;font-weight:700;color:var(--gray-700);display:block;margin-bottom:4px;">Tipo</label>
                            <select id="nt-tipo" class="inp" style="max-width:180px;">
                                <option value="extra">🏷 Extra</option>
                                <option value="quirk">⚡ Quirk</option>
                                <option value="atributo">📊 Atributo</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label style="font-size:0.78em;font-weight:700;color:var(--gray-700);display:block;margin-bottom:4px;">Descripción</label>
                        <textarea id="nt-desc" class="inp" rows="3"
                            placeholder="Descripción del tag… @Nombre@, #Tag, !Medalla"
                            style="font-family:monospace;font-size:0.85em;resize:vertical;"></textarea>
                    </div>
                    <div>
                        <label style="font-size:0.78em;font-weight:700;color:var(--gray-700);display:block;margin-bottom:6px;">
                            Asignar a personajes <span style="font-weight:400;color:var(--gray-400);">(opcional — click para marcar)</span>
                        </label>
                        <div id="nt-pj-grid" style="display:flex;flex-wrap:wrap;gap:6px;max-height:180px;overflow-y:auto;
                            background:var(--gray-100);border-radius:var(--radius);padding:8px;">
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-green" onclick="window._catCrearTagEjecutar()">✅ Crear tag</button>
                        <button class="btn btn-outline" onclick="document.getElementById('cat-inline-modal').innerHTML=''">Cancelar</button>
                    </div>
                    <div id="nt-msg" style="font-size:0.82em;color:var(--red);min-height:16px;"></div>
                </div>
            </div>
        </div>`;

    // Poblar grid de personajes y montar markup en textarea
    setTimeout(() => {
        const grid = document.getElementById('nt-pj-grid');
        if (!grid) return;
        // Montar autocompletado markup en la descripción
        const ntDesc = document.getElementById('nt-desc');
        if (ntDesc) initMarkupTextarea(ntDesc);
        grid.innerHTML = grupos.map(g => {
            const img = `${STORAGE_URL}/imgpersonajes/${norm(g.nombre_refinado)}icon.png`;
            return `<div id="nt-pj-${g.id}"
                onclick="this.dataset.sel=this.dataset.sel==='1'?'0':'1';
                         this.style.outline=this.dataset.sel==='1'?'2px solid var(--green)':'';
                         this.style.opacity=this.dataset.sel==='1'?'1':'0.55';"
                class="char-thumb"
                style="cursor:pointer;opacity:0.55;transition:opacity .15s;"
                data-id="${g.id}" data-nombre="${_esc(g.nombre_refinado)}" data-sel="0">
                <img src="${img}" onerror="this.src='${fb2}'">
                <span>${g.nombre_refinado}</span>
            </div>`;
        }).join('');
        document.getElementById('nt-nombre')?.focus();
    }, 60);
};

window._catCrearTagEjecutar = async () => {
    const nombreRaw = document.getElementById('nt-nombre')?.value.trim();
    const tipo      = document.getElementById('nt-tipo')?.value || 'extra';
    const desc      = document.getElementById('nt-desc')?.value.trim() || '';
    const msgEl     = document.getElementById('nt-msg');

    if (!nombreRaw) { if(msgEl) msgEl.textContent = 'El nombre es obligatorio.'; return; }
    const tagNorm = nombreRaw.startsWith('#') ? nombreRaw : '#' + nombreRaw;
    const tagKey  = tagNorm.slice(1);

    if(msgEl) msgEl.textContent = '⏳ Creando…';

    const { guardarDescripcionTag } = await import('./tags-data.js');
    const { supabase } = await import('../bnh-auth.js');

    // 1. Crear en tags_catalogo
    const res = await guardarDescripcionTag(tagKey, desc, tipo);
    if (!res.ok) { if(msgEl) msgEl.textContent = '❌ ' + res.msg; return; }

    // 2. Asignar a personajes seleccionados
    const selDivs = document.querySelectorAll('#nt-pj-grid [data-sel="1"]');
    let asignados = 0;
    for (const div of selDivs) {
        const id     = div.dataset.id;
        const nombre = div.dataset.nombre;
        const { data: g } = await supabase.from('personajes_refinados')
            .select('tags').eq('id', id).maybeSingle();
        if (!g) continue;
        const nuevosTags = [...new Set([...(g.tags||[]), tagNorm])];
        await supabase.from('personajes_refinados').update({ tags: nuevosTags }).eq('id', id);
        asignados++;
    }

    document.getElementById('cat-inline-modal').innerHTML = '';
    toast(`✅ Tag ${tagNorm} creado${asignados ? ` y asignado a ${asignados} personaje${asignados!==1?'s':''}` : ''}`, 'ok');
    await _recargarCatalogo();
};

// ── Catálogo OP: edición inline ───────────────────────────────
window._catEditarInline = (tagKey) => {
    const tag      = '#' + tagKey;
    const catEntry = catalogoTags.find(t => t.nombre.toLowerCase() === tagKey.toLowerCase());
    const desc     = catEntry?.descripcion || '';
    const tipo     = catEntry?.tipo || 'extra';

    const container = document.getElementById('cat-inline-modal');
    if (!container) return;

    container.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;"
            onclick="if(event.target===this)document.getElementById('cat-inline-modal').innerHTML=''">
            <div style="background:white;border-radius:var(--radius-lg);max-width:500px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.2);overflow:hidden;">
                <div style="background:var(--green-dark);color:white;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">
                    <b style="font-family:'Cinzel',serif;">Editar ${tag}</b>
                    <button onclick="document.getElementById('cat-inline-modal').innerHTML=''"
                        style="background:rgba(255,255,255,0.2);border:none;color:white;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:1.1em;line-height:1;">×</button>
                </div>
                <div style="padding:16px;display:flex;flex-direction:column;gap:10px;">
                   <div style="display:flex;gap:12px;margin-bottom:4px;">
                        <div style="flex:1;">
                            <label style="font-size:0.78em;font-weight:700;color:var(--gray-600);display:block;margin-bottom:4px;">Nombre:</label>
                            <input id="ci-nombre" class="inp" value="#${_esc(tagKey)}" style="font-weight:bold;color:var(--blue);width:100%;">
                        </div>
                        <div>
                            <label style="font-size:0.78em;font-weight:700;color:var(--gray-600);display:block;margin-bottom:4px;">Tipo:</label>
                            <select id="ci-tipo" class="inp" style="min-width:140px;padding:5px 8px;font-size:0.85em;">
                                <option value="quirk"    ${tipo==='quirk'   ?'selected':''}>⚡ Quirk</option>
                                <option value="atributo" ${tipo==='atributo'?'selected':''}>📊 Atributo</option>
                                <option value="extra"    ${tipo==='extra'   ?'selected':''}>🏷 Extra</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label style="font-size:0.78em;font-weight:700;color:var(--gray-600);">Descripción:</label>
                        <textarea id="ci-desc" class="inp" rows="3"
                            style="margin-top:4px;font-family:monospace;font-size:0.85em;resize:vertical;"
                            placeholder="@Nombre@, #Tag, !Medalla">${_esc(desc)}</textarea>
                        <div style="font-size:0.7em;color:var(--gray-400);margin-top:2px;">
                            <span style="color:var(--green);font-weight:700;">@Nombre@</span> ·
                            <span style="color:var(--red);font-weight:700;">#Tag</span> ·
                            <span style="color:#1a4a80;font-weight:700;">!Medalla!</span>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-green btn-sm" onclick="window._catGuardarInline('${_esc(tagKey)}')">💾 Guardar</button>
                        <button class="btn btn-outline btn-sm" onclick="document.getElementById('cat-inline-modal').innerHTML=''">Cancelar</button>
                    </div>
                    <div id="ci-msg" style="font-size:0.8em;color:var(--red);min-height:16px;"></div>
                </div>
            </div>
        </div>`;

    // Montar autocompletado markup en el textarea
    setTimeout(() => {
        const ta = document.getElementById('ci-desc');
        if (ta) initMarkupTextarea(ta);
    }, 60);
};

window._catGuardarInline = async (tagKey) => {
    const desc     = document.getElementById('ci-desc')?.value.trim() || '';
    const tipo     = document.getElementById('ci-tipo')?.value || 'extra';
    const nuevoNom = document.getElementById('ci-nombre')?.value.trim() || '';
    const msgEl    = document.getElementById('ci-msg');
    
    if (msgEl) msgEl.textContent = '⏳ Guardando…';

    // Importamos la función renameTag que ya tienes en tags-data.js
    const { guardarDescripcionTag, renameTag } = await import('./tags-data.js');

    let actualKey = tagKey;

    // 1. Si el nombre cambió en el input, renombramos primero en toda la BD
    if (nuevoNom && nuevoNom !== '#' + tagKey && nuevoNom !== tagKey) {
        const resRename = await renameTag('#' + tagKey, nuevoNom);
        if (!resRename.ok) {
            if (msgEl) msgEl.textContent = '❌ Error al renombrar: ' + resRename.msg;
            return;
        }
        // Actualizamos la key con el nuevo nombre sin el '#'
        actualKey = nuevoNom.startsWith('#') ? nuevoNom.slice(1) : nuevoNom;
    }

    // 2. Guardamos la nueva descripción y tipo usando la key final (nueva o vieja)
    const res = await guardarDescripcionTag(actualKey, desc, tipo);
    
    if (res.ok) {
        document.getElementById('cat-inline-modal').innerHTML = '';
        toast('✅ Tag actualizado', 'ok');
        await _recargarCatalogo();
    } else {
        if (msgEl) msgEl.textContent = '❌ ' + res.msg;
    }
};

// ── Catálogo OP: selección múltiple ──────────────────────────
window._catMultiActivo = false;
window._catMultiSel    = new Set();

function _catUpdateCount() {
    const el = document.getElementById('cat-multi-count');
    if (el) el.textContent = `${window._catMultiSel.size} seleccionado${window._catMultiSel.size!==1?'s':''}`;
}

window._catIniciarMulti = () => {
    window._catMultiActivo = true;
    window._catMultiSel    = new Set();
    const toolbar = document.getElementById('cat-multi-toolbar');
    if (toolbar) toolbar.style.display = 'flex';
    document.querySelectorAll('.cat-card-check').forEach(el => el.style.display = 'block');
    document.querySelectorAll('.cat-card-actions').forEach(el => el.style.display = 'none');
    const btn = document.getElementById('btn-cat-multi');
    if (btn) btn.style.display = 'none';
    _catUpdateCount();
};

window._catCancelMulti = () => {
    window._catMultiActivo = false;
    window._catMultiSel    = new Set();
    document.querySelectorAll('.cat-card-check input[type=checkbox]').forEach(cb => { cb.checked = false; });
    document.querySelectorAll('.cat-card-check').forEach(el => el.style.display = 'none');
    const toolbar = document.getElementById('cat-multi-toolbar');
    if (toolbar) toolbar.style.display = 'none';
    const btn = document.getElementById('btn-cat-multi');
    if (btn) btn.style.display = '';
    document.querySelectorAll('input[name="cat-tipo-radio"]').forEach(r => r.checked = false);
};

window._catToggleCheck = (tag, checked) => {
    if (checked) window._catMultiSel.add(tag);
    else         window._catMultiSel.delete(tag);
    _catUpdateCount();
};

// Radio toggle: la lógica está inline en el onclick del HTML generado
// Esta función se llama solo cuando un radio se activa (no cuando se deselecciona)

window._catTipoRadio = async (tipo) => {
    if (!window._catMultiSel.size) {
        toast('⚠️ Selecciona al menos un tag primero', 'info');
        return;
    }
    // Capturar el Set ANTES de cualquier re-render para no perderlo
    const tagsACambiar = [...window._catMultiSel];
    let ok = 0;
    for (const tag of tagsACambiar) {
        const tagKey = tag.startsWith('#') ? tag.slice(1) : tag;
        const entry  = catalogoTags.find(t => t.nombre.toLowerCase() === tagKey.toLowerCase());
        const res    = await guardarDescripcionTag(tagKey, entry?.descripcion || '', tipo);
        if (res.ok) { if (entry) entry.tipo = tipo; ok++; }
    }
    toast(`✅ Tipo "${tipo}" aplicado a ${ok} tag${ok!==1?'s':''}`, 'ok');
    // Mantener selección activa tras re-render (recarga invisible)
    await _recargarCatalogo();
};

window._catEliminarSeleccionados = async () => {
    const count = window._catMultiSel.size;
    if (!count) { toast('⚠️ Nada seleccionado', 'info'); return; }
    if (!confirm(`¿Eliminar ${count} tag${count!==1?'s':''} seleccionado${count!==1?'s':''}?\nSe quitarán de todos los personajes. Esta acción no se puede deshacer.`)) return;
    const { deleteTag, cargarTodo } = await import('./tags-data.js');
    const { initMarkup }            = await import('../bnh-markup.js');
    let total = 0;
    for (const tag of window._catMultiSel) {
        const res = await deleteTag(tag);
        if (res.ok) total += res.afectados;
    }
    toast(`🗑️ ${count} tag${count!==1?'s':''} eliminado${count!==1?'s':''}`, 'ok');
    window._catMultiActivo = false;
    window._catMultiSel    = new Set();
    await _recargarCatalogo();
};

// ── Combinar tags ────────────────────────────────────────────
window._catCombinarTags = () => {
    const count = window._catMultiSel.size;
    if (count < 2) { toast('⚠️ Selecciona al menos 2 tags para combinar', 'info'); return; }
    const tagsOrigen = [...window._catMultiSel];

    const container = document.getElementById('cat-inline-modal');
    if (!container) return;

    container.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;"
            onclick="if(event.target===this)document.getElementById('cat-inline-modal').innerHTML=''">
            <div style="background:white;border-radius:var(--radius-lg);max-width:520px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,0.22);overflow:hidden;">
                <div style="background:#6c3483;color:white;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <b style="font-family:'Cinzel',serif;font-size:1.05em;">🔀 Combinar Tags</b>
                        <div style="font-size:0.78em;opacity:0.85;margin-top:2px;">Los PT se suman al nuevo tag. Los tags originales se eliminan.</div>
                    </div>
                    <button onclick="document.getElementById('cat-inline-modal').innerHTML=''"
                        style="background:rgba(255,255,255,0.2);border:none;color:white;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:1.1em;line-height:1;">×</button>
                </div>
                <div style="padding:18px;display:flex;flex-direction:column;gap:12px;">
                    <div>
                        <div style="font-size:0.75em;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Tags a combinar</div>
                        <div style="display:flex;flex-wrap:wrap;gap:6px;">
                            ${tagsOrigen.map(t => `<span style="background:#f5eeff;color:#6c3483;border:1px solid #6c3483;border-radius:6px;padding:3px 9px;font-size:0.82em;font-weight:700;">${t}</span>`).join('')}
                        </div>
                    </div>
                    <div>
                        <label style="font-size:0.82em;font-weight:700;color:var(--gray-700);">Nombre del nuevo tag *</label>
                        <input id="comb-nombre" class="inp" style="margin-top:4px;"
                            placeholder="#NuevoTag" autocomplete="off"
                            onkeydown="if(event.key==='Enter')window._catEjecutarCombinar()">
                        <div style="font-size:0.72em;color:var(--gray-500);margin-top:3px;">El # se añade automáticamente si no lo escribes.</div>
                    </div>
                    <div>
                        <label style="font-size:0.82em;font-weight:700;color:var(--gray-700);">Tipo del nuevo tag</label>
                        <select id="comb-tipo" class="inp" style="margin-top:4px;max-width:180px;">
                            <option value="extra">🏷 Extra</option>
                            <option value="quirk">⚡ Quirk</option>
                            <option value="atributo">📊 Atributo</option>
                        </select>
                    </div>
                    <div style="background:var(--orange-pale);border:1px solid var(--orange);border-radius:var(--radius);padding:10px;font-size:0.82em;color:var(--orange);">
                        ⚠️ Los personajes que tenían cualquiera de los tags originales recibirán el nuevo tag.
                        Sus PT se sumarán. Los tags originales quedarán eliminados.
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-sm" style="background:#6c3483;color:white;border-color:#6c3483;"
                            onclick="window._catEjecutarCombinar()">🔀 Combinar</button>
                        <button class="btn btn-outline btn-sm"
                            onclick="document.getElementById('cat-inline-modal').innerHTML=''">Cancelar</button>
                    </div>
                    <div id="comb-msg" style="font-size:0.82em;color:var(--red);min-height:16px;"></div>
                </div>
            </div>
        </div>`;

    setTimeout(() => document.getElementById('comb-nombre')?.focus(), 80);
    // Guardar tags origen en el modal para acceder desde _catEjecutarCombinar
    window._catCombinarOrigen = tagsOrigen;
};

window._catEjecutarCombinar = async () => {
    const tagsOrigen = window._catCombinarOrigen || [];
    if (!tagsOrigen.length) return;

    const nombreRaw = document.getElementById('comb-nombre')?.value.trim();
    if (!nombreRaw) { const m=document.getElementById('comb-msg'); if(m) m.textContent='El nombre es obligatorio.'; return; }
    const nuevoTag  = nombreRaw.startsWith('#') ? nombreRaw : '#' + nombreRaw;
    const tipo      = document.getElementById('comb-tipo')?.value || 'extra';

    const btn = document.querySelector('#cat-inline-modal button[onclick*="Ejecutar"], #cat-inline-modal .btn[onclick*="Combinar"]');
    const msgEl = document.getElementById('comb-msg');
    if (msgEl) msgEl.textContent = '⏳ Procesando…';

    const { supabase } = await import('../bnh-auth.js');
    const { cargarTodo } = await import('./tags-data.js');
    const { initMarkup } = await import('../bnh-markup.js');

    try {
        // 1. Para cada personaje: si tiene alguno de los tags origen → asignar nuevo tag
        //    y sumar sus PT en puntos_tag
        const { data: pjs } = await supabase.from('personajes_refinados').select('id, nombre_refinado, tags');

        for (const pj of (pjs || [])) {
            const tagsActuales = (pj.tags || []).map(t => (t.startsWith('#') ? t : '#' + t));
            const tieneAlguno = tagsOrigen.some(to => tagsActuales.some(ta => ta.toLowerCase() === to.toLowerCase()));
            if (!tieneAlguno) continue;

            // Nuevo array de tags: quitar los origen, añadir nuevo (sin duplicar)
            const nuevosTags = [
                ...tagsActuales.filter(ta => !tagsOrigen.some(to => to.toLowerCase() === ta.toLowerCase())),
                nuevoTag,
            ].filter((v, i, a) => a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i);

            await supabase.from('personajes_refinados').update({ tags: nuevosTags }).eq('id', pj.id);

            // Sumar PT de todos los tags origen para este personaje
            let ptTotal = 0;
            for (const tagOrigen of tagsOrigen) {
                const { data: ptRow } = await supabase.from('puntos_tag')
                    .select('cantidad').eq('personaje_nombre', pj.nombre_refinado)
                    .ilike('tag', tagOrigen).maybeSingle();
                ptTotal += ptRow?.cantidad || 0;
            }

            if (ptTotal > 0) {
                // Verificar si ya existe registro para el nuevo tag
                const { data: ptExist } = await supabase.from('puntos_tag')
                    .select('cantidad').eq('personaje_nombre', pj.nombre_refinado)
                    .ilike('tag', nuevoTag).maybeSingle();
                const ptFinal = (ptExist?.cantidad || 0) + ptTotal;
                await supabase.from('puntos_tag').upsert(
                    { personaje_nombre: pj.nombre_refinado, tag: nuevoTag, cantidad: ptFinal, actualizado_en: new Date().toISOString() },
                    { onConflict: 'personaje_nombre,tag' }
                );
            }
        }

        // 2. Eliminar puntos_tag y log de los tags origen
        for (const tagOrigen of tagsOrigen) {
            await supabase.from('puntos_tag').delete().ilike('tag', tagOrigen);
            await supabase.from('log_puntos_tag').delete().ilike('tag', tagOrigen);
            // Eliminar de tags_catalogo
            const key = tagOrigen.startsWith('#') ? tagOrigen.slice(1) : tagOrigen;
            await supabase.from('tags_catalogo').delete().ilike('nombre', key);
        }

        // 3. Crear/actualizar el nuevo tag en catálogo
        const nuevoKey = nuevoTag.startsWith('#') ? nuevoTag.slice(1) : nuevoTag;
        await supabase.from('tags_catalogo').upsert(
            { nombre: nuevoKey, tipo, descripcion: '' },
            { onConflict: 'nombre' }
        );

        document.getElementById('cat-inline-modal').innerHTML = '';
        toast(`✅ Tags combinados en ${nuevoTag}`, 'ok');

        window._catMultiActivo = false;
        window._catMultiSel    = new Set();
        await _recargarCatalogo();

    } catch(e) {
        if (msgEl) msgEl.textContent = '❌ Error: ' + e.message;
    }
};

// ── Tab Tags Baneados (solo OP) ───────────────────────────────
export function renderBaneados() {
    const wrap = document.getElementById('vista-baneados');
    if (!wrap) return;

    const tagMapa = {};
    grupos.forEach(g => (g.tags||[]).forEach(t => {
        const k = (t.startsWith('#') ? t.slice(1) : t);
        tagMapa[k] = (tagMapa[k]||0) + 1;
    }));

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
