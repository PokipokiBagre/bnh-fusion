// ============================================================
// panel-stats-ui.js
// ============================================================

import { stState } from './panel-stats-state.js';
import { norm, STORAGE_URL } from '../dev-state.js';
import { cargarGrupoEnSlot, crearGrupoRefinado, vaciarSlot, asignarPersonajeASlotActivo, desvincularPersonaje } from './panel-stats-logic.js';

export function renderPanelStats() {
    const contenedor = document.getElementById('content-stats');
    if (!contenedor) return;

    const todosLosHilos = new Set();
    Object.values(stState.hilosPorPersonaje).forEach(set => set.forEach(h => todosLosHilos.add(h)));
    const hilosArray = Array.from(todosLosHilos).sort((a,b) => b - a);

    let filtrados = stState.personajesRaw.filter(p => {
        const coincideFiltro = stState.filtroActual === 'sueltos' ? !p.refinado_id : !!p.refinado_id;
        const coincideNom = p.nombre.toLowerCase().includes(stState.busquedaTexto.toLowerCase());
        let coincideHilo = true;
        if (stState.filtroHilo !== 'todos') {
            const hilosPj = stState.hilosPorPersonaje[p.nombre];
            coincideHilo = hilosPj ? hilosPj.has(Number(stState.filtroHilo)) : false;
        }
        return coincideFiltro && coincideNom && coincideHilo;
    });

    filtrados.sort((a, b) => a.nombre.localeCompare(b.nombre));

    const htmlLista = filtrados.length === 0 
        ? `<div class="empty-state">No hay personajes en esta vista.</div>` 
        : filtrados.map(p => _renderRowPersonaje(p)).join('');

    const htmlSlots = stState.slots.map((refId, i) => _renderSlot(refId, i)).join('');

    contenedor.innerHTML = `
        <div style="display: grid; grid-template-columns: 450px 1fr; gap: 24px; align-items: start;">
            
            <div style="background: var(--white); border: 1.5px solid var(--gray-200); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-sm);">
                <div style="background: var(--gray-100); padding: 16px; border-bottom: 1.5px solid var(--gray-200);">
                    <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                        <button class="btn ${stState.filtroActual === 'sueltos' ? 'btn-green' : 'btn-outline'}" style="flex:1" onclick="window._stFiltro('sueltos')">Sueltos</button>
                        <button class="btn ${stState.filtroActual === 'agrupados' ? 'btn-green' : 'btn-outline'}" style="flex:1" onclick="window._stFiltro('agrupados')">Agrupados</button>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" class="inp" placeholder="🔍 Buscar..." value="${stState.busquedaTexto}" oninput="window._stBuscar(this.value)" style="flex: 2;">
                        <select class="inp" onchange="window._stHilo(this.value)" style="flex: 1; cursor:pointer;">
                            <option value="todos">Todos los hilos</option>
                            ${hilosArray.map(h => `<option value="${h}" ${stState.filtroHilo == h ? 'selected' : ''}>Hilo ${h}</option>`).join('')}
                        </select>
                    </div>
                </div>
                
                <div style="max-height: 65vh; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
                    ${htmlLista}
                </div>
            </div>

            <div>
                <h3 style="color: var(--green-dark); font-family: 'Cinzel', serif; font-size: 1.4em; margin-bottom: 16px;">Mesa de Agrupación</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">
                    ${htmlSlots}
                </div>
            </div>
        </div>
    `;

    _exponerGlobalesStats();
}

function _renderRowPersonaje(p) {
    const imgUrl = `${STORAGE_URL}/imgpersonajes/${norm(p.nombre)}icon.png`;
    const imgError = `this.onerror=null; this.src='${STORAGE_URL}/imginterfaz/no_encontrado.png'`;
    const hilos = Array.from(stState.hilosPorPersonaje[p.nombre] || []).map(h => `<span style="background:var(--gray-200); color:var(--gray-700); padding:2px 6px; border-radius:4px; font-size:0.7em; margin-right:4px;">#${h}</span>`).join('');
    const pts = stState.puntosPorPersonaje[p.nombre] || 0;

    let actionBtn = '';
    if (stState.filtroActual === 'sueltos') {
        actionBtn = `<button class="btn btn-outline" style="padding: 6px 10px; font-size: 0.75em; border-color:var(--green); color:var(--green);" onclick="window._stAsignar('${p.id}')">➕ Asignar</button>`;
    } else {
        const refInfo = stState.personajesRefinados.find(r => r.id === p.refinado_id);
        const refName = refInfo ? refInfo.nombre_refinado : 'Grupo';
        actionBtn = `
            <div style="text-align:right;">
                <div style="font-size:0.65em; color:var(--gray-500); margin-bottom:4px;">En: ${refName}</div>
                <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.7em; border-color:var(--red); color:var(--red);" onclick="window._stDesvincular('${p.id}')">✖ Desvincular</button>
            </div>
        `;
    }

    return `
        <div style="display: flex; align-items: center; gap: 12px; padding: 10px; background: var(--gray-100); border: 1px solid var(--gray-300); border-radius: 8px;">
            <img src="${imgUrl}" onerror="${imgError}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid var(--white); box-shadow: var(--shadow-sm);">
            <div style="flex: 1; overflow: hidden;">
                <div style="font-weight: 600; font-size: 0.9em; color: var(--gray-900); white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${p.nombre}</div>
                <div style="font-size: 0.75em; color: var(--green-dark); font-weight: bold; margin: 2px 0;">${pts} Pts</div>
                <div style="margin-top: 2px;">${hilos}</div>
            </div>
            <div>${actionBtn}</div>
        </div>
    `;
}

