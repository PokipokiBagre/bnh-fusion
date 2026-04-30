// ============================================================
// tags/tags-ai.js
// ============================================================
import { catalogoTags, grupos, tagsState } from './tags-state.js';
import { guardarDescripcionTag, cargarTodo } from './tags-data.js';
import { renderCatalogo, toast } from './tags-ui.js';
import { supabase } from '../bnh-auth.js';

// ── Reglas de markup ────────────────────────────────────────────────────────
const MARKUP_RULES = `
SISTEMA DE MARCADO — REGLAS ABSOLUTAS para las descripciones:
- Personajes: SIEMPRE @Nombre_Del_Personaje@ (con arrobas, guion bajo entre palabras).
- Tags/Quirks: SIEMPRE #NombreExacto (hashtag, sin espacios, guion bajo para separar palabras).
  Correctos: #Powercore, #Algaravia, #Eldritch_Proyection
  Incorrectos: #Quirk_Powercore, Powercore, quirk Powercore
- Medallas/Tecnicas: SIEMPRE !Nombre de Medalla! (signos de exclamacion simples, NO exclamacion invertida).
  Correcto: !Golpe Orbital!   Incorrecto: ¡Golpe Orbital!
- El Quirk de un personaje ES un #Tag. Si el Quirk es "Powercore" -> #Powercore. NUNCA "Quirk #Powercore".
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
function _renderPanel(tagsPresel = null) {
    const esModoPresel = Array.isArray(tagsPresel) && tagsPresel.length > 0;

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
        const preChecked = esModoPresel && tagsPresel.some(t => t.toLowerCase() === tag.toLowerCase());
        return `
        <label class="ai-tag-row" data-tag="${safeTag}" style="
            display:flex;align-items:flex-start;gap:10px;padding:10px 12px;
            border-bottom:1px solid var(--gray-100);cursor:pointer;transition:background .12s;
        " onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background=''">
            <input type="checkbox" data-tag="${safeTag}" data-key="${safeKey}" class="ai-tag-chk"
                ${preChecked ? 'checked' : ''}
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

    // Banner de preselección (modo selección múltiple)
    const bannerPresel = esModoPresel ? `
        <div style="background:var(--green-pale);border:1.5px solid var(--green);border-radius:var(--radius,8px);
            padding:10px 14px;font-size:0.84em;color:var(--green-dark);display:flex;align-items:center;gap:8px;">
            <span style="font-size:1.1em;">☑️</span>
            <span><b>${tagsPresel.length} tags</b> preseleccionados desde la selección múltiple.
                Puedes ajustar la selección debajo si lo necesitas.</span>
        </div>` : '';

    // Lista colapsada por defecto en modo presel
    const listaStyle = esModoPresel
        ? 'display:none;'
        : '';
    const toggleListaBtn = esModoPresel ? `
        <button class="btn btn-outline btn-sm" style="font-size:0.78em;margin-bottom:4px;"
            onclick="const l=document.getElementById('ai-lista-wrap');l.style.display=l.style.display==='none'?'block':'none';this.textContent=l.style.display==='none'?'▼ Ver/editar selección':'▲ Ocultar selección';">
            ▼ Ver/editar selección
        </button>` : '';

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

                ${bannerPresel}

                ${toggleListaBtn}

                <div id="ai-lista-wrap" style="${listaStyle}">
                    <input id="ai-tag-search" class="inp" placeholder="Filtrar tags..."
                        oninput="window._tagsAI.filtrar(this.value)" style="font-size:0.85em;margin-bottom:8px;">

                    <div style="border:1.5px solid var(--gray-200);border-radius:var(--radius,8px);max-height:260px;overflow-y:auto;">
                        <div style="
                            display:flex;align-items:center;justify-content:space-between;
                            padding:8px 12px;background:var(--gray-50);
                            border-bottom:1px solid var(--gray-200);font-size:0.8em;
                        ">
                            <span id="ai-sel-count" style="color:var(--gray-600);">${esModoPresel ? tagsPresel.length : 0} tags seleccionados</span>
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
let _selectedTags  = new Set();
let _preselMode    = false; // true cuando viene de selección múltiple

