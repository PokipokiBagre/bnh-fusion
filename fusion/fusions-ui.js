// fusions/
import { fusionsState, personajes, STORAGE_URL, norm } from './fusions-state.js';
import { activarFusion } from '../bnh-fusion.js';

export function renderSelectores() {
    const wrap = document.getElementById('simulador-contenedor');
    if (!wrap) return;

    const options = personajes.map(p => `<option value="${p.nombre}">${p.nombre}</option>`).join('');
    
    const charCard = (id, label) => `
        <div class="card" style="text-align:center;">
            <div class="card-title">${label}</div>
            <img id="img-${id}" src="${STORAGE_URL}/imginterfaz/no_encontrado.png" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid var(--gray-200);margin-bottom:10px;">
            <select id="sel-${id}" class="inp" onchange="window._fusionSelectPJ('${id}', this.value)">
                <option value="">Selecciona...</option>
                ${options}
            </select>
            <div id="stats-${id}" style="margin-top:10px;font-size:0.85em;color:var(--gray-700);"></div>
        </div>
    `;

    wrap.innerHTML = `
        ${charCard('pja', 'Sujeto A')}
        <div class="card" style="display:flex;flex-direction:column;justify-content:center;align-items:center;background:var(--fusion-pale);border-color:var(--fusion-primary);">
            <label style="font-weight:700;color:var(--fusion-dark);margin-bottom:10px;">Rendimiento D100</label>
            <input type="number" id="inp-d100" class="inp" placeholder="0-100" min="1" max="100" style="text-align:center;font-size:1.5em;font-weight:bold;color:var(--fusion-primary);margin-bottom:15px;">
            <button class="btn btn-fusion" style="width:100%;" onclick="window._fusionSimular()">⚡ Simular Fusión</button>
        </div>
        ${charCard('pjb', 'Sujeto B')}
    `;
}

export function updateCharCard(idTarget, nombrePJ) {
    const pj = personajes.find(p => p.nombre === nombrePJ);
    const imgEl = document.getElementById(`img-${idTarget}`);
    const statsEl = document.getElementById(`stats-${idTarget}`);
    
    if (!pj) {
        imgEl.src = `${STORAGE_URL}/imginterfaz/no_encontrado.png`;
        statsEl.innerHTML = '';
        return;
    }

    imgEl.src = `${STORAGE_URL}/imgpersonajes/${norm(pj.nombre)}icon.png`;
    imgEl.onerror = () => { imgEl.src = `${STORAGE_URL}/imginterfaz/no_encontrado.png`; };
    statsEl.innerHTML = `POT: <b>${pj.pot}</b> | AGI: <b>${pj.agi}</b> | CTL: <b>${pj.ctl}</b>`;
}

export function renderResultado(resultado) {
    const wrap = document.getElementById('resultado-fusion');
    wrap.classList.remove('oculto');

    const tagsHtml = Object.entries(resultado.tags)
        .sort((a,b) => b[1].pts - a[1].pts)
        .map(([tag, data]) => {
            let color = data.tipo === 'suma' ? '#27ae60' : (data.tipo === 'sinergia' ? '#f39c12' : '#8e44ad');
            return `<span style="background:rgba(142,68,173,0.08);border:1px solid ${color};color:${color};padding:4px 10px;border-radius:12px;font-size:0.85em;font-weight:600;">
                ${tag} <span style="color:var(--gray-700);">(${data.pts} PT)</span>
            </span>`;
        }).join('');

    wrap.innerHTML = `
        <div class="card-title">Resultado de la Fusión</div>
        <div style="text-align:center; margin-bottom:20px;">
            <span style="background:var(--fusion-primary);color:white;padding:5px 12px;border-radius:20px;font-weight:700;font-size:0.85em;">
                ${resultado.reglaAplicada}
            </span>
        </div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:15px;margin-bottom:20px;">
            <div class="stat-box"><div style="font-size:0.7em;color:var(--gray-500);">POT TOTAL</div><div style="font-size:1.5em;font-weight:800;color:var(--orange);">${resultado.stats.pot}</div></div>
            <div class="stat-box"><div style="font-size:0.7em;color:var(--gray-500);">AGI TOTAL</div><div style="font-size:1.5em;font-weight:800;color:#2980b9;">${resultado.stats.agi}</div></div>
            <div class="stat-box"><div style="font-size:0.7em;color:var(--gray-500);">CTL TOTAL</div><div style="font-size:1.5em;font-weight:800;color:var(--green-light);">${resultado.stats.ctl}</div></div>
        </div>

        <div style="font-size:0.85em;font-weight:700;color:var(--gray-700);margin-bottom:10px;">Tags y Puntos Disponibles:</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px;">
            ${tagsHtml || '<span style="color:var(--gray-500);font-size:0.85em;">Sin tags resultantes.</span>'}
        </div>

        <button class="btn btn-fusion" style="width:100%;font-size:1em;" onclick="window._fusionOficializar()">Oficializar en Base de Datos</button>
    `;
}