function _renderSlot(refId, index) {
    const isActivo = stState.slotActivoIndex === index;
    const borderStyle = isActivo ? 'border: 3px solid var(--green); box-shadow: 0 0 0 4px var(--green-pale);' : 'border: 2px dashed var(--gray-300);';
    const bgStyle = isActivo ? 'background: var(--white);' : 'background: var(--gray-100); opacity: 0.8;';

    if (!refId) {
        return `
            <div style="${borderStyle} ${bgStyle} border-radius: var(--radius-lg); padding: 16px; cursor: pointer; transition: 0.2s;" onclick="window._stActivarSlot(${index})">
                <div style="color: var(--gray-500); font-weight: 600; font-size: 0.85em; margin-bottom: 12px; text-transform: uppercase;">Slot ${index + 1} Vacío</div>
                <input type="text" id="inp-crear-${index}" class="inp" placeholder="Nombre de nuevo grupo" style="margin-bottom: 8px; font-size:0.8em;" onclick="event.stopPropagation()">
                <button class="btn btn-green" style="width: 100%; font-size: 0.8em; justify-content: center;" onclick="event.stopPropagation(); window._stCrearGrupo(${index})">✨ Crear y Cargar</button>
                
                <div style="margin: 12px 0; border-top: 1px solid var(--gray-300);"></div>
                
                <select id="sel-cargar-${index}" class="inp" style="margin-bottom: 8px; font-size:0.8em;" onclick="event.stopPropagation()">
                    <option value="">Cargar grupo existente...</option>
                    ${stState.personajesRefinados.sort((a,b)=>a.nombre_refinado.localeCompare(b.nombre_refinado)).map(r => `<option value="${r.id}">${r.nombre_refinado} (${r.id.split('-')[0]})</option>`).join('')}
                </select>
                <button class="btn btn-outline" style="width: 100%; font-size: 0.8em; justify-content: center;" onclick="event.stopPropagation(); window._stCargarGrupo(${index})">📂 Cargar al Slot</button>
            </div>
        `;
    }

    const refInfo = stState.personajesRefinados.find(r => r.id === refId);
    if (!refInfo) return `<div style="${borderStyle} ${bgStyle} padding:16px;">Error de ID</div>`;

    const miembros = stState.personajesRaw.filter(p => p.refinado_id === refId);
    let totalPts = refInfo.puntos_manual || 0;
    miembros.forEach(m => totalPts += (stState.puntosPorPersonaje[m.nombre] || 0));

    return `
        <div style="${borderStyle} background: var(--white); border-radius: var(--radius-lg); padding: 16px; display: flex; flex-direction: column; cursor: pointer; transition: 0.2s;" onclick="window._stActivarSlot(${index})">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <div>
                    <div style="font-weight: 700; font-size: 1.1em; color: var(--green-dark);">${refInfo.nombre_refinado}</div>
                    <div style="font-family: monospace; font-size: 0.7em; color: var(--gray-500);">ID: ${refInfo.id.split('-')[0]}</div>
                </div>
                <div style="background: var(--green-pale); color: var(--green-dark); font-weight: 800; font-size: 0.9em; padding: 4px 8px; border-radius: 6px;">
                    ${totalPts} Pts
                </div>
            </div>
            
            <div style="flex: 1; background: var(--gray-100); border: 1px solid var(--gray-200); border-radius: 6px; padding: 8px; margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 6px; align-content: flex-start; min-height: 80px;">
                ${miembros.length === 0 ? `<span style="font-size:0.75em; color:var(--gray-500); font-style:italic;">Sin miembros asignados.</span>` : ''}
                ${miembros.map(m => `
                    <div style="background: var(--white); border: 1px solid var(--gray-300); font-size: 0.7em; padding: 2px 6px; border-radius: 4px; display: flex; align-items: center; gap: 6px;">
                        <span style="color:var(--gray-900); font-weight:600;">${m.nombre}</span>
                        <span style="color:var(--red); cursor:pointer; font-weight:bold;" onclick="event.stopPropagation(); window._stDesvincular('${m.id}')">×</span>
                    </div>
                `).join('')}
            </div>

            <button class="btn btn-outline" style="width: 100%; font-size: 0.75em; justify-content: center; color: var(--gray-500);" onclick="event.stopPropagation(); window._stVaciarSlot(${index})">
                🧹 Retirar del Slot
            </button>
        </div>
    `;
}

function _exponerGlobalesStats() {
    window._stFiltro = (f) => { stState.filtroActual = f; renderPanelStats(); };
    window._stBuscar = (t) => { stState.busquedaTexto = t; renderPanelStats(); };
    window._stHilo   = (h) => { stState.filtroHilo = h; renderPanelStats(); };
    
    window._stActivarSlot = (index) => {
        stState.slotActivoIndex = index;
        renderPanelStats();
    };

    window._stCrearGrupo = async (index) => {
        const inp = document.getElementById(`inp-crear-${index}`);
        if (!inp || !inp.value.trim()) return;
        stState.slotActivoIndex = index;
        await crearGrupoRefinado(inp.value.trim(), index);
    };

    window._stCargarGrupo = async (index) => {
        const sel = document.getElementById(`sel-cargar-${index}`);
        if (!sel || !sel.value) return;
        stState.slotActivoIndex = index;
        await cargarGrupoEnSlot(sel.value, index);
    };

    window._stVaciarSlot = async (index) => {
        await vaciarSlot(index);
    };

    window._stAsignar = async (personajeId) => {
        const res = await asignarPersonajeASlotActivo(personajeId);
        if (!res.ok) alert(res.msg); 
        else renderPanelStats();
    };

    window._stDesvincular = async (personajeId) => {
        await desvincularPersonaje(personajeId);
        renderPanelStats();
    };
}
