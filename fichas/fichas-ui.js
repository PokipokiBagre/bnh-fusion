// ============================================================
// fichas-ui.js — Catálogo + Vista Detalle (solo lectura)
// ============================================================
import { fichasGlobal, ptGlobal, fichasUI, STORAGE_URL, norm } from './fichas-state.js';
import { calcTier, calcPVMax, calcCambios, totalPT, colorTier, fmtTag } from './fichas-logic.js';
import { estaEnFusion, getFusionDe, renderFusionBadge } from '../bnh-fusion.js';

const $ = id => document.getElementById(id);

// ── Imagen de personaje con fallback ─────────────────────────
function imgPJ(nombre) {
    // Usa el PRIMER nombre si hay comas (grupo nombre)
    const clave = nombre.includes(',') ? nombre.split(',')[0].trim() : nombre;
    return `${STORAGE_URL}/imgpersonajes/${norm(clave)}icon.png`;
}
const fallbackImg = `${STORAGE_URL}/imginterfaz/no_encontrado.png`;
const onErr = `this.onerror=null;this.src='${fallbackImg}'`;

// ── Barra de stat (visual) ────────────────────────────────────
function statBar(actual, max, color) {
    const pct = max > 0 ? Math.min(100, Math.round((actual / max) * 100)) : 0;
    return `<div style="background:#1a1a1a; border-radius:4px; height:6px; overflow:hidden;">
        <div style="width:${pct}%; height:100%; background:${color}; border-radius:4px;"></div>
    </div>`;
}

