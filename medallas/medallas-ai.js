// ============================================================
// medallas/medallas-ai.js — IA Generadora de Medallas
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
  @Nombre_Personaje@ → SOLO para apuntar a un personaje por su nombre específico. Si te refieres a personajes en general o aliados/rivales, usa lenguaje natural sin el símbolo @.
`.trim();

// ── 5 medallas aleatorias del catálogo como ejemplos ────────
function _get5Ejemplos() {
    const pool = (medallas || []).filter(m => !m.propuesta && m.nombre && m.efecto_desc);
    if (!pool.length) return '(catálogo vacío, sin ejemplos disponibles)';

    const sample = [...pool].sort(() => Math.random() - 0.5).slice(0, 5);
    return sample.map(m => {
        const tags = (m.requisitos_base || []).map(r =>
            (r.tag.startsWith('#') ? r.tag : '#' + r.tag)
        ).join(', ');
        const reqs = (m.requisitos_base || [])
            .map(r => `    ${r.tag.startsWith('#') ? r.tag : '#' + r.tag}: min. ${r.pts_minimos} PT`)
            .join('\n');
        const conds = (m.efectos_condicionales || [])
            .map(ec => `    SI ${ec.tag} >= ${ec.pts_minimos} PT: ${ec.efecto}`)
            .join('\n');
        return [
            `[${m.nombre}] | ${m.costo_ctl} CTL | Tipo: ${m.tipo || 'activa'}`,
            `  Tags: ${tags || '(sin tags)'}`,
            `  [EFECTO] ${m.efecto_desc}`,
            reqs ? `  [REQUISITOS]\n${reqs}` : '',
            conds ? `  [CONDICIONALES]\n${conds}` : '',
        ].filter(Boolean).join('\n');
    }).join('\n\n---\n\n');
}

// ── Lista de tags disponibles en el catálogo ─────────────────
function _getTagsDisponibles() {
    const tags = (TAGS_CANONICOS || []).filter(Boolean);
    if (!tags.length) return '(catálogo de tags vacío)';
    return tags.join(', ');
}


function _getNombres() {
    return (medallas || []).map(m => m.nombre).filter(Boolean).join(', ');
}

// ── Lista de medallas reales para que la IA pueda referenciarlas con !nombre! ───────────
function _getMedallasRef() {
    const pool = (medallas || []).filter(m => m.nombre);
    if (!pool.length) return '(catálogo vacío)';
    return pool.map(m => `!${m.nombre}!`).join(', ');
}

// ── Leer tags ya cargados en el formulario ───────────────────
function _leerTagsForm(tipo, fid) {
    let selector = '';
    if (tipo === 'mini')  selector = `#mf-reqs-${fid} input[placeholder="#Tag"]`;
    if (tipo === 'prop')  selector = '#prop-reqs [id^="req-tag-"]';
    if (tipo === 'admin') selector = '#fm-reqs [id^="req-tag-"]';
    if (!selector) return [];
    return [...document.querySelectorAll(selector)]
        .map(el => el.value.trim())
        .filter(t => t.startsWith('#'));
}

