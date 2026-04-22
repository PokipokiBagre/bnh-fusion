// ============================================================
// bnh-ai.js — Puente de comunicación con Gemini via Supabase
// ============================================================
import { supabase } from './bnh-auth.js';
import { REGLAS_SISTEMA } from './bnh-reglas.js';
import { gruposGlobal, ptGlobal } from './fichas/fichas-state.js';

export async function llamarIA(peticionUsuario, contextoDeDatos) {
    try {
        // Agregamos un abort controller para que no se quede colgado eternamente
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 segundos máximo

        const { data, error } = await supabase.functions.invoke('bnh-ai-injector', {
            body: { 
                prompt: peticionUsuario, 
                contextoAdicional: `
                    ${REGLAS_SISTEMA}
                    
                    DATOS DE LA BASE DE DATOS ACTUAL:
                    ${contextoDeDatos}
                `
            },
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

    const pts = ptGlobal[nombrePJ] || {};
    const tagsStr = Object.entries(pts).map(([t, p]) => `${t} [${p} PT]`).join(', ');

    // Serializar info_extra actual para el contexto
    const ie = textosActuales.info_extra || {};
    const infoExtraStr = Object.entries({
        estado: ie.estado, edad: ie.edad, altura: ie.altura, peso: ie.peso,
        genero: ie.genero, lugar_nac: ie.lugar_nac, ocupacion: ie.ocupacion,
        afiliacion: ie.afiliacion, familia: ie.familia, nota: ie.nota
    }).map(([k, v]) => `  - ${k}: ${v || 'Vacío'}`).join('\n');

    const contexto = `
        PERSONAJE: @${pj.nombre_refinado}@
        STATS: POT ${pj.pot}, AGI ${pj.agi}, CTL ${pj.ctl}.
        TAGS EQUIPADOS: ${tagsStr}
        
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
        
        REGLA DE info_extra:
        - Si el OP da datos concretos (altura, edad, familia, ocupación, etc.), extráelos y colócalos en info_extra.
        - Si un campo de info_extra ya tiene valor en el contexto, consérvalo a menos que el OP pida cambiarlo.
        - Si el OP no menciona un campo y estaba "Vacío", puedes inferir un valor razonable basado en el lore (ej: altura estimada por físico, ocupación por sus tags, familia por el lore).
        - Para "familia", usa marcado @Nombre@ para cada miembro mencionado.
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
            "ocupacion": "#Héroe (Clase S) / #Profesor",
            "afiliacion": "#U.A. / Agencia Propia",
            "familia": "Hija: @Lexi@",
            "nota": ""
          }
        }
    `;

    return await llamarIA(prompt, contexto);
}

/**
 * 3. MEDALLAS: Crea una medalla basada en los tags y PT del personaje.
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
 * 4. TAGS: Sugiere un nuevo tag y su descripción técnica para el catálogo.
 */
export async function iaSugerirTag(concepto) {
    const contexto = `El usuario quiere expandir el catálogo de tags del juego.`;
    const prompt = `Sugiere un nuevo #Tag basado en "${concepto}". 
    Incluye una descripción técnica de 2 o 3 líneas siguiendo el estilo de la Guía de Personajes.`;

    return await llamarIA(prompt, contexto);
}
