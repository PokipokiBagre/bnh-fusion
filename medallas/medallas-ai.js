// ============================================================
// medallas/medallas-ai.js — IA integrada en formularios
// v2.0: IA inline por formulario, edición contextual, estructura irregular real
// ============================================================
import { supabase } from '../bnh-auth.js';
import { medallas } from './medallas-state.js';
import { TAGS_CANONICOS } from '../bnh-tags.js';

const _esc = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// ── Guía interna del motor ────────────────────────────────────
const GUIA_MEDALLAS = `
ENGINE DE MEDALLAS — BNH-FUSION v5.0

RECURSOS MANIPULABLES:
  POT / AGI / CTL — Stats del personaje o del rival
  PV              — Puntos de vida
  Cambios/t       — Acciones por turno
  #Tag [PT]       — Reducir, escalar o duplicar desde los PT de un tag
  !NombreMedalla! — Desequipar o bloquear re-equipamiento de una medalla ESPECÍFICA

TIPOS Y CTL:
  PASIVA     — Constante o disparada automáticamente. CTL típico: 1–7.
  ACTIVA     — Requiere acción del jugador. CTL típico: 3–12.
  DEFINITIVA — Rompe la lógica del combate. CTL típico: 8–16.

ESCALA DE STATS (calibra el impacto real):
  Tier 1: POT ~13, AGI ~13, CTL ~14. Tier 2: suma ~60. Tier 3: suma ~80. Tier 4: suma ~100.
  -1 stat = irrelevante. -3 = duele en tier 1. -8 = severo. Calibra acorde.

PT REQUISITOS: 20=básico, 40=moderado, 80=avanzado, 160=maestro.

EFECTOS — usa lenguaje natural directo:
  "Aumenta POT +8." / "Disminuye CTL rival -3." / "Eleva AGI ^1.5." / "Multiplica CTL x2."
  "Disminuye PV rival -(PT de #Tag / 10)." / "Inicio de turno: Aumenta AGI +2."
  NUNCA: "Delta X = Y" ni notación técnica.

MARKUP:
  #Tag → solo tags de la lista provista. NUNCA inventar tags.
  !NombreMedalla! → nombre exacto de una medalla existente. NUNCA !Activa!, !Pasiva!, !Definitiva!
  @Nombre_Personaje@ → SOLO para apuntar a un personaje específico. Para "aliados" o "rival" usa lenguaje natural.
  %rango: efecto% → Factor dado d100. Encapsula un resultado condicional por tirada.
    Ejemplos: %90+: Hace 3 PVs de daño adicional y aumenta 5 PT al tag #Fuerza_Bruta.%
              %20-: Autoquita 10 PVs al usuario.%
              %50-89: Sin efecto adicional.%
    Úsalo cuando el efecto tenga componente de azar. El rango puede ser: N+ (≥N), N- (≤N), N-M (entre N y M).
    El efecto dentro del bloque puede contener @Persona@, #Tag, !Medalla! normalmente.
`.trim();

// ── Helpers de datos ─────────────────────────────────────────

function _get5Ejemplos() {
    const pool = (medallas || []).filter(m => !m.propuesta && m.nombre && m.efecto_desc);
    if (!pool.length) return '(catálogo vacío, sin ejemplos disponibles)';
    const sample = [...pool].sort(() => Math.random() - 0.5).slice(0, 5);
    return sample.map(m => {
        const reqs  = (m.requisitos_base || []).map(r => `    ${r.tag.startsWith('#') ? r.tag : '#' + r.tag}: min. ${r.pts_minimos} PT`).join('\n');
        const conds = (m.efectos_condicionales || []).map(ec => `    SI ${ec.tag} >= ${ec.pts_minimos} PT: ${ec.efecto}`).join('\n');
        return [
            `[${m.nombre}] | ${m.costo_ctl} CTL | Tipo: ${m.tipo || 'activa'}`,
            `  [EFECTO] ${m.efecto_desc}`,
            reqs  ? `  [REQUISITOS]\n${reqs}` : '',
            conds ? `  [CONDICIONALES]\n${conds}` : '',
        ].filter(Boolean).join('\n');
    }).join('\n\n---\n\n');
}

function _getTagsDisponibles() {
    const tags = (TAGS_CANONICOS || []).filter(Boolean);
    return tags.length ? tags.join(', ') : '(catálogo de tags vacío)';
}

function _getNombres() {
    return (medallas || []).map(m => m.nombre).filter(Boolean).join(', ');
}

