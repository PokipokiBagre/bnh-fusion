// ============================================================
// tags/tags-ai.js
// ============================================================
// Integración de IA para generar descripciones de tags en lote.
// Se engancha al catálogo añadiendo un botón "✨ IA" en la toolbar
// y expone window._tagsAI como punto de entrada.
//
// Dependencias:
//   - tags-state.js   → catalogoTags, grupos, tagsState
//   - tags-data.js    → guardarDescripcionTag, cargarTodo
//   - tags-ui.js      → renderCatalogo, toast
//   - bnh-auth.js     → currentConfig (para la URL de la Edge Function)
// ============================================================

import { catalogoTags, grupos, tagsState } from './tags-state.js';
import { guardarDescripcionTag, cargarTodo } from './tags-data.js';
import { renderCatalogo, toast } from './tags-ui.js';
import { currentConfig } from '../bnh-auth.js';

// ── URL de la Edge Function (misma que usa el resto del proyecto) ──────────
const EDGE_FN_URL = `${currentConfig.supabaseUrl}/functions/v1/gemini-proxy`;

// ── Reglas de markup que se envían siempre a la IA ─────────────────────────
const MARKUP_RULES = `
SISTEMA DE MARCADO — REGLAS ABSOLUTAS para las descripciones:
- Personajes: SIEMPRE @Nombre_Del_Personaje@ (con arrobas, guión bajo entre palabras).
- Tags/Quirks: SIEMPRE #NombreExacto (con hashtag, sin espacios, guión bajo para separar palabras).
  Ejemplos CORRECTOS: #Powercore, #Algaravía, #Eldritch_Proyection
  Ejemplos INCORRECTOS: #Quirk_Powercore, Powercore, quirk Powercore
- Medallas/Técnicas: SIEMPRE !Nombre de Medalla! (con signos de exclamación simples, NO ¡!).
  Ejemplo CORRECTO: !Golpe Orbital!
  Ejemplo INCORRECTO: ¡Golpe Orbital!, ¡!Golpe Orbital!
- El Quirk de un personaje ES un #Tag. No es una categoría aparte.
  Si el personaje tiene el Quirk "Powercore", su tag es #Powercore. NUNCA escribas "Quirk #Powercore".
`.trim();

// ── Helpers ─────────────────────────────────────────────────────────────────
const _esc = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Cuenta cuántos personajes tienen el tag (normalizado). */
function _countPJ(tagNombre) {
    const tNorm = (tagNombre.startsWith('#') ? tagNombre : '#' + tagNombre).toLowerCase();
    return grupos.filter(g =>
        (g.tags || []).some(t => (t.startsWith('#') ? t : '#' + t).toLowerCase() === tNorm)
    ).length;
}

/** Devuelve la descripción actual de un tag (sin #). */
function _descActual(tagKey) {
    const entry = catalogoTags.find(c =>
        (c.nombre.startsWith('#') ? c.nombre.slice(1) : c.nombre).toLowerCase() === tagKey.toLowerCase()
    );
    return entry?.descripcion || '';
}

/** Construye la lista de tags del catálogo con su conteo de PJs. */
function _buildTagList() {
    const tagMapa = {};
    grupos.forEach(g => (g.tags || []).forEach(t => {
        const k = (t.startsWith('#') ? t : '#' + t);
        tagMapa[k] = (tagMapa[k] || 0) + 1;
    }));
    // Añadir tags del catálogo sin personajes
    catalogoTags.forEach(ct => {
        const k = '#' + (ct.nombre.startsWith('#') ? ct.nombre.slice(1) : ct.nombre);
        if (!tagMapa[k]) tagMapa[k] = 0;
    });
    return tagMapa; // { '#Leal': 5, '#Powercore': 2, … }
}

