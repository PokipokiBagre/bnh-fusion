// ============================================================
// tags/tags-ui.js
// ============================================================
import {
    tagsState, grupos, puntosAll, catalogoTags, medallasCat, solicitudes,
    STORAGE_URL, norm, tagDetalle, setTagDetalle,
    inventarioMedallas,
} from './tags-state.js';
import { getTagsConPuntos, tagsMasComunes, tagsCercaDeCanje, medallasDe, descDe, UMBRAL_MAX, rankingPorPT, getMedallasAccesibles, proyectarPJ } from './tags-logic.js';
import { renderMarkup, initMarkupTextarea } from '../bnh-markup.js';
import { renderFusionBadge } from '../bnh-fusion.js';
import { aplicarDeltas } from '../bnh-pac.js';

// Helper: muestra cadena de hasta 5 deltas con etiquetas de colores (badges)
function _fmtDChain(base, total, deltas) {
    const activos = (deltas || []).filter(d => d && String(d).trim() !== '0');
    if (!activos.length || base === total) return String(total);
    
    const makeBadge = (text, bg, color, border) => 
        `<span style="display:inline-flex; align-items:center; justify-content:center; padding:1px 4px; border-radius:4px; font-size:0.65em; font-weight:700; font-family:monospace; background:${bg}; color:${color}; border:1px solid ${border}; line-height:1.2;">${text}</span>`;

    let badgesHtml = makeBadge(base, '#f1f2f6', '#576574', '#ced6e0'); 
    let acc = base;

    for (const d of activos) {
        const s = String(d).trim();
        const powM  = s.match(/^\^([+-]?\d+(?:\.\d+)?)$/);
        const multM = s.match(/^[xX\*]([+-]?\d+(?:\.\d+)?)$/);
        const divM  = s.match(/^\/([+-]?\d+(?:\.\d+)?)$/);
        const addM  = s.match(/^([+-]?\d+(?:\.\d+)?)$/);

        if (powM) {
            acc = Math.round(Math.pow(acc, parseFloat(powM[1])));
            badgesHtml += makeBadge(`^${powM[1]}`, '#fce4ec', '#ad1457', '#f48fb1');
        } else if (multM) {
            acc = Math.round(acc * parseFloat(multM[1]));
            badgesHtml += makeBadge(`×${multM[1]}`, '#f3e5f5', '#6a1b9a', '#ce93d8'); 
        } else if (divM) {
            acc = Math.round(acc / parseFloat(divM[1]));
            badgesHtml += makeBadge(`÷${divM[1]}`, '#fff3e0', '#ef6c00', '#ffcc80'); 
        } else if (addM) {
            const n = parseFloat(addM[1]);
            acc = Math.round(acc + n);
            if (n >= 0) {
                badgesHtml += makeBadge(`+${n}`, '#e3f2fd', '#1565c0', '#90caf9'); 
            } else {
                badgesHtml += makeBadge(`${n}`, '#ffebee', '#c62828', '#ef9a9a'); 
            }
        }
    }

    return `${total} <span style="display:inline-flex; align-items:center; gap:3px; margin-left:6px; vertical-align:middle; flex-wrap:wrap; margin-top:-2px;">${badgesHtml}</span>`;
}

const _esc = s => String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const fb = () => `${STORAGE_URL}/imginterfaz/no_encontrado.png`;