function _getMedallasRef() {
    const pool = (medallas || []).filter(m => m.nombre);
    return pool.length ? pool.map(m => `!${m.nombre}!`).join(', ') : '(catálogo vacío)';
}

// ── Leer estado ACTUAL de un mini-form ───────────────────────
function _leerMiniForm(fid) {
    const get = id => document.getElementById(id);

    const nombre  = get(`mf-nombre-${fid}`)?.value.trim() || '';
    const ctl     = get(`mf-ctl-${fid}`)?.value || '1';
    const efecto  = get(`mf-efecto-${fid}`)?.value.trim() || '';
    const tipo    = get(`mf-tipo-${fid}`)?.value || 'activa';

    // Reqs: todos los rows presentes en el DOM
    const reqsDiv = get(`mf-reqs-${fid}`);
    const reqs = [];
    if (reqsDiv) {
        reqsDiv.querySelectorAll('[id^="mf-rrow-"]').forEach(row => {
            const tag = row.querySelector('[placeholder="#Tag"]')?.value.trim() || '';
            const pts = parseInt(row.querySelector('[type="number"]')?.value || '0') || 0;
            if (tag) reqs.push({ tag, pts_minimos: pts });
        });
    }

    // Conds
    const condsDiv = get(`mf-conds-${fid}`);
    const conds = [];
    if (condsDiv) {
        condsDiv.querySelectorAll('[id^="mf-crow-"]').forEach(row => {
            const tag    = row.querySelector('[placeholder="#Tag"]')?.value.trim() || '';
            const pts    = parseInt(row.querySelector('[type="number"]')?.value || '0') || 0;
            const efCond = row.querySelector('textarea')?.value.trim() || '';
            if (tag || efCond) conds.push({ tag, pts_minimos: pts, efecto: efCond });
        });
    }

    return { nombre, costo_ctl: parseInt(ctl) || 1, efecto_base: efecto, tipo, requisitos_base: reqs, efectos_condicionales: conds };
}

// Leer form admin (fm-*)
function _leerFormAdmin() {
    const get = id => document.getElementById(id);
    const nombre = get('fm-nombre')?.value.trim() || '';
    const ctl    = parseInt(get('fm-ctl')?.value || '1') || 1;
    const efecto = get('fm-efecto')?.value.trim() || '';
    const tipo   = get('fm-tipo')?.value || 'activa';

    const reqs = [];
    document.querySelectorAll('#fm-reqs [id^="req-row-"]').forEach(row => {
        const tag = row.querySelector('[id^="req-tag-"]')?.value.trim() || '';
        const pts = parseInt(row.querySelector('[id^="req-pts-"]')?.value || '0') || 0;
        if (tag) reqs.push({ tag, pts_minimos: pts });
    });

    const conds = [];
    document.querySelectorAll('#fm-conds [id^="cond-row-"]').forEach(row => {
        const tag    = row.querySelector('[id^="cond-tag-"]')?.value.trim() || '';
        const pts    = parseInt(row.querySelector('[id^="cond-pts-"]')?.value || '0') || 0;
        const efCond = row.querySelector('textarea')?.value.trim() || '';
        if (tag || efCond) conds.push({ tag, pts_minimos: pts, efecto: efCond });
    });

    return { nombre, costo_ctl: ctl, efecto_base: efecto, tipo, requisitos_base: reqs, efectos_condicionales: conds };
}

// Leer form propuesta (prop-*)
function _leerFormProp() {
    const get = id => document.getElementById(id);
    const nombre = get('prop-nombre')?.value.trim() || '';
    const ctl    = parseInt(get('prop-ctl')?.value || '1') || 1;
    const efecto = get('prop-efecto')?.value.trim() || '';
    const tipo   = get('prop-tipo')?.value || 'activa';

    const reqs = [];
    document.querySelectorAll('#prop-reqs [id^="req-row-"]').forEach(row => {
        const tag = row.querySelector('[id^="req-tag-"]')?.value.trim() || '';
        const pts = parseInt(row.querySelector('[id^="req-pts-"]')?.value || '0') || 0;
        if (tag) reqs.push({ tag, pts_minimos: pts });
    });

    const conds = [];
    document.querySelectorAll('#prop-conds [id^="cond-row-"]').forEach(row => {
        const tag    = row.querySelector('[id^="cond-tag-"]')?.value.trim() || '';
        const pts    = parseInt(row.querySelector('[id^="cond-pts-"]')?.value || '0') || 0;
        const efCond = row.querySelector('textarea')?.value.trim() || '';
        if (tag || efCond) conds.push({ tag, pts_minimos: pts, efecto: efCond });
    });

    return { nombre, costo_ctl: ctl, efecto_base: efecto, tipo, requisitos_base: reqs, efectos_condicionales: conds };
}