function _updateCount() {
    const el = document.getElementById('ai-sel-count');
    const n  = _selectedTags.size;
    if (el) el.textContent = `${n} tag${n !== 1 ? 's' : ''} seleccionado${n !== 1 ? 's' : ''}`;
}

// ── API pública: window._tagsAI ──────────────────────────────────────────────
window._tagsAI = {

    open(tagsPresel) {
        _preselMode   = Array.isArray(tagsPresel) && tagsPresel.length > 0;
        _selectedTags = _preselMode ? new Set(tagsPresel) : new Set();
        _renderPanel(_preselMode ? tagsPresel : null);
    },

    close() {
        const root = document.getElementById('ai-panel-root');
        if (root) root.innerHTML = '';
        _selectedTags = new Set();
        _preselMode   = false;
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
            const pjsConTag = grupos
                .filter(g => (g.tags||[]).some(t => (t.startsWith('#')?t:'#'+t).toLowerCase() === tag.toLowerCase()))
                .map(g => g.nombre_refinado)
                .join(', ');
            return `- ${tag} (${count} PJ${count !== 1 ? 's' : ''})${pjsConTag ? `\n  Personajes: ${pjsConTag}` : ''}${desc ? `\n  Descripcion actual: "${desc}"` : ''}`;
        }).join('\n');

        const prompt = `Genera UNA descripcion para cada tag del sistema RPG listado abajo.

REGLAS DE FORMATO:
${MARKUP_RULES}

INSTRUCCIONES:
- Devuelve SOLO un objeto JSON valido, sin texto adicional ni bloques markdown.
- Formato exacto: { "#NombreTag": "descripcion", ... }
- Claves = nombres exactos de los tags tal como aparecen abajo (con #).
- Tono: narrativo, suelto, evocador. Como si fuera la entrada de un glosario de rol. Puede ser vago, sugerente o un poco ironico si el tag lo pide.
- LONGITUD — regla estricta:     
  · Sin @arrobas@: UNA sola oracion, maxima 18 palabras. Directa, sin subordinadas. Ejemplo: "Implica afinidad con maquinaria y tecnologia, creacion y mejora de dispositivos."  
  · Con @arrobas@: maximo DOS oraciones cortas (no mas de 30 palabras en total). Primera: que hace el tag. Segunda: el personaje y su relacion con el. NADA MAS.
- NOMBRES DE PERSONAJE: usa el nombre exactamente como aparece, envuelto en @arrobas@. No añadas nada al nombre.
- Si hay descripcion actual, reescribela siguiendo estas reglas de longitud (acortala si es necesario).
- POSICION DE TAGS REFERENCIADOS (#OtroTag): varía la posicion — al inicio, en el medio, o al final de la oracion. No uses siempre la misma posicion.

${promptExtra ? `CONTEXTO DEL OP (extrae nombres de personajes tal cual y marcalos con @arrobas@, sin modificarlos):\n${promptExtra}\n` : ''}

TAGS A DESCRIBIR:
${tagsInfo}`;

        // Construir lista completa de tags del sistema (igual que "Copiar lista")
        // para que la IA pueda referenciar tags existentes en sus descripciones
        const todosLosTags = Object.entries(tagMapa)
            .filter(([tag]) => {
                const entry = catalogoTags.find(c =>
                    ('#' + (c.nombre.startsWith('#') ? c.nombre.slice(1) : c.nombre)).toLowerCase() === tag.toLowerCase()
                );
                return !entry?.baneado;
            })
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([tag, count]) => `${tag} (${count})`)
            .join(', ');

        const contextoAdicional = `BNH-FUSION RPG.

CATALOGO COMPLETO DE TAGS DEL SISTEMA (puedes referenciar cualquiera de estos en tus descripciones usando #NombreTag):
${todosLosTags}`;

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
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                            <button id="ai-optimizar-btn" class="btn btn-sm" style="background:#1a4a80;color:white;border-color:#1a4a80;font-size:0.82em;"
                                onclick="window._tagsAI.optimizar()" title="Segunda pasada: añade @Personajes@ y #Tags donde corresponda">
                                ✨ Optimizar markup
                            </button>
                            <button id="ai-guardar-todos-btn" class="btn btn-green" style="font-size:0.85em;">
                                Guardar todos
                            </button>
                        </div>
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

    // ── Segunda pasada: insertar @Personajes@ y #Tags en las descripciones generadas ──
    async optimizar() {
        const btn = document.getElementById('ai-optimizar-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Optimizando...'; }

        // Recoger las descripciones actuales de los textareas de resultados
        const descActuales = {};
        document.querySelectorAll('[id^="ai-desc-"]').forEach(ta => {
            const tagKey = ta.id.replace('ai-desc-', '');
            const card   = document.getElementById(`ai-res-card-${tagKey}`);
            if (card?.style.opacity === '0.35') return; // ignorar descartadas
            descActuales[tagKey] = ta.value.trim();
        });

        if (!Object.keys(descActuales).length) {
            toast('No hay descripciones para optimizar.', 'error');
            if (btn) { btn.disabled = false; btn.textContent = '✨ Optimizar markup'; }
            return;
        }

        // Construir contexto de personajes y tags disponibles
        const tagMapa = _buildTagList();
        const todosLosTagsStr = Object.keys(tagMapa)
            .filter(t => { const e = catalogoTags.find(c => ('#'+(c.nombre.startsWith('#')?c.nombre.slice(1):c.nombre)).toLowerCase()===t.toLowerCase()); return !e?.baneado; })
            .join(', ');
        const todosLosPJsStr = grupos.map(g => g.nombre_refinado).join(', ');

        const descInput = Object.entries(descActuales)
            .map(([k, v]) => `"#${k}": "${v.replace(/"/g,'\\"')}"`)
            .join(',\n');

        const promptOpt = `Tienes estas descripciones de tags de un RPG. Haz una segunda pasada:
1. Donde aparezca un nombre de personaje en texto plano (ej: "Maxwell", "Elisa"), envuélvelo en @arrobas@: @Maxwell@.
2. Donde aparezca el nombre de un tag sin # (ej: "Eldritch", "Catastrófico"), añade el # delante: #Eldritch.
3. NO cambies el sentido ni la longitud del texto. Solo añade el markup donde falta.
4. Si el texto ya tiene @arrobas@ o # correctamente aplicados, déjalos como están.

PERSONAJES DISPONIBLES (nombres exactos, pueden aparecer en las descripciones):
${todosLosPJsStr}

TAGS DISPONIBLES (para añadir # donde corresponda):
${todosLosTagsStr}

DESCRIPCIONES A OPTIMIZAR:
{
${descInput}
}

Devuelve SOLO un JSON con exactamente las mismas claves, sin markdown, sin texto extra.`;

        try {
            const { data, error } = await supabase.functions.invoke('bnh-ai-injector', {
                body: { prompt: promptOpt, contextoAdicional: 'BNH-FUSION RPG. Optimización de markup.' },
            });
            if (error) throw new Error(error.message);
            if (!data?.resultado) throw new Error('Sin resultado.');

            const clean = data.resultado.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim();
            const parsed = JSON.parse(clean);

            let actualizados = 0;
            Object.entries(parsed).forEach(([tagKey, desc]) => {
                const key = tagKey.startsWith('#') ? tagKey.slice(1) : tagKey;
                const ta  = document.getElementById(`ai-desc-${_esc(key)}`);
                if (ta && desc) { ta.value = desc; actualizados++; }
            });

            toast(`✨ ${actualizados} descripcion${actualizados!==1?'es':''} optimizada${actualizados!==1?'s':''}`, 'ok');
        } catch(err) {
            toast('Error al optimizar: ' + (err.message || err), 'error');
            console.error('[tags-ai] optimizar:', err);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '✨ Optimizar markup'; }
        }
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
