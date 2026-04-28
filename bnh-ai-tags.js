// ============================================================
// bnh-ai-tags.js — Sugerencia de Tags por IA para el Panel OP
// ============================================================
import { llamarIA } from './bnh-ai.js';
import { gruposGlobal, ptGlobal } from './fichas/fichas-state.js';
import { supabase } from './bnh-auth.js';
import { guardarTagsGrupo } from './fichas/fichas-data.js';

// ── Obtener catálogo real de tags desde la BD ─────────────────
async function _getCatalogoTags() {
    const { data } = await supabase
        .from('tags_catalogo')
        .select('nombre, descripcion')
        .eq('baneado', false)
        .order('nombre');
    return data || [];
}

// ── Crear un tag nuevo en el catálogo ────────────────────────
async function _crearTagEnCatalogo(tagNombre) {
    const nombre = tagNombre.startsWith('#') ? tagNombre : '#' + tagNombre;
    const { error } = await supabase
        .from('tags_catalogo')
        .insert({ nombre, descripcion: '' });
    return !error;
}

// ── Llamada a la IA ───────────────────────────────────────────
async function _pedirSugerenciasIA(pj, catalogoTags) {
    const tagsEquipados = (pj.tags || []).map(t => t.startsWith('#') ? t : '#' + t);

    const ie = pj.info_extra || {};
    const infoExtra = [
        ie.estado     && `Estado: ${ie.estado}`,
        ie.edad       && `Edad: ${ie.edad}`,
        ie.ocupacion  && `Ocupación: ${ie.ocupacion}`,
        ie.afiliacion && `Afiliación: ${ie.afiliacion}`,
        ie.lugar_nac  && `Lugar de nacimiento: ${ie.lugar_nac}`,
        ie.familia    && `Familia: ${ie.familia}`,
        ie.nota       && `Nota: ${ie.nota}`,
    ].filter(Boolean).join('\n');

    const pts = ptGlobal[pj.nombre_refinado] || {};
    const ptStr = Object.entries(pts)
        .filter(([, v]) => v > 0)
        .map(([t, v]) => `${t} (${v} PT)`)
        .join(', ') || 'Ninguno';

    const catalogoStr = catalogoTags
        .map(t => `${t.nombre}${t.descripcion ? ': ' + t.descripcion.slice(0, 80) : ''}`)
        .join('\n');

    const contexto = `
PERSONAJE: ${pj.nombre_refinado}
STATS: POT ${pj.pot || 0}, AGI ${pj.agi || 0}, CTL ${pj.ctl || 0}
TAGS QUE YA TIENE: ${tagsEquipados.join(', ') || 'Ninguno'}
PUNTOS DE TAG (PT): ${ptStr}

DESCRIPCIÓN: ${pj.descripcion || 'Sin descripción'}
LORE / HISTORIA: ${pj.lore || 'Sin lore'}
PERSONALIDAD: ${pj.personalidad || 'Sin personalidad'}
QUIRK / HABILIDAD: ${pj.quirk || 'Sin quirk'}
${infoExtra ? '\nINFO EXTRA:\n' + infoExtra : ''}

CATÁLOGO COMPLETO DE TAGS DISPONIBLES (nombre: descripción breve):
${catalogoStr}
    `.trim();

    const prompt = `
Eres un asistente de un juego de rol basado en My Hero Academia.
Se te proporciona la ficha de un personaje y el catálogo COMPLETO de tags del juego.

Tu tarea: analizar el personaje a fondo y proponer TODOS los tags relevantes del catálogo que le correspondan.

REGLAS:
1. NO repitas tags que el personaje ya tiene.
2. Los tags del catálogo deben estar escritos EXACTAMENTE como aparecen en el catálogo.
3. Propón entre 10 y 20 tags del catálogo. Sé generoso — si un tag encaja aunque sea parcialmente, inclúyelo.
4. Solo propone tags nuevos si el concepto realmente no está cubierto por ningún tag del catálogo.
5. Máximo 4 tags nuevos. Deben ser concisos (1-2 palabras, estilo catálogo).
6. El razonamiento debe ser MUY BREVE: 1 sola oración de máximo 15 palabras.
7. Responde ÚNICAMENTE con JSON válido, sin markdown ni texto extra.

FORMATO DE TAGS NUEVOS:
- 1 o 2 palabras con guión_bajo si son dos: #Mente_Maestra, #Fuerza_Bruta.
- NUNCA frases largas ni palabras compuestas sin separar.

Respuesta OBLIGATORIA:
{
  "razonamiento": "Una sola oración breve sobre el personaje.",
  "tags_catalogo": ["#Tag1", "#Tag2", ...hasta 20],
  "tags_nuevos": ["#TagNuevo1"]
}

Si no hacen falta tags nuevos: "tags_nuevos": []
    `.trim();

    return await llamarIA(prompt, contexto);
}