// ── Volcar datos en formularios ───────────────────────────────

function _llenarMiniForm(fid, data) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = (val ?? ''); };

    set(`mf-nombre-${fid}`, data.nombre);
    set(`mf-ctl-${fid}`, data.costo_ctl);
    set(`mf-efecto-${fid}`, data.efecto_base);
    const tipoEl = document.getElementById(`mf-tipo-${fid}`);
    if (tipoEl && data.tipo) tipoEl.value = data.tipo;

    const reqsDiv = document.getElementById(`mf-reqs-${fid}`);
    if (reqsDiv && data.requisitos_base?.length) {
        reqsDiv.innerHTML = data.requisitos_base.map((r, i) => `
            <div class="cond-row" id="mf-rrow-${fid}-${i}" style="margin-bottom:4px;">
                <input class="inp" placeholder="#Tag" style="flex:1;font-size:0.82em;"
                    id="mf-rtag-${fid}-${i}" value="${_esc(r.tag || '')}" autocomplete="off">
                <input class="inp" type="number" min="0" placeholder="PT"
                    style="width:60px;font-size:0.82em;" id="mf-rpts-${fid}-${i}" value="${r.pts_minimos || 0}">
                <button class="btn btn-red btn-sm"
                    onclick="document.getElementById('mf-rrow-${fid}-${i}').remove()">✕</button>
            </div>`).join('');
        if (window._mfReqCounters) window._mfReqCounters[fid] = data.requisitos_base.length - 1;
    }

    const condsDiv = document.getElementById(`mf-conds-${fid}`);
    if (condsDiv) {
        // Filtrar condicionales sin tag (la IA a veces los deja vacíos)
        const condsValidas = (data.efectos_condicionales || []).filter(ec => ec.tag && ec.tag.trim());
        condsDiv.innerHTML = condsValidas.map((ec, i) => `
            <div class="cond-row" id="mf-crow-${fid}-${i}"
                style="flex-direction:column;align-items:stretch;margin-bottom:6px;">
                <div style="display:flex;gap:4px;">
                    <input class="inp" placeholder="#Tag" style="flex:1;font-size:0.82em;"
                        id="mf-ctag-${fid}-${i}" value="${_esc(ec.tag || '')}" autocomplete="off">
                    <input class="inp" type="number" min="0" placeholder="PT"
                        style="width:60px;font-size:0.82em;" id="mf-cpts-${fid}-${i}" value="${ec.pts_minimos || 0}">
                    <button class="btn btn-red btn-sm"
                        onclick="document.getElementById('mf-crow-${fid}-${i}').remove()">✕</button>
                </div>
                <textarea class="inp" rows="1" id="mf-cefecto-${fid}-${i}"
                    style="font-size:0.82em;margin-top:4px;">${_esc(ec.efecto || '')}</textarea>
            </div>`).join('');
        if (window._mfCondCounters)
            window._mfCondCounters[fid] = (condsValidas.length || 1) - 1;
    }
}

function _llenarFormAdmin(data) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = (val ?? ''); };
    set('fm-nombre', data.nombre);
    set('fm-ctl', data.costo_ctl);
    set('fm-efecto', data.efecto_base);
    const tipoEl = document.getElementById('fm-tipo');
    if (tipoEl && data.tipo) tipoEl.value = data.tipo;

    const reqsDiv = document.getElementById('fm-reqs');
    if (reqsDiv && data.requisitos_base?.length) {
        reqsDiv.innerHTML = data.requisitos_base.map((r, i) => `
            <div class="cond-row" id="req-row-${i}">
                <input class="inp" placeholder="#Tag — escribe # para sugerencias" style="flex:1;"
                    value="${_esc(r.tag || '')}" id="req-tag-${i}" autocomplete="off">
                <input class="inp" type="number" min="0" placeholder="PT mín." style="width:90px;"
                    value="${r.pts_minimos || 0}" id="req-pts-${i}">
                <button class="btn btn-red btn-sm"
                    onclick="document.getElementById('req-row-${i}').remove()">✕</button>
            </div>`).join('');
        window._fm_reqCount = data.requisitos_base.length;
    }

    const condsDiv = document.getElementById('fm-conds');
    if (condsDiv) {
        const condsValidas = (data.efectos_condicionales || []).filter(ec => ec.tag && ec.tag.trim());
        condsDiv.innerHTML = condsValidas.map((ec, i) => `
            <div class="cond-row" style="flex-direction:column;align-items:stretch;" id="cond-row-${i}">
                <div style="display:flex;gap:8px;">
                    <input class="inp" placeholder="#Tag — escribe # para sugerencias" style="flex:1;"
                        value="${_esc(ec.tag || '')}" id="cond-tag-${i}" autocomplete="off">
                    <input class="inp" type="number" min="0" placeholder="PT mín." style="width:90px;"
                        value="${ec.pts_minimos || 0}" id="cond-pts-${i}">
                    <button class="btn btn-red btn-sm"
                        onclick="document.getElementById('cond-row-${i}').remove()">✕</button>
                </div>
                <textarea class="inp" rows="2" id="cond-efecto-${i}"
                    style="margin-top:6px;">${_esc(ec.efecto || '')}</textarea>
            </div>`).join('');
        window._fm_condCount = condsValidas.length || 0;
    }
}

