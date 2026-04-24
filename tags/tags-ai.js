// ============================================================
// tags/tags-ai.js
// ============================================================
import { catalogoTags, grupos, tagsState } from './tags-state.js';
import { guardarDescripcionTag, cargarTodo } from './tags-data.js';
import { renderCatalogo, toast } from './tags-ui.js';
import { supabase } from '../bnh-auth.js';

// ── Reglas de markup ────────────────────────────────────────────────────────
const MARKUP_RULES = `
SISTEMA DE MARCADO — REGLAS ABSOLUTAS:

PERSONAJES -> @Nombre@ con arrobas.
  CRITICO: copia el nombre EXACTAMENTE como lo escribio el OP, sin traducir, sin añadir palabras, sin guiones bajos extras.
  Si el OP escribio "Kevan" -> @Kevan@. Si escribio "Fufu" -> @Fufu@. Si escribio "All Tight" -> @All Tight@. Si escribio "Doña Manitas" -> @Doña Manitas@.
  PROHIBIDO inventar apodos, descripciones o sufijos. NUNCA: @Kevan_El_Bailarin@, @Fufu_El_Inmaduro@.
  Los nombres de personajes pueden tener espacios, tildes y caracteres especiales — conservalos tal cual.

TAGS -> #NombreExacto sin espacios, guion bajo para separar palabras.
  Correcto: #Powercore, #Eldritch_Proyection. Incorrecto: Powercore, #Quirk_Powercore.

MEDALLAS -> !Nombre de Medalla! con signos de exclamacion simples.
  Pueden tener espacios, tildes y caracteres especiales. Correcto: !Fuerza Bruta!, !Algaravia!. Incorrecto: ¡Golpe Orbital!
`.trim();

// ── Helpers ─────────────────────────────────────────────────────────────────
const _esc = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function _descActual(tagKey) {
    const entry = catalogoTags.find(c =>
        (c.nombre.startsWith('#') ? c.nombre.slice(1) : c.nombre).toLowerCase() === tagKey.toLowerCase()
    );
    return entry?.descripcion || '';
}

function _buildTagList() {
    const mapa = {};
    grupos.forEach(g => (g.tags || []).forEach(t => {
        const k = t.startsWith('#') ? t : '#' + t;
        mapa[k] = (mapa[k] || 0) + 1;
    }));
    catalogoTags.forEach(ct => {
        const k = '#' + (ct.nombre.startsWith('#') ? ct.nombre.slice(1) : ct.nombre);
        if (!mapa[k]) mapa[k] = 0;
    });
    return mapa;
}

