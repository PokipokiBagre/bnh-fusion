// ============================================================
// panel-stats-ui.js
// ============================================================

import { stState } from './panel-stats-state.js';
import { autoRegistrarHuerfanos, agruparPersonajes, cargarAgrupaciones } from './panel-stats-logic.js';

export function renderColumnaStats(pjNombre) {
    const contenedor = document.getElementById('content-stats');
    if (!contenedor) return;

    const pjRaw = stState.personajesRaw.find(p => p.nombre === pjNombre);
    let nombreGrupo = "Sin Agrupar";
    
    if (pjRaw && pjRaw.refinado_id) {
        const ref = stState.personajesRefinados.find(r => r.id === pjRaw.refinado_id);
        if (ref) nombreGrupo = ref.nombre_refinado;
    }

    // Dibujamos la UI integrada al estilo de tu panel BNH
    contenedor.innerHTML = `
        <div style="background:#050a14; border:1px solid #0d2035; border-radius:8px; padding:16px;">
            <h4 style="color:#e8c940; margin:0 0 10px 0; font-family:'Rajdhani',sans-serif; text-transform:uppercase;">📊 Agrupación de Puntos</h4>
            <p style="color:#888; font-size:0.85em; margin:4px 0;">Personaje Leído: <strong style="color:#c8d8e8;">${pjNombre}</strong></p>
            <p style="color:#888; font-size:0.85em; margin:4px 0;">Identidad Refinada: <strong style="color:#00b4d8;">${nombreGrupo}</strong></p>

            <hr style="border-color:#0d2035; margin:16px 0;">

            <button class="btn btn-outline" style="width:100%; font-size:0.85em;" onclick="window.toggleAdminGrupos()">
                ⚙️ ADMINISTRAR GRUPOS / MULTICUENTAS
            </button>

            <div id="admin-grupos-panel" class="oculto" style="margin-top:16px; padding-top:16px; border-top:1px dashed #0d2035;">
                <button class="btn btn-green" style="width:100%; margin-bottom:12px; font-size:0.8em;" onclick="window.ejecutarAutoRegistro()">
                    ⚡ Auto-Registrar los no agrupados individualmente
                </button>

                <div style="background:#000; padding:10px; border-radius:6px; border:1px solid #1a3050;">
                    <label style="display:block; color:#00b4d8; font-size:0.8em; margin-bottom:6px;">Crear o Editar Grupo Refinado</label>
                    <input type="text" id="input-nombre-refinado" class="inp" placeholder="Ej: Ouna" style="width:100%; box-sizing:border-box; margin-bottom:8px; font-size:0.85em;">

                    <label style="display:block; color:#888; font-size:0.75em; margin-bottom:4px;">Selecciona los nombres crudos a fusionar:</label>
                    <select id="select-raw-pjs" multiple style="width:100%; height:130px; background:#111; color:#ccc; border:1px solid #333; font-size:0.8em; border-radius:4px; padding:4px;">
                        ${stState.personajesRaw.sort((a,b) => a.nombre.localeCompare(b.nombre)).map(p => {
                            const currRef = stState.personajesRefinados.find(r => r.id === p.refinado_id);
                            const marca = currRef ? `[En: ${currRef.nombre_refinado}]` : '[SUELTA]';
                            return `<option value="${p.id}">${p.nombre} ${marca}</option>`;
                        }).join('')}
                    </select>
                    <p style="font-size:0.65em; color:#555; margin-top:4px;">* Usa CTRL o SHIFT para seleccionar varios.</p>

                    <button class="btn" style="width:100%; margin-top:8px; background:#d4af37; color:#000; font-weight:bold; font-size:0.85em;" onclick="window.ejecutarAgrupacion()">
                        🔗 Agrupar Seleccionados
                    </button>
                </div>
            </div>
        </div>
    `;

    // Exponemos las funciones al objeto global 'window' para que el HTML los lea
    window.toggleAdminGrupos = () => {
        document.getElementById('admin-grupos-panel').classList.toggle('oculto');
    };

    window.ejecutarAutoRegistro = async () => {
        const btn = document.querySelector('#admin-grupos-panel .btn-green');
        const txtOriginal = btn.innerText;
        btn.innerText = "⏳ Registrando...";
        const res = await autoRegistrarHuerfanos();
        alert(res.msg);
        renderColumnaStats(pjNombre); 
    };

    window.ejecutarAgrupacion = async () => {
        const nombreRef = document.getElementById('input-nombre-refinado').value.trim();
        const selector = document.getElementById('select-raw-pjs');
        const idsSeleccionados = Array.from(selector.selectedOptions).map(opt => opt.value);

        if (!nombreRef) return alert("Escribe un nombre de cuenta maestra.");
        if (idsSeleccionados.length === 0) return alert("Selecciona al menos un personaje de la lista.");

        await agruparPersonajes(nombreRef, idsSeleccionados);
        alert(`Los personajes fueron agrupados exitosamente bajo "${nombreRef}".`);
        renderColumnaStats(pjNombre); 
    };
}
