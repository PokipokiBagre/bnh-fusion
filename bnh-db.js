// ============================================================
// bnh-db.js — Cliente Unificado de Base de Datos BNH
// Coloca este archivo en la RAÍZ del proyecto BNH
// ============================================================
// Uso:
//   import { db } from '../bnh-db.js';
// ============================================================

import { supabase, currentConfig } from './bnh-auth.js';

export const db = {

    // ══════════════════════════════════════════════════════
    // STORAGE
    // ══════════════════════════════════════════════════════
    storage: {
        get urlBase() { return currentConfig.storageUrl; },

        getUrlInterfaz(nombreArchivo) {
            if (!nombreArchivo) return '';

            const norm = (str) => str.toString().trim().toLowerCase()
                .replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e')
                .replace(/[íìïî]/g, 'i').replace(/[óòöô]/g, 'o')
                .replace(/[úùüû]/g, 'u').replace(/[ñ]/g, 'n')
                .replace(/\s+/g, '_')
                .replace(/[^a-z0-9_\-]/g, '');

            const nombreLimpio = nombreArchivo.replace(/\.(png|jpg|jpeg|webp|gif)$/i, '');
            const key = norm(nombreLimpio);

            const { data } = supabase.storage
                .from('imagenes-bnh')
                .getPublicUrl(`imginterfaz/${key}.png`);

            return data.publicUrl;
        }
    },

    // ══════════════════════════════════════════════════════
    // USUARIOS (solo admin)
    // ══════════════════════════════════════════════════════
    usuarios: {
        async getPerfiles() {
            const { data } = await supabase
                .from('perfiles_usuario')
                .select('id, email, rol, personaje_nombre, created_at')
                .order('email');
            return data || [];
        },

        async asignarPersonaje(userId, personajeNombre) {
            const { error } = await supabase
                .from('perfiles_usuario')
                .update({ personaje_nombre: personajeNombre })
                .eq('id', userId);
            return !error;
        },

        async cambiarRol(userId, nuevoRol) {
            const { error } = await supabase
                .from('perfiles_usuario')
                .update({ rol: nuevoRol })
                .eq('id', userId);
            return !error;
        }
    }

    // Agrega aquí más módulos (personajes, misiones, etc.)
    // cuando los necesites, con la misma estructura que hex-db.js
};