// ── Render del panel ─────────────────────────────────────────────────────────
function _renderPanel() {
    const tagMapa = _buildTagList();
    const allTags = Object.entries(tagMapa)
        .filter(([tag]) => {
            const entry = catalogoTags.find(c =>
                ('#' + (c.nombre.startsWith('#') ? c.nombre.slice(1) : c.nombre)).toLowerCase() === tag.toLowerCase()
            );
            return !entry?.baneado;
        })
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    const tagRows = allTags.map(([tag, count]) => {
        const tagKey     = tag.slice(1);
        const descActual = _descActual(tagKey);
        const safeTag    = _esc(tag);
        const safeKey    = _esc(tagKey);
        return `
        <label class="ai-tag-row" data-tag="${safeTag}" style="
            display:flex;align-items:flex-start;gap:10px;padding:10px 12px;
            border-bottom:1px solid var(--gray-100);cursor:pointer;transition:background .12s;
        " onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background=''">
            <input type="checkbox" data-tag="${safeTag}" data-key="${safeKey}" class="ai-tag-chk"
                style="margin-top:3px;width:15px;height:15px;cursor:pointer;accent-color:var(--green);flex-shrink:0;"
                onchange="window._tagsAI.toggleTag('${safeTag}', this.checked)">
            <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span style="font-weight:700;color:var(--blue);font-size:0.88em;">${tag}</span>
                    <span style="font-size:0.72em;color:var(--gray-500);">${count} PJ${count !== 1 ? 's' : ''}</span>
                    ${descActual ? '<span style="font-size:0.68em;color:var(--green);font-weight:600;">&#10003; desc.</span>' : ''}
                </div>
                ${descActual
                    ? `<div style="font-size:0.74em;color:var(--gray-600);margin-top:2px;font-style:italic;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${_esc(descActual)}</div>`
                    : ''}
            </div>
        </label>`;
    }).join('');

    const html = `
    <div id="ai-panel-backdrop" style="
        position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:3000;
        display:flex;align-items:flex-start;justify-content:center;
        padding:30px 16px;overflow-y:auto;
    " onclick="if(event.target===this)window._tagsAI.close()">
        <div style="
            background:white;border-radius:var(--radius-lg,12px);width:100%;max-width:680px;
            box-shadow:0 12px 48px rgba(0,0,0,0.28);overflow:hidden;
        ">
            <!-- Header -->
            <div style="
                background:linear-gradient(135deg,#1a1a2e,#16213e);
                color:white;padding:16px 20px;
                display:flex;justify-content:space-between;align-items:center;
            ">
                <div>
                    <div style="font-family:'Cinzel',serif;font-size:1.1em;font-weight:700;">IA &#8212; Generador de Descripciones</div>
                    <div style="font-size:0.75em;color:rgba(255,255,255,0.6);margin-top:2px;">
                        Selecciona tags, escribe contexto y genera descripciones en lote.
                    </div>
                </div>
                <button onclick="window._tagsAI.close()" style="
                    background:rgba(255,255,255,0.15);border:none;color:white;
                    border-radius:50%;width:30px;height:30px;cursor:pointer;font-size:1.1em;line-height:1;">&#x2715;</button>
            </div>

            <div style="padding:18px;display:flex;flex-direction:column;gap:14px;">

                <input id="ai-tag-search" class="inp" placeholder="Filtrar tags..."
                    oninput="window._tagsAI.filtrar(this.value)" style="font-size:0.85em;">

                <div style="border:1.5px solid var(--gray-200);border-radius:var(--radius,8px);max-height:260px;overflow-y:auto;">
                    <div style="
                        display:flex;align-items:center;justify-content:space-between;
                        padding:8px 12px;background:var(--gray-50);
                        border-bottom:1px solid var(--gray-200);font-size:0.8em;
                    ">
                        <span id="ai-sel-count" style="color:var(--gray-600);">0 tags seleccionados</span>
                        <div style="display:flex;gap:8px;">
                            <button class="btn btn-sm btn-outline" style="padding:3px 8px;font-size:0.75em;"
                                onclick="window._tagsAI.seleccionarTodos(true)">Todos</button>
                            <button class="btn btn-sm btn-outline" style="padding:3px 8px;font-size:0.75em;"
                                onclick="window._tagsAI.seleccionarTodos(false)">Ninguno</button>
                            <button class="btn btn-sm btn-outline" style="padding:3px 8px;font-size:0.75em;"
                                onclick="window._tagsAI.seleccionarSinDesc()">Sin desc.</button>
                        </div>
                    </div>
                    <div id="ai-tags-list">${tagRows}</div>
                </div>

                <div>
                    <label style="font-size:0.78em;font-weight:700;color:var(--gray-700);display:block;margin-bottom:5px;">
                        Contexto adicional / instrucciones para la IA
                    </label>
                    <textarea id="ai-prompt-extra" class="inp" rows="3" style="
                        font-family:monospace;font-size:0.84em;resize:vertical;width:100%;
                    " placeholder="Ej: #Marzanna es un Quirk de congelacion. #Tightlandia es el parque de @All_Tight@."></textarea>
                </div>

                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                    <button id="ai-gen-btn" class="btn btn-green" onclick="window._tagsAI.generar()" style="min-width:180px;">
                        Generar descripciones
                    </button>
                    <button class="btn btn-outline" onclick="window._tagsAI.close()">Cancelar</button>
                    <span id="ai-status" style="font-size:0.8em;color:var(--gray-500);"></span>
                </div>

                <div id="ai-results-area" style="display:none;flex-direction:column;gap:10px;"></div>

            </div>
        </div>
    </div>`;

    let root = document.getElementById('ai-panel-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'ai-panel-root';
        document.body.appendChild(root);
    }
    root.innerHTML = html;
}

// ── Estado ───────────────────────────────────────────────────────────────────
let _selectedTags = new Set();

function _updateCount() {
    const el = document.getElementById('ai-sel-count');
    const n  = _selectedTags.size;
    if (el) el.textContent = `${n} tag${n !== 1 ? 's' : ''} seleccionado${n !== 1 ? 's' : ''}`;
}

// ── API pública: window._tagsAI ──────────────────────────────────────────────
window._tagsAI = {

    open() {
        _selectedTags = new Set();
        _renderPanel();
    },

    close() {
        const root = document.getElementById('ai-panel-root');
        if (root) root.innerHTML = '';
        _selectedTags = new Set();
    },

    toggleTag(tag, checked) {
        if (checked) _selectedTags.add(tag);
        else         _selectedTags.delete(tag);
        _updateCount();
    },

    filtrar(valor) {
        const q = valor.trim().toLowerCase();
        document.querySelectorAll('#ai-tags-list .ai-tag-row').forEach(row => {
            row.style.display = !q || (row.dataset.tag || '').toLowerCase().includes(q) ? '' : 'none';
        });
    },

    seleccionarTodos(estado) {
        document.querySelectorAll('#ai-tags-list .ai-tag-chk').forEach(chk => {
            const row = chk.closest('.ai-tag-row');
            if (row && row.style.display === 'none') return;
            chk.checked = estado;
            const tag = chk.dataset.tag;
            if (!tag) return;
            if (estado) _selectedTags.add(tag);
            else        _selectedTags.delete(tag);
        });
        _updateCount();
    },

    seleccionarSinDesc() {
        document.querySelectorAll('#ai-tags-list .ai-tag-chk').forEach(chk => {
            const row = chk.closest('.ai-tag-row');
            if (row && row.style.display === 'none') return;
            const tieneDesc = !!_descActual(chk.dataset.key || '');
            chk.checked     = !tieneDesc;
            const tag = chk.dataset.tag;
            if (!tag) return;
            if (!tieneDesc) _selectedTags.add(tag);
            else            _selectedTags.delete(tag);
        });
        _updateCount();
    },

    async generar() {
        if (_selectedTags.size === 0) {
            toast('Selecciona al menos un tag.', 'error');
            return;
        }

        const promptExtra = document.getElementById('ai-prompt-extra')?.value.trim() || '';
        const btn         = document.getElementById('ai-gen-btn');
        const status      = document.getElementById('ai-status');
        const resultsArea = document.getElementById('ai-results-area');

        if (btn)         { btn.disabled = true; btn.textContent = 'Generando...'; }
        if (status)      status.textContent = 'Conectando con Gemini...';
        if (resultsArea) { resultsArea.style.display = 'none'; resultsArea.innerHTML = ''; }

        const tagMapa  = _buildTagList();
        const tagsInfo = [..._selectedTags].map(tag => {
            const tagKey = tag.slice(1);
            const count  = tagMapa[tag] || 0;
            const desc   = _descActual(tagKey);
            return `- ${tag} (${count} PJ${count !== 1 ? 's' : ''})${desc ? `\n  Descripcion actual: "${desc}"` : ''}`;
        }).join('\n');

        const prompt = `Genera UNA descripcion corta (1-2 oraciones) para cada tag del sistema RPG listado abajo.

REGLAS DE FORMATO:
${MARKUP_RULES}

INSTRUCCIONES:
- Devuelve SOLO un objeto JSON valido, sin texto adicional ni bloques markdown.
- Formato exacto: { "#NombreTag": "descripcion", ... }
- Claves = nombres exactos de los tags tal como aparecen abajo (con #).
- Tono: narrativo, suelto, evocador. Como si fuera la entrada de un glosario de rol escrita por alguien que conoce el universo. No es un manual tecnico; puede ser vago, sugerente o incluso un poco ironico si el tag lo pide.
- Largo ideal: 1 oracion generosa o 2 cortas. Nada de listas ni bullet points.
- Si hay descripcion actual, puedes reescribirla con mejor tono sin cambiar el significado.
- NOMBRES DE PERSONAJE: si el OP menciona un nombre en el contexto, usalo EXACTAMENTE como fue escrito, solo envuelto en @arrobas@. No añadas nada al nombre.

${promptExtra ? `CONTEXTO DEL OP (extrae nombres de personajes tal cual y marcalos con @arrobas@, sin modificarlos):\n${promptExtra}\n` : ''}

TAGS A DESCRIBIR:
${tagsInfo}`;

        const contextoAdicional = `BNH-FUSION RPG. Tags: ${[..._selectedTags].join(', ')}`;

        try {
            if (status) status.textContent = 'Esperando respuesta de Gemini...';

            // ── Usamos supabase.functions.invoke para evitar problemas de CORS.
            // El cliente de Supabase ya incluye los headers correctos (apikey,
            // Authorization) y usa el mismo origen que el resto del proyecto.
            const { data, error } = await supabase.functions.invoke('bnh-ai-injector', {
                body: { prompt, contextoAdicional },
            });

            if (error) throw new Error(error.message || JSON.stringify(error));
            if (!data)           throw new Error('La funcion no devolvio datos.');
            if (data.error)      throw new Error(data.error);
            if (!data.resultado) throw new Error('Campo "resultado" vacio en la respuesta.');

            // Limpiar posibles bloques markdown y parsear el JSON
            let parsed;
            try {
                const clean = data.resultado
                    .replace(/^```json\s*/i, '')
                    .replace(/^```\s*/,      '')
                    .replace(/\s*```$/,      '')
                    .trim();
                parsed = JSON.parse(clean);
            } catch (_) {
                throw new Error('Gemini no devolvio JSON valido.\nRespuesta: ' + data.resultado.slice(0, 300));
            }

            if (status) status.textContent = `${Object.keys(parsed).length} descripciones generadas`;

            const tagsKeys    = Object.keys(parsed);
            const resultCards = tagsKeys.map(tag => {
                const tagKey    = tag.startsWith('#') ? tag.slice(1) : tag;
                const safeKey   = _esc(tagKey);
                const safeTag   = _esc(tag);
                const descAntes = _descActual(tagKey);
                const desc      = parsed[tag] || '';
                return `
                <div id="ai-res-card-${safeKey}" style="
                    border:1.5px solid var(--gray-200);border-radius:var(--radius,8px);
                    padding:12px;display:flex;flex-direction:column;gap:8px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                        <span style="font-weight:700;color:var(--blue);font-size:0.9em;">${safeTag}</span>
                        <div style="display:flex;gap:6px;">
                            <button class="btn btn-sm btn-green"
                                onclick="window._tagsAI.guardarUno('${safeKey}')"
                                style="padding:4px 10px;font-size:0.78em;">Guardar</button>
                            <button class="btn btn-sm btn-outline"
                                onclick="document.getElementById('ai-res-card-${safeKey}').style.opacity='0.35'"
                                style="padding:4px 10px;font-size:0.78em;" title="Ignorar">&#x2715;</button>
                        </div>
                    </div>
                    ${descAntes ? `
                    <div style="font-size:0.74em;color:var(--gray-500);font-style:italic;padding:4px 8px;
                        background:var(--gray-50);border-radius:4px;border-left:3px solid var(--gray-300);">
                        <b style="color:var(--gray-600);">Anterior:</b> ${_esc(descAntes)}
                    </div>` : ''}
                    <textarea id="ai-desc-${safeKey}" class="inp" rows="2"
                        style="font-family:monospace;font-size:0.83em;resize:vertical;">${_esc(desc)}</textarea>
                </div>`;
            }).join('');

            if (resultsArea) {
                resultsArea.style.display = 'flex';
                resultsArea.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                        <b style="font-size:0.9em;color:var(--gray-800);">Revisa las descripciones antes de guardar:</b>
                        <button id="ai-guardar-todos-btn" class="btn btn-green" style="font-size:0.85em;">
                            Guardar todos
                        </button>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:8px;">${resultCards}</div>`;

                document.getElementById('ai-guardar-todos-btn')
                    .addEventListener('click', () => window._tagsAI.guardarTodos(tagsKeys));
            }

        } catch (err) {
            if (status) status.textContent = '';
            const errMsg = err.message || String(err);
            if (resultsArea) {
                resultsArea.style.display = 'flex';
                resultsArea.innerHTML = `
                    <div style="background:#fdecea;border:1.5px solid #e74c3c;border-radius:8px;padding:14px;font-size:0.82em;color:#c0392b;">
                        <b>Error al conectar con la IA:</b><br>
                        <pre style="margin:8px 0 0;white-space:pre-wrap;font-family:monospace;font-size:0.9em;">${_esc(errMsg)}</pre>
                    </div>`;
            }
            console.error('[tags-ai]', err);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Generar descripciones'; }
        }
    },

    async guardarUno(tagKey) {
        const ta   = document.getElementById(`ai-desc-${tagKey}`);
        const card = document.getElementById(`ai-res-card-${tagKey}`);
        if (!ta) return;

        const res = await guardarDescripcionTag(tagKey, ta.value.trim());
        if (res.ok) {
            toast(`#${tagKey} guardado`, 'ok');
            if (card) { card.style.borderColor = 'var(--green)'; card.style.opacity = '0.6'; }
            await cargarTodo();
            renderCatalogo();
        } else {
            toast('Error: ' + res.msg, 'error');
        }
    },

    async guardarTodos(tags) {
        const btnAll = document.getElementById('ai-guardar-todos-btn');
        if (btnAll) { btnAll.disabled = true; btnAll.textContent = 'Guardando...'; }

        let ok = 0;
        for (const tag of tags) {
            const tagKey = tag.startsWith('#') ? tag.slice(1) : tag;
            const card   = document.getElementById(`ai-res-card-${_esc(tagKey)}`);
            const ta     = document.getElementById(`ai-desc-${_esc(tagKey)}`);
            if (!ta || card?.style.opacity === '0.35') continue;

            const res = await guardarDescripcionTag(tagKey, ta.value.trim());
            if (res.ok) {
                ok++;
                if (card) { card.style.borderColor = 'var(--green)'; card.style.opacity = '0.6'; }
            } else {
                toast(`Error en #${tagKey}: ${res.msg}`, 'error');
            }
        }

        if (ok > 0) {
            toast(`${ok} descripcion${ok !== 1 ? 'es' : ''} guardada${ok !== 1 ? 's' : ''}`, 'ok');
            await cargarTodo();
            renderCatalogo();
        }

        if (btnAll) { btnAll.disabled = false; btnAll.textContent = 'Guardar todos'; }
    },
};

