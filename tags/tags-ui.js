// ============================================================
// tags/tags-ui.js — Renderizado de los 3 tabs
// ============================================================
import { tagsState, grupos, puntosAll, catalogoTags, medallasCat, STORAGE_URL, norm } from './tags-state.js';
import { getTagsConPuntos, estadoUmbral, tagsMasComunes, tagsCercaDeCanje, medallasDe, descDe, UMBRAL_MAX, rankingPorPT } from './tags-logic.js';
import { guardarDescripcionTag, canjearPT } from './tags-data.js';
import { renderMarkup } from '../bnh-markup.js';

// ── Tab Progresión ────────────────────────────────────────────
export function renderProgresion() {
    const wrap = document.getElementById('vista-progresion');
    if (!wrap) return;

    const pj = tagsState.pjSeleccionado;
    const tagsConPts = pj ? getTagsConPuntos(pj) : [];
    const fallback = `${STORAGE_URL}/imginterfaz/no_encontrado.png`;

    // Selector de personaje
    const charHtml = grupos
        .filter(g => {
            // mostrar solo jugadores activos en la barra superior si hay muchos
            return true;
        })
        .map(g => {
            const img = `${STORAGE_URL}/imgpersonajes/${norm(g.nombre_refinado)}icon.png`;
            const activo = tagsState.pjSeleccionado === g.nombre_refinado;
            return `<div class="char-thumb ${activo?'active':''}" onclick="window._tagsSelPJ('${g.nombre_refinado.replace(/'/g,"\\'")}')">
                <img src="${img}" onerror="this.onerror=null;this.src='${fallback}';">
                <span>${g.nombre_refinado}</span>
            </div>`;
        }).join('');

    // Barras de progresión del PJ seleccionado
    let barrasHtml = '';
    if (!pj) {
        barrasHtml = `<div class="empty-state"><h3>Selecciona un personaje</h3><p>Click en uno de arriba para ver su progresión de tags.</p></div>`;
    } else if (!tagsConPts.length) {
        barrasHtml = `<div class="empty-state"><h3>Sin tags</h3><p>${pj} no tiene tags asignados.</p></div>`;
    } else {
        barrasHtml = tagsConPts.map(({ tag, pts }) => {
            const pct   = Math.min((pts / UMBRAL_MAX) * 100, 100);
            const color = pts >= 75 ? 'prog-red' : pts >= 50 ? 'prog-orange' : 'prog-green';
            const { clase, texto } = estadoUmbral(pts);

            // Botones de canje (solo OP)
            let canjeHtml = '';
            if (tagsState.esAdmin && pts > 0) {
                canjeHtml = `<div class="thresh-badges" style="margin-top:8px;">`;
                if (pts >= 100) {
                    canjeHtml += `<button class="thresh done btn btn-sm" style="cursor:pointer;" onclick="window._tagsCanjear('${pj.replace(/'/g,"\\'")}','${tag}','tres_tags')">−100 → 🎁 3 tags nuevos</button>`;
                }
                if (pts >= 75) {
                    canjeHtml += `<button class="thresh done btn btn-sm" style="cursor:pointer;margin-left:4px;" onclick="window._tagsCanjear('${pj.replace(/'/g,"\\'")}','${tag}','medalla')">−75 → 🏅 Medalla</button>`;
                }
                if (pts >= 50) {
                    canjeHtml += `
                        <button class="thresh done btn btn-sm" style="cursor:pointer;" onclick="window._tagsCanjear('${pj.replace(/'/g,"\\'")}','${tag}','stat_pot')">−50 → +POT</button>
                        <button class="thresh done btn btn-sm" style="cursor:pointer;" onclick="window._tagsCanjear('${pj.replace(/'/g,"\\'")}','${tag}','stat_agi')">−50 → +AGI</button>
                        <button class="thresh done btn btn-sm" style="cursor:pointer;" onclick="window._tagsCanjear('${pj.replace(/'/g,"\\'")}','${tag}','stat_ctl')">−50 → +CTL</button>`;
                }
                canjeHtml += `</div>`;
            } else if (!tagsState.esAdmin) {
                // Jugador: solo info de umbrales
                canjeHtml = `<div class="thresh-badges">`;
                [[50,'🗡 +stat'],[75,'🏅 medalla'],[100,'🎁 3 tags']].forEach(([thr, lbl]) => {
                    const cl = pts >= thr ? 'done' : pts >= thr * 0.7 ? 'close' : 'far';
                    canjeHtml += `<span class="thresh ${cl}">${thr}pt → ${lbl}</span>`;
                });
                canjeHtml += `</div>`;
            }

            return `<div class="prog-wrap">
                <div class="prog-label">
                    <span class="tag-name">${tag}</span>
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
                    <div class="char-grid">${charHtml}</div>
                </div>
                ${pj ? `
                <div class="card">
                    <div class="card-title">Progresión de Tags — ${pj}</div>
                    ${barrasHtml}
                </div>` : barrasHtml}
            </div>

            <div style="display:flex;flex-direction:column;gap:14px;position:sticky;top:80px;">
                ${pj ? `
                <div class="card">
                    <div class="card-title">Resumen</div>
                    ${_resumenPJ(pj)}
                </div>` : ''}
                <div class="card">
                    <div class="card-title">🔥 Cerca de canje</div>
                    ${_cercaDeCanje()}
                </div>
            </div>
        </div>`;
}

function _resumenPJ(pj) {
    const g = grupos.find(x => x.nombre_refinado === pj);
    if (!g) return '';
    const ptsMapa = {};
    puntosAll.filter(p => p.personaje_nombre === pj).forEach(p => { ptsMapa[p.tag] = p.cantidad; });
    const total = Object.values(ptsMapa).reduce((a,b)=>a+b,0);
    const listos = Object.values(ptsMapa).filter(v=>v>=50).length;
    return `
        <div style="display:flex;flex-direction:column;gap:8px;font-size:0.85em;">
            <div style="display:flex;justify-content:space-between;"><span>PT totales</span><b>${total}</b></div>
            <div style="display:flex;justify-content:space-between;"><span>Tags con ≥50 PT</span><b style="color:var(--green);">${listos}</b></div>
            <div style="display:flex;justify-content:space-between;"><span>Tags totales</span><b>${(g.tags||[]).length}</b></div>
            <div style="display:flex;justify-content:space-between;"><span>POT / AGI / CTL</span><b>${g.pot||0} / ${g.agi||0} / ${g.ctl||0}</b></div>
        </div>`;
}

function _cercaDeCanje() {
    const lista = tagsCercaDeCanje().slice(0, 8);
    if (!lista.length) return `<div class="empty-state" style="padding:12px;"><p>Nadie cerca aún.</p></div>`;
    return lista.map(({ pj, tag, pts }) =>
        `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--gray-100);font-size:0.82em;">
            <div>
                <span style="font-weight:600;">${pj}</span>
                <span class="tag-pill" style="margin-left:6px;">${tag}</span>
            </div>
            <span style="font-weight:700;color:${pts>=100?'var(--red)':pts>=75?'var(--orange)':'var(--green)'};">${pts}</span>
        </div>`
    ).join('');
}

// ── Tab Catálogo ──────────────────────────────────────────────
export function renderCatalogo() {
    const wrap = document.getElementById('vista-catalogo');
    if (!wrap) return;

    // Construir mapa: tag → { count, medallas, desc }
    const tagMapa = {};
    grupos.forEach(g => (g.tags||[]).forEach(t => {
        const k = t.startsWith('#') ? t : '#'+t;
        if (!tagMapa[k]) tagMapa[k] = { count: 0 };
        tagMapa[k].count++;
    }));

    let entradas = Object.entries(tagMapa)
        .map(([tag, info]) => ({
            tag,
            count: info.count,
            desc: descDe(tag),
            medallas: medallasDe(tag),
        }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

    if (tagsState.busquedaCat) {
        const q = tagsState.busquedaCat.toLowerCase();
        entradas = entradas.filter(e => e.tag.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q));
    }

    const filas = entradas.map(({ tag, count, desc, medallas }) => {
        const medallaHtml = medallas.length
            ? medallas.map(m => `<span class="tag-pill" style="color:var(--blue);">🏅${m.nombre}</span>`).join('')
            : '';

        const descInput = tagsState.esAdmin
            ? `<div style="display:flex;gap:6px;margin-top:4px;">
                <input class="inp" style="font-size:0.82em;padding:5px 8px;" id="desc-${tag.replace('#','')}"
                    value="${_esc(desc)}" placeholder="Descripción del tag…">
                <button class="btn btn-sm btn-green" onclick="window._tagsGuardarDesc('${tag.replace(/'/g,"\\'")}')">💾</button>
               </div>`
            : (desc ? `<div class="tag-cat-desc">${renderMarkup(desc)}</div>` : '');

        return `<div class="tag-cat-item">
            <div class="tag-cat-head">
                <span class="tag-cat-name" onclick="window._tagsIrAFichas('${tag.replace(/'/g,"\\'")}')">
                    ${tag}
                </span>
                <span class="tag-cat-count">${count} personaje${count!==1?'s':''}</span>
            </div>
            ${descInput}
            ${medallaHtml ? `<div class="tag-cat-medals" style="margin-top:6px;">${medallaHtml}</div>` : ''}
        </div>`;
    }).join('');

    wrap.innerHTML = `
        <div style="display:flex;gap:12px;margin-bottom:16px;align-items:center;">
            <input class="inp" id="cat-search" placeholder="🔍 Buscar tag o descripción…"
                value="${_esc(tagsState.busquedaCat)}"
                oninput="window._tagsBuscarCat(this.value)"
                style="max-width:360px;">
            <span style="color:var(--gray-500);font-size:0.85em;">${entradas.length} tags</span>
        </div>
        <div class="card">
            ${filas || `<div class="empty-state"><h3>Sin resultados</h3></div>`}
        </div>`;

    // Keep focus on search input
    setTimeout(() => {
        const el = document.getElementById('cat-search');
        if (el && document.activeElement !== el && tagsState.busquedaCat) el.focus();
    }, 10);
}

// ── Tab Estadísticas ──────────────────────────────────────────
export function renderEstadisticas() {
    const wrap = document.getElementById('vista-estadisticas');
    if (!wrap) return;

    const comunes = tagsMasComunes(20);
    const ranking = rankingPorPT().slice(0, 10);

    const totalPTs   = puntosAll.reduce((a,b)=>a+b.cantidad,0);
    const totalTags  = new Set(grupos.flatMap(g=>g.tags||[])).size;
    const totalPJs   = grupos.length;
    const tagsPorPJ  = totalPJs ? (grupos.reduce((a,g)=>a+(g.tags||[]).length,0)/totalPJs).toFixed(1) : 0;

    const barMax = comunes[0]?.count || 1;

    wrap.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;">
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div class="stats-banner">
                    <div class="stat-box"><div class="num">${totalTags}</div><div class="lbl">Tags únicos</div></div>
                    <div class="stat-box"><div class="num">${totalPTs}</div><div class="lbl">PT totales</div></div>
                    <div class="stat-box"><div class="num">${tagsPorPJ}</div><div class="lbl">Tags / PJ</div></div>
                    <div class="stat-box"><div class="num">${totalPJs}</div><div class="lbl">Personajes</div></div>
                </div>
                <div class="card">
                    <div class="card-title">Tags más comunes</div>
                    ${comunes.map(({ tag, count }) => {
                        const pct = Math.round((count / barMax) * 100);
                        return `<div class="prog-wrap">
                            <div class="prog-label">
                                <span class="tag-name" style="cursor:pointer;" onclick="window._tagsIrAFichas('${tag.replace(/'/g,"\\'")}')">
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
                        const img = `${STORAGE_URL}/imgpersonajes/${norm(nombre)}icon.png`;
                        const fb  = `${STORAGE_URL}/imginterfaz/no_encontrado.png`;
                        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--gray-100);">
                            <span style="font-size:1.1em;width:28px;text-align:center;">${medal}</span>
                            <img src="${img}" onerror="this.onerror=null;this.src='${fb}';"
                                style="width:32px;height:32px;border-radius:50%;object-fit:cover;object-position:top;">
                            <span style="flex:1;font-weight:600;font-size:0.88em;">${nombre}</span>
                            <span style="font-weight:800;color:var(--green-dark);">${total} PT</span>
                        </div>`;
                    }).join('')}
                </div>
                <div class="card">
                    <div class="card-title">⚡ Próximos a canjear (≥75 PT)</div>
                    ${tagsCercaDeCanje().slice(0,10).map(({ pj, tag, pts }) => `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--gray-100);font-size:0.83em;">
                            <div>
                                <span style="font-weight:600;">${pj}</span>
                                <span class="tag-pill" style="margin-left:6px;">${tag}</span>
                            </div>
                            <span style="font-weight:700;color:${pts>=100?'var(--red)':'var(--orange)'};">${pts} PT</span>
                        </div>`).join('') || `<div class="empty-state" style="padding:12px;"><p>Nadie cerca todavía.</p></div>`}
                </div>
            </div>
        </div>`;
}

// ── Helpers ───────────────────────────────────────────────────
function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

export function toast(msg, tipo = 'ok') {
    const el = document.getElementById('toast-msg');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast-' + tipo;
    setTimeout(() => { el.className = ''; }, 3000);
}
