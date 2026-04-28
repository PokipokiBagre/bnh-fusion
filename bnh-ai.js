// ============================================================
// bnh-ai.js — Puente de comunicación con Gemini via Supabase
// ============================================================
import { supabase } from './bnh-auth.js';
import { REGLAS_SISTEMA } from './bnh-reglas.js';
import { gruposGlobal, ptGlobal } from './fichas/fichas-state.js';

export async function llamarIA(peticionUsuario, contextoDeDatos, imagenData = null) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 segundos

        const body = { 
            prompt: peticionUsuario, 
            contextoAdicional: `
                    ${REGLAS_SISTEMA}
                    
                    DATOS DE LA BASE DE DATOS ACTUAL:
                    ${contextoDeDatos}
                `
        };
        // Si viene imagen, añadirla al body para que la edge function la pase a Gemini
        if (imagenData?.base64 && imagenData?.mimeType) {
            body.imagenBase64  = imagenData.base64;
            body.imagenMimeType = imagenData.mimeType;
        }

        const { data, error } = await supabase.functions.invoke('bnh-ai-injector', {
            body,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (error) {
            console.error("Detalle de Supabase:", error);
            const msgReal = (error.context && error.context.error) ? error.context.error : error.message;
            throw new Error(msgReal);
        }

        if (data && data.error) {
            throw new Error(data.error);
        }

        return data.resultado;
    } catch (err) {
        console.error("Error crítico en IA:", err);
        if (err.name === 'AbortError') {
             throw new Error("Tiempo de espera agotado. La IA tardó demasiado en responder.");
        }
        throw new Error(err.message || "Error desconocido de conexión.");
    }
}