// ── Inyección del botón en la toolbar del catálogo ───────────────────────────
let _observer = null;

export function initTagsAI() {
    if (!document.getElementById('ai-panel-root')) {
        const root = document.createElement('div');
        root.id = 'ai-panel-root';
        document.body.appendChild(root);
    }

    if (_observer) _observer.disconnect();
    _observer = new MutationObserver(_inyectarBotonIA);

    const vistaCatalogo = document.getElementById('vista-catalogo');
    if (vistaCatalogo) {
        _observer.observe(vistaCatalogo, { childList: true, subtree: false });
    }

    _inyectarBotonIA();
}

function _inyectarBotonIA() {
    const btnNuevo = document.querySelector('#vista-catalogo .btn-green.btn-sm');
    if (!btnNuevo || document.getElementById('btn-cat-ia')) return;

    const btnIA = document.createElement('button');
    btnIA.id        = 'btn-cat-ia';
    btnIA.className = 'btn btn-sm';
    btnIA.style.cssText = 'background:linear-gradient(135deg,#1a1a2e,#6c3483);color:white;border-color:#6c3483;';
    btnIA.textContent   = 'IA -- Descripciones';
    btnIA.onclick       = () => window._tagsAI.open();

    btnNuevo.insertAdjacentElement('afterend', btnIA);
}
