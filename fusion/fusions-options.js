// fusions/fusions-options.js
import { supabase } from '../bnh-auth.js';

export const opcionesState = {
    modo_stats:        'suma',
    num_umbrales:      3,
    umbral_1:          33,
    umbral_2:          66,
    comportamiento_z1: 'mayor',
    comportamiento_z2: 'mayor',
    comportamiento_z3: 'suma',
    crear_tag_fusion:  true,
    pts_tag_fusion:    50,
    desc_z1:           'Asimilación Básica — PTs: el mayor',
    desc_z2:           'Sinergia — PTs: el mayor compartido',
    desc_z3:           'Fusión Perfecta — PTs: suma completa',
};

export async function cargarOpciones() {
    const { data, error } = await supabase.from('opciones_fusion').select('*').eq('id',1).maybeSingle();
    if (!error && data) Object.assign(opcionesState, data);
    return opcionesState;
}

export async function guardarOpciones(parcial = {}) {
    Object.assign(opcionesState, parcial);
    const payload = { ...opcionesState, actualizado_en: new Date().toISOString() };
    delete payload.id;
    const { error } = await supabase.from('opciones_fusion').update(payload).eq('id',1);
    return error ? { ok: false, msg: error.message } : { ok: true };
}

const COMP_LABELS = { mayor:'Mayor de A y B', suma:'Suma A + B', promedio:'Promedio ⌈(A+B)/2⌉', cero:'Poner en 0' };
const STAT_LABELS  = { suma:'Suma (A + B)', promedio:'Promedio ⌈(A+B)/2⌉', mayor:'Mayor de los dos' };

function _radio(name, value, current, label) {
    const on = current === value;
    return `<label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:0.875em;
        padding:8px 12px;border-radius:8px;user-select:none;transition:all 0.15s;
        border:1.5px solid ${on?'var(--fp)':'var(--border)'};
        background:${on?'var(--fp-pale)':'white'};color:${on?'var(--fp-dark)':'var(--gray-700)'};
        font-weight:${on?700:500};">
        <input type="radio" name="${name}" value="${value}" ${on?'checked':''}
            onchange="window._fusionOpcionChange('${name}','${value}')" style="accent-color:var(--fp);">
        ${label}</label>`;
}

function _select(name, value, opts) {
    const o = Object.entries(opts).map(([v,l]) =>
        `<option value="${v}" ${value===v?'selected':''}>${l}</option>`).join('');
    return `<select class="inp" style="max-width:280px;font-size:0.875em;"
        onchange="window._fusionOpcionChange('${name}',this.value)">${o}</select>`;
}

function _toggle(name, value, on, off) {
    return `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;">
        <div onclick="window._fusionOpcionChange('${name}',${!value})" style="
            position:relative;width:44px;height:24px;border-radius:12px;cursor:pointer;
            background:${value?'var(--fp)':'var(--gray-300)'};transition:background 0.2s;flex-shrink:0;">
            <span style="position:absolute;top:3px;left:${value?'23px':'3px'};
                width:18px;height:18px;border-radius:50%;background:white;
                transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.25);"></span>
        </div>
        <span style="font-size:0.875em;font-weight:${value?700:500};color:${value?'var(--fp-dark)':'var(--gray-700)'};">
            ${value?on:off}</span></label>`;
}

function _zonaCard(zona, label, comp, desc, umbralLabel) {
    const zKey = `comportamiento_z${zona}`;
    const dKey = `desc_z${zona}`;
    const c = {1:'#d68910',2:'#1a4a80',3:'#8b2fc9'}[zona]||'#8b2fc9';
    return `<div style="border:1.5px solid ${c}28;border-radius:10px;padding:16px;background:${c}06;">
        <div style="margin-bottom:10px;">
            <span style="font-size:0.7em;font-weight:800;text-transform:uppercase;letter-spacing:1px;
                color:${c};background:${c}18;border:1px solid ${c}44;padding:2px 10px;border-radius:8px;">
                ${label} ${umbralLabel}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
            <div>
                <div style="font-size:0.72em;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Comportamiento de PTs</div>
                ${_select(zKey, comp, COMP_LABELS)}
            </div>
            <div>
                <div style="font-size:0.72em;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Etiqueta de zona</div>
                <input class="inp" type="text" value="${desc.replace(/"/g,'&quot;')}"
                    oninput="window._fusionOpcionChange('${dKey}',this.value)"
                    style="font-size:0.85em;" placeholder="Descripción...">
            </div>
        </div>
    </div>`;
}