// ── Llenar formulario con el resultado de la IA ──────────────
function _llenarForm(tipo, fid, data) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = (val ?? '');
    };

    // ── Mini-form (múltiple) ──
    if (tipo === 'mini') {
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
            condsDiv.innerHTML = (data.efectos_condicionales || []).map((ec, i) => `
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
                window._mfCondCounters[fid] = (data.efectos_condicionales?.length || 1) - 1;
        }
    }

    // ── Formulario de propuesta simple ──
    if (tipo === 'prop') {
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
            condsDiv.innerHTML = (data.efectos_condicionales || []).map((ec, i) => `
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
            window._propCondCount = (data.efectos_condicionales?.length || 1) - 1;
        }
    }

    // ── Formulario admin (crear/editar) ──
    if (tipo === 'admin') {
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
            condsDiv.innerHTML = (data.efectos_condicionales || []).map((ec, i) => `
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
            window._fm_condCount = data.efectos_condicionales?.length || 0;
        }
    }
}

// ── Preview de la medalla generada ───────────────────────────
function _renderPreview(container, data) {
    if (!container) return;

    const tipoColor = data.tipo === 'pasiva' ? '#27ae60' : data.tipo === 'definitiva' ? '#8e44ad' : '#2980b9';
    const reqs = (data.requisitos_base || []).map(r =>
        `<span style="font-size:0.72em;background:rgba(52,152,219,0.1);color:#2980b9;
            border:1px solid rgba(52,152,219,0.3);padding:2px 8px;border-radius:8px;font-weight:700;">
            ${_esc(r.tag)} ≥${r.pts_minimos} PT</span>`
    ).join(' ');
    const conds = (data.efectos_condicionales || []).map(ec =>
        `<div style="font-size:0.75em;padding:6px 10px;background:rgba(243,156,18,0.07);
            border:1px solid rgba(243,156,18,0.3);border-radius:6px;margin-top:4px;">
            <b style="color:#e67e22;">⚡ SI ${_esc(ec.tag)} ≥${ec.pts_minimos} PT:</b>
            <span style="color:#555;"> ${_esc(ec.efecto)}</span>
         </div>`
    ).join('');

    container.style.display = 'block';
    container.innerHTML = `
    <div style="border:2px solid #6c3483;border-radius:10px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#1a1a2e,#6c3483);color:white;
            padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
            <div style="font-family:'Cinzel',serif;font-size:0.95em;font-weight:700;">${_esc(data.nombre)}</div>
            <div style="display:flex;gap:6px;align-items:center;">
                <span style="font-size:0.7em;font-weight:700;background:rgba(255,255,255,0.15);
                    padding:2px 8px;border-radius:10px;text-transform:uppercase;">${_esc(data.tipo || 'activa')}</span>
                <span style="font-size:0.9em;font-weight:800;">${data.costo_ctl} CTL</span>
            </div>
        </div>
        <div style="padding:12px 14px;background:#faf8ff;display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:0.84em;color:#333;line-height:1.6;">${_esc(data.efecto_base)}</div>
            ${reqs ? `<div style="display:flex;flex-wrap:wrap;gap:4px;">${reqs}</div>` : ''}
            ${conds}
            <div style="border-top:1px solid #e0d8f0;padding-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <button class="btn" style="background:linear-gradient(135deg,#1a1a2e,#6c3483);
                    color:white;border-color:#6c3483;flex:1;min-width:140px;"
                    onclick="window._medallaIA.aplicar()">✅ Aplicar al formulario</button>
                <button class="btn btn-outline" style="font-size:0.82em;"
                    onclick="window._medallaIA.generar()">🔄 Regenerar</button>
            </div>
        </div>
    </div>`;
}

// ── Render del panel principal ────────────────────────────────
function _renderPanel(tipo, fid, tagsActuales) {
    let root = document.getElementById('medalla-ai-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'medalla-ai-root';
        document.body.appendChild(root);
    }

    const subtitulo = tipo === 'mini'
        ? `Medalla ${fid.replace(/^m[mp]/, '#')}` // mm0 → #0
        : tipo === 'prop' ? 'Propuesta de medalla' : 'Formulario admin';

    const tagsChips = tagsActuales.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:4px;">
            ${tagsActuales.map(t =>
                `<span style="background:rgba(52,152,219,0.1);border:1px solid rgba(52,152,219,0.35);
                    color:#2980b9;padding:3px 10px;border-radius:10px;font-size:0.78em;font-weight:700;">${_esc(t)}</span>`
            ).join('')}
           </div>`
        : `<p style="font-size:0.78em;color:#aaa;margin:0;font-style:italic;">
            Sin tags en el formulario. Descríbelos en el concepto.</p>`;

    root.innerHTML = `
    <div id="medalla-ai-backdrop" style="
        position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:1200;
        display:flex;align-items:flex-start;justify-content:center;
        padding:30px 16px 60px;overflow-y:auto;
    " onclick="if(event.target===this)window._medallaIA.cerrar()">
        <div style="background:white;border-radius:14px;width:100%;max-width:580px;
            box-shadow:0 16px 60px rgba(0,0,0,0.4);overflow:hidden;">

            <!-- Header -->
            <div style="background:linear-gradient(135deg,#1a1a2e,#6c3483);color:white;
                padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <div style="font-family:'Cinzel',serif;font-size:1.05em;font-weight:700;">✨ IA — Generar Medalla</div>
                    <div style="font-size:0.72em;color:rgba(255,255,255,0.55);margin-top:2px;">${subtitulo}</div>
                </div>
                <button onclick="window._medallaIA.cerrar()" style="
                    background:rgba(255,255,255,0.15);border:none;color:white;
                    border-radius:50%;width:30px;height:30px;cursor:pointer;font-size:1.1em;line-height:1;">×</button>
            </div>

            <div style="padding:18px;display:flex;flex-direction:column;gap:14px;">

                <!-- Tags base del formulario -->
                <div>
                    <div style="font-size:0.75em;font-weight:700;color:#666;
                        text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">
                        Tags del formulario (requisitos base)
                    </div>
                    ${tagsChips}
                </div>

                <!-- Concepto -->
                <div>
                    <label style="font-size:0.78em;font-weight:700;color:#444;display:block;margin-bottom:5px;">
                        Concepto o idea para la medalla
                    </label>
                    <textarea id="ai-medalla-concepto" class="inp" rows="3"
                        placeholder="Ej: una medalla que drene POT del rival y lo transfiera, que invalide !Estrella de Carne!, que escale con los PT de #Trauma, que aplique un estado de Luto..."
                        style="resize:vertical;font-size:0.85em;"></textarea>
                    <div style="font-size:0.71em;color:#aaa;margin-top:3px;">
                        Menciona efectos, condiciones, medallas a invalidar (!así!), personajes (@así@) o tags adicionales (#así).
                    </div>
                </div>

                <!-- Botones -->
                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                    <button id="ai-medalla-gen-btn" class="btn"
                        style="background:linear-gradient(135deg,#1a1a2e,#6c3483);color:white;
                            border-color:#6c3483;min-width:150px;font-weight:700;"
                        onclick="window._medallaIA.generar()">✨ Generar</button>
                    <button class="btn btn-outline" onclick="window._medallaIA.cerrar()">Cancelar</button>
                    <span id="ai-medalla-status" style="font-size:0.78em;color:#888;"></span>
                </div>

                <!-- Resultado -->
                <div id="ai-medalla-result" style="display:none;"></div>

            </div>
        </div>
    </div>`;
}

// ── Estado interno ────────────────────────────────────────────
let _iaTipo   = null;
let _iaFid    = null;
let _iaResult = null;

// ── API pública (window._medallaIA) ──────────────────────────
window._medallaIA = {

    abrir(fid, tipo) {
        _iaTipo   = tipo;
        _iaFid    = fid;
        _iaResult = null;
        const tags = _leerTagsForm(tipo, fid);
        _renderPanel(tipo, fid, tags);
    },

    cerrar() {
        const root = document.getElementById('medalla-ai-root');
        if (root) root.innerHTML = '';
        _iaResult = null;
    },

    async generar() {
        const concepto   = document.getElementById('ai-medalla-concepto')?.value.trim() || '';
        const btn        = document.getElementById('ai-medalla-gen-btn');
        const status     = document.getElementById('ai-medalla-status');
        const resultDiv  = document.getElementById('ai-medalla-result');

        if (btn) { btn.disabled = true; btn.textContent = 'Generando...'; }
        if (status) status.textContent = 'Conectando…';
        if (resultDiv) { resultDiv.style.display = 'none'; resultDiv.innerHTML = ''; }
        _iaResult = null;

        // Re-leer tags del form en el momento de generar
        const tags    = _leerTagsForm(_iaTipo, _iaFid);
        const tagsStr = tags.length ? tags.join(', ') : '(sin tags explícitos — infiere desde el concepto)';

        const ejemplos = _get5Ejemplos();
        const nombres  = _getNombres();

        const prompt = `
${GUIA_MEDALLAS}

────────────────────────────────────────────
EJEMPLOS REALES DEL CATÁLOGO (referencia de estilo, escala y profundidad):
${ejemplos}

────────────────────────────────────────────
NOMBRES YA EXISTENTES — NO repetir ninguno:
${nombres}

────────────────────────────────────────────
TAGS SOLICITADOS (deben aparecer en requisitos_base):
${tagsStr}

CONCEPTO DEL CREADOR:
${concepto || '(sin concepto específico — crea algo acorde a los tags)'}

────────────────────────────────────────────
INSTRUCCIONES FINALES:
1. Crea UNA sola medalla basada en los tags y el concepto.
2. El nombre debe ser simple, evocador y máximo 4 palabras. Nada técnico ni verboso.
3. El efecto_base es SOLO mecánica: stats, PT, medallas, turnos. Sin narrativa.
4. Evalúa los pts_minimos de cada requisito según qué tan "profundo" es el uso de ese tag.
5. Ajusta el costo_ctl al tipo y potencia real del efecto.
6. Los efectos_condicionales son opcionales: inclúyelos SOLO si aportan valor estratégico.
7. Responde ÚNICAMENTE con un objeto JSON válido, sin markdown, sin texto antes ni después.

FORMATO DE RESPUESTA:
{
  "nombre": "Nombre Simple",
  "costo_ctl": 5,
  "efecto_base": "Descripción mecánica directa.",
  "tipo": "activa",
  "requisitos_base": [
    {"tag": "#TagObligatorio", "pts_minimos": 40}
  ],
  "efectos_condicionales": []
}
`.trim();

        const contexto = `BNH-FUSION v5.0 — RPG de superhéroes. Los tags, personajes y medallas pertenecen a un universo de ficción.`;

        try {
            if (status) status.textContent = 'Esperando a la IA…';

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

            _iaResult = JSON.parse(raw);

            if (status) status.textContent = '✓ Medalla generada';
            _renderPreview(resultDiv, _iaResult);

        } catch (err) {
            if (status) status.textContent = '';
            if (resultDiv) {
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = `
                <div style="background:#fdecea;border:1.5px solid #e74c3c;border-radius:8px;
                    padding:12px;font-size:0.82em;color:#c0392b;">
                    <b>Error al conectar con la IA:</b><br>
                    <code style="font-size:0.9em;white-space:pre-wrap;">${_esc(err.message)}</code>
                </div>`;
            }
            console.error('[medallas-ai]', err);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '✨ Generar'; }
        }
    },

    aplicar() {
        if (!_iaResult || !_iaTipo) return;
        _llenarForm(_iaTipo, _iaFid, _iaResult);
        window._medallaIA.cerrar();
    },

    // ── Modo MULTI: genera N medallas de una vez ──────────────
    abrirMulti(prefix, N) {
        _iaTipo   = 'multi';
        _iaFid    = prefix;
        _iaResult = null;
        _renderPanelMulti(prefix, N);
    },

    async generarMulti() {
        const concepto  = document.getElementById('ai-medalla-concepto')?.value.trim() || '';
        const N         = parseInt(document.getElementById('ai-multi-n')?.value || '4');
        const prefix    = document.getElementById('ai-multi-prefix')?.value || 'mm';
        const btn       = document.getElementById('ai-medalla-gen-btn');
        const status    = document.getElementById('ai-medalla-status');
        const resultDiv = document.getElementById('ai-medalla-result');

        if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }
        if (status) status.textContent = 'Conectando…';
        if (resultDiv) { resultDiv.style.display = 'none'; resultDiv.innerHTML = ''; }

        const ejemplos   = _get5Ejemplos();
        const nombres    = _getNombres();
        const tagsDisp   = _getTagsDisponibles();
        const medallasRef = _getMedallasRef();

        // Pre-asignar estructura de variedad para cada medalla (shuffle real)
        const _BASE_SLOTS = [
            {tipo:'pasiva',     num_reqs:1, tiene_cond:false},
            {tipo:'activa',     num_reqs:1, tiene_cond:false},
            {tipo:'activa',     num_reqs:2, tiene_cond:true },
            {tipo:'definitiva', num_reqs:1, tiene_cond:false},
        ];
        // Fisher-Yates shuffle de los slots base
        const _shuffled = [..._BASE_SLOTS].sort(() => Math.random() - 0.5);
        // Si N > 4, repetir y re-mezclar
        const slots = Array.from({length: N}, (_, i) => ({..._shuffled[i % 4]}));

        const slotDesc = slots.map((s, i) => {
            const condStr = s.tiene_cond
                ? `"efectos_condicionales": [{"tag": "#TagDeLaLista", "pts_minimos": N, "efecto": "..."}]`
                : `"efectos_condicionales": []`;
            const reqsEx = Array.from({length: s.num_reqs}, () => `{"tag": "#TagDeLaLista", "pts_minimos": N}`).join(', ');
            return `  Medalla ${i+1}: tipo="${s.tipo}", exactamente ${s.num_reqs} requisito(s), condicional=${s.tiene_cond}
    → "requisitos_base": [${reqsEx}]
    → ${condStr}`;
        }).join('\n\n');

        const prompt = `
${GUIA_MEDALLAS}

────────────────────────────────────────────
TAGS DISPONIBLES — SOLO usa tags de esta lista exacta:
${tagsDisp}
NUNCA uses un tag que no esté aquí. Si el concepto menciona uno que no existe, usa el más parecido.

────────────────────────────────────────────
MEDALLAS DEL CATÁLOGO — Únicas que puedes referenciar con !nombre!:
${medallasRef}
Si no necesitas referenciar ninguna medalla específica, simplemente no uses !nombre!.

────────────────────────────────────────────
NOMBRES YA EXISTENTES — NO repetir ninguno:
${nombres}

────────────────────────────────────────────
EJEMPLOS DE ESTILO (solo referencia):
${ejemplos}

────────────────────────────────────────────
CONCEPTO DEL CREADOR:
${concepto || '(sin concepto — crea algo coherente con los tags)'}

────────────────────────────────────────────
ESTRUCTURA FIJA — Debes respetar esto exactamente para cada medalla:

${slotDesc}

────────────────────────────────────────────
NOMBRES — LEE ESTO CON ATENCIÓN:
- Cada medalla necesita un nombre DISTINTO en estilo: una puede ser de 1 palabra ("Chantaje"), otra de 2 ("Legado Oculto"), otra de 1 palabra diferente ("Censura"). NO uses el mismo patrón (adjetivo+sustantivo) para todas.
- Palabras directas: sustantivos crudos, verbos, conceptos. Evita el patrón "X Y" donde X es adjetivo y Y es sustantivo para más de 1 nombre del set.
- Prohibido: "Susurro Silente", "Velo de Mentiras", "Carga de Culpa" — demasiado compuestos y líricos.
- Permitido: "Susurro", "Chantaje", "Traición", "Mentira", "Revelación", "Colapso", "Herida"

Responde ÚNICAMENTE con un array JSON de ${N} objetos. Sin markdown, sin texto extra.
Formato por objeto: {"nombre":"...","costo_ctl":N,"efecto_base":"...","tipo":"...","requisitos_base":[...],"efectos_condicionales":[...]}
`.trim();

        const contexto = `BNH-FUSION v5.0 — RPG de superhéroes. Set de ${N} medallas temáticas.`;

        try {
            if (status) status.textContent = 'Esperando a la IA…';

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

            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) throw new Error('La IA no devolvió un array de medallas.');

            _iaResult = arr;

            if (status) status.textContent = `✓ ${arr.length} medallas generadas`;
            _renderPreviewMulti(resultDiv, arr, prefix);

        } catch (err) {
            if (status) status.textContent = '';
            if (resultDiv) {
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = `
                <div style="background:#fdecea;border:1.5px solid #e74c3c;border-radius:8px;
                    padding:12px;font-size:0.82em;color:#c0392b;">
                    <b>Error al conectar con la IA:</b><br>
                    <code style="font-size:0.9em;white-space:pre-wrap;">${_esc(err.message)}</code>
                </div>`;
            }
            console.error('[medallas-ai multi]', err);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '✨ Generar set'; }
        }
    },

    aplicarMulti() {
        if (!Array.isArray(_iaResult)) return;
        const prefix = document.getElementById('ai-multi-prefix')?.value || 'mm';
        _iaResult.forEach((data, i) => _llenarForm('mini', `${prefix}${i}`, data));
        window._medallaIA.cerrar();
    }
};

// ── Preview múltiple ──────────────────────────────────────────
function _renderPreviewMulti(container, arr, prefix) {
    if (!container) return;
    const tipoColor = t => t === 'pasiva' ? '#27ae60' : t === 'definitiva' ? '#8e44ad' : '#2980b9';

    const cards = arr.map((data, i) => {
        const reqs = (data.requisitos_base || []).map(r =>
            `<span style="font-size:0.7em;background:rgba(52,152,219,0.1);color:#2980b9;
                border:1px solid rgba(52,152,219,0.3);padding:1px 7px;border-radius:8px;font-weight:700;">
                ${_esc(r.tag)} ≥${r.pts_minimos} PT</span>`
        ).join(' ');
        const conds = (data.efectos_condicionales || []).filter(ec => ec.tag && ec.efecto).map(ec =>
            `<div style="font-size:0.72em;padding:4px 8px;background:rgba(243,156,18,0.07);
                border:1px solid rgba(243,156,18,0.3);border-radius:5px;margin-top:3px;">
                <b style="color:#e67e22;">⚡ SI ${_esc(ec.tag)} ≥${ec.pts_minimos ?? 0} PT:</b>
                <span style="color:#555;"> ${_esc(ec.efecto)}</span>
             </div>`
        ).join('');

        return `
        <div style="border:1.5px solid #6c3483;border-radius:9px;overflow:hidden;min-width:0;">
            <div style="background:linear-gradient(135deg,#1a1a2e,#6c3483);color:white;
                padding:8px 12px;display:flex;justify-content:space-between;align-items:center;">
                <div style="font-family:'Cinzel',serif;font-size:0.85em;font-weight:700;">${_esc(data.nombre)}</div>
                <div style="display:flex;gap:5px;align-items:center;">
                    <span style="font-size:0.65em;font-weight:700;background:rgba(255,255,255,0.15);
                        padding:1px 6px;border-radius:8px;text-transform:uppercase;">${_esc(data.tipo||'activa')}</span>
                    <span style="font-size:0.85em;font-weight:800;">${data.costo_ctl} CTL</span>
                </div>
            </div>
            <div style="padding:10px 12px;background:#faf8ff;display:flex;flex-direction:column;gap:6px;font-size:0.82em;">
                <div style="color:#333;line-height:1.5;">${_esc(data.efecto_base)}</div>
                ${reqs ? `<div style="display:flex;flex-wrap:wrap;gap:3px;">${reqs}</div>` : ''}
                ${conds}
            </div>
        </div>`;
    }).join('');

    container.style.display = 'block';
    container.innerHTML = `
    <div style="border:2px solid #6c3483;border-radius:10px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#1a1a2e,#6c3483);color:white;
            padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
            <div style="font-family:'Cinzel',serif;font-size:0.9em;font-weight:700;">✨ Set generado — ${arr.length} medallas</div>
        </div>
        <div style="padding:12px;background:#faf8ff;display:flex;flex-direction:column;gap:8px;">
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;">
                ${cards}
            </div>
            <div style="border-top:1px solid #e0d8f0;padding-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <button class="btn" style="background:linear-gradient(135deg,#1a1a2e,#6c3483);
                    color:white;border-color:#6c3483;flex:1;min-width:160px;"
                    onclick="window._medallaIA.aplicarMulti()">✅ Aplicar a los formularios</button>
                <button class="btn btn-outline" style="font-size:0.82em;"
                    onclick="window._medallaIA.generarMulti()">🔄 Regenerar set</button>
            </div>
        </div>
    </div>`;
}

// ── Panel IA para modo multi ──────────────────────────────────
function _renderPanelMulti(prefix, N) {
    let root = document.getElementById('medalla-ai-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'medalla-ai-root';
        document.body.appendChild(root);
    }

    root.innerHTML = `
    <div id="medalla-ai-backdrop" style="
        position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:1200;
        display:flex;align-items:flex-start;justify-content:center;
        padding:30px 16px 60px;overflow-y:auto;
    " onclick="if(event.target===this)window._medallaIA.cerrar()">
        <div style="background:white;border-radius:14px;width:100%;max-width:620px;
            box-shadow:0 16px 60px rgba(0,0,0,0.4);overflow:hidden;">

            <div style="background:linear-gradient(135deg,#1a1a2e,#6c3483);color:white;
                padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <div style="font-family:'Cinzel',serif;font-size:1.05em;font-weight:700;">✨ IA — Generar set de medallas</div>
                    <div style="font-size:0.72em;color:rgba(255,255,255,0.55);margin-top:2px;">Genera ${N} medallas temáticamente coherentes de una sola vez</div>
                </div>
                <button onclick="window._medallaIA.cerrar()" style="
                    background:rgba(255,255,255,0.15);border:none;color:white;
                    border-radius:50%;width:30px;height:30px;cursor:pointer;font-size:1.1em;line-height:1;">×</button>
            </div>

            <div style="padding:18px;display:flex;flex-direction:column;gap:14px;">
                <input type="hidden" id="ai-multi-prefix" value="${prefix}">
                <input type="hidden" id="ai-multi-n" value="${N}">

                <div>
                    <label style="font-size:0.78em;font-weight:700;color:#444;display:block;margin-bottom:5px;">
                        Concepto o tema para el set de ${N} medallas
                    </label>
                    <textarea id="ai-medalla-concepto" class="inp" rows="4"
                        placeholder="Ej: un set de medallas de velocidad — una pasiva que aumente AGI, una activa que use PV para multiplicar la velocidad, una definitiva que invalide todas las medallas lentas del rival..."
                        style="resize:vertical;font-size:0.85em;"></textarea>
                    <div style="font-size:0.71em;color:#aaa;margin-top:3px;">
                        Describe el tema, los roles o los efectos que quieres. Menciona tags (#así), medallas a invalidar (!así!) o personajes (@así@).
                        La IA diseñará ${N} medallas distintas que se complementen entre sí.
                    </div>
                </div>

                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                    <button id="ai-medalla-gen-btn" class="btn"
                        style="background:linear-gradient(135deg,#1a1a2e,#6c3483);color:white;
                            border-color:#6c3483;min-width:150px;font-weight:700;"
                        onclick="window._medallaIA.generarMulti()">✨ Generar set</button>
                    <button class="btn btn-outline" onclick="window._medallaIA.cerrar()">Cancelar</button>
                    <span id="ai-medalla-status" style="font-size:0.78em;color:#888;"></span>
                </div>

                <div id="ai-medalla-result" style="display:none;"></div>
            </div>
        </div>
    </div>`;
}
