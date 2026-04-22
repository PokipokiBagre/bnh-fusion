// ============================================================
// bnh-ai.js — Puente de comunicación con Gemini via Supabase
// ============================================================
import { supabase } from './bnh-auth.js';
import { REGLAS_SISTEMA } from './bnh-reglas.js';
import { gruposGlobal, ptGlobal } from './fichas/fichas-state.js';

/**
 * 1. Función base: Invoca la Edge Function en Supabase.
 * Envía siempre las REGLAS_SISTEMA como contexto de instrucción.
 */
// bnh-ai.js (reemplaza solo esta función)
export async function llamarIA(peticionUsuario, contextoDeDatos) {
    try {
        const { data, error } = await supabase.functions.invoke('bnh-ai-injector', {
            body: { 
                prompt: peticionUsuario, 
                contextoAdicional: `
                    ${REGLAS_SISTEMA}
                    
                    DATOS DE LA BASE DE DATOS ACTUAL:
                    ${contextoDeDatos}
                `
            }
        });

        // Si la función falla, extraemos el error real
        if (error) {
            console.error("Detalle de Supabase:", error);
            // Supabase a veces esconde el mensaje en error.context
            const msgReal = (error.context && error.context.error) ? error.context.error : error.message;
            throw new Error(msgReal);
        }

        // Si Deno devolvió un error JSON controlado por nosotros
        if (data && data.error) {
            throw new Error(data.error);
        }

        return data.resultado;
    } catch (err) {
        console.error("Error crítico en IA:", err);
        // Ahora sí mostraremos el mensaje real en la cajita de la UI
        throw new Error(err.message || "Error desconocido de conexión.");
    }
}

/**
 * 2. LORE: Genera o edita la historia de un personaje.
 */
export async function iaGestionarLore(nombrePJ, instruccion, esEdicion = false, textoActual = "") {
    const pj = gruposGlobal.find(g => g.nombre_refinado === nombrePJ);
    if (!pj) throw new Error("Personaje no encontrado.");

    const pts = ptGlobal[nombrePJ] || {};
    const tagsStr = Object.entries(pts).map(([t, p]) => `${t} [${p} PT]`).join(', ');

    const contexto = `
        PERSONAJE: @${pj.nombre_refinado}@
        STATS: POT ${pj.pot}, AGI ${pj.agi}, CTL ${pj.ctl}.
        TAGS EQUIPADOS: ${tagsStr}
        ${esEdicion ? `TEXTO ACTUAL A EDITAR: ${textoActual}` : `HISTORIA PREVIA: ${pj.lore || 'Ninguna'}`}
    `;

    return await llamarIA(instruccion, contexto);
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