function _llenarFormProp(data) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = (val ?? ''); };
    set('prop-nombre', data.nombre);
    set('prop-ctl', data.costo_ctl);
    set('prop-efecto', data.efecto_base);
    const tipoEl = document.getElementById('prop-tipo');
    if (tipoEl && data.tipo) tipoEl.value = data.tipo;

    const reqsDiv = document.getElementById('prop-reqs');
    if (reqsDiv && data.requisitos_base?.length) {
        reqsDiv.innerHTML = data.requisitos_base.map((r, i) => `
            <div class="cond-row" id="req-row-${i}">
                <input class="inp" placeholder="#Tag — escribe # para sugerencias" style="flex:1;"
                    value="${_esc(r.tag || '')}" id="req-tag-${i}" autocomplete="off">
                <input class="inp" type="number" min="0" placeholder="PT mín." style="width:90px;"
                    value="${r.pts_minimos || 0}" id="req-pts-${i}">
                <button class="btn btn-red btn-sm"
                    onclick="document.getElementById('req-row-${i}').remove()">✕</button>
            </div>`).join('');
        window._propReqCount = data.requisitos_base.length - 1;
    }

    const condsDiv = document.getElementById('prop-conds');
    if (condsDiv) {
        const condsValidas = (data.efectos_condicionales || []).filter(ec => ec.tag && ec.tag.trim());
        condsDiv.innerHTML = condsValidas.map((ec, i) => `
            <div class="cond-row" style="flex-direction:column;align-items:stretch;" id="cond-row-${i}">
                <div style="display:flex;gap:8px;">
                    <input class="inp" placeholder="#Tag — escribe # para sugerencias" style="flex:1;"
                        value="${_esc(ec.tag || '')}" id="cond-tag-${i}" autocomplete="off">
                    <input class="inp" type="number" min="0" placeholder="PT mín." style="width:90px;"
                        value="${ec.pts_minimos || 0}" id="cond-pts-${i}">
                    <button class="btn btn-red btn-sm"
                        onclick="document.getElementById('cond-row-${i}').remove()">✕</button>
                </div>
                <textarea class="inp" rows="2" id="cond-efecto-${i}"
                    style="margin-top:6px;">${_esc(ec.efecto || '')}</textarea>
            </div>`).join('');
        window._propCondCount = (condsValidas.length || 1) - 1;
    }
}

// ── Estructura irregular para generación múltiple ────────────
// La IA siempre genera la medalla completa.
// El PROGRAMA decide aquí qué reqs/conds conservar en cada slot,
// para que la irregularidad sea consistente y no dependa del azar de la IA.
function _generarEstructuraSlots(N) {
    // Pool de estructuras base, variadas
    const base = [
        { tipo: 'pasiva',     num_reqs: 1, tiene_cond: false },
        { tipo: 'activa',     num_reqs: 1, tiene_cond: false },
        { tipo: 'activa',     num_reqs: 1, tiene_cond: true  },
        { tipo: 'activa',     num_reqs: 2, tiene_cond: false },
        { tipo: 'activa',     num_reqs: 2, tiene_cond: true  },
        { tipo: 'pasiva',     num_reqs: 1, tiene_cond: true  },
        { tipo: 'definitiva', num_reqs: 1, tiene_cond: false },
        { tipo: 'definitiva', num_reqs: 2, tiene_cond: true  },
    ];
    // Fisher-Yates shuffle y expandir a N sin repetir el mismo patrón consecutivo
    const shuffled = [...base].sort(() => Math.random() - 0.5);
    return Array.from({ length: N }, (_, i) => ({ ...shuffled[i % shuffled.length] }));
}

