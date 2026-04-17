// ============================================================
// bnh-opciones-tags.js — Configuración modular del sistema de PT
// Colocar en la RAÍZ del proyecto.
//
// Tabla Supabase (ejecutar una vez):
//   CREATE TABLE opciones_tags (
//     clave      text primary key,
//     valor      numeric not null,
//     descripcion text
//   );
//   INSERT INTO opciones_tags (clave, valor, descripcion) VALUES
//     ('max_no_compartidos',  5,  'Máximo de tags propios únicos que se puntúan por post'),
//     ('max_compartidos',     5,  'Máximo de tags compartidos que se puntúan por post'),
//     ('max_lectura',         5,  'Máximo de #tags leídos del contenido que se puntúan por post'),
//     ('delta_no_compartido', 1,  'Puntos por tag no compartido'),
//     ('delta_compartido',    2,  'Puntos por tag compartido'),
//     ('delta_lectura',       1,  'Puntos por tag de lectura (#tag en contenido)'),
//     ('multiplicador_fusion',3,  'Multiplicador de PT cuando el personaje está en fusión (en lugar de x5 base)');
// ============================================================

import { supabase } from './bnh-auth.js';

// Valores por defecto (usados si la tabla falla o no existe)
export let OPCIONES = {
    max_no_compartidos:  5,
    max_compartidos:     5,
    max_lectura:         5,
    delta_no_compartido: 1,
    delta_compartido:    2,
    delta_lectura:       1,
    multiplicador_fusion: 3
};

let _cargado = false;

export async function initOpciones() {
    if (_cargado) return OPCIONES;
    try {
        const { data, error } = await supabase
            .from('opciones_tags')
            .select('clave, valor');
        if (!error && data && data.length > 0) {
            data.forEach(r => {
                if (r.clave in OPCIONES) OPCIONES[r.clave] = Number(r.valor);
            });
        }
    } catch (_) { /* usa defaults */ }
    _cargado = true;
    return OPCIONES;
}

export async function guardarOpcion(clave, valor) {
    if (!(clave in OPCIONES)) return { ok: false, msg: 'Clave desconocida' };
    const { error } = await supabase
        .from('opciones_tags')
        .upsert({ clave, valor: Number(valor) }, { onConflict: 'clave' });
    if (error) return { ok: false, msg: error.message };
    OPCIONES[clave] = Number(valor);
    return { ok: true };
}

// Renderiza el panel de opciones (lectura para todos, edición solo OP)
export function renderOpcionesPanel(esAdmin) {
    const campos = [
        { clave: 'max_no_compartidos',  label: 'Max tags no compartidos / post', grupo: 'Interacción' },
        { clave: 'delta_no_compartido', label: 'Puntos por tag no compartido',   grupo: 'Interacción' },
        { clave: 'max_compartidos',     label: 'Max tags compartidos / post',    grupo: 'Interacción' },
        { clave: 'delta_compartido',    label: 'Puntos por tag compartido',      grupo: 'Interacción' },
        { clave: 'max_lectura',         label: 'Max tags de lectura / post',     grupo: 'Lectura' },
        { clave: 'delta_lectura',       label: 'Puntos por tag de lectura',      grupo: 'Lectura' },
        { clave: 'multiplicador_fusion',label: 'Multiplicador en fusión (÷)',    grupo: 'Fusión' },
    ];

    const grupos = [...new Set(campos.map(c => c.grupo))];

    return `
    <div style="padding:16px; max-width:520px;">
        <h3 style="font-family:'Cinzel',serif; color:var(--green-dark); margin-bottom:16px; font-size:1.1em;">
            ⚙ Opciones de PT
        </h3>
        ${grupos.map(grupo => `
        <div style="margin-bottom:16px;">
            <div style="font-size:0.72em; font-weight:700; color:var(--gray-500); text-transform:uppercase;
                letter-spacing:1px; margin-bottom:8px; padding-bottom:4px; border-bottom:1px solid var(--gray-200);">
                ${grupo}
            </div>
            ${campos.filter(c => c.grupo === grupo).map(c => `
            <div style="display:flex; align-items:center; justify-content:space-between;
                padding:6px 0; border-bottom:1px solid var(--gray-100);">
                <span style="font-size:0.85em; color:var(--gray-700);">${c.label}</span>
                ${esAdmin
                    ? `<input type="number" min="0" max="99" value="${OPCIONES[c.clave]}"
                        data-clave="${c.clave}"
                        onchange="window._opcionTagChange('${c.clave}', this.value)"
                        style="width:60px; text-align:center; border:1.5px solid var(--gray-300);
                               border-radius:var(--radius); padding:4px 6px; font-size:0.9em;
                               font-weight:700; color:var(--green-dark);">`
                    : `<span style="font-weight:700; color:var(--green-dark); font-size:0.9em;">
                        ${OPCIONES[c.clave]}</span>`
                }
            </div>`).join('')}
        </div>`).join('')}
        ${esAdmin ? `<p style="font-size:0.75em; color:var(--gray-500); margin-top:8px;">
            Los cambios se guardan inmediatamente. Recalcula PT después de cambiar valores.</p>` : ''}
    </div>`;
}