export function renderOpciones() {
    const wrap = document.getElementById('vista-opciones');
    if (!wrap) return;
    const o   = opcionesState;
    const u1  = o.umbral_1;
    const u2  = o.num_umbrales === 2 ? 100 : o.umbral_2;

    const zonas = o.num_umbrales === 2
        ? [ {zona:1,label:'Zona 1',comp:o.comportamiento_z1,desc:o.desc_z1,umbral:`(D100 ≤ ${u1})`},
            {zona:3,label:'Zona 2',comp:o.comportamiento_z3,desc:o.desc_z3,umbral:`(D100 > ${u1})`} ]
        : [ {zona:1,label:'Zona 1',comp:o.comportamiento_z1,desc:o.desc_z1,umbral:`(D100 ≤ ${u1})`},
            {zona:2,label:'Zona 2',comp:o.comportamiento_z2,desc:o.desc_z2,umbral:`(${u1+1}–${u2})`},
            {zona:3,label:'Zona 3',comp:o.comportamiento_z3,desc:o.desc_z3,umbral:`(D100 > ${u2})`} ];

    const statEx = {suma:`POT = 35 (20+15)`,promedio:`POT = 18 ⌈(20+15)/2⌉`,mayor:`POT = 20 (el mayor)`}[o.modo_stats];

    wrap.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px;max-width:860px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:4px;">
            <div>
                <div style="font-family:'Cinzel',serif;font-size:1.05em;font-weight:700;color:var(--fp-dark);">⚙️ Configuración de Fusiones</div>
                <div style="font-size:0.8em;color:var(--gray-500);margin-top:2px;">Se aplica a nuevas simulaciones. El historial mantiene la regla que usó en su momento.</div>
            </div>
            <button class="btn btn-fusion" onclick="window._fusionGuardarOpciones()">💾 Guardar</button>
        </div>

        <div class="card">
            <div class="card-title">Cálculo de Stats (POT · AGI · CTL)</div>
            <p style="font-size:0.82em;color:var(--gray-500);margin-bottom:12px;">Cómo se combinan los stats base de los dos personajes.</p>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                ${_radio('modo_stats','suma',    o.modo_stats, STAT_LABELS.suma)}
                ${_radio('modo_stats','promedio', o.modo_stats, STAT_LABELS.promedio)}
                ${_radio('modo_stats','mayor',   o.modo_stats, STAT_LABELS.mayor)}
            </div>
            <div style="padding:10px 14px;border-radius:8px;background:var(--fp-pale);font-size:0.8em;color:var(--fp-dark);">
                <b>Ejemplo</b> (A=20, B=15): <b>${statEx}</b>
            </div>
        </div>

        <div class="card">
            <div class="card-title">Estructura del D100</div>
            <p style="font-size:0.82em;color:var(--gray-500);margin-bottom:12px;">Cuántas zonas de compatibilidad existen y dónde están los cortes.</p>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
                ${_radio('num_umbrales','2',String(o.num_umbrales),'2 zonas — un umbral')}
                ${_radio('num_umbrales','3',String(o.num_umbrales),'3 zonas — dos umbrales')}
            </div>
            <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px;">
                <div>
                    <label style="font-size:0.72em;font-weight:700;color:var(--gray-500);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px;">Umbral 1 (D100 ≤ → Z1)</label>
                    <input type="number" class="inp" value="${o.umbral_1}" min="1" max="99"
                        style="max-width:90px;text-align:center;font-size:1.2em;font-weight:800;color:var(--orange);"
                        oninput="window._fusionOpcionChange('umbral_1',parseInt(this.value)||33)">
                </div>
                ${o.num_umbrales===3?`
                <div>
                    <label style="font-size:0.72em;font-weight:700;color:var(--gray-500);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px;">Umbral 2 (D100 ≤ → Z2)</label>
                    <input type="number" class="inp" value="${o.umbral_2}" min="1" max="99"
                        style="max-width:90px;text-align:center;font-size:1.2em;font-weight:800;color:#2980b9;"
                        oninput="window._fusionOpcionChange('umbral_2',parseInt(this.value)||66)">
                </div>`:''}
            </div>
            <div style="display:flex;height:32px;border-radius:8px;overflow:hidden;border:1px solid var(--border);">
                <div style="flex:${u1};background:rgba(214,137,16,0.35);display:flex;align-items:center;justify-content:center;font-size:0.72em;font-weight:700;color:#7d5a00;">≤${u1}</div>
                ${o.num_umbrales===3?`<div style="flex:${u2-u1};background:rgba(26,74,128,0.28);display:flex;align-items:center;justify-content:center;font-size:0.72em;font-weight:700;color:#1a4a80;">${u1+1}–${u2}</div>`:''}
                <div style="flex:${100-u2};background:rgba(139,47,201,0.35);display:flex;align-items:center;justify-content:center;font-size:0.72em;font-weight:700;color:var(--fp-dark);">${(o.num_umbrales===2?u1:u2)+1}–100</div>
            </div>
        </div>

        <div class="card">
            <div class="card-title">Comportamiento de PTs por Zona</div>
            <p style="font-size:0.82em;color:var(--gray-500);margin-bottom:12px;">Qué pasa con los puntos de tag según en qué zona cae el D100.</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;">
                ${zonas.map(z => _zonaCard(z.zona, z.label, z.comp, z.desc, z.umbral)).join('')}
            </div>
        </div>

        <div class="card">
            <div class="card-title">Tag Temporal de Fusión</div>
            <p style="font-size:0.82em;color:var(--gray-500);margin-bottom:12px;">
                Al oficializar se puede crear un tag nuevo (ej: <b style="color:var(--fp);">#VaporFusion</b>) que se asigna a ambos PJs durante la fusión.
                El nombre se escribe en el momento de oficializar.
            </p>
            <div style="display:flex;flex-direction:column;gap:12px;">
                ${_toggle('crear_tag_fusion', o.crear_tag_fusion, 'Crear tag de fusión al oficializar', 'No crear tag de fusión')}
                ${o.crear_tag_fusion?`
                <div>
                    <label style="font-size:0.72em;font-weight:700;color:var(--gray-500);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px;">PT iniciales del tag de fusión</label>
                    <input type="number" class="inp" value="${o.pts_tag_fusion}" min="0" max="500"
                        style="max-width:100px;text-align:center;font-size:1.2em;font-weight:800;color:var(--fp);"
                        oninput="window._fusionOpcionChange('pts_tag_fusion',parseInt(this.value)||0)">
                    <div style="font-size:0.78em;color:var(--gray-500);margin-top:4px;">Ambos PJs recibirán este tag con este número de PT.</div>
                </div>`:''}
            </div>
        </div>

        <div style="display:flex;justify-content:flex-end;padding-bottom:20px;">
            <button class="btn btn-fusion btn-lg" onclick="window._fusionGuardarOpciones()">💾 Guardar Configuración</button>
        </div>
    </div>`;
}