// Recortar el resultado de la IA según la estructura del slot
function _aplicarEstructura(data, slot) {
    const out = { ...data };
    // Recortar reqs al número indicado
    const reqs = (out.requisitos_base || []).slice(0, slot.num_reqs);
    // Si la IA no generó suficientes, mantener los que haya
    out.requisitos_base = reqs.length ? reqs : (out.requisitos_base || []);
    // Limpiar/mantener condicionales
    out.efectos_condicionales = slot.tiene_cond ? (out.efectos_condicionales || []) : [];
    // Respetar el tipo del slot
    out.tipo = slot.tipo;
    return out;
}

// ── Llamada a Supabase edge function ─────────────────────────
async function _invocarIA(prompt, contexto) {
    const { data, error } = await supabase.functions.invoke('bnh-ai-injector', {
        body: { prompt, contextoAdicional: contexto }
    });
    if (error) throw new Error(error.message || JSON.stringify(error));
    if (!data)           throw new Error('Sin datos de respuesta.');
    if (data.error)      throw new Error(data.error);
    if (!data.resultado) throw new Error('Respuesta vacía de la IA.');

    const raw = data.resultado
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/,      '')
        .replace(/\s*```$/,      '')
        .trim();
    return raw;
}

// ── Prompt para medalla individual ───────────────────────────
function _buildPromptSingle(instruccion, estadoActual) {
    const tieneContenido = estadoActual.nombre || estadoActual.efecto_base || estadoActual.requisitos_base?.length;
    const estadoStr = tieneContenido
        ? `ESTADO ACTUAL DEL FORMULARIO (puedes modificar solo lo que el usuario pida, o todo si la instrucción lo requiere):
nombre: ${estadoActual.nombre || '(vacío)'}
costo_ctl: ${estadoActual.costo_ctl}
efecto_base: ${estadoActual.efecto_base || '(vacío)'}
tipo: ${estadoActual.tipo}
requisitos_base: ${JSON.stringify(estadoActual.requisitos_base || [])}
efectos_condicionales: ${JSON.stringify(estadoActual.efectos_condicionales || [])}`
        : 'FORMULARIO VACÍO — genera una medalla nueva desde cero.';

    return `
${GUIA_MEDALLAS}

────────────────────────────────────────────
TAGS DISPONIBLES — SOLO usa tags de esta lista:
${_getTagsDisponibles()}

────────────────────────────────────────────
MEDALLAS DEL CATÁLOGO — únicos nombres válidos para !nombre!:
${_getMedallasRef()}

────────────────────────────────────────────
NOMBRES YA EXISTENTES — NO repetir:
${_getNombres()}

────────────────────────────────────────────
EJEMPLOS DE ESTILO:
${_get5Ejemplos()}

────────────────────────────────────────────
${estadoStr}

────────────────────────────────────────────
INSTRUCCIÓN DEL USUARIO:
${instruccion || '(generar medalla nueva coherente con el contexto)'}

────────────────────────────────────────────
INSTRUCCIONES FINALES:
1. Si el formulario tiene contenido, respeta lo que el usuario NO pidió cambiar.
2. Si el formulario está vacío, crea una medalla nueva completa.
3. El efecto_base es SOLO mecánica: stats, PT, medallas, turnos. Sin narrativa.
4. Ajusta costo_ctl al tipo y potencia real.
5. Responde ÚNICAMENTE con un objeto JSON válido, sin markdown ni texto extra.

REGLAS CRÍTICAS DE CAMPOS — NUNCA las ignores:
- "pts_minimos" en requisitos_base: NUNCA 0 salvo tag de mera presencia. Usa 20, 40, 80 o 160 según profundidad.
- "efectos_condicionales": si incluyes alguno, DEBE tener "tag" real (de la lista), "pts_minimos" > 0, y "efecto" con mecánica. NUNCA tag vacío.

FORMATO:
{
  "nombre": "...",
  "costo_ctl": 5,
  "efecto_base": "Descripción mecánica directa.",
  "tipo": "activa",
  "requisitos_base": [{"tag": "#TagReal", "pts_minimos": 40}],
  "efectos_condicionales": [{"tag": "#TagReal", "pts_minimos": 60, "efecto": "Descripción del efecto condicional."}]
}
`.trim();
}

// ── Prompt para set múltiple ──────────────────────────────────
function _buildPromptMulti(instruccion, slots, estadosActuales) {
    const N = slots.length;

    // Serializar estado actual de cada formulario
    const estadosStr = estadosActuales.map((est, i) => {
        const slot = slots[i];
        const tieneContenido = est.nombre || est.efecto_base || est.requisitos_base?.length;
        if (tieneContenido) {
            return `  Medalla ${i+1} (tipo obligatorio: "${slot.tipo}", reqs: ${slot.num_reqs}, cond: ${slot.tiene_cond}):
    ESTADO ACTUAL → nombre: "${est.nombre}", efecto: "${est.efecto_base}", tipo: "${est.tipo}"
    reqs: ${JSON.stringify(est.requisitos_base)}, conds: ${JSON.stringify(est.efectos_condicionales)}`;
        }
        return `  Medalla ${i+1}: VACÍA (tipo obligatorio: "${slot.tipo}", exactamente ${slot.num_reqs} req(s), cond: ${slot.tiene_cond})`;
    }).join('\n\n');

    return `
${GUIA_MEDALLAS}

────────────────────────────────────────────
TAGS DISPONIBLES — SOLO usa tags de esta lista exacta:
${_getTagsDisponibles()}
NUNCA uses un tag que no esté aquí.

────────────────────────────────────────────
MEDALLAS DEL CATÁLOGO — únicos nombres válidos para !nombre!:
${_getMedallasRef()}

────────────────────────────────────────────
NOMBRES YA EXISTENTES — NO repetir ninguno:
${_getNombres()}

────────────────────────────────────────────
EJEMPLOS DE ESTILO:
${_get5Ejemplos()}

────────────────────────────────────────────
ESTADO ACTUAL DE LOS ${N} FORMULARIOS:
${estadosStr}

────────────────────────────────────────────
INSTRUCCIÓN DEL USUARIO:
${instruccion || '(generar set coherente, temáticamente relacionado)'}

────────────────────────────────────────────
REGLAS DE ESTRUCTURA — OBLIGATORIAS:
${slots.map((s, i) => `  Medalla ${i+1}: tipo="${s.tipo}", exactamente ${s.num_reqs} requisito(s), efectos_condicionales=${s.tiene_cond ? 'al menos 1' : 'array vacío []'}`).join('\n')}

REGLAS DE NOMBRES:
- Cada medalla DISTINTO nombre. Mezcla 1 y 2 palabras. Evita patrón "Adjetivo+Sustantivo" repetido.
- Sustantivos crudos, verbos, conceptos directos.

INSTRUCCIONES FINALES:
1. Si un formulario tiene contenido, aplica solo lo que la instrucción del usuario pida; mantén lo demás.
2. Si está vacío, genera contenido nuevo coherente con el tema/instrucción.
3. Los formularios del set deben complementarse temáticamente pero ser mecánicamente distintos.
4. Responde ÚNICAMENTE con un array JSON de ${N} objetos. Sin markdown ni texto extra.

REGLAS CRÍTICAS DE CAMPOS — NUNCA las ignores:
- "pts_minimos" en requisitos_base: OBLIGATORIO, NUNCA 0 salvo que el tag sea meramente de presencia. Usa 20 (básico), 40 (moderado), 80 (avanzado), 160 (maestro). Calibra según el peso del efecto.
- "efectos_condicionales": cada objeto DEBE tener "tag" (un #Tag real de la lista), "pts_minimos" (número > 0), y "efecto" (descripción mecánica). NUNCA dejes "tag" vacío ni "pts_minimos" en 0.
- Si un slot exige cond=true, el array efectos_condicionales NUNCA puede estar vacío ni tener objetos sin tag.

FORMATO EXACTO por objeto (respeta los tipos de valor):
{"nombre":"Nombre","costo_ctl":5,"efecto_base":"Descripción mecánica.","tipo":"activa","requisitos_base":[{"tag":"#TagReal","pts_minimos":40}],"efectos_condicionales":[{"tag":"#TagReal","pts_minimos":60,"efecto":"Descripción mecánica del efecto condicional."}]}
`.trim();
}

// ── HTML del bloque IA inline ─────────────────────────────────
// Se inserta dentro del mini-form o del form admin/prop.
// iaId: id único para este bloque (evita colisiones entre múltiples mini-forms)

export function renderBloqueIA(iaId, onGenerar) {
    return `
<div id="ia-bloque-${iaId}" style="background:#f5f0ff;border:1.5px solid #9b59b6;border-radius:8px;padding:10px 12px;margin-top:4px;">
    <div style="font-size:0.7em;font-weight:800;color:#6c3483;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">✨ Asistente IA</div>
    <div style="display:flex;gap:6px;align-items:flex-start;">
        <textarea id="ia-input-${iaId}" rows="2" 
            style="flex:1;padding:5px 8px;border:1px solid #c8a8e9;border-radius:6px;font-size:0.8em;resize:vertical;font-family:inherit;background:white;"
            placeholder="Ej: cambia el nombre a 'Trauma Latente', quita vida en lugar de dar protección, añade un requisito #Combate…"></textarea>
        <button id="ia-btn-${iaId}"
            style="background:linear-gradient(135deg,#4a235a,#8e44ad);color:white;border:none;border-radius:6px;padding:6px 12px;font-size:0.78em;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;"
            onclick="(${onGenerar})('${iaId}')">✨ IA</button>
    </div>
    <div id="ia-status-${iaId}" style="font-size:0.73em;color:#888;margin-top:4px;min-height:14px;"></div>
</div>`;
}

// ── Lógica de generación individual (mini-form) ───────────────

window._iaGenerarMini = async function(iaId) {
    // iaId === fid para mini-forms
    const fid = iaId;
    const inputEl  = document.getElementById(`ia-input-${iaId}`);
    const btnEl    = document.getElementById(`ia-btn-${iaId}`);
    const statusEl = document.getElementById(`ia-status-${iaId}`);

    const instruccion = inputEl?.value.trim() || '';

    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '⏳…'; }
    if (statusEl) { statusEl.textContent = 'Esperando a la IA…'; statusEl.style.color = '#8e44ad'; }

    try {
        const estadoActual = _leerMiniForm(fid);
        const prompt = _buildPromptSingle(instruccion, estadoActual);
        const contexto = `BNH-FUSION v5.0 — RPG de superhéroes. Edición individual de medalla.`;

        const raw = await _invocarIA(prompt, contexto);
        const result = JSON.parse(raw);

        _llenarMiniForm(fid, result);

        if (statusEl) { statusEl.textContent = '✅ Aplicado'; statusEl.style.color = '#27ae60'; }
        if (inputEl) inputEl.value = '';
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);

    } catch (err) {
        console.error('[medallas-ai mini]', err);
        if (statusEl) { statusEl.textContent = '❌ ' + (err.message || 'Error'); statusEl.style.color = '#e74c3c'; }
    } finally {
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = '✨ IA'; }
    }
};

// ── Lógica de generación para form admin ─────────────────────

window._iaGenerarAdmin = async function(iaId) {
    const inputEl  = document.getElementById(`ia-input-${iaId}`);
    const btnEl    = document.getElementById(`ia-btn-${iaId}`);
    const statusEl = document.getElementById(`ia-status-${iaId}`);

    const instruccion = inputEl?.value.trim() || '';

    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '⏳…'; }
    if (statusEl) { statusEl.textContent = 'Esperando a la IA…'; statusEl.style.color = '#8e44ad'; }

    try {
        const estadoActual = _leerFormAdmin();
        const prompt = _buildPromptSingle(instruccion, estadoActual);
        const contexto = `BNH-FUSION v5.0 — RPG de superhéroes. Edición de medalla.`;

        const raw = await _invocarIA(prompt, contexto);
        const result = JSON.parse(raw);

        _llenarFormAdmin(result);

        if (statusEl) { statusEl.textContent = '✅ Aplicado'; statusEl.style.color = '#27ae60'; }
        if (inputEl) inputEl.value = '';
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);

    } catch (err) {
        console.error('[medallas-ai admin]', err);
        if (statusEl) { statusEl.textContent = '❌ ' + (err.message || 'Error'); statusEl.style.color = '#e74c3c'; }
    } finally {
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = '✨ IA'; }
    }
};

// ── Lógica de generación para form propuesta ─────────────────

window._iaGenerarProp = async function(iaId) {
    const inputEl  = document.getElementById(`ia-input-${iaId}`);
    const btnEl    = document.getElementById(`ia-btn-${iaId}`);
    const statusEl = document.getElementById(`ia-status-${iaId}`);

    const instruccion = inputEl?.value.trim() || '';

    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '⏳…'; }
    if (statusEl) { statusEl.textContent = 'Esperando a la IA…'; statusEl.style.color = '#8e44ad'; }

    try {
        const estadoActual = _leerFormProp();
        const prompt = _buildPromptSingle(instruccion, estadoActual);
        const contexto = `BNH-FUSION v5.0 — RPG de superhéroes. Propuesta de medalla.`;

        const raw = await _invocarIA(prompt, contexto);
        const result = JSON.parse(raw);

        _llenarFormProp(result);

        if (statusEl) { statusEl.textContent = '✅ Aplicado'; statusEl.style.color = '#27ae60'; }
        if (inputEl) inputEl.value = '';
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);

    } catch (err) {
        console.error('[medallas-ai prop]', err);
        if (statusEl) { statusEl.textContent = '❌ ' + (err.message || 'Error'); statusEl.style.color = '#e74c3c'; }
    } finally {
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = '✨ IA'; }
    }
};

// ── Generación múltiple (barra de control global) ─────────────
// Genera TODOS los formularios visibles de una vez con una sola instrucción.

window._iaGenerarTodos = async function(prefix, N) {
    const inputEl  = document.getElementById('ia-global-input');
    const btnEl    = document.getElementById('ia-global-btn');
    const statusEl = document.getElementById('ia-global-status');

    const instruccion = inputEl?.value.trim() || '';

    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '⏳ Generando…'; }
    if (statusEl) { statusEl.textContent = `Generando ${N} medallas…`; statusEl.style.color = '#8e44ad'; }

    try {
        // Leer estado actual de todos los formularios
        const estadosActuales = Array.from({ length: N }, (_, i) => _leerMiniForm(`${prefix}${i}`));

        // Generar slots con estructura irregular (el programa decide, no la IA)
        const slots = _generarEstructuraSlots(N);

        const prompt  = _buildPromptMulti(instruccion, slots, estadosActuales);
        const contexto = `BNH-FUSION v5.0 — RPG de superhéroes. Set de ${N} medallas.`;

        const raw = await _invocarIA(prompt, contexto);
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) throw new Error('La IA no devolvió un array de medallas.');

        // Aplicar estructura irregular del programa sobre cada resultado de la IA
        arr.forEach((data, i) => {
            if (i >= N) return;
            const fid = `${prefix}${i}`;
            const conEstructura = _aplicarEstructura(data, slots[i]);
            _llenarMiniForm(fid, conEstructura);
        });

        if (statusEl) { statusEl.textContent = `✅ ${arr.length} medallas generadas`; statusEl.style.color = '#27ae60'; }
        if (inputEl) inputEl.value = '';
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 4000);

    } catch (err) {
        console.error('[medallas-ai global]', err);
        if (statusEl) { statusEl.textContent = '❌ ' + (err.message || 'Error'); statusEl.style.color = '#e74c3c'; }
    } finally {
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = `✨ IA ×${N}`; }
    }
};

// ── HTML de la barra IA global (para renderFormsMultiple) ─────
export function renderBarraIAGlobal(prefix, N) {
    return `
<div style="background:#f5f0ff;border:1.5px solid #9b59b6;border-radius:10px;padding:12px 16px;margin-bottom:14px;">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
        <span style="font-size:0.78em;font-weight:800;color:#6c3483;text-transform:uppercase;letter-spacing:.5px;">✨ IA Global — ${N} medallas</span>
        <span style="font-size:0.72em;color:#9b59b6;">· edita o genera todos los formularios a la vez</span>
    </div>
    <div style="display:flex;gap:8px;align-items:flex-start;">
        <textarea id="ia-global-input" rows="2"
            style="flex:1;padding:6px 10px;border:1px solid #c8a8e9;border-radius:6px;font-size:0.82em;resize:vertical;font-family:inherit;background:white;"
            placeholder="Ej: crea un set de medallas de fuego temáticas entre sí, o: a la primera cámbiale el nombre a 'Llama', a la segunda añade un requisito #Fuego…"></textarea>
        <button id="ia-global-btn"
            style="background:linear-gradient(135deg,#1a1a2e,#6c3483);color:white;border:none;border-radius:8px;padding:8px 16px;font-size:0.82em;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;"
            onclick="window._iaGenerarTodos('${prefix}',${N})">✨ IA ×${N}</button>
    </div>
    <div id="ia-global-status" style="font-size:0.73em;color:#888;margin-top:4px;min-height:14px;"></div>
</div>`;
}

// ── Compatibilidad: window._medallaIA (ya no abre modal, aplica inline) ──
// Se mantiene por si algo en medallas-ui.js aún lo llama.
window._medallaIA = {
    abrir(fid, tipo) {
        // No-op: la IA ahora está inline. Ignorar llamada.
        console.info('[medallas-ai] _medallaIA.abrir ignorado — IA ya es inline.');
    },
    cerrar() {},
    generar() {},
    aplicar() {},
    abrirMulti(prefix, N) {
        console.info('[medallas-ai] _medallaIA.abrirMulti ignorado — usar barra IA global inline.');
    },
    generarMulti() {},
    aplicarMulti() {}
};
