// ============================================================
// tags/tags-ai.js  — Panel IA inline en la toolbar de selección múltiple
// SIN modal flotante. El panel se expande dentro de cat-multi-toolbar.
// ============================================================
import { catalogoTags, grupos, tagsState } from './tags-state.js';
import { guardarDescripcionTag, cargarTodo } from './tags-data.js';
import { renderCatalogo, toast } from './tags-ui.js';
import { supabase } from '../bnh-auth.js';

// ── Reglas de markup ────────────────────────────────────────────────────────
const MARKUP_RULES = `
SISTEMA DE MARCADO:
- Personajes: @Nombre_Del_Personaje@ (arrobas, guion_bajo_entre_palabras).
- Tags: #NombreExacto (hashtag, sin espacios).
- Medallas: !Nombre de Medalla!
- El Quirk de un personaje ES un #Tag. Nunca "Quirk #X", solo #X.
`.trim();

// ── Helpers ─────────────────────────────────────────────────────────────────
const _esc = s => String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');

function _descActual(tagKey) {
    const entry = catalogoTags.find(c =>
        (c.nombre.startsWith('#') ? c.nombre.slice(1) : c.nombre).toLowerCase() === tagKey.toLowerCase()
    );
    return entry?.descripcion || '';
}

function _buildTagList() {
    const mapa = {};
    grupos.forEach(g => (g.tags||[]).forEach(t => {
        const k = t.startsWith('#') ? t : '#'+t;
        mapa[k] = (mapa[k]||0) + 1;
    }));
    catalogoTags.forEach(ct => {
        const k = '#'+(ct.nombre.startsWith('#') ? ct.nombre.slice(1) : ct.nombre);
        if (!mapa[k]) mapa[k] = 0;
    });
    return mapa;
}

// ── Pjs que tienen un tag dado ────────────────────────────────────────────────
function _pjsDeTag(tag) {
    const norm = (t) => (t.startsWith('#') ? t : '#'+t).toLowerCase();
    return grupos
        .filter(g => (g.tags||[]).some(t => norm(t) === norm(tag)))
        .map(g => g.nombre_refinado);
}

// ── Renderizar el panel inline ────────────────────────────────────────────────
function _renderInlinePanel(tagsSel) {
    // El panel va FUERA de la toolbar sticky, justo debajo de ella
    document.getElementById('ai-inline-panel')?.remove();

    const tagsSelArr = [...tagsSel];
    const tagMapa    = _buildTagList();

    // Chips compactos de los tags seleccionados (no tarjetas grandes)
    const chips = tagsSelArr.map(tag => {
        const tagKey = tag.startsWith('#') ? tag.slice(1) : tag;
        const desc   = _descActual(tagKey);
        const count  = tagMapa[tag.startsWith('#') ? tag : '#'+tag] || 0;
        return `<span style="display:inline-flex;align-items:center;gap:4px;background:white;border:1.5px solid var(--green);
            border-radius:20px;padding:2px 10px;font-size:0.8em;font-weight:600;color:var(--blue);">
            ${_esc(tag.startsWith('#')?tag:'#'+tag)}
            <span style="color:var(--gray-400);font-weight:400;">${count}</span>
            ${desc ? '<span style="color:var(--green);font-size:0.85em;">✓</span>' : ''}
        </span>`;
    }).join('');

    const panel = document.createElement('div');
    panel.id = 'ai-inline-panel';
    panel.style.cssText = 'background:var(--green-pale);border:1.5px solid var(--green);border-top:none;border-radius:0 0 var(--radius) var(--radius);padding:12px 14px;display:flex;flex-direction:column;gap:10px;';

    panel.innerHTML = `
        <!-- Tags seleccionados como chips -->
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
            <span style="font-size:0.75em;font-weight:700;color:var(--gray-600);">Tags:</span>
            ${chips}
        </div>

        <!-- Contexto + botones en una fila -->
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
            <div style="flex:1;min-width:200px;">
                <textarea id="ai-prompt-extra" class="inp" rows="2"
                    style="font-family:monospace;font-size:0.82em;resize:none;width:100%;box-sizing:border-box;"
                    placeholder="Contexto: #Marzanna es un Quirk de congelación. @All_Tight@ tiene #Tightlandia..."></textarea>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;padding-bottom:2px;">
                <button id="ai-gen-btn" class="btn btn-green btn-sm" onclick="window._tagsAI.generar()">
                    ✨ Generar
                </button>
                <button id="ai-opt-btn" class="btn btn-sm" style="background:#1a4a80;color:white;border-color:#1a4a80;"
                    onclick="window._tagsAI.optimizar()">
                    🔍 Optimizar
                </button>
                <span id="ai-status" style="font-size:0.75em;color:var(--gray-500);align-self:center;"></span>
            </div>
        </div>

        <!-- Resultados (inicialmente ocultos) -->
        <div id="ai-results-area" style="display:none;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto;"></div>
    `;

    // Insertar DESPUÉS de la toolbar, no dentro
    const toolbar = document.getElementById('cat-multi-toolbar');
    if (toolbar) toolbar.insertAdjacentElement('afterend', panel);
}