// ── Panel principal ──────────────────────────────────────────────────────────
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
        const tagKey = tag.slice(1);
        const descActual = _descActual(tagKey);
        const safeTag = _esc(tag);
        const safeKey = _esc(tagKey);
        return `
        <label class="ai-tag-row" data-tag="${safeTag}" style="
            display:flex; align-items:flex-start; gap:10px; padding:10px 12px;
            border-bottom:1px solid var(--gray-100); cursor:pointer;
            transition:background .12s;
        " onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background=''">
            <input type="checkbox" data-tag="${safeTag}" data-key="${safeKey}"
                class="ai-tag-chk"
                style="margin-top:3px;width:15px;height:15px;cursor:pointer;accent-color:var(--green);flex-shrink:0;"
                onchange="window._tagsAI.toggleTag('${safeTag}', this.checked)">
            <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span style="font-weight:700;color:var(--blue);font-size:0.88em;">${tag}</span>
                    <span style="font-size:0.72em;color:var(--gray-500);">${count} PJ${count !== 1 ? 's' : ''}</span>
                    ${descActual ? '<span style="font-size:0.68em;color:var(--green);font-weight:600;">✓ tiene desc.</span>' : ''}
                </div>
                ${descActual ? `<div style="font-size:0.74em;color:var(--gray-600);margin-top:2px;font-style:italic;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${_esc(descActual)}</div>` : ''}
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
            background:white;border-radius:var(--radius-lg);width:100%;max-width:680px;
            box-shadow:0 12px 48px rgba(0,0,0,0.28);overflow:hidden;
        ">
            <!-- Header -->
            <div style="
                background:linear-gradient(135deg,#1a1a2e,#16213e);
                color:white;padding:16px 20px;
                display:flex;justify-content:space-between;align-items:center;
            ">
                <div>
                    <div style="font-family:'Cinzel',serif;font-size:1.1em;font-weight:700;">🤖 IA — Generador de Descripciones</div>
                    <div style="font-size:0.75em;color:rgba(255,255,255,0.6);margin-top:2px;">
                        Selecciona tags, escribe contexto adicional y genera descripciones en lote.
                    </div>
                </div>
                <button onclick="window._tagsAI.close()" style="
                    background:rgba(255,255,255,0.15);border:none;color:white;
                    border-radius:50%;width:30px;height:30px;cursor:pointer;font-size:1.1em;line-height:1;
                ">×</button>
            </div>

            <div style="padding:18px;display:flex;flex-direction:column;gap:14px;">

                <!-- Buscador de tags dentro del panel -->
                <input id="ai-tag-search" class="inp" placeholder="🔍 Filtrar tags…"
                    oninput="window._tagsAI.filtrar(this.value)"
                    style="font-size:0.85em;">

                <!-- Lista de tags seleccionables -->
                <div style="
                    border:1.5px solid var(--gray-200);border-radius:var(--radius);
                    max-height:260px;overflow-y:auto;
                ">
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
                    <div id="ai-tags-list">
                        ${tagRows}
                    </div>
                </div>

                <!-- Prompt adicional del usuario -->
                <div>
                    <label style="font-size:0.78em;font-weight:700;color:var(--gray-700);display:block;margin-bottom:5px;">
                        📝 Contexto adicional / instrucciones para la IA
                    </label>
                    <textarea id="ai-prompt-extra" class="inp" rows="3" style="
                        font-family:monospace;font-size:0.84em;resize:vertical;width:100%;
                    " placeholder="Ej: 'El tag #Marzanna es un Quirk de congelación. El tag #Tightlandia es un lugar. Sé conciso, máximo 2 oraciones por tag.'"></textarea>
                </div>

                <!-- Botón generar -->
                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                    <button id="ai-gen-btn" class="btn btn-green" onclick="window._tagsAI.generar()" style="min-width:160px;">
                        ✨ Generar descripciones
                    </button>
                    <button class="btn btn-outline" onclick="window._tagsAI.close()">Cancelar</button>
                    <span id="ai-status" style="font-size:0.8em;color:var(--gray-500);"></span>
                </div>

                <!-- Área de resultados (aparece tras la respuesta) -->
                <div id="ai-results-area" style="display:none;flex-direction:column;gap:10px;"></div>

            </div>
        </div>
    </div>`;

    const container = document.getElementById('ai-panel-root');
    if (container) container.innerHTML = html;
}

// ── Estado del panel ─────────────────────────────────────────────────────────
let _selectedTags = new Set();

function _updateCount() {
    const el = document.getElementById('ai-sel-count');
    if (el) el.textContent = `${_selectedTags.size} tag${_selectedTags.size !== 1 ? 's' : ''} seleccionado${_selectedTags.size !== 1 ? 's' : ''}`;
}

// ── API pública: window._tagsAI ──────────────────────────────────────────────
window._tagsAI = {

    open() {
        _selectedTags = new Set();
        // Insertar root si no existe
        let root = document.getElementById('ai-panel-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'ai-panel-root';
            document.body.appendChild(root);
        }
        _renderPanel();
    },

    close() {
        const root = document.getElementById('ai-panel-root');
        if (root) root.innerHTML = '';
        _selectedTags = new Set();
    },

    toggleTag(tag, checked) {
        if (checked) _selectedTags.add(tag);
        else _selectedTags.delete(tag);
        _updateCount();
    },

    filtrar(valor) {
        const q = valor.trim().toLowerCase();
        document.querySelectorAll('#ai-tags-list .ai-tag-row').forEach(row => {
            const tag = (row.dataset.tag || '').toLowerCase();
            row.style.display = !q || tag.includes(q) ? '' : 'none';
        });
    },

    seleccionarTodos(estado) {
        document.querySelectorAll('#ai-tags-list .ai-tag-chk').forEach(chk => {
            const row = chk.closest('.ai-tag-row');
            if (row && row.style.display === 'none') return; // respetar filtro
            chk.checked = estado;
            const tag = chk.dataset.tag;
            if (tag) {
                if (estado) _selectedTags.add(tag);
                else _selectedTags.delete(tag);
            }
        });
        _updateCount();
    },

    seleccionarSinDesc() {
        document.querySelectorAll('#ai-tags-list .ai-tag-chk').forEach(chk => {
            const row = chk.closest('.ai-tag-row');
            if (row && row.style.display === 'none') return;
            const tagKey = (chk.dataset.key || '');
            const tieneDesc = !!_descActual(tagKey);
            chk.checked = !tieneDesc;
            const tag = chk.dataset.tag;
            if (tag) {
                if (!tieneDesc) _selectedTags.add(tag);
                else _selectedTags.delete(tag);
            }
        });
        _updateCount();
    },

    async generar() {
        if (_selectedTags.size === 0) {
            toast('Selecciona al menos un tag.', 'error');
            return;
        }

        const promptExtra = document.getElementById('ai-prompt-extra')?.value.trim() || '';
        const btn = document.getElementById('ai-gen-btn');
        const status = document.getElementById('ai-status');
        const resultsArea = document.getElementById('ai-results-area');

        if (btn) { btn.disabled = true; btn.textContent = '⏳ Generando…'; }
        if (status) status.textContent = 'Conectando con la IA…';
        if (resultsArea) { resultsArea.style.display = 'none'; resultsArea.innerHTML = ''; }

        // ── Construir contexto de tags seleccionados ──────────────────────
        const tagMapa = _buildTagList();
        const tagsInfo = [..._selectedTags].map(tag => {
            const tagKey = tag.slice(1);
            const count  = tagMapa[tag] || 0;
            const desc   = _descActual(tagKey);
            return `- ${tag} (${count} PJ${count !== 1 ? 's' : ''})${desc ? `\n  Descripción actual: "${desc}"` : ''}`;
        }).join('\n');

        // ── Prompt principal ──────────────────────────────────────────────
        const prompt = `
Necesito que generes UNA descripción corta (1-2 oraciones) para cada uno de los siguientes tags del sistema RPG.

REGLAS DE FORMATO:
${MARKUP_RULES}

INSTRUCCIONES:
- Devuelve SOLO un objeto JSON válido, sin texto adicional, sin bloques de código markdown.
- El JSON debe tener el formato: { "#NombreTag": "descripción", … }
- Las claves deben ser los nombres exactos de los tags (con #).
- Cada descripción debe ser concisa, en español, y usar el sistema de marcado cuando mencione otros tags, personajes o medallas.
- Si ya hay una descripción existente, puedes mejorarla o reescribirla.

${promptExtra ? `CONTEXTO ADICIONAL DEL ADMINISTRADOR:\n${promptExtra}\n` : ''}

TAGS A DESCRIBIR:
${tagsInfo}
        `.trim();

        const contextoAdicional = `Sistema BNH-FUSION RPG. Tags a procesar: ${[..._selectedTags].join(', ')}`;

        try {
            if (status) status.textContent = 'Esperando respuesta de Gemini…';

            const response = await fetch(EDGE_FN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, contextoAdicional }),
            });

            const data = await response.json();

            if (data.error) throw new Error(data.error);
            if (!data.resultado) throw new Error('La IA no devolvió un resultado.');

            // ── Parsear JSON devuelto por la IA ──────────────────────────
            let parsed;
            try {
                // Limpiar posibles bloques markdown que la IA añada por error
                const clean = data.resultado
                    .replace(/```json/gi, '')
                    .replace(/```/g, '')
                    .trim();
                parsed = JSON.parse(clean);
            } catch (e) {
                throw new Error('La IA no devolvió un JSON válido. Respuesta: ' + data.resultado.slice(0, 200));
            }

            // ── Mostrar resultados editables ─────────────────────────────
            if (status) status.textContent = `✅ ${Object.keys(parsed).length} descripciones generadas`;

            const resultCards = Object.entries(parsed).map(([tag, desc]) => {
                const tagKey = tag.startsWith('#') ? tag.slice(1) : tag;
                const safeKey = _esc(tagKey);
                const safeTag = _esc(tag);
                const descAnterior = _descActual(tagKey);
                return `
                <div id="ai-res-card-${safeKey}" style="
                    border:1.5px solid var(--gray-200);border-radius:var(--radius);
                    padding:12px;display:flex;flex-direction:column;gap:8px;
                ">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                        <span style="font-weight:700;color:var(--blue);font-size:0.9em;">${safeTag}</span>
                        <div style="display:flex;gap:6px;">
                            <button class="btn btn-sm btn-green"
                                onclick="window._tagsAI.guardarUno('${safeKey}')"
                                style="padding:4px 10px;font-size:0.78em;">
                                💾 Guardar
                            </button>
                            <button class="btn btn-sm btn-outline"
                                onclick="document.getElementById('ai-res-card-${safeKey}').style.opacity='0.4'"
                                style="padding:4px 10px;font-size:0.78em;"
                                title="Ignorar este tag">
                                ✕
                            </button>
                        </div>
                    </div>
                    ${descAnterior ? `<div style="font-size:0.74em;color:var(--gray-500);font-style:italic;padding:4px 8px;background:var(--gray-50);border-radius:4px;border-left:3px solid var(--gray-300);">
                        <span style="font-weight:600;color:var(--gray-600);">Anterior:</span> ${_esc(descAnterior)}
                    </div>` : ''}
                    <textarea
                        id="ai-desc-${safeKey}"
                        class="inp"
                        rows="2"
                        style="font-family:monospace;font-size:0.83em;resize:vertical;"
                    >${_esc(desc)}</textarea>
                </div>`;
            }).join('');

            if (resultsArea) {
                resultsArea.style.display = 'flex';
                resultsArea.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                        <div style="font-weight:700;font-size:0.9em;color:var(--gray-800);">
                            📋 Revisa y edita las descripciones antes de guardar:
                        </div>
                        <button class="btn btn-green"
                            onclick="window._tagsAI.guardarTodos(${JSON.stringify(Object.keys(parsed)).replace(/"/g, '&quot;')})"
                            style="font-size:0.85em;">
                            💾 Guardar todos
                        </button>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        ${resultCards}
                    </div>`;
            }

        } catch (err) {
            if (status) status.textContent = '';
            toast('❌ Error IA: ' + err.message, 'error');
            console.error('[tags-ai] Error:', err);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '✨ Generar descripciones'; }
        }
    },

    async guardarUno(tagKey) {
        const ta = document.getElementById(`ai-desc-${tagKey}`);
        if (!ta) return;
        const desc = ta.value.trim();
        const res = await guardarDescripcionTag(tagKey, desc);
        if (res.ok) {
            toast(`✅ Descripción de #${tagKey} guardada`, 'ok');
            const card = document.getElementById(`ai-res-card-${tagKey}`);
            if (card) {
                card.style.borderColor = 'var(--green)';
                card.style.opacity = '0.6';
            }
            await cargarTodo();
            renderCatalogo();
        } else {
            toast('❌ ' + res.msg, 'error');
        }
    },

    async guardarTodos(tags) {
        const btn = document.querySelector('#ai-results-area .btn-green');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando…'; }

        let ok = 0;
        let errores = 0;

        for (const tag of tags) {
            const tagKey = tag.startsWith('#') ? tag.slice(1) : tag;
            const ta = document.getElementById(`ai-desc-${_esc(tagKey)}`);
            const card = document.getElementById(`ai-res-card-${_esc(tagKey)}`);
            if (!ta || card?.style.opacity === '0.4') continue; // ignorados

            const desc = ta.value.trim();
            const res = await guardarDescripcionTag(tagKey, desc);
            if (res.ok) {
                ok++;
                if (card) { card.style.borderColor = 'var(--green)'; card.style.opacity = '0.6'; }
            } else {
                errores++;
                toast(`❌ Error en #${tagKey}: ${res.msg}`, 'error');
            }
        }

        if (ok > 0) {
            toast(`✅ ${ok} descripcion${ok !== 1 ? 'es' : ''} guardada${ok !== 1 ? 's' : ''}`, 'ok');
            await cargarTodo();
            renderCatalogo();
        }

        if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar todos'; }
    },
};