async function _recargarCatalogo() {
    const scrollY = document.getElementById('vista-catalogo')?.closest('.app-main')?.scrollTop ?? window.scrollY;
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

export function renderProgresion() {
    const wrap = document.getElementById('vista-progresion');
    if (!wrap) return;
    const pj = tagsState.pjSeleccionado;
    
    // --- LENTE ---
    const proy = pj ? proyectarPJ(pj) : null;
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
            <img src="${img}" onerror="this.onerror=null;this.src='${fb()}'" onclick="event.stopPropagation();window._tagsSelPJ('${g.nombre_refinado.replace(/'/g,"\\'")}')" style="cursor:pointer;">
            <span>${g.nombre_refinado}</span>
        </div>`;
    }).join('');

    let barrasHtml = '';
    if (!pj) {
        barrasHtml = `<div class="empty-state"><h3>Selecciona un personaje</h3><p>Click en uno de arriba para ver su progresión.</p></div>`;
    } else if (!tagsConPts.length) {
        barrasHtml = `<div class="empty-state"><h3>Sin tags</h3><p>${pj} no tiene tags asignados.</p></div>`;
    } else {
        barrasHtml = tagsConPts.map(({ tag, pts, ptsReales, alterado }) => {
            const tagKey = tag.startsWith('#') ? tag.slice(1) : tag;
            const catEntry = catalogoTags.find(t => (t.nombre.startsWith('#') ? t.nombre.slice(1) : t.nombre).toLowerCase() === tagKey.toLowerCase());
            const baneado = catEntry?.baneado;
            const pct   = Math.min((pts / UMBRAL_MAX) * 100, 100);
            
            let colorBg = '';
            if (pts >= 100) colorBg = '#3498db';
            else if (pts >= 75) colorBg = '#1abc9c';
            else colorBg = '#2ecc71';

            let canjeHtml = '';
            if (baneado) {
                canjeHtml = '';
            } else if (pts > 0) {
                canjeHtml = `<div class="thresh-badges">`;
                
                const bloq = alterado ? 'disabled style="opacity:0.5;cursor:not-allowed;" title="Bloqueado: PT virtuales de fusión"' : '';
                const clk = (accion) => alterado ? `onclick="window.toast('No puedes gastar PT virtuales de fusión', 'error')"` : `onclick="${accion}"`;

                if (pts >= 100) canjeHtml += `<button class="thresh done btn btn-sm" style="background:var(--orange);border-color:var(--orange);color:white;" ${clk(`window._tagsAbrirCanjeTresTags('${_esc(pj)}','${tag}')`)} ${bloq}>−100 → 🎁 3 tags</button>`;
                if (pts >= 75)  canjeHtml += `<button class="thresh done btn btn-sm" style="background:#1a4a80;border-color:#1a4a80;color:white;" ${clk(`window._tagsAbrirCanjeMedialla('${_esc(pj)}','${tag}')`)} ${bloq}>−75 → 🏅 Medalla</button>`;
                if (pts >= 50)  canjeHtml += `
                    <button class="thresh done btn btn-sm" ${clk(`window._tagsCanjear('${_esc(pj)}','${tag}','stat_pot')`)} ${bloq}>−50→+POT</button>
                    <button class="thresh done btn btn-sm" ${clk(`window._tagsCanjear('${_esc(pj)}','${tag}','stat_agi')`)} ${bloq}>−50→+AGI</button>
                    <button class="thresh done btn btn-sm" ${clk(`window._tagsCanjear('${_esc(pj)}','${tag}','stat_ctl')`)} ${bloq}>−50→+CTL</button>`;
                
                if (pts < 50) {
                    [[50,'🗡 +stat'],[75,'🏅 medalla'],[100,'🎁 3 tags']].forEach(([thr,lbl]) => {
                        const cl = pts>=thr?'done':pts>=thr*0.6?'close':'far';
                        canjeHtml += `<span class="thresh ${cl}">${thr}pt → ${lbl}</span>`;
                    });
                }
                canjeHtml += `</div>`;
            }

            return `<div class="prog-wrap">
                <div class="prog-label">
                    <span class="tag-name" style="cursor:pointer;" onclick="window._tagsVerDetalle('${tag.replace(/'/g,"\\'")}')">
                        ${tag}${baneado?' <span style="color:#888;font-size:0.75em;">🚫</span>':''}
                    </span>
                    <span class="tag-pts" ${alterado ? `style="color:#8e44ad; font-weight:800;" title="Reales: ${ptsReales}"` : ''}>
                        ${alterado ? '⚡ ' : ''}${pts} / ${UMBRAL_MAX} PT
                    </span>
                </div>
                <div class="prog-bar"><div class="prog-fill" style="width:${pct}%; background:${alterado ? '#8e44ad' : colorBg};"></div></div>
                ${canjeHtml}
            </div>`;
        }).join('');
    }

    let secMedallas = '';
    if (pj) {
        const accMedallas = getMedallasAccesibles(pj);
        const busqMed = (tagsState.busquedaMedallasAcc || '').toLowerCase();
        let visiblesInit = 0;
        
        const mHtml = accMedallas.map(m => {
            const equipada = inventarioMedallas.includes(m.id);
            const tagsD = (m.requisitos_base||[]).map(r => `
                <span style="font-size:0.7em; font-weight:600; background:rgba(52,152,219,0.1); color:var(--blue,#2980b9); border:1px solid rgba(52,152,219,0.3); padding:2px 8px; border-radius:12px; white-space:nowrap;">
                    ${_esc(r.tag.startsWith('#')?r.tag:'#'+r.tag)} ≥${r.pts_minimos}pt
                </span>`).join(' ');

            const mostrar = !busqMed || m.nombre.toLowerCase().includes(busqMed) || (m.efecto_desc||'').toLowerCase().includes(busqMed);
            if (mostrar) visiblesInit++;

            return `
            <div class="medalla-acc-card" 
                 data-nombre="${_esc(m.nombre)}" 
                 data-efecto="${_esc(m.efecto_desc || '')}"
                 onclick="window.open('../medallas/index.html?medalla=${encodeURIComponent(m.nombre)}','_blank')"
                 onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.12)'; this.style.transform='translateY(-2px)';"
                 onmouseout="this.style.boxShadow=''; this.style.transform='';"
                 style="display:${mostrar ? 'flex' : 'none'}; background:${equipada ? 'rgba(39,174,96,0.05)' : '#fff'}; border:1.5px solid ${equipada ? 'var(--green)' : 'var(--gray-200)'}; border-radius:10px; padding:14px; flex-direction:column; gap:8px; cursor:pointer; transition:all .15s;">
                 
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                    <span style="font-weight:700; font-size:0.9em; color:var(--gray-900); line-height:1.2;">🏅 ${_esc(m.nombre)}</span>
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0;">
                        <span style="font-size:0.75em; font-weight:800; color:var(--purple); background:rgba(142,68,173,0.08); border:1px solid rgba(142,68,173,0.22); padding:2px 8px; border-radius:8px;">${m.costo_ctl} CTL</span>
                        ${equipada ? `<span style="font-size:0.68em; font-weight:700; color:var(--green); background:var(--green-pale); border:1px solid var(--green); padding:2px 6px; border-radius:6px;">✅ Equipada</span>` : ''}
                    </div>
                </div>
                
                ${tagsD ? `<div style="display:flex; flex-wrap:wrap; gap:4px;">${tagsD}</div>` : ''}
                
                ${m.efecto_desc ? `<div style="font-size:0.78em; color:var(--gray-600); line-height:1.5; border-top:1px solid var(--gray-100); padding-top:6px;">${renderMarkup(m.efecto_desc)}</div>` : ''}
            </div>`;
        }).join('');

        secMedallas = `
        <div class="card" style="margin-top:16px;">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
                <div id="medallas-acc-titulo" class="card-title" style="margin:0;">Medallas Posibles Accesibles (${visiblesInit})</div>
                <input class="inp" placeholder="🔍 Buscar medalla..." value="${_esc(tagsState.busquedaMedallasAcc)}" oninput="window._tagsBuscarMedallasAcc(this.value)" style="width:100%; max-width:250px; padding:6px 10px; font-size:0.85em;">
            </div>
            <div id="medallas-acc-grid" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:12px;">
                ${mHtml || '<p class="empty-state" style="grid-column:1/-1; padding:20px 0;">No se encontraron medallas.</p>'}
            </div>
        </div>`;
    }

    const rankingHtml = rankingPorPT().slice(0, 5).map(({ nombre, total }, i) => {
        const medal = ['🥇','🥈','🥉'][i] || `${i+1}.`;
        const img   = `${STORAGE_URL}/imgpersonajes/${norm(nombre)}icon.png`;
        return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--gray-100);">
            <span style="width:26px;text-align:center;font-size:1.1em;">${medal}</span>
            <img src="${img}" onerror="this.onerror=null;this.src='${fb()}';" style="width:24px;height:24px;border-radius:50%;object-fit:cover;object-position:top;">
            <span style="flex:1;font-weight:600;font-size:0.85em;">${nombre}</span>
            <span style="font-weight:800;color:var(--green-dark);font-size:0.85em;">${total} PT</span>
        </div>`;
    }).join('');

    let statsTitle = '';
    let badgeFusionHtml = '';
    if (proy) {
        badgeFusionHtml = proy.esFusion ? renderFusionBadge(pj, STORAGE_URL, norm) : '';
        if (proy.esFusion) {
            statsTitle = `
            <div style="background:var(--purple-pale); border:1px solid var(--purple); border-radius:6px; padding:6px 12px; font-size:0.8em; color:var(--purple); font-weight:700; margin-bottom: 15px; display:inline-block;">
                ⚡ PAC Proyectado: ${proy.pot + proy.agi + proy.ctl} (POT: ${proy.pot} | AGI: ${proy.agi} | CTL: ${proy.ctl})
            </div>`;
        }
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
                    <div class="char-grid">${charHtml || '<span style="color:#aaa;font-size:0.85em;">Sin personajes</span>'}</div>
                </div>
                ${pj ? `
                <div class="card">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="card-title" style="margin-bottom:0;">Progresión — ${pj}</div>
                        ${badgeFusionHtml}
                    </div>
                    <hr style="border:0; border-top:1px solid var(--gray-200); margin:10px 0;">
                    ${statsTitle}
                    ${barrasHtml}
                </div>
                ${secMedallas}` : barrasHtml}
            </div>

            <div style="display:flex;flex-direction:column;gap:14px;position:sticky;top:80px;">
                ${pj ? `<div class="card"><div class="card-title">Resumen</div>${_resumenPJ(pj, proy)}</div>` : ''}
                ${pj ? _renderSolicitudes(pj) : ''}
                <div class="card">
                    <div class="card-title">🏆 Ranking Top 5</div>
                    ${rankingHtml}
                </div>
                <div class="card">
                    <div class="card-title">⚡ Cerca de canje</div>
                    ${_cercaDeCanje()}
                </div>
            </div>
        </div>`;
}

function _renderSolicitudes(pj) {
    const reqs = solicitudes.filter(s => s.personaje_nombre === pj);
    if (!reqs.length) return '';
    
    const rows = reqs.map(r => {
        let lbl = '';
        if (r.tipo === 'stat_pot') lbl = '💪 +1 POT';
        else if (r.tipo === 'stat_agi') lbl = '⚡ +1 AGI';
        else if (r.tipo === 'stat_ctl') lbl = '🧠 +1 CTL';
        else if (r.tipo === 'medalla') lbl = `🏅 Medalla Propuesta: <b>${r.datos?.nombre_medalla||'Desconocida'}</b>`;
        else if (r.tipo === 'tres_tags') {
            lbl = `🎁 Tags: ${r.datos.cambios.map(c=>c.tipo==='remover'?'-'+c.tag:c.tipo==='anadir'?'+'+c.tag:'✨'+c.tag).join(', ')}`;
        }

        const adminBtns = tagsState.esAdmin ? `
            <button onclick="window._tagsAprobarReq(${r.id})" class="btn btn-green btn-sm" style="flex:1;">✅ Aprobar</button>
            <button onclick="window._tagsCancelarReq(${r.id})" class="btn btn-red btn-sm" style="flex:1;">❌ Rechazar</button>
        ` : `
            ${r.tipo === 'tres_tags' ? `<button onclick="window._tagsAbrirEditTresTags(${r.id})" class="btn btn-outline btn-sm" style="border-color:var(--orange);color:var(--orange);flex:1;">✏️ Editar Solicitud</button>` : ''}
            ${r.tipo === 'medalla' ? `<button onclick="window._tagsAbrirEditMedalla(${r.id})" class="btn btn-outline btn-sm" style="border-color:var(--orange);color:var(--orange);flex:1;">✏️ Editar Propuesta</button>` : ''}
            <button onclick="window._tagsCancelarReq(${r.id})" class="btn btn-red btn-sm" style="flex:1;">🗑️ Retirar / Devolver PT</button>
        `;

        return `<div style="background:#fffbf5;border:1px solid var(--orange);border-radius:8px;padding:10px;margin-bottom:8px;">
            <div style="font-size:0.72em;color:var(--orange);font-weight:800;margin-bottom:4px;text-transform:uppercase;">⏳ Solicitud Pendiente (−${r.costo_pt} PT de ${r.tag_origen})</div>
            <div style="font-size:0.85em;font-weight:600;color:var(--gray-800);margin-bottom:8px;">${lbl}</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${adminBtns}</div>
        </div>`;
    }).join('');

    return `<div class="card" style="border:2px solid #e67e22;">
        <div class="card-title" style="color:#d68910;">⏳ Solicitudes Pendientes</div>
        ${rows}
    </div>`;
}

function _resumenPJ(pj, proy) {
    const g = grupos.find(x => x.nombre_refinado === pj);
    if (!g) return '';

    if (!proy) { const { proyectarPJ: _p } = { proyectarPJ }; proy = _p(pj); }

    const ptsMapa = {};
    puntosAll.filter(p => p.personaje_nombre === pj).forEach(p => { ptsMapa[p.tag] = p.cantidad; });
    const total  = Object.values(ptsMapa).reduce((a,b)=>a+b,0);
    const listos = Object.values(ptsMapa).filter(v => v >= 50).length;

    const pot = proy?.pot ?? (g.pot||0);
    const agi = proy?.agi ?? (g.agi||0);
    const ctl = proy?.ctl ?? (g.ctl||0);

    const potBase = proy?.pot_chain_base ?? (g.pot||0);
    const agiBase = proy?.agi_chain_base ?? (g.agi||0);
    const ctlBase = proy?.ctl_chain_base ?? (g.ctl||0);

    const potDeltas = [1,2,3,4,5].map(n => g['delta_pot_'+n]);
    const agiDeltas = [1,2,3,4,5].map(n => g['delta_agi_'+n]);
    const ctlDeltas = [1,2,3,4,5].map(n => g['delta_ctl_'+n]);

    // CTL Usado: medallas equipadas (del inventario) + delta_ctl_usado_*
    const ctlUsadoBase = inventarioMedallas.reduce((s, id) => {
        const med = medallasCat.find(m => m.id === id);
        return s + (Number(med?.costo_ctl) || 0);
    }, 0);
    const ctlUsado = aplicarDeltas(ctlUsadoBase,
        g.delta_ctl_usado_1, g.delta_ctl_usado_2, g.delta_ctl_usado_3,
        g.delta_ctl_usado_4, g.delta_ctl_usado_5);
    const ctlUsadoDeltas = [1,2,3,4,5].map(n => g['delta_ctl_usado_'+n]);
    const ctlExcedido = ctlUsado > ctl;

    const pac = pot + agi + ctl;
    const tierData = (() => {
        if (pac >= 150) return { tier:5, label:'TIER 5', color:'#9b59b6' };
        if (pac >= 100) return { tier:4, label:'TIER 4', color:'#f39c12' };
        if (pac >= 80)  return { tier:3, label:'TIER 3', color:'#8e44ad' };
        if (pac >= 60)  return { tier:2, label:'TIER 2', color:'#2980b9' };
        return          { tier:1, label:'TIER 1', color:'#27ae60' };
    })();

    const bonoPV = [5,10,15,20,30][tierData.tier-1] || 5;
    const pvMaxPuro = Math.floor(pot/4) + Math.floor(agi/4) + Math.floor(ctl/4) + bonoPV;
    const pvMax     = aplicarDeltas(pvMaxPuro,  g.delta_pv_1, g.delta_pv_2, g.delta_pv_3, g.delta_pv_4, g.delta_pv_5);
    const pvActBase = (g.pv_actual !== null && g.pv_actual !== undefined) ? g.pv_actual : pvMax;
    const pvActual  = aplicarDeltas(pvActBase, g.delta_pv_actual_1, g.delta_pv_actual_2, g.delta_pv_actual_3, g.delta_pv_actual_4, g.delta_pv_actual_5);
    const cambios   = aplicarDeltas(Math.floor(agi/4), g.delta_cambios_1, g.delta_cambios_2, g.delta_cambios_3, g.delta_cambios_4, g.delta_cambios_5);

    const profileUrl = STORAGE_URL + '/imgpersonajes/' + norm(pj) + 'profile.png';
    const iconUrl    = STORAGE_URL + '/imgpersonajes/' + norm(pj) + 'icon.png';
    const noImg      = STORAGE_URL + '/imginterfaz/no_encontrado.png';

    const fusionBanner = proy?.esFusion ? `
        <div style="background:rgba(139,47,201,0.08);border:1px solid #8b2fc9;border-radius:6px;padding:5px 10px;
            font-size:0.75em;color:#6c3483;font-weight:700;margin-bottom:8px;text-align:center;">
            ⚡ Fusión con ${proy.compañero} (×${proy.rendimiento > 100 ? '1.5' : '1'})
        </div>` : '';

    return `
    <div style="display:flex;flex-direction:column;gap:0;">
        <div style="border-radius:8px;overflow:hidden;background:#f8f9fa;margin-bottom:12px;max-height:320px;">
            <img src="${profileUrl}" onerror="this.src='${iconUrl}';this.onerror=()=>this.src='${noImg}'"
                style="width:100%;display:block;object-fit:cover;object-position:top;">
        </div>
        ${fusionBanner}
        <div style="text-align:center;font-family:'Cinzel',serif;font-size:1em;font-weight:800;
            color:${tierData.color};letter-spacing:1px;margin-bottom:10px;">${tierData.label}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
            <div style="background:#fef9f0;border:1px solid #f39c12;border-radius:6px;padding:6px;text-align:center;">
                <div style="font-size:0.65em;color:#888;text-transform:uppercase;letter-spacing:.5px;">POT</div>
                <div style="font-size:1em;font-weight:800;color:#d68910;">${_fmtDChain(potBase, pot, potDeltas)}</div>
            </div>
            <div style="background:#f0f8fe;border:1px solid #2980b9;border-radius:6px;padding:6px;text-align:center;">
                <div style="font-size:0.65em;color:#888;text-transform:uppercase;letter-spacing:.5px;">AGI</div>
                <div style="font-size:1em;font-weight:800;color:#2980b9;">${_fmtDChain(agiBase, agi, agiDeltas)}</div>
            </div>
            <div style="border:1px solid #27ae60;border-radius:6px;overflow:hidden;text-align:center;display:flex;flex-direction:column;">
                <!-- Zona superior: CTL USADO -->
                <div style="background:${ctlExcedido?'#fde8e8':'#c8f5dc'};padding:5px 2px 3px;display:flex;flex-direction:column;align-items:center;border-bottom:1px solid #27ae6055;">
                    <div style="font-size:0.55em;color:${ctlExcedido?'#c0392b':'#1a6b3a'};text-transform:uppercase;letter-spacing:.5px;margin-bottom:1px;">🛡 usado</div>
                    <div style="font-size:1em;font-weight:800;color:${ctlExcedido?'#c0392b':'#1a6b3a'};">${_fmtDChain(ctlUsadoBase, ctlUsado, ctlUsadoDeltas)}</div>
                </div>
                <!-- Zona inferior: CTL TOTAL -->
                <div style="background:#f0fff4;padding:4px 2px 5px;display:flex;flex-direction:column;align-items:center;">
                    <div style="font-size:0.55em;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:1px;">CTL total</div>
                    <div style="font-size:1em;font-weight:800;color:#27ae60;">${_fmtDChain(ctlBase, ctl, ctlDeltas)}</div>
                </div>
            </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;font-size:0.82em;border-top:1px solid var(--gray-200);padding-top:8px;">
            <div style="display:flex;justify-content:space-between;"><span>PAC</span><b>${pac}</b></div>
            <div style="display:flex;justify-content:space-between;">
                <span>PV</span>
                <b>${_fmtDChain(pvActBase, pvActual, [1,2,3,4,5].map(n=>g['delta_pv_actual_'+n]))} / ${_fmtDChain(pvMaxPuro, pvMax, [1,2,3,4,5].map(n=>g['delta_pv_'+n]))}</b>
            </div>
            <div style="display:flex;justify-content:space-between;">
                <span>Cambios/t</span>
                <b>${_fmtDChain(Math.floor(agi/4), cambios, [1,2,3,4,5].map(n=>g['delta_cambios_'+n]))}</b>
            </div>
            <div style="display:flex;justify-content:space-between;border-top:1px solid #f0f0f0;padding-top:5px;margin-top:2px;">
                <span>PT totales</span><b style="color:var(--green);">${total}</b>
            </div>
            <div style="display:flex;justify-content:space-between;">
                <span>Tags ≥50 PT</span><b style="color:var(--orange);">${listos}</b>
            </div>
            <div style="display:flex;justify-content:space-between;">
                <span>Tags totales</span><b>${(proy?.tags || g.tags||[]).length}</b>
            </div>
        </div>
    </div>`;
}

function _cercaDeCanje() {
    const lista = tagsCercaDeCanje().slice(0,8);
    if (!lista.length) return `<div class="empty-state" style="padding:12px;"><p>Nadie cerca aún.</p></div>`;
    return lista.map(({pj,tag,pts}) => {
        let colorTxt = pts >= 100 ? '#3498db' : pts >= 75 ? '#1abc9c' : '#2ecc71';
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--gray-100);font-size:0.82em;">
            <div><span style="font-weight:600;">${pj}</span>
                <span class="tag-pill" style="margin-left:5px;cursor:pointer;" onclick="window._tagsVerDetalle('${tag.replace(/'/g,"\\'")}')">
                    ${tag}
                </span>
            </div>
            <span style="font-weight:700;color:${colorTxt};">${pts} PT</span>
        </div>`;
    }).join('');
}