// ── Renderizar el widget ──────────────────────────────────────
function _renderWidget(grupoId, nombreGrupo, estado) {
    const container = document.getElementById('bnh-ai-tags-widget');
    if (!container) return;

    if (estado === 'loading') {
        container.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;
            background:#faf5ff;border:1px solid #c39bd3;border-radius:6px;">
            <div style="width:14px;height:14px;border:2px solid #9b59b6;
                border-top-color:transparent;border-radius:50%;
                animation:spin .8s linear infinite;flex-shrink:0;"></div>
            <span style="font-size:0.75em;color:#6c3483;">Analizando personaje…</span>
        </div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
        return;
    }

    if (estado === 'error') {
        container.innerHTML = `
        <div style="padding:7px 11px;background:#fdecea;border:1px solid #e74c3c;
            border-radius:6px;font-size:0.74em;color:#c0392b;">
            ❌ Error al consultar la IA. Intenta de nuevo.
        </div>`;
        const btn = document.getElementById('btn-ia-tags-sugerir');
        if (btn) btn.disabled = false;
        return;
    }

    if (!estado || !estado.razonamiento) return;

    const { razonamiento, tags_catalogo = [], tags_nuevos = [] } = estado;
    const hayChips = tags_catalogo.length > 0 || tags_nuevos.length > 0;

    const chipsCatalogo = tags_catalogo.map(tag => {
        const safe = tag.replace(/'/g, "\\'");
        return `<span
            onclick="window._iaTags_asignar('${grupoId}','${nombreGrupo.replace(/'/g,"\\'")}','${safe}',false)"
            title="Del catálogo — click para asignar"
            style="background:#f3e8ff;border:1px solid #9b59b6;color:#6c3483;
                padding:2px 8px;border-radius:10px;font-size:0.7em;font-weight:600;
                cursor:pointer;white-space:nowrap;transition:all .15s;user-select:none;"
            onmouseover="this.style.background='#8e44ad';this.style.color='white'"
            onmouseout="this.style.background='#f3e8ff';this.style.color='#6c3483'"
        >${tag}</span>`;
    }).join('');

    const chipsNuevos = tags_nuevos.map(tag => {
        const safe = tag.replace(/'/g, "\\'");
        return `<span
            onclick="window._iaTags_asignar('${grupoId}','${nombreGrupo.replace(/'/g,"\\'")}','${safe}',true)"
            title="Tag nuevo — click para crear y asignar"
            style="background:#fffbea;border:1px solid #e2b000;color:#7d6000;
                padding:2px 8px;border-radius:10px;font-size:0.7em;font-weight:600;
                cursor:pointer;white-space:nowrap;transition:all .15s;user-select:none;"
            onmouseover="this.style.background='#f1c40f';this.style.color='#4a3800'"
            onmouseout="this.style.background='#fffbea';this.style.color='#7d6000'"
        >${tag} ✨</span>`;
    }).join('');

    container.innerHTML = `
    <div style="border:1px solid #c39bd3;border-radius:8px;overflow:hidden;">

        <div style="display:flex;align-items:center;gap:7px;padding:7px 11px;
            background:#f5eeff;border-bottom:1px solid #c39bd3;">
            <span style="font-size:0.72em;font-weight:700;color:#5b2c8f;
                text-transform:uppercase;letter-spacing:.4px;">IA Propone</span>
            <span style="flex:1;font-size:0.72em;color:#7d5a9a;font-style:italic;
                overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                title="${razonamiento.replace(/"/g,'&quot;')}">${razonamiento}</span>
            <button
                onclick="window._iaTags_sugerir('${grupoId}','${nombreGrupo.replace(/'/g,"\\'")}');this.disabled=true"
                style="flex-shrink:0;background:none;border:1px solid #9b59b6;color:#8e44ad;
                    border-radius:5px;padding:1px 7px;font-size:0.68em;cursor:pointer;
                    font-weight:600;transition:all .15s;"
                onmouseover="this.style.background='#8e44ad';this.style.color='white'"
                onmouseout="this.style.background='none';this.style.color='#8e44ad'">
                ↺ Reintentar
            </button>
        </div>

        <div style="padding:8px 11px;">
            ${hayChips ? `
            <div style="display:flex;flex-wrap:wrap;gap:4px;">
                ${chipsCatalogo}
                ${tags_nuevos.length > 0 ? `
                    <span style="width:100%;font-size:0.62em;color:#7d6000;font-weight:700;
                        text-transform:uppercase;letter-spacing:.3px;margin-top:3px;">
                        Nuevos →
                    </span>
                    ${chipsNuevos}
                ` : ''}
            </div>
            <div style="margin-top:7px;font-size:0.62em;color:#a08cbb;">
                <span style="background:#f3e8ff;border:1px solid #c39bd3;
                    padding:1px 5px;border-radius:4px;color:#6c3483;">Violeta</span>
                = catálogo &nbsp;·&nbsp;
                <span style="background:#fffbea;border:1px solid #e2b000;
                    padding:1px 5px;border-radius:4px;color:#7d6000;">Amarillo ✨</span>
                = nuevo
            </div>
            ` : `
            <div style="font-size:0.74em;color:#a08cbb;">
                Sin sugerencias adicionales para este personaje.
            </div>
            `}
            <div id="ia-tags-msg" style="margin-top:5px;font-size:0.71em;min-height:1em;"></div>
        </div>
    </div>`;
}

// ── Exponer globales ──────────────────────────────────────────
export function initIATagsPanel() {

    window._iaTags_sugerir = async (grupoId, nombreGrupo) => {
        const btn = document.getElementById('btn-ia-tags-sugerir');
        if (btn) btn.disabled = true;

        _renderWidget(grupoId, nombreGrupo, 'loading');

        try {
            const [pjData, catalogoTags] = await Promise.all([
                Promise.resolve(gruposGlobal.find(x => x.id === grupoId)),
                _getCatalogoTags()
            ]);

            if (!pjData) throw new Error('Personaje no encontrado');

            const catalogoSet = new Set(catalogoTags.map(t => t.nombre.toLowerCase()));
            const raw = await _pedirSugerenciasIA(pjData, catalogoTags);

            let clean = raw
                .replace(/```json/gi, '')
                .replace(/```/g, '')
                .replace(/[\u0000-\u0019]+/g, ' ')
                .trim();

            let resultado;
            try {
                resultado = JSON.parse(clean);
            } catch(e) {
                console.error('[bnh-ai-tags] JSON malformado:', clean);
                throw new Error('La IA devolvió un formato inesperado.');
            }

            // Normalizar
            resultado.tags_catalogo = (resultado.tags_catalogo || [])
                .map(t => t.startsWith('#') ? t : '#' + t);
            resultado.tags_nuevos = (resultado.tags_nuevos || [])
                .map(t => t.startsWith('#') ? t : '#' + t)
                .slice(0, 4); // máximo 4 nuevos

            // Filtrar ya asignados
            const g = gruposGlobal.find(x => x.id === grupoId);
            const yaAsignados = new Set((g?.tags || []).map(t =>
                (t.startsWith('#') ? t : '#' + t).toLowerCase()
            ));
            resultado.tags_catalogo = resultado.tags_catalogo.filter(t => !yaAsignados.has(t.toLowerCase()));
            resultado.tags_nuevos   = resultado.tags_nuevos.filter(t => !yaAsignados.has(t.toLowerCase()));

            // Truncar razonamiento a ~100 chars para que quepa en una línea
            if (resultado.razonamiento && resultado.razonamiento.length > 100) {
                resultado.razonamiento = resultado.razonamiento.slice(0, 97) + '…';
            }

            resultado.catalogoSet = catalogoSet;
            _renderWidget(grupoId, nombreGrupo, resultado);

        } catch(e) {
            console.error('[bnh-ai-tags]', e);
            _renderWidget(grupoId, nombreGrupo, 'error');
        }
    };

    window._iaTags_asignar = async (grupoId, nombreGrupo, tag, esNuevo) => {
        const msgEl = document.getElementById('ia-tags-msg');
        const tagNorm = tag.startsWith('#') ? tag : '#' + tag;

        // Atenuar chip clickeado
        const chips = document.querySelectorAll('#bnh-ai-tags-widget span[onclick]');
        chips.forEach(c => {
            if (c.textContent.trim().replace(' ✨','') === tag) {
                c.style.opacity = '0.4';
                c.style.pointerEvents = 'none';
            }
        });

        try {
            if (esNuevo) {
                if (msgEl) { msgEl.style.color = '#9a7d0a'; msgEl.textContent = `⏳ Creando ${tagNorm}…`; }
                await _crearTagEnCatalogo(tagNorm);
            }

            const g = gruposGlobal.find(x => x.id === grupoId);
            if (!g) throw new Error('Grupo no encontrado');

            const yaLo = (g.tags || []).some(t =>
                (t.startsWith('#') ? t : '#' + t).toLowerCase() === tagNorm.toLowerCase()
            );
            if (yaLo) {
                if (msgEl) { msgEl.style.color = '#888'; msgEl.textContent = `${tagNorm} ya asignado.`; }
                return;
            }

            const nuevosTags = [...(g.tags || []), tagNorm];
            const res = await guardarTagsGrupo(grupoId, nuevosTags);
            if (!res.ok) throw new Error(res.msg);

            if (msgEl) {
                msgEl.style.color = esNuevo ? '#7d6000' : '#5b2c8f';
                msgEl.textContent = `✅ ${tagNorm} asignado${esNuevo ? ' (nuevo en catálogo)' : ''}.`;
            }

            window._opRefreshTab1Pools?.(grupoId, nombreGrupo);
            window.sincronizarVista?.();

        } catch(e) {
            console.error('[bnh-ai-tags] asignar:', e);
            if (msgEl) { msgEl.style.color = 'var(--red)'; msgEl.textContent = `❌ ${e.message}`; }
            chips.forEach(c => {
                if (c.textContent.trim().replace(' ✨','') === tag) {
                    c.style.opacity = '1';
                    c.style.pointerEvents = '';
                }
            });
        }
    };
}

// ── HTML del botón (se inyecta en el tab Tags & PT) ───────────
export function htmlIATagsWidget(grupoId, nombreGrupo) {
    const safeNombre = nombreGrupo.replace(/'/g, "\\'");
    return `
    <div style="margin-bottom:10px;">
        <button id="btn-ia-tags-sugerir"
            onclick="this.disabled=true; window._iaTags_sugerir('${grupoId}','${safeNombre}')"
            style="display:flex;align-items:center;gap:7px;width:100%;
                background:linear-gradient(135deg,#7d3c98,#5b2c8f);
                color:white;border:none;border-radius:7px;padding:7px 13px;
                font-size:0.77em;font-weight:600;cursor:pointer;
                transition:opacity .15s;letter-spacing:.2px;"
            onmouseover="this.style.opacity='.88'" onmouseout="this.style.opacity='1'">
            <span style="font-size:1.05em;">✦</span>
            <span>Sugerir tags con IA</span>
            <span style="margin-left:auto;font-size:0.72em;opacity:.7;font-weight:400;">
                Analiza lore, quirk y stats
            </span>
        </button>
        <div id="bnh-ai-tags-widget" style="margin-top:5px;"></div>
    </div>
    <hr style="border:none;border-top:1px solid var(--gray-200);margin:0 0 10px;">`;
}