// ── Inyección del botón "🤖 IA" en la toolbar del catálogo ──────────────────
//
// Se llama desde renderCatalogo() (tags-ui.js) después de renderizar el HTML.
// En lugar de modificar tags-ui.js, usamos un MutationObserver para detectar
// cuándo aparece el botón "✨ Nuevo tag" y añadimos nuestro botón junto a él.
// Así tags-ai.js es completamente autónomo.

let _observer = null;

export function initTagsAI() {
    // Insertar contenedor root en el body
    if (!document.getElementById('ai-panel-root')) {
        const root = document.createElement('div');
        root.id = 'ai-panel-root';
        document.body.appendChild(root);
    }

    // Observar el DOM para inyectar el botón cada vez que se re-renderice el catálogo
    if (_observer) _observer.disconnect();
    _observer = new MutationObserver(() => _inyectarBotonIA());
    const vistaCatalogo = document.getElementById('vista-catalogo');
    if (vistaCatalogo) {
        _observer.observe(vistaCatalogo, { childList: true, subtree: false });
    }

    // Intentar inyectar ya si el catálogo ya está renderizado
    _inyectarBotonIA();
}

function _inyectarBotonIA() {
    // Buscar el botón "Nuevo tag" como ancla (solo visible para admins)
    const btnNuevo = document.querySelector('#vista-catalogo .btn-green.btn-sm');
    if (!btnNuevo) return;

    // No duplicar
    if (document.getElementById('btn-cat-ia')) return;

    const btnIA = document.createElement('button');
    btnIA.id = 'btn-cat-ia';
    btnIA.className = 'btn btn-sm';
    btnIA.style.cssText = 'background:linear-gradient(135deg,#1a1a2e,#6c3483);color:white;border-color:#6c3483;';
    btnIA.textContent = '🤖 IA — Descripciones';
    btnIA.onclick = () => window._tagsAI.open();

    // Insertar después del botón "Nuevo tag"
    btnNuevo.insertAdjacentElement('afterend', btnIA);
}