// ── Tag Detalle (modal) ───────────────────────────────────────
export function renderTagDetalle(tagNombre) {
    const tag    = tagNombre.startsWith('#') ? tagNombre : '#' + tagNombre;
    const tagKey = tag.slice(1);
    const catEntry  = catalogoTags.find(t => (t.nombre.startsWith('#') ? t.nombre.slice(1) : t.nombre).toLowerCase() === tagKey.toLowerCase());
    const baneado   = catEntry?.baneado || false;
    const desc      = catEntry?.descripcion || '';
    const medallas  = medallasDe(tag);
    const personajes = grupos.filter(g =>
        (g.tags||[]).some(t => (t.startsWith('#')?t:'#'+t).toLowerCase() === tag.toLowerCase())
    );

    // Resetear filtros al abrir el modal (por defecto: Activo / Todos)
    window._detalleFilEst = '#activo';
    window._detalleFilRol = 'todos';

    const el = document.getElementById('tag-detalle-modal');
    if (!el) return;

    const adminDescForm = tagsState.esAdmin ? `
        ${desc ? `<div style="font-size:0.9em;color:var(--gray-700);line-height:1.6;padding:10px 12px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius);margin-bottom:10px;">${renderMarkup(desc)}</div>` : ''}
        <div style="display:flex;gap:12px;margin-bottom:8px;align-items:center;">
            <div style="flex:1;">
                <label style="font-size:0.75em;font-weight:700;color:var(--gray-500);display:block;margin-bottom:4px;">Nombre:</label>
                <input id="detalle-nombre-inp" class="inp" value="#${_esc(tagKey)}" style="font-weight:bold;color:var(--blue);width:100%;font-size:0.85em;" disabled>
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
        `${desc ? `<div style="font-size:0.9em;color:var(--gray-700);line-height:1.6;">${renderMarkup(desc)}</div>`
                : `<p style="font-size:0.85em;color:var(--gray-400);font-style:italic;">Sin descripción aún.</p>`}`;

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
                onclick="window.open('../medallas/index.html?medalla=${encodeURIComponent(m.nombre)}','_blank')">
            <div style="font-weight:700;color:var(--blue);font-size:0.85em;margin-bottom:3px;">🏅 ${_esc(m.nombre)}</div>
            ${m.costo_ctl?`<div style="font-size:0.72em;color:var(--gray-500);margin-bottom:3px;">${m.costo_ctl} CTL</div>`:''}
            ${otrosTags?`<div style="margin-bottom:4px;">${otrosTags}</div>`:''}
            ${m.efecto_desc?`<div style="font-size:0.78em;color:var(--gray-700);line-height:1.4;margin-bottom:3px;">${renderMarkup(m.efecto_desc)}</div>`:''}
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
                    const tl2 = (g.tags||[]).map(t => (t.startsWith('#')?t:'#'+t).toLowerCase());
                    const dRol2 = tl2.includes('#jugador') ? '#jugador' : tl2.includes('#npc') ? '#npc' : '';
                    const dEst2 = tl2.includes('#activo') ? '#activo' : tl2.includes('#inactivo') ? '#inactivo' : '';
                    return '<div class="char-thumb" id="assign-'+g.id+'" data-rol="'+dRol2+'" data-est="'+dEst2+'" style="cursor:pointer;opacity:0.65;"'+
                        ' onclick="window._tagsAsignarClick(\''+g.id+'\',\''+safeN+'\',\''+safeT+'\',this)">'+
                        '<img src="'+img2+'" onerror="this.onerror=null;this.src=\''+fb()+'\';"><span>'+g.nombre_refinado+'</span></div>';
                }).join('')}
            </div>` : `<div style="font-size:0.82em;color:var(--green-dark);">✅ Todos tienen este tag.</div>`}
        </div>` : '';

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
                        <div style="font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500);margin-bottom:8px;">
                            Tienen este tag (<span id="detalle-tienen-count">${personajes.length}</span>)
                        </div>
                        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;">
                            <button data-detalle-fil-est="#activo"  class="btn btn-sm btn-green"   style="padding:4px 10px;font-size:0.78em;" onclick="window._tagsDetalleFilEst('#activo')">Activo</button>
                            <button data-detalle-fil-est="#inactivo" class="btn btn-sm btn-outline" style="padding:4px 10px;font-size:0.78em;" onclick="window._tagsDetalleFilEst('#inactivo')">Inactivo</button>
                            <button data-detalle-fil-est="todos"     class="btn btn-sm btn-outline" style="padding:4px 10px;font-size:0.78em;" onclick="window._tagsDetalleFilEst('todos')">Todos</button>
                            <span style="width:1px;background:var(--gray-200);margin:0 3px;display:inline-block;"></span>
                            <button data-detalle-fil-rol="todos"    class="btn btn-sm btn-green"   style="padding:4px 10px;font-size:0.78em;" onclick="window._tagsDetalleFilRol('todos')">Todos</button>
                            <button data-detalle-fil-rol="#jugador" class="btn btn-sm btn-outline" style="padding:4px 10px;font-size:0.78em;" onclick="window._tagsDetalleFilRol('#jugador')">Jugador</button>
                            <button data-detalle-fil-rol="#npc"     class="btn btn-sm btn-outline" style="padding:4px 10px;font-size:0.78em;" onclick="window._tagsDetalleFilRol('#npc')">NPC</button>
                        </div>
                        <div id="detalle-tienen-grid" style="display:flex;flex-wrap:wrap;gap:8px;max-height:160px;overflow-y:auto;padding:2px;">
                            ${personajes.map(g => {
                                const img = STORAGE_URL+'/imgpersonajes/'+norm(g.nombre_refinado)+'icon.png';
                                const safeN = g.nombre_refinado.replace(/'/g,"\\'");
                                const safeT = tag.replace(/'/g,"\\'");
                                const tl = (g.tags||[]).map(t => (t.startsWith('#')?t:'#'+t).toLowerCase());
                                const dRol = tl.includes('#jugador') ? '#jugador' : tl.includes('#npc') ? '#npc' : '';
                                const dEst = tl.includes('#activo') ? '#activo' : tl.includes('#inactivo') ? '#inactivo' : '';
                                
                                const btnQuitar = tagsState.esAdmin 
                                    ? '<b onclick="event.stopPropagation();window._tagsQuitarDesdeDetalle(\''+g.id+'\',\''+safeN+'\',\''+safeT+'\')" style="color:var(--red);margin-left:6px;font-size:1.2em;line-height:0.8;padding:0 2px;" title="Quitar tag">×</b>' 
                                    : '';
                                    
                                return '<div class="char-thumb" data-rol="'+dRol+'" data-est="'+dEst+'" style="cursor:pointer;" onclick="window._tagsIrAFichas(\''+safeT+'\');window._tagsCloseDetalle();">'+
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

    if (tagsState.esAdmin) {
        setTimeout(() => {
            const ta = document.getElementById('detalle-desc-inp');
            if (ta && window._initMarkupTA) window._initMarkupTA(ta);
        }, 60);
    }

    window._tagsModoMultiActivo = false;
    window._tagsModoMultiSel    = new Set();

    // Aplicar el filtro inicial (Activo / Todos) justo después de renderizar
    setTimeout(() => window._tagsDetalleAplicarFiltros(), 0);
}

window._tagsDetalleAplicarFiltros = () => {
    const rol = window._detalleFilRol || 'todos';
    const est = window._detalleFilEst || 'todos';

    // Filtrar grids
    ['detalle-tienen-grid', 'sinTag-grid'].forEach(gridId => {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        let visible = 0;
        grid.querySelectorAll('.char-thumb').forEach(el => {
            const elRol = el.dataset.rol || '';
            const elEst = el.dataset.est || '';
            const rolOk = rol === 'todos' || elRol === rol;
            const estOk = est === 'todos' || elEst === est;
            const show  = rolOk && estOk;
            el.style.display = show ? '' : 'none';
            if (show && gridId === 'detalle-tienen-grid') visible++;
        });
        if (gridId === 'detalle-tienen-grid') {
            const countEl = document.getElementById('detalle-tienen-count');
            if (countEl) countEl.textContent = visible;
        }
    });

    // Actualizar estilos de botones Estado
    document.querySelectorAll('[data-detalle-fil-est]').forEach(btn => {
        const active = btn.dataset.detalleFilEst === (window._detalleFilEst || 'todos');
        btn.className = 'btn btn-sm ' + (active ? 'btn-green' : 'btn-outline');
        btn.style.cssText = 'padding:4px 10px;font-size:0.78em;';
    });

    // Actualizar estilos de botones Rol
    document.querySelectorAll('[data-detalle-fil-rol]').forEach(btn => {
        const active = btn.dataset.detalleFilRol === (window._detalleFilRol || 'todos');
        btn.className = 'btn btn-sm ' + (active ? 'btn-green' : 'btn-outline');
        btn.style.cssText = 'padding:4px 10px;font-size:0.78em;';
    });
};

window._tagsDetalleFilEst = (v) => { window._detalleFilEst = v; window._tagsDetalleAplicarFiltros(); };
window._tagsDetalleFilRol = (v) => { window._detalleFilRol = v; window._tagsDetalleAplicarFiltros(); };

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
    catalogoTags.forEach(ct => {
        const k = '#' + (ct.nombre.startsWith('#') ? ct.nombre.slice(1) : ct.nombre);
        if (!tagMapa[k]) tagMapa[k] = { count: 0 };
    });

    let entradas = Object.entries(tagMapa)
        .map(([tag, info]) => {
            const tagKey = tag.startsWith('#') ? tag.slice(1) : tag;
            const catEntry = catalogoTags.find(t => {
                const n = t.nombre.startsWith('#') ? t.nombre.slice(1) : t.nombre;
                return n.toLowerCase() === tagKey.toLowerCase();
            });
            return {
                tag, count: info.count,
                desc: catEntry?.descripcion || '',
                medallas: medallasDe(tag),
                baneado: catEntry?.baneado || false,
            };
        })
        .filter(e => !e.baneado)
        .sort((a,b) => b.count-a.count || a.tag.localeCompare(b.tag));

    if (tagsState.busquedaCat) {
        const q = tagsState.busquedaCat.toLowerCase();
        entradas = entradas.filter(e => e.tag.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q));
    }

    const multiToolbar = tagsState.esAdmin ? `
        <div id="cat-multi-toolbar" style="display:none;background:var(--green-pale);border:1.5px solid var(--green);
            border-radius:var(--radius);padding:10px 14px;margin-bottom:12px;align-items:center;gap:10px;flex-wrap:wrap;
            position:sticky;top:130px;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,0.10);">
            <span id="cat-multi-count" style="font-weight:700;font-size:0.88em;color:var(--green-dark);">0 seleccionados</span>
            <div style="display:flex;gap:6px;align-items:center;">
            </div>
            <button class="btn btn-sm" style="background:#6c3483;color:white;border-color:#6c3483;"
                onclick="window._catCombinarTags()">🔀 Combinar</button>
            <button class="btn btn-sm" style="background:linear-gradient(135deg,#1a1a2e,#6c3483);color:white;border-color:#6c3483;"
                onclick="window._tagsAI.open([...window._catMultiSel])">✨ IA — Descripciones</button>
            <button class="btn btn-red btn-sm" onclick="window._catEliminarSeleccionados()">🗑️ Eliminar</button>
            <button class="btn btn-outline btn-sm" onclick="window._catCancelMulti()">✕ Cancelar</button>
        </div>` : '';

    const cards = entradas.map(({ tag, count, desc, medallas }) => {
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
        <div data-cat-card="${_esc(tag)}" data-cat-desc="${_esc(desc)}"
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
            <div style="font-weight:700;color:var(--blue);font-size:0.88em;margin-bottom:4px;">${tag}</div>
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:${desc?'6px':'0'};">
                <span style="font-size:0.7em;color:var(--gray-500);">${count} personaje${count!==1?'s':''}</span>
                ${medallas.length ? `<span style="font-size:0.7em;">· 🏅${medallas.length}</span>` : ''}
            </div>
            ${desc
                ? `<div style="font-size:0.75em;color:var(--gray-700);line-height:1.5;border-top:1px solid var(--gray-100);padding-top:5px;margin-top:2px;">${renderMarkup(desc)}</div>`
                : `<div style="font-size:0.72em;color:var(--gray-400);font-style:italic;">Sin descripción.</div>`
            }
        </div>`;
    }).join('');

        wrap.innerHTML = `
        <div style="display:flex;gap:12px;margin-bottom:12px;align-items:center;flex-wrap:wrap;">
            <input class="inp" id="cat-search" placeholder="🔍 Buscar tag o descripción…"
                value="${_esc(tagsState.busquedaCat)}"
                oninput="window._catFiltrarInPlace(this.value)"
                style="max-width:360px;">
            
            <button class="btn btn-outline btn-sm" onclick="window._tagsCopiarTextoTags()">📋 Copiar lista</button>

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

    if (window._catMultiActivo) {
        requestAnimationFrame(() => {
            const toolbar = document.getElementById('cat-multi-toolbar');
            if (toolbar) toolbar.style.display = 'flex';
            document.querySelectorAll('.cat-card-check').forEach(el => el.style.display = 'block');
            document.querySelectorAll('.cat-card-actions').forEach(el => el.style.display = 'none');
            const btn = document.getElementById('btn-cat-multi');
            if (btn) btn.style.display = 'none';
            window._catMultiSel.forEach(t => {
                const cb = document.querySelector(`[data-cat-card="${_esc(t)}"] .cat-card-check input`);
                if (cb) cb.checked = true;
            });
            _catUpdateCount();
        });
    }
}

window._catNuevoTag = () => {
    const container = document.getElementById('cat-inline-modal');
    if (!container) return;

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
                    <div>
                        <label style="font-size:0.78em;font-weight:700;color:var(--gray-700);display:block;margin-bottom:4px;">Nombre del tag *</label>
                        <input id="nt-nombre" class="inp" placeholder="#NuevoTag" autocomplete="off" style="width:100%;"
                            onkeydown="if(event.key==='Enter')document.getElementById('nt-desc').focus()">
                        <div style="font-size:0.72em;color:var(--gray-400);margin-top:2px;">El # se añade automáticamente.</div>
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

    setTimeout(() => {
        const grid = document.getElementById('nt-pj-grid');
        if (!grid) return;
        const ntDesc = document.getElementById('nt-desc');
        if (ntDesc && window._initMarkupTA) window._initMarkupTA(ntDesc);
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
    const desc      = document.getElementById('nt-desc')?.value.trim() || '';
    const msgEl     = document.getElementById('nt-msg');

    if (!nombreRaw) { if(msgEl) msgEl.textContent = 'El nombre es obligatorio.'; return; }
    const tagNorm = nombreRaw.startsWith('#') ? nombreRaw : '#' + nombreRaw;
    const tagKey  = tagNorm.slice(1);

    if(msgEl) msgEl.textContent = '⏳ Creando…';

    const { guardarDescripcionTag } = await import('./tags-data.js');
    const { supabase } = await import('../bnh-auth.js');

    const res = await guardarDescripcionTag(tagKey, desc);
    if (!res.ok) { if(msgEl) msgEl.textContent = '❌ ' + res.msg; return; }

    const selDivs = document.querySelectorAll('#nt-pj-grid [data-sel="1"]');
    let asignados = 0;
    for (const div of selDivs) {
        const id     = div.dataset.id;
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

window._catEditarInline = (tagKey) => {
    const tag      = '#' + tagKey;
    const catEntry = catalogoTags.find(t => (t.nombre.startsWith('#') ? t.nombre.slice(1) : t.nombre).toLowerCase() === tagKey.toLowerCase());
    const desc     = catEntry?.descripcion || '';
    const container = document.getElementById('cat-inline-modal');
    if (!container) return;

    container.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:2000;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;"
            onclick="if(event.target===this)document.getElementById('cat-inline-modal').innerHTML=''">
            <div style="background:white;border-radius:var(--radius-lg);max-width:500px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.2);overflow:hidden;">
                <div style="background:var(--green-dark);color:white;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">
                    <b style="font-family:'Cinzel',serif;">Editar ${tag}</b>
                    <button onclick="document.getElementById('cat-inline-modal').innerHTML=''"
                        style="background:rgba(255,255,255,0.2);border:none;color:white;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:1.1em;line-height:1;">×</button>
                </div>
                <div style="padding:16px;display:flex;flex-direction:column;gap:10px;">
                    <div>
                        <label style="font-size:0.78em;font-weight:700;color:var(--gray-600);display:block;margin-bottom:4px;">Nombre:</label>
                        <input id="ci-nombre" class="inp" value="#${_esc(tagKey)}" style="font-weight:bold;color:var(--blue);width:100%;">
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

    setTimeout(() => {
        const ta = document.getElementById('ci-desc');
        if (ta && window._initMarkupTA) window._initMarkupTA(ta);
    }, 60);
};

window._catGuardarInline = async (tagKey) => {
    const desc     = document.getElementById('ci-desc')?.value.trim() || '';
    const nuevoNom = document.getElementById('ci-nombre')?.value.trim() || '';
    const msgEl    = document.getElementById('ci-msg');
    
    if (msgEl) msgEl.textContent = '⏳ Guardando…';

    const { guardarDescripcionTag, renameTag } = await import('./tags-data.js');

    let actualKey = tagKey;
    if (nuevoNom && nuevoNom !== '#' + tagKey && nuevoNom !== tagKey) {
        const resRename = await renameTag('#' + tagKey, nuevoNom);
        if (!resRename.ok) {
            if (msgEl) msgEl.textContent = '❌ Error al renombrar: ' + resRename.msg;
            return;
        }
        actualKey = nuevoNom.startsWith('#') ? nuevoNom.slice(1) : nuevoNom;
    }

    const res = await guardarDescripcionTag(actualKey, desc);
    
    if (res.ok) {
        document.getElementById('cat-inline-modal').innerHTML = '';
        toast('✅ Tag actualizado', 'ok');
        await _recargarCatalogo();
    } else {
        if (msgEl) msgEl.textContent = '❌ ' + res.msg;
    }
};

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
};

window._catToggleCheck = (tag, checked) => {
    if (checked) window._catMultiSel.add(tag);
    else         window._catMultiSel.delete(tag);
    _catUpdateCount();
};

window._catEliminarSeleccionados = async () => {
    const count = window._catMultiSel.size;
    if (!count) { toast('⚠️ Nada seleccionado', 'info'); return; }
    if (!confirm(`¿Eliminar ${count} tag${count!==1?'s':''} seleccionado${count!==1?'s':''}?\nSe quitarán de todos los personajes. Esta acción no se puede deshacer.`)) return;
    const borrarPuntos = confirm(`¿Borrar también los PT acumulados de estos ${count} tags?\n\nAceptar = borra PT y historial. Cancelar = conserva PT huérfanos.`);
    const { deleteTag } = await import('./tags-data.js');
    const tags = [...window._catMultiSel];
    toast('⏳ Eliminando…', 'ok');
    const resultados = await Promise.all(tags.map(tag => deleteTag(tag, borrarPuntos)));
    const fallidos = resultados.filter(r => !r.ok);
    if (fallidos.length) {
        toast(`⚠️ ${count - fallidos.length} eliminados, ${fallidos.length} fallaron`, 'error');
    } else {
        toast(`🗑️ ${count} tag${count!==1?'s':''} eliminado${count!==1?'s':''}`, 'ok');
    }
    window._catMultiActivo = false;
    window._catMultiSel    = new Set();
    await _recargarCatalogo();
};

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
                        <input id="comb-nombre" class="inp" style="margin-top:4px;width:100%;"
                            placeholder="#NuevoTag" autocomplete="off"
                            onkeydown="if(event.key==='Enter')window._catEjecutarCombinar()">
                        <div style="font-size:0.72em;color:var(--gray-500);margin-top:3px;">El # se añade automáticamente si no lo escribes.</div>
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
    window._catCombinarOrigen = tagsOrigen;
};

window._catEjecutarCombinar = async () => {
    const tagsOrigen = window._catCombinarOrigen || [];
    if (!tagsOrigen.length) return;

    const nombreRaw = document.getElementById('comb-nombre')?.value.trim();
    if (!nombreRaw) { const m=document.getElementById('comb-msg'); if(m) m.textContent='El nombre es obligatorio.'; return; }
    const nuevoTag  = nombreRaw.startsWith('#') ? nombreRaw : '#' + nombreRaw;

    const msgEl = document.getElementById('comb-msg');
    if (msgEl) msgEl.textContent = '⏳ Procesando…';

    const { supabase } = await import('../bnh-auth.js');

    try {
        const { data: pjs } = await supabase.from('personajes_refinados').select('id, nombre_refinado, tags');

        for (const pj of (pjs || [])) {
            const tagsActuales = (pj.tags || []).map(t => (t.startsWith('#') ? t : '#' + t));
            const tieneAlguno = tagsOrigen.some(to => tagsActuales.some(ta => ta.toLowerCase() === to.toLowerCase()));
            if (!tieneAlguno) continue;

            const nuevosTags = [
                ...tagsActuales.filter(ta => !tagsOrigen.some(to => to.toLowerCase() === ta.toLowerCase())),
                nuevoTag,
            ].filter((v, i, a) => a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i);

            await supabase.from('personajes_refinados').update({ tags: nuevosTags }).eq('id', pj.id);

            let ptTotal = 0;
            for (const tagOrigen of tagsOrigen) {
                const { data: ptRow } = await supabase.from('puntos_tag')
                    .select('cantidad').eq('personaje_nombre', pj.nombre_refinado)
                    .ilike('tag', tagOrigen).maybeSingle();
                ptTotal += ptRow?.cantidad || 0;
            }

            if (ptTotal > 0) {
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

        // Crear el nuevo tag en el catálogo
        await supabase.from('tags_catalogo').upsert(
            { nombre: nuevoTag, descripcion: '' },
            { onConflict: 'nombre' }
        );

        for (const tagOrigen of tagsOrigen) {
            await supabase.from('puntos_tag').delete().ilike('tag', tagOrigen);
            await supabase.from('log_puntos_tag').delete().ilike('tag', tagOrigen);
            const keyConHash  = tagOrigen.startsWith('#') ? tagOrigen : '#' + tagOrigen;
            const keySinHash  = tagOrigen.startsWith('#') ? tagOrigen.slice(1) : tagOrigen;
            await supabase.from('tags_catalogo').delete().eq('nombre', keyConHash);
            await supabase.from('tags_catalogo').delete().eq('nombre', keySinHash);
        }

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
        // Normalizar: el catalogo puede guardar el nombre con '#' o sin '#'
        const cat = catalogoTags.find(c => {
            const cn = c.nombre.startsWith('#') ? c.nombre.slice(1) : c.nombre;
            return cn.toLowerCase() === nombre.toLowerCase();
        });
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

window._tagsCopiarTextoTags = () => {
    const tagConteo = {};
    
    // 1. Inicializar TODOS los tags del catálogo en 0
    catalogoTags.forEach(ct => {
        const nombreLimpio = ct.nombre.startsWith('#') ? ct.nombre.slice(1) : ct.nombre;
        tagConteo[nombreLimpio] = 0;
    });

    // 2. Sumar los tags que están equipados en los personajes
    grupos.forEach(g => {
        (g.tags || []).forEach(t => {
            const k = t.startsWith('#') ? t.slice(1) : t;
            // Lo sumamos (por si acaso un personaje tiene un tag que no está en el catálogo)
            tagConteo[k] = (tagConteo[k] || 0) + 1;
        });
    });

    // 3. Ordenar: Primero por cantidad (mayor a menor), luego alfabéticamente
    const texto = Object.entries(tagConteo)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) 
        .map(([nombre, conteo]) => `${nombre} (${conteo})`)
        .join('\n');

    navigator.clipboard.writeText(texto).then(() => {
        toast('✅ Lista de tags copiada');
    }).catch(() => {
        toast('❌ Error al copiar', 'error');
    });
};

export function toast(msg, tipo='ok') {
    const el = document.getElementById('toast-msg');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast-' + tipo;
    setTimeout(() => { el.className = ''; }, 3000);
}
