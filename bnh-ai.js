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

/**
 * 2. LORE: Genera o edita la historia de un personaje.
 */
/**
 * 2. LORE: Genera o edita la historia de un personaje usando JSON routing.
 */
export async function iaGestionarLore(nombrePJ, instruccion, textosActuales) {
    const pj = gruposGlobal.find(g => g.nombre_refinado === nombrePJ);
    if (!pj) throw new Error("Personaje no encontrado.");

    const pts = ptGlobal[nombrePJ] || {};
    const tagsStr = Object.entries(pts).map(([t, p]) => `${t} [${p} PT]`).join(', ');

    const contexto = `
        PERSONAJE: @${pj.nombre_refinado}@
        STATS: POT ${pj.pot}, AGI ${pj.agi}, CTL ${pj.ctl}.
        TAGS EQUIPADOS: ${tagsStr}
        
        TEXTOS ACTUALES EN LA UI:
        - Descripción: ${textosActuales.descripcion || 'Vacío'}
        - Historia: ${textosActuales.lore || 'Vacío'}
        - Personalidad: ${textosActuales.personalidad || 'Vacío'}
        - Quirk: ${textosActuales.quirk || 'Vacío'}
    `;

    const prompt = `
        INSTRUCCIÓN DEL OP: ${instruccion}

        REGLA CRÍTICA DE FORMATO: No respondas con texto libre ni markdown. Tu respuesta debe ser ÚNICA Y ESTRICTAMENTE un objeto JSON válido con 4 claves. 
        Si el OP te pide editar solo una sección (ej: "Mejora su historia"), inventa esa sección y copia exactamente el texto de las demás secciones actuales para no borrarlas.
        Si la sección actual dice "Vacío" y no se te pide llenarla, déjala en blanco ("").

        Devuelve exactamente esto:
        {
          "descripcion": "...",
          "lore": "...",
          "personalidad": "...",
          "quirk": "..."
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