export async function iaGestionarLore(nombrePJ, instruccion, textosActuales) {
    const pj = gruposGlobal.find(g => g.nombre_refinado === nombrePJ);
    if (!pj) throw new Error("Personaje no encontrado.");

    // ── Tags del personaje (vienen de gruposGlobal, no de ptGlobal) ──
    const tagsEquipados = (pj.tags || []).map(t => t.startsWith('#') ? t : '#' + t);

    // ── PT por tag (puede estar vacío si el PJ no tiene progresión aún) ──
    const pts = ptGlobal[nombrePJ] || {};

    // Construimos una lista unificada: todos los tags equipados, con su PT si lo tienen
    const tagsConPT = tagsEquipados.map(tag => {
        // Buscar el PT del tag (las claves de ptGlobal pueden o no tener #)
        const ptVal = pts[tag] ?? pts[tag.replace(/^#/, '')] ?? 0;
        return ptVal > 0 ? `${tag} [${ptVal} PT]` : tag;
    });

    // Tags con PT que NO están en la lista de equipados (ej: stats internos)
    const tagsExtraPT = Object.entries(pts)
        .filter(([t]) => {
            const norm = (t.startsWith('#') ? t : '#' + t).toLowerCase();
            return !tagsEquipados.some(te => te.toLowerCase() === norm);
        })
        .map(([t, p]) => `${t.startsWith('#') ? t : '#' + t} [${p} PT]`);

    const tagsStr = [...tagsConPT, ...tagsExtraPT].join(', ') || 'Ninguno';

    // ── Serializar info_extra actual ──
    const ie = textosActuales.info_extra || {};
    const infoExtraStr = Object.entries({
        estado: ie.estado, edad: ie.edad, altura: ie.altura, peso: ie.peso,
        genero: ie.genero, lugar_nac: ie.lugar_nac, ocupacion: ie.ocupacion,
        afiliacion: ie.afiliacion, familia: ie.familia, nota: ie.nota
    }).map(([k, v]) => `  - ${k}: ${v || 'Vacío'}`).join('\n');

    const contexto = `
        PERSONAJE: @${pj.nombre_refinado}@
        STATS: POT ${pj.pot}, AGI ${pj.agi}, CTL ${pj.ctl}.
        TAGS EQUIPADOS (úsalos para inferir ocupación, afiliación, etc.): ${tagsStr}
        
        TEXTOS ACTUALES EN LA UI:
        - descripcion: ${textosActuales.descripcion || 'Vacío'}
        - lore: ${textosActuales.lore || 'Vacío'}
        - personalidad: ${textosActuales.personalidad || 'Vacío'}
        - quirk: ${textosActuales.quirk || 'Vacío'}
        
        INFORMACIÓN EXTRA ACTUAL:
${infoExtraStr}
    `;

    const prompt = `
        INSTRUCCIÓN DEL OP: ${instruccion}

        REGLA CRÍTICA: Debes responder ÚNICA y EXCLUSIVAMENTE con un objeto JSON válido. No incluyas markdown, ni texto antes o después.
        
        Usa estas claves exactas: "descripcion", "lore", "personalidad", "quirk", e "info_extra" (objeto con las claves: estado, edad, altura, peso, genero, lugar_nac, ocupacion, afiliacion, familia, nota).
        
        ⚠️ REGLA DE FORMATO: Si necesitas párrafos o saltos de línea, usa "\\n". NUNCA uses saltos de línea reales en el JSON.
        
        REGLAS DE info_extra:
        - Si el OP da datos concretos (altura, edad, familia, ocupación, etc.), extráelos y colócalos en info_extra.
        - Si un campo de info_extra ya tiene valor en el contexto, consérvalo a menos que el OP pida cambiarlo.
        - Si el OP no menciona un campo y estaba "Vacío", INFIERE un valor razonable usando los TAGS EQUIPADOS del personaje:
            · "ocupacion": usa tags como #Héroe_Profesional, #Profesor, #NPC, etc.
            · "afiliacion": usa tags como #U.A., #Gobierno, #Agencia, etc. Si no hay tag claro, pon "Independiente".
            · "estado": usa #Activo o #Inactivo según corresponda.
            · "altura" y "peso": estima según el lore y stats (POT alto = complexión robusta).
            · "edad": usa etiquetas como #Madurez, #Joven, etc. si hay tags relevantes.
        - Para "familia", usa marcado @Nombre@ para cada miembro mencionado. CRÍTICO: el nombre va EXACTAMENTE como aparece en el contexto o como lo escribió el OP, con espacios y tildes incluidos. NUNCA uses guiones bajos en nombres de personas. Correcto: @Coyote Peterson@. Incorrecto: @Coyote_Peterson@.
        - NUNCA inventes tags que no estén en la lista de TAGS EQUIPADOS.
        - Si el OP solo pide editar una sección de texto, copia las demás sin cambios.
        
        Ejemplo de respuesta OBLIGATORIA:
        {
          "descripcion": "texto...",
          "lore": "Párrafo uno.\\n\\nPárrafo dos.",
          "personalidad": "texto...",
          "quirk": "texto...",
          "info_extra": {
            "estado": "#Activo",
            "edad": "#Madurez",
            "altura": "1.85 m (Estimada)",
            "peso": "Normal",
            "genero": "Masculino",
            "lugar_nac": "Desconocido",
            "ocupacion": "#Héroe_Profesional / #Profesor",
            "afiliacion": "#U.A.",
            "familia": "Hija: @Lexi@",
            "nota": ""
          }
        }
    `;

    return await llamarIA(prompt, contexto);
}

/**
 * MEDALLAS: Crea una medalla basada en los tags y PT del personaje.
 * Respeta rangos de CTL: Pasiva (1-7), Activa (3-12), Definitiva (8-16).
 */
export async function iaSugerirMedalla(nombrePJ, tipoDeseado, concepto) {
    const pj = gruposGlobal.find(g => g.nombre_refinado === nombrePJ);
    const pts = ptGlobal[nombrePJ] || {};
    const tagsDisponibles = Object.entries(pts)
        .filter(([, p]) => p > 0)
        .map(([t, p]) => `${t} (${p} PT)`)
        .join(', ');

    const contexto = `
        PERSONAJE: @${nombrePJ}@
        TAGS CON PUNTOS (PT): ${tagsDisponibles}
        REGLA CRÍTICA: La medalla debe usar obligatoriamente uno de estos tags.
        TIPO SOLICITADO: ${tipoDeseado} (Recuerda los rangos de CTL para este tipo).
    `;

    const prompt = `Crea una medalla técnica para @${nombrePJ}@ basada en el concepto: "${concepto}". 
    Devuelve el nombre entre !! y detalla el efecto técnico y los requisitos de PT.`;

    return await llamarIA(prompt, contexto);
}

/**
 * TAGS: Sugiere un nuevo tag y su descripción técnica para el catálogo.
 */
export async function iaSugerirTag(concepto) {
    const contexto = `El usuario quiere expandir el catálogo de tags del juego.`;
    const prompt = `Sugiere un nuevo #Tag basado en "${concepto}". 
    Incluye una descripción técnica de 2 o 3 líneas siguiendo el estilo de la Guía de Personajes.`;

    return await llamarIA(prompt, contexto);
}
