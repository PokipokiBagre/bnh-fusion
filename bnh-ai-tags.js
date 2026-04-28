// ============================================================
// bnh-ai-tags.js — Sugerencia de Tags por IA para el Panel OP
// ============================================================
// Lee el lore/quirk/descripción/stats del PJ + el catálogo completo
// de tags disponibles, y le pide a la IA que proponga cuáles encajan.
// Los tags sugeridos se muestran en una caja:
//   · Violeta  → ya existe en el catálogo (click = asignar al PJ)
//   · Amarillo → no existe aún (click = crear tag nuevo y asignar)
// ============================================================

import { llamarIA } from './bnh-ai.js';
import { gruposGlobal, ptGlobal } from './fichas/fichas-state.js';
import { supabase } from './bnh-auth.js';
import { guardarTagsGrupo } from './fichas/fichas-data.js';
import { urlIcono } from './fichas/fichas-upload.js';

// ── Obtener catálogo real de tags desde la BD ─────────────────
async function _getCatalogoTags() {
    const { data } = await supabase
        .from('tags_catalogo')
        .select('nombre, descripcion')
        .eq('baneado', false)
        .order('nombre');
    return data || [];
}

// ── Crear un tag nuevo en el catálogo directamente ───────────
async function _crearTagEnCatalogo(tagNombre) {
    const nombre = tagNombre.startsWith('#') ? tagNombre : '#' + tagNombre;
    const { error } = await supabase
        .from('tags_catalogo')
        .insert({ nombre, descripcion: '' });
    return !error;
}

// ── Intentar cargar icono del PJ como base64 ─────────────────
async function _fetchIconoBase64(nombreRefinado) {
    try {
        const url = urlIcono(nombreRefinado) + '?v=' + Date.now();
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const blob = await resp.blob();
        // Solo pasar si es imagen válida
        if (!blob.type.startsWith('image/')) return null;
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
                // reader.result = "data:image/png;base64,XXXX"
                const base64 = reader.result.split(',')[1];
                resolve({ base64, mimeType: blob.type });
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null; // si la imagen no existe, silencioso
    }
}