// ============================================================
// VISTA: CATÁLOGO
// ============================================================
export function renderCatalogo() {
    const cont = $('fichas-contenido');
    if (!cont) return;

    let lista = [...fichasGlobal];
    if (fichasUI.filtroTexto) {
        const q = fichasUI.filtroTexto.toLowerCase();
        lista = lista.filter(p =>
            p.nombre.toLowerCase().includes(q) ||
            (p.tags || []).some(t => t.toLowerCase().includes(q))
        );
    }

    if (!lista.length) {
        cont.innerHTML = `<div class="empty-state">
            <div class="empty-icon">👤</div>
            <h3>${fichasGlobal.length ? 'Sin resultados' : 'No hay personajes registrados'}</h3>
            ${fichasUI.esAdmin ? `<button class="btn btn-green" onclick="window.abrirCrearPersonaje()">+ Crear Personaje</button>` : ''}
        </div>`;
        return;
    }

    let html = `<div class="fichas-grid">`;

    lista.forEach(p => {
        const { tier, tierLabel } = calcTier(p.pot || 0, p.agi || 0, p.ctl || 0);
        const pvMax    = calcPVMax(p.pot || 0, p.agi || 0, p.ctl || 0);
        const pac      = (p.pot || 0) + (p.agi || 0) + (p.ctl || 0);
        const tc       = colorTier(tier);
        const enFusion = estaEnFusion(p.nombre);
        const ptTotal  = totalPT(ptGlobal[p.nombre]);
        const safeNom  = p.nombre.replace(/'/g, "\\'");

        html += `
        <div class="ficha-card" onclick="window.abrirFicha('${safeNom}')"
             style="border-color:${tc.border}; background:${tc.bg};">
            <div style="position:relative;">
                <img src="${imgPJ(p.nombre)}" onerror="${onErr}"
                    style="width:80px; height:80px; border-radius:50%; border:3px solid ${tc.border};
                           object-fit:cover; display:block; margin:0 auto;">
                ${enFusion ? `<div style="position:absolute; bottom:-4px; left:50%; transform:translateX(-50%);">
                    ${renderFusionBadge(p.nombre, STORAGE_URL, norm)}
                </div>` : ''}
            </div>
            <h3 style="color:${tc.text}; margin:10px 0 4px 0; font-size:1em; text-align:center;
                        font-family:'Cinzel',serif; white-space:nowrap; overflow:hidden;
                        text-overflow:ellipsis;">${p.nombre}</h3>
            <div style="text-align:center; margin-bottom:8px;">
                <span style="background:${tc.bg}; border:1px solid ${tc.border}; color:${tc.text};
                              padding:2px 8px; border-radius:10px; font-size:0.7em; font-weight:700;">
                    ${tierLabel} · PAC ${pac}
                </span>
            </div>
            <div style="font-size:0.75em; color:#aaa; margin-bottom:6px;">
                PV ${p.pv_actual ?? pvMax}/${pvMax}
                ${statBar(p.pv_actual ?? pvMax, pvMax, '#ef4444')}
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:3px; margin-bottom:6px; min-height:22px;">
                ${(p.tags || []).slice(0, 4).map(t =>
                    `<span style="background:#111; border:1px solid #333; color:#aaa;
                                  padding:1px 6px; border-radius:8px; font-size:0.65em;">${fmtTag(t)}</span>`
                ).join('')}
                ${(p.tags || []).length > 4 ? `<span style="color:#666; font-size:0.65em;">+${(p.tags||[]).length-4}</span>` : ''}
            </div>
            <div style="font-size:0.7em; color:#555; text-align:right;">
                PT acum: <b style="color:#00b4d8;">${ptTotal}</b>
            </div>
            ${fichasUI.esAdmin ? `
            <button onclick="event.stopPropagation(); window.borrarPersonaje('${safeNom}')"
                style="position:absolute; top:8px; right:8px; background:rgba(239,68,68,0.1);
                       border:1px solid rgba(239,68,68,0.3); color:#ef4444; border-radius:4px;
                       width:26px; height:26px; cursor:pointer; font-size:0.9em; line-height:1;">🗑</button>` : ''}
        </div>`;
    });

    html += `</div>`;
    cont.innerHTML = html;
}

// ============================================================
// VISTA: DETALLE (ficha completa tipo wiki)
// ============================================================
export function renderDetalle(nombre) {
    const cont = $('fichas-contenido');
    if (!cont) return;

    const p = fichasGlobal.find(x => x.nombre === nombre);
    if (!p) { renderCatalogo(); return; }

    const { tier, tierLabel } = calcTier(p.pot || 0, p.agi || 0, p.ctl || 0);
    const pvMax    = calcPVMax(p.pot || 0, p.agi || 0, p.ctl || 0);
    const pac      = (p.pot || 0) + (p.agi || 0) + (p.ctl || 0);
    const cambios  = calcCambios(p.agi || 0);
    const tc       = colorTier(tier);
    const fusion   = getFusionDe(nombre);
    const ptPJ     = ptGlobal[nombre] || {};
    const safeNom  = nombre.replace(/'/g, "\\'");

    // Tags ordenados por PT desc
    const tagsOrdenados = [...(p.tags || [])].sort((a, b) =>
        (ptPJ[b] || 0) - (ptPJ[a] || 0)
    );

    // Sidebar de información (estilo wiki)
    const sidebarRows = [
        ['PAC Total',   `<b style="color:${tc.text}">${pac}</b>`],
        ['Tier',        `<span style="color:${tc.text}; font-weight:700;">${tierLabel}</span>`],
        ['POT',         `${p.pot || 0}`],
        ['AGI',         `${p.agi || 0}`],
        ['CTL',         `${p.ctl || 0}`],
        ['PV',          `${p.pv_actual ?? pvMax} / ${pvMax}`],
        ['Cambios/turno', `${cambios}`],
    ].map(([k, v]) => `
        <tr>
            <td style="padding:5px 10px; color:#888; font-size:0.82em; white-space:nowrap;">${k}</td>
            <td style="padding:5px 10px; font-size:0.82em;">${v}</td>
        </tr>`).join('');

    cont.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 260px; gap:24px; align-items:start; max-width:1100px;">

        <!-- COLUMNA IZQUIERDA: wiki -->
        <div>
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; flex-wrap:wrap;">
                <button onclick="window.volverCatalogo()"
                    style="background:#111; border:1px solid #333; color:#aaa; padding:6px 14px;
                           border-radius:6px; cursor:pointer; font-size:0.85em;">← Volver</button>
                <h1 style="margin:0; font-family:'Cinzel',serif; font-size:2em; color:${tc.text};">${nombre}</h1>
                ${fusion ? renderFusionBadge(nombre, STORAGE_URL, norm) : ''}
                ${fichasUI.esAdmin ? `
                <button onclick="window.abrirPanelOP('${safeNom}')"
                    style="background:#1a0040; border:1px solid #a855f7; color:#c084fc;
                           padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:700;
                           font-size:0.85em; margin-left:auto;">⚙️ PANEL OP</button>` : ''}
            </div>

            <!-- TAGS -->
            <div style="margin-bottom:24px;">
                <h3 style="color:#aaa; font-size:0.85em; text-transform:uppercase; letter-spacing:1px;
                            border-bottom:1px solid #222; padding-bottom:6px; margin-bottom:10px;">Tags del Quirk</h3>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                    ${tagsOrdenados.map(t => {
                        const pts = ptPJ[t] || 0;
                        const color = pts >= 50 ? '#f59e0b' : pts >= 20 ? '#a855f7' : pts >= 5 ? '#00b4d8' : '#555';
                        return `<span style="background:#111; border:1px solid ${color}; color:${color};
                                            padding:4px 10px; border-radius:12px; font-size:0.8em; font-weight:600;">
                                    ${fmtTag(t)} <span style="opacity:0.7; font-size:0.85em;">${pts}pt</span>
                                </span>`;
                    }).join('') || '<span style="color:#444; font-size:0.85em;">Sin tags asignados</span>'}
                </div>
            </div>

            <!-- LORE -->
            ${p.lore ? `
            <div style="margin-bottom:24px;">
                <h2 style="font-family:'Cinzel',serif; font-size:1.3em; color:#ddd;
                            border-bottom:1px solid #222; padding-bottom:8px; margin-bottom:12px;">Historia</h2>
                <div style="color:#bbb; line-height:1.7; font-size:0.92em; white-space:pre-wrap;">${escHTML(p.lore)}</div>
            </div>` : ''}

            <!-- QUIRK -->
            ${p.quirk ? `
            <div style="margin-bottom:24px;">
                <h2 style="font-family:'Cinzel',serif; font-size:1.3em; color:#ddd;
                            border-bottom:1px solid #222; padding-bottom:8px; margin-bottom:12px;">Quirk</h2>
                <div style="color:#bbb; line-height:1.7; font-size:0.92em; white-space:pre-wrap;">${escHTML(p.quirk)}</div>
            </div>` : ''}

            <!-- FUSION INFO si activa -->
            ${fusion ? `
            <div style="background:#1a0040; border:1px solid #a855f7; border-radius:10px;
                        padding:16px; margin-bottom:24px;">
                <h3 style="color:#c084fc; margin:0 0 8px 0; font-family:'Cinzel',serif;">⚡ Fusión Activa</h3>
                <p style="color:#aaa; font-size:0.88em; margin:0 0 6px 0;">
                    Fusionado con: <b style="color:#e9d5ff;">${fusion.pj_a === nombre ? fusion.pj_b : fusion.pj_a}</b>
                </p>
                <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:8px;">
                    ${(fusion.tags_fusionados || []).map(t =>
                        `<span style="background:#2d1b69; border:1px solid #7c3aed; color:#c084fc;
                                      padding:2px 8px; border-radius:8px; font-size:0.75em;">${fmtTag(t)}</span>`
                    ).join('')}
                </div>
                ${fichasUI.esAdmin ? `
                <button onclick="window.terminarFusionUI('${fusion.id}')"
                    style="margin-top:12px; background:#3b0764; border:1px solid #7c3aed; color:#e9d5ff;
                           padding:6px 14px; border-radius:6px; cursor:pointer; font-size:0.82em;">
                    ✕ Terminar Fusión
                </button>` : ''}
            </div>` : ''}

            <!-- PT por tag tabla -->
            ${Object.keys(ptPJ).length ? `
            <div>
                <h2 style="font-family:'Cinzel',serif; font-size:1.3em; color:#ddd;
                            border-bottom:1px solid #222; padding-bottom:8px; margin-bottom:12px;">Progresión (PT)</h2>
                <table style="width:100%; border-collapse:collapse; font-size:0.85em;">
                    <thead>
                        <tr style="color:#666; font-size:0.8em; text-transform:uppercase;">
                            <th style="text-align:left; padding:4px 8px;">Tag</th>
                            <th style="text-align:right; padding:4px 8px;">PT</th>
                            <th style="text-align:right; padding:4px 8px;">Para stat (+1)</th>
                            <th style="text-align:right; padding:4px 8px;">Para medalla</th>
                            <th style="text-align:right; padding:4px 8px;">Para mutación</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.entries(ptPJ).sort((a,b) => b[1]-a[1]).map(([tag, pts]) => `
                        <tr style="border-top:1px solid #1a1a1a;">
                            <td style="padding:5px 8px; color:#00b4d8;">${fmtTag(tag)}</td>
                            <td style="padding:5px 8px; text-align:right; font-weight:700; color:${pts>=50?'#f59e0b':pts>=20?'#a855f7':'#ddd'};">${pts}</td>
                            <td style="padding:5px 8px; text-align:right; color:${pts>=50?'#4ade80':'#555'};">${pts >= 50 ? '✓' : `${50-pts} faltan`}</td>
                            <td style="padding:5px 8px; text-align:right; color:${pts>=75?'#4ade80':'#555'};">${pts >= 75 ? '✓' : `${75-pts} faltan`}</td>
                            <td style="padding:5px 8px; text-align:right; color:${pts>=100?'#4ade80':'#555'};">${pts >= 100 ? '✓' : `${100-pts} faltan`}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>` : ''}
        </div>

        <!-- COLUMNA DERECHA: infobox -->
        <div>
            <div style="background:#0d0d0d; border:1.5px solid ${tc.border}; border-radius:10px; overflow:hidden; position:sticky; top:80px;">
                <!-- Header del infobox -->
                <div style="background:${tc.border}; padding:8px; text-align:center;">
                    <span style="color:#000; font-weight:700; font-size:0.9em; font-family:'Cinzel',serif;">${nombre}</span>
                </div>
                <!-- Imagen principal -->
                <div style="text-align:center; padding:12px 12px 0;">
                    <img src="${imgPJ(nombre)}" onerror="${onErr}"
                        style="width:180px; height:180px; border-radius:8px; border:2px solid ${tc.border};
                               object-fit:cover;">
                </div>
                <!-- Stats -->
                <table style="width:100%; border-collapse:collapse; margin-top:8px;">
                    <tbody style="font-family:sans-serif;">${sidebarRows}</tbody>
                </table>
                <!-- Tags en infobox -->
                <div style="padding:8px 10px 12px;">
                    <div style="color:#666; font-size:0.72em; text-transform:uppercase; margin-bottom:6px;">Tags</div>
                    <div style="display:flex; flex-wrap:wrap; gap:3px;">
                        ${(p.tags || []).map(t =>
                            `<span style="background:#1a1a1a; border:1px solid #333; color:#888;
                                          padding:2px 6px; border-radius:6px; font-size:0.68em;">${fmtTag(t)}</span>`
                        ).join('') || '<span style="color:#444; font-size:0.75em;">—</span>'}
                    </div>
                </div>
            </div>
        </div>

    </div>`;
}

function escHTML(str) {
    return String(str || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