// ── Estado ───────────────────────────────────────────────────────────────────
window._tagsAI = {

    // Abre/actualiza el panel inline con los tags actualmente seleccionados
    openInline() {
        const tags = [...(window._catMultiSel || [])];
        if (!tags.length) { toast('Selecciona al menos un tag.', 'error'); return; }
        _renderInlinePanel(tags);
    },

    // Re-renderiza el resumen de tags si el panel ya está abierto (llamado desde _catToggleCheck)
    refreshInline() {
        if (!document.getElementById('ai-inline-panel')) return;
        const tags = [...(window._catMultiSel || [])];
        if (!tags.length) { document.getElementById('ai-inline-panel')?.remove(); return; }
        _renderInlinePanel(tags);
    },

    // Cierra el panel inline
    closeInline() {
        document.getElementById('ai-inline-panel')?.remove();
    },

    // Compatibilidad con código externo que llame a .open()
    open(tags) {
        if (Array.isArray(tags) && tags.length) {
            // Sincronizar selección
            window._catMultiSel = new Set(tags);
        }
        this.openInline();
    },

    async generar() {
        const tagsSel = [...(window._catMultiSel || [])];
        if (!tagsSel.length) { toast('No hay tags seleccionados.', 'error'); return; }

        const promptExtra = document.getElementById('ai-prompt-extra')?.value.trim() || '';
        const btn         = document.getElementById('ai-gen-btn');
        const status      = document.getElementById('ai-status');
        const resultsArea = document.getElementById('ai-results-area');

        if (btn)    { btn.disabled = true; btn.textContent = '⏳ Generando...'; }
        if (status) status.textContent = 'Conectando con Gemini...';
        if (resultsArea) { resultsArea.style.display = 'none'; resultsArea.innerHTML = ''; }

        const tagMapa = _buildTagList();

        // Para cada tag: incluir PJs con ese tag (para que la IA pueda mencionarlos)
        const tagsInfo = tagsSel.map(tag => {
            const tagKey = (tag.startsWith('#') ? tag : '#'+tag).slice(1);
            const count  = tagMapa[tag.startsWith('#') ? tag : '#'+tag] || 0;
            const desc   = _descActual(tagKey);
            const pjsConTag = _pjsDeTag(tag).join(', ');
            return `- ${tag.startsWith('#')?tag:'#'+tag} (${count} PJ${count!==1?'s':''})`
                + (pjsConTag ? `\n  Personajes: ${pjsConTag}` : '')
                + (desc      ? `\n  Desc. actual: "${desc}"` : '');
        }).join('\n');

        const todosLosTags = Object.entries(tagMapa)
            .filter(([tag]) => {
                const e = catalogoTags.find(c => ('#'+(c.nombre.startsWith('#')?c.nombre.slice(1):c.nombre)).toLowerCase() === tag.toLowerCase());
                return !e?.baneado;
            })
            .sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]))
            .map(([tag,count]) => `${tag}(${count})`).join(', ');

        const prompt = `Genera UNA descripción para cada tag del sistema RPG listado abajo.

REGLAS DE FORMATO:
${MARKUP_RULES}

INSTRUCCIONES:
- Devuelve SOLO un objeto JSON válido. Sin markdown, sin texto extra.
- Formato: { "#NombreTag": "descripción", ... }
- Tono: narrativo, evocador, como glosario de rol. Puede ser irónico si el tag lo pide.
- LONGITUD ESTRICTA:
  · Sin @arrobas@: UNA oración, máximo 18 palabras.
  · Con @arrobas@: máximo DOS oraciones cortas (30 palabras en total).
- REGLA DE REPRESENTACIÓN (para decidir si mencionar a un personaje con @arrobas@):
  · Si el tag tiene de 1 a 3 personajes: mencionarlos TODOS con @arrobas@.
  · Si el tag tiene 4+ personajes: menciona solo 1-2 que sean representativos o interesantes para el tag. NO menciones siempre los mismos — varía según qué personaje ilustra mejor ese tag en particular.
  · NUNCA menciones más de 2 personajes por descripción.
- Si hay descripción actual, reescríbela respetando estas reglas (acórtala si es necesario).
- Varía la posición de #OtroTag en la oración — no siempre al final.

${promptExtra ? `CONTEXTO DEL OP:\n${promptExtra}\n` : ''}

CATÁLOGO COMPLETO (para referenciar otros tags):
${todosLosTags}

TAGS A DESCRIBIR:
${tagsInfo}`;

        const contextoAdicional = `BNH-FUSION RPG.`;

        try {
            if (status) status.textContent = 'Esperando respuesta de Gemini...';
            const { data, error } = await supabase.functions.invoke('bnh-ai-injector', {
                body: { prompt, contextoAdicional },
            });
            if (error)          throw new Error(error.message || JSON.stringify(error));
            if (!data)          throw new Error('Sin datos en la respuesta.');
            if (data.error)     throw new Error(data.error);
            if (!data.resultado)throw new Error('Campo "resultado" vacío.');

            const clean = data.resultado
                .replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim();
            let parsed;
            try { parsed = JSON.parse(clean); }
            catch(_) { throw new Error('JSON inválido.\nRespuesta: ' + data.resultado.slice(0,300)); }

            if (status) status.textContent = `${Object.keys(parsed).length} descripciones generadas`;

            const tagsKeys    = Object.keys(parsed);
            const resultCards = tagsKeys.map(tag => {
                const tagKey  = tag.startsWith('#') ? tag.slice(1) : tag;
                const safeKey = _esc(tagKey);
                const safeTag = _esc(tag.startsWith('#') ? tag : '#'+tag);
                const antes   = _descActual(tagKey);
                const desc    = parsed[tag] || '';
                return `
                <div id="ai-res-card-${safeKey}" style="
                    border:1.5px solid var(--gray-200);border-radius:8px;
                    padding:10px;display:flex;flex-direction:column;gap:6px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
                        <span style="font-weight:700;color:var(--blue);font-size:0.88em;">${safeTag}</span>
                        <div style="display:flex;gap:5px;">
                            <button class="btn btn-sm btn-green"
                                onclick="window._tagsAI.guardarUno('${safeKey}')"
                                style="padding:3px 8px;font-size:0.76em;">Guardar</button>
                            <button class="btn btn-sm btn-outline"
                                onclick="document.getElementById('ai-res-card-${safeKey}').style.opacity='0.35'"
                                style="padding:3px 8px;font-size:0.76em;">✕</button>
                        </div>
                    </div>
                    ${antes ? `<div style="font-size:0.72em;color:var(--gray-400);font-style:italic;padding:3px 7px;background:var(--gray-50);border-radius:4px;border-left:2px solid var(--gray-300);"><b>Anterior:</b> ${_esc(antes)}</div>` : ''}
                    <textarea id="ai-desc-${safeKey}" class="inp" rows="2"
                        style="font-family:monospace;font-size:0.82em;resize:vertical;">${_esc(desc)}</textarea>
                </div>`;
            }).join('');

            if (resultsArea) {
                resultsArea.style.display = 'flex';
                resultsArea.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
                        <b style="font-size:0.88em;color:var(--gray-800);">Revisa antes de guardar:</b>
                        <button id="ai-guardar-todos-btn" class="btn btn-green btn-sm">
                            💾 Guardar todos
                        </button>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;">${resultCards}</div>`;
                document.getElementById('ai-guardar-todos-btn')
                    .addEventListener('click', () => window._tagsAI.guardarTodos(tagsKeys));
            }

            // Mostrar botón Optimizar ahora que hay resultados

        } catch(err) {
            if (status) status.textContent = '';
            const errMsg = err.message || String(err);
            if (resultsArea) {
                resultsArea.style.display = 'flex';
                resultsArea.innerHTML = `<div style="background:#fdecea;border:1.5px solid #e74c3c;border-radius:8px;padding:12px;font-size:0.82em;color:#c0392b;"><b>Error:</b><br><pre style="margin:6px 0 0;white-space:pre-wrap;">${_esc(errMsg)}</pre></div>`;
            }
            console.error('[tags-ai]', err);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '✨ Generar descripciones'; }
        }
    },

    // ── Optimizar: segunda pasada con criterio de representación 30-70% ────────
    async optimizar() {
        const btn    = document.getElementById('ai-opt-btn');
        const status = document.getElementById('ai-status');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Optimizando...'; }

        // Prioridad 1: textareas de resultados generados
        const descActuales = {};
        document.querySelectorAll('[id^="ai-desc-"]').forEach(ta => {
            const tagKey = ta.id.replace('ai-desc-','');
            const card   = document.getElementById(`ai-res-card-${tagKey}`);
            if (card?.style.opacity === '0.35') return;
            const val = ta.value.trim();
            if (val) descActuales[tagKey] = val;
        });

        // Prioridad 2: si no hay resultados generados, usar descripciones actuales del catálogo
        if (!Object.keys(descActuales).length) {
            const tagsSel = [...(window._catMultiSel || [])];
            tagsSel.forEach(tag => {
                const tagKey = tag.startsWith('#') ? tag.slice(1) : tag;
                const desc   = _descActual(tagKey);
                if (desc) descActuales[tagKey] = desc;
            });
        }

        if (!Object.keys(descActuales).length) {
            toast('Los tags seleccionados no tienen descripción aún. Usa "Generar" primero.', 'error');
            if (btn) { btn.disabled = false; btn.textContent = '🔍 Optimizar markup'; }
            return;
        }

        const tagMapa    = _buildTagList();
        const todosLosPJs = grupos.map(g => g.nombre_refinado).join(', ');
        const todosLosTags = Object.keys(tagMapa)
            .filter(t => { const e = catalogoTags.find(c => ('#'+(c.nombre.startsWith('#')?c.nombre.slice(1):c.nombre)).toLowerCase()===t.toLowerCase()); return !e?.baneado; })
            .join(', ');

        // Para cada tag a optimizar: incluir lista de PJs con % de representación
        const tagsConPjs = Object.keys(descActuales).map(tagKey => {
            const tag  = '#' + tagKey;
            const pjs  = _pjsDeTag(tag);
            const total = tagMapa[tag] || pjs.length || 1;
            // Calcular representación real de cada PJ (siempre es 100% en tags binarios,
            // pero lo expresamos para que la IA entienda el criterio)
            const pjsStr = pjs.length
                ? pjs.map(n => `@${n}@`).join(', ') + ` (${pjs.length} de ${grupos.length} PJs totales = ${Math.round(pjs.length/grupos.length*100)}%)`
                : 'Ninguno';
            return `${tag}: ${pjsStr}`;
        }).join('\n');

        const descInput = Object.entries(descActuales)
            .map(([k,v]) => `"#${k}": "${v.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`)
            .join(',\n');

        const promptOpt = `Tienes estas descripciones de tags de un RPG. Haz una segunda pasada de markup Y longitud:

TAREA:
1. Donde aparezca un nombre de personaje en texto plano, envuélvelo en @arrobas@: @Maxwell@.
2. Donde aparezca el nombre de un tag sin # (ej: "Eldritch"), añade el #: #Eldritch.
3. Si el texto ya tiene markup correcto, déjalo.
4. LONGITUD — recorta si es necesario:
   · Sin @arrobas@: máximo UNA oración, 18 palabras. Si el texto es más largo, resúmelo.
   · Con @arrobas@: máximo DOS oraciones cortas, 30 palabras en total. Si es más largo, resúmelo.
   · NUNCA menciones más de 2 personajes por descripción.

CRITERIO DE REPRESENTACIÓN PARA PERSONAJES:
- Si un tag tiene de 1 a 3 personajes → menciónalos TODOS con @arrobas@.
- Si un tag tiene 4+ personajes → menciona como máximo 2 que ilustren bien el tag. Elige los más representativos — no los primeros de la lista.
- Si la descripción ya menciona personajes, reduce a 2 máximo y añade @arrobas@ donde falten.

PERSONAJES POR TAG (usa esto para decidir quién mencionar):
${tagsConPjs}

TODOS LOS PERSONAJES DISPONIBLES:
${todosLosPJs}

TODOS LOS TAGS DISPONIBLES:
${todosLosTags}

DESCRIPCIONES A OPTIMIZAR:
{
${descInput}
}

Devuelve SOLO un JSON con exactamente las mismas claves (#tagKey), sin markdown, sin texto extra.`;

        try {
            if (status) status.textContent = 'Optimizando markup...';
            const { data, error } = await supabase.functions.invoke('bnh-ai-injector', {
                body: { prompt: promptOpt, contextoAdicional: 'BNH-FUSION RPG. Optimización de markup.' },
            });
            if (error) throw new Error(error.message);
            if (!data?.resultado) throw new Error('Sin resultado.');

            const clean = data.resultado.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim();
            const parsed = JSON.parse(clean);

            let actualizados = 0;
            const tagsKeys = Object.keys(parsed);

            // Si ya hay textareas de resultados, actualizar directamente
            const hayTextareas = document.querySelectorAll('[id^="ai-desc-"]').length > 0;
            if (hayTextareas) {
                tagsKeys.forEach(tagKey => {
                    const key = tagKey.startsWith('#') ? tagKey.slice(1) : tagKey;
                    const ta  = document.getElementById(`ai-desc-${_esc(key)}`);
                    if (ta && parsed[tagKey]) { ta.value = String(parsed[tagKey]); actualizados++; }
                });
            } else {
                // No había textareas — mostrar resultados como tarjetas editables
                const resultsArea = document.getElementById('ai-results-area');
                const resultCards = tagsKeys.map(tag => {
                    const tagKey  = tag.startsWith('#') ? tag.slice(1) : tag;
                    const safeKey = _esc(tagKey);
                    const antes   = descActuales[tagKey] || '';
                    const desc    = parsed[tag] || '';
                    if (desc) actualizados++;
                    return `
                    <div id="ai-res-card-${safeKey}" style="border:1.5px solid var(--gray-200);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
                            <span style="font-weight:700;color:var(--blue);font-size:0.88em;">#${safeKey}</span>
                            <div style="display:flex;gap:5px;">
                                <button class="btn btn-sm btn-green" onclick="window._tagsAI.guardarUno('${safeKey}')" style="padding:3px 8px;font-size:0.76em;">Guardar</button>
                                <button class="btn btn-sm btn-outline" onclick="document.getElementById('ai-res-card-${safeKey}').style.opacity='0.35'" style="padding:3px 8px;font-size:0.76em;">✕</button>
                            </div>
                        </div>
                        ${antes ? `<div style="font-size:0.72em;color:var(--gray-400);font-style:italic;padding:3px 7px;background:var(--gray-50);border-radius:4px;border-left:2px solid var(--gray-300);"><b>Anterior:</b> ${_esc(antes)}</div>` : ''}
                        <textarea id="ai-desc-${safeKey}" class="inp" rows="2" style="font-family:monospace;font-size:0.82em;resize:vertical;">${_esc(desc)}</textarea>
                    </div>`;
                }).join('');

                if (resultsArea) {
                    resultsArea.style.display = 'flex';
                    resultsArea.innerHTML = `
                        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
                            <b style="font-size:0.88em;color:var(--gray-800);">Revisa antes de guardar:</b>
                            <button id="ai-guardar-todos-btn" class="btn btn-green btn-sm">💾 Guardar todos</button>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:6px;">${resultCards}</div>`;
                    document.getElementById('ai-guardar-todos-btn')
                        .addEventListener('click', () => window._tagsAI.guardarTodos(tagsKeys));
                }
            }

            if (status) status.textContent = `${actualizados} optimizada${actualizados!==1?'s':''}`;
            toast(`✨ ${actualizados} descripción${actualizados!==1?'es':''} optimizada${actualizados!==1?'s':''}`, 'ok');
        } catch(err) {
            toast('Error al optimizar: ' + (err.message||err), 'error');
            if (status) status.textContent = '';
            console.error('[tags-ai] optimizar:', err);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🔍 Optimizar markup'; }
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
            toast(`${ok} descripción${ok!==1?'es':''} guardada${ok!==1?'s':''}`, 'ok');
            await cargarTodo();
            renderCatalogo();
        }
        if (btnAll) { btnAll.disabled = false; btnAll.textContent = '💾 Guardar todos'; }
    },
};

// ── initTagsAI: solo expone window._tagsAI (ya está hecho arriba) ────────────
// El botón de la toolbar lo llama directamente. No hay modal, no hay observer.
export function initTagsAI() {
    // Limpiar cualquier panel-root residual de versiones anteriores
    document.getElementById('ai-panel-root')?.remove();
}