// ── Llamada principal a la IA ─────────────────────────────────
async function _pedirSugerenciasIA(pj, catalogoTags, imagenData) {
    const tagsEquipados = (pj.tags || []).map(t => t.startsWith('#') ? t : '#' + t);

    // Info extra del PJ (campos de lore estructurado)
    const ie = pj.info_extra || {};
    const infoExtra = [
        ie.estado && `Estado: ${ie.estado}`,
        ie.edad && `Edad: ${ie.edad}`,
        ie.ocupacion && `Ocupación: ${ie.ocupacion}`,
        ie.afiliacion && `Afiliación: ${ie.afiliacion}`,
        ie.lugar_nac && `Lugar de nacimiento: ${ie.lugar_nac}`,
        ie.familia && `Familia: ${ie.familia}`,
        ie.nota && `Nota: ${ie.nota}`,
    ].filter(Boolean).join('\n');

    // PT del PJ (tags con progresión)
    const pts = ptGlobal[pj.nombre_refinado] || {};
    const ptStr = Object.entries(pts)
        .filter(([, v]) => v > 0)
        .map(([t, v]) => `${t} (${v} PT)`)
        .join(', ') || 'Ninguno';

    // Catálogo completo de tags (nombre + descripción resumida)
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

Tu tarea: analiza el lore, quirk, personalidad, stats e información del personaje, 
y propón qué tags del catálogo le corresponderían mejor. 
TAMBIÉN puedes proponer tags NUEVOS que no estén en el catálogo si crees que encajan perfectamente 
y que enriquecerían el juego.

REGLAS CRÍTICAS:
1. NO repitas tags que el personaje ya tiene.
2. Los tags del catálogo que propongas deben estar escritos EXACTAMENTE como aparecen en el catálogo.
3. Los tags nuevos (que no están en el catálogo) deben seguir el formato #PalabraConMayúscula.
4. Propón entre 5 y 15 tags en total. Prioriza calidad sobre cantidad.
5. Responde ÚNICAMENTE con un objeto JSON válido, sin markdown, sin texto extra.

Formato de respuesta OBLIGATORIO:
{
  "razonamiento": "Breve explicación (2-3 líneas) de tu análisis del personaje.",
  "tags_catalogo": ["#Tag1", "#Tag2", "#Tag3"],
  "tags_nuevos": ["#TagNuevo1", "#TagNuevo2"]
}

Si no tienes tags nuevos que proponer, usa un array vacío: "tags_nuevos": []
    `.trim();

    return await llamarIA(prompt, contexto, imagenData);
}

// ── Renderizar el widget en el DOM ────────────────────────────
function _renderWidget(grupoId, nombreGrupo, estado) {
    const container = document.getElementById('bnh-ai-tags-widget');
    if (!container) return;

    if (estado === 'loading') {
        container.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;
            background:linear-gradient(135deg,#f3e8ff,#ede0ff);
            border:1px solid #9b59b6;border-radius:8px;">
            <span style="font-size:1.1em;">🤖</span>
            <span style="font-size:0.78em;color:#6c3483;font-weight:600;">La IA está analizando al personaje…</span>
            <div style="margin-left:auto;width:16px;height:16px;border:2px solid #9b59b6;
                border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
        </div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
        return;
    }

    if (estado === 'error') {
        container.innerHTML = `
        <div style="padding:8px 12px;background:#fdecea;border:1px solid #e74c3c;
            border-radius:8px;font-size:0.75em;color:#c0392b;">
            ❌ Error al consultar la IA. Intenta de nuevo.
        </div>`;
        // Re-mostrar botón
        const btn = document.getElementById('btn-ia-tags-sugerir');
        if (btn) btn.disabled = false;
        return;
    }

    if (!estado || !estado.razonamiento) return;

    const { razonamiento, tags_catalogo = [], tags_nuevos = [], catalogoSet } = estado;

    const chipsCatalogo = tags_catalogo.map(tag => {
        const safe = tag.replace(/'/g, "\\'");
        return `<span 
            onclick="window._iaTags_asignar('${grupoId}','${nombreGrupo.replace(/'/g,"\\'")}','${safe}',false)"
            title="Tag del catálogo — click para asignar"
            style="background:#f3e8ff;border:1.5px solid #8e44ad;color:#6c3483;
                padding:3px 10px;border-radius:10px;font-size:0.72em;font-weight:700;
                cursor:pointer;white-space:nowrap;transition:all .15s;user-select:none;"
            onmouseover="this.style.background='#8e44ad';this.style.color='white'"
            onmouseout="this.style.background='#f3e8ff';this.style.color='#6c3483'"
        >${tag}</span>`;
    }).join('');

    const chipsNuevos = tags_nuevos.map(tag => {
        const safe = tag.replace(/'/g, "\\'");
        return `<span 
            onclick="window._iaTags_asignar('${grupoId}','${nombreGrupo.replace(/'/g,"\\'")}','${safe}',true)"
            title="Tag nuevo — click para crear en catálogo y asignar"
            style="background:#fffbea;border:1.5px solid #f1c40f;color:#9a7d0a;
                padding:3px 10px;border-radius:10px;font-size:0.72em;font-weight:700;
                cursor:pointer;white-space:nowrap;transition:all .15s;user-select:none;"
            onmouseover="this.style.background='#f1c40f';this.style.color='#5d4e00'"
            onmouseout="this.style.background='#fffbea';this.style.color='#9a7d0a'"
        >${tag} ✨</span>`;
    }).join('');

    const hayChips = tags_catalogo.length > 0 || tags_nuevos.length > 0;

    container.innerHTML = `
    <div style="background:linear-gradient(135deg,#faf5ff,#f3e8ff);
        border:1.5px solid #9b59b6;border-radius:10px;padding:12px 14px;">

        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
            <span style="font-size:1em;">🤖</span>
            <span style="font-size:0.75em;font-weight:800;color:#6c3483;text-transform:uppercase;letter-spacing:.5px;">
                La IA propone
            </span>
            <button onclick="window._iaTags_sugerir('${grupoId}','${nombreGrupo.replace(/'/g,"\\'")}');this.disabled=true"
                style="margin-left:auto;background:transparent;border:1px solid #9b59b6;color:#8e44ad;
                    border-radius:6px;padding:1px 8px;font-size:0.68em;cursor:pointer;font-weight:600;"
                onmouseover="this.style.background='#9b59b6';this.style.color='white'"
                onmouseout="this.style.background='transparent';this.style.color='#8e44ad'">
                🔄 Volver a pedir
            </button>
        </div>

        <div style="font-size:0.72em;color:#6c3483;line-height:1.5;margin-bottom:10px;
            background:rgba(155,89,182,0.07);border-radius:6px;padding:6px 9px;font-style:italic;">
            ${razonamiento}
        </div>

        ${hayChips ? `
        <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;">
            ${chipsCatalogo}
            ${tags_nuevos.length > 0 ? `
            <span style="width:100%;font-size:0.65em;color:#9a7d0a;font-weight:600;
                margin-top:3px;text-transform:uppercase;letter-spacing:.4px;">
                Tags nuevos (no están en el catálogo aún):
            </span>
            ${chipsNuevos}
            ` : ''}
        </div>
        <div style="margin-top:8px;font-size:0.65em;color:#a08cbb;line-height:1.4;">
            <span style="background:#f3e8ff;border:1px solid #9b59b6;padding:1px 6px;border-radius:6px;color:#6c3483;">Violeta</span> 
            = existe en catálogo &nbsp;·&nbsp;
            <span style="background:#fffbea;border:1px solid #f1c40f;padding:1px 6px;border-radius:6px;color:#9a7d0a;">Amarillo ✨</span> 
            = tag nuevo (se crea al hacer click)
        </div>
        ` : `
        <div style="font-size:0.75em;color:#a08cbb;">
            La IA no encontró tags adicionales que sugerir para este personaje.
        </div>
        `}

        <div id="ia-tags-msg" style="margin-top:6px;font-size:0.72em;min-height:1em;"></div>
    </div>`;
}

// ── Exponer globales ──────────────────────────────────────────
export function initIATagsPanel() {

    // Llamada principal: pide sugerencias y renderiza
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

            // Intentar cargar el icono del PJ (silencioso si no existe)
            const imagenData = await _fetchIconoBase64(pjData.nombre_refinado);
            const raw = await _pedirSugerenciasIA(pjData, catalogoTags, imagenData);

            // Limpiar y parsear
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

            // Normalizar arrays
            resultado.tags_catalogo = (resultado.tags_catalogo || [])
                .map(t => t.startsWith('#') ? t : '#' + t);
            resultado.tags_nuevos = (resultado.tags_nuevos || [])
                .map(t => t.startsWith('#') ? t : '#' + t);

            // Filtrar los que el PJ ya tiene
            const g = gruposGlobal.find(x => x.id === grupoId);
            const yaAsignados = new Set((g?.tags || []).map(t => (t.startsWith('#') ? t : '#' + t).toLowerCase()));
            resultado.tags_catalogo = resultado.tags_catalogo.filter(t => !yaAsignados.has(t.toLowerCase()));
            resultado.tags_nuevos   = resultado.tags_nuevos.filter(t => !yaAsignados.has(t.toLowerCase()));

            resultado.catalogoSet = catalogoSet;

            _renderWidget(grupoId, nombreGrupo, resultado);

        } catch(e) {
            console.error('[bnh-ai-tags]', e);
            _renderWidget(grupoId, nombreGrupo, 'error');
        }
    };

    // Click en un chip: asignar al PJ (y crear en catálogo si es nuevo)
    window._iaTags_asignar = async (grupoId, nombreGrupo, tag, esNuevo) => {
        const msgEl = document.getElementById('ia-tags-msg');
        const tagNorm = tag.startsWith('#') ? tag : '#' + tag;

        // Encontrar el chip que se clickeó y desactivarlo visualmente
        const chips = document.querySelectorAll('#bnh-ai-tags-widget span[onclick]');
        chips.forEach(c => {
            if (c.textContent.trim().startsWith(tag)) {
                c.style.opacity = '0.4';
                c.style.pointerEvents = 'none';
            }
        });

        try {
            // 1. Si es nuevo, crear en catálogo primero
            if (esNuevo) {
                if (msgEl) { msgEl.style.color = '#9a7d0a'; msgEl.textContent = `⏳ Creando ${tagNorm} en el catálogo…`; }
                await _crearTagEnCatalogo(tagNorm);
            }

            // 2. Asignar al grupo
            const g = gruposGlobal.find(x => x.id === grupoId);
            if (!g) throw new Error('Grupo no encontrado');

            const yaLo = (g.tags || []).some(t => (t.startsWith('#') ? t : '#' + t).toLowerCase() === tagNorm.toLowerCase());
            if (yaLo) {
                if (msgEl) { msgEl.style.color = '#888'; msgEl.textContent = `${tagNorm} ya asignado.`; }
                return;
            }

            const nuevosTags = [...(g.tags || []), tagNorm];
            const res = await guardarTagsGrupo(grupoId, nuevosTags);

            if (!res.ok) throw new Error(res.msg);

            if (msgEl) {
                msgEl.style.color = esNuevo ? '#9a7d0a' : '#6c3483';
                msgEl.textContent = `✅ ${tagNorm} asignado${esNuevo ? ' (y añadido al catálogo)' : ''}.`;
            }

            // Refrescar chips de tags actuales y pool
            const chipsEl = document.getElementById('op-chips');
            const ptDePJ = ptGlobal[nombreGrupo] || {};
            if (chipsEl) {
                // Importar _chipsHTML no es posible directamente — llamar al refresh global
                window._opRefreshTab1Pools?.(grupoId, nombreGrupo);
            }
            window.sincronizarVista?.();

        } catch(e) {
            console.error('[bnh-ai-tags] asignar:', e);
            if (msgEl) { msgEl.style.color = 'var(--red)'; msgEl.textContent = `❌ ${e.message}`; }
            // Reactivar el chip
            chips.forEach(c => {
                if (c.textContent.trim().startsWith(tag)) {
                    c.style.opacity = '1';
                    c.style.pointerEvents = '';
                }
            });
        }
    };
}

// ── HTML del widget (se inyecta en el tab Tags & PT) ──────────
export function htmlIATagsWidget(grupoId, nombreGrupo) {
    const safeNombre = nombreGrupo.replace(/'/g, "\\'");
    return `
    <div style="margin-bottom:10px;">
        <button id="btn-ia-tags-sugerir"
            onclick="this.disabled=true; window._iaTags_sugerir('${grupoId}','${safeNombre}')"
            style="display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,#8e44ad,#6c3483);
                color:white;border:none;border-radius:8px;padding:6px 14px;
                font-size:0.78em;font-weight:700;cursor:pointer;transition:opacity .15s;width:100%;"
            onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
            <span>🤖</span>
            <span>Sugerir tags con IA</span>
            <span style="margin-left:auto;font-size:0.75em;opacity:.8;font-weight:400;">
                Analiza lore, quirk y stats
            </span>
        </button>
        <div id="bnh-ai-tags-widget" style="margin-top:6px;"></div>
    </div>
    <hr style="border:none;border-top:1px solid var(--gray-200);margin:0 0 10px;">`;
}
