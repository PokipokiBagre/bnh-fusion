// ============================================================
// bnh-db.js — Cliente Unificado de Base de Datos BNH v4
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
            const { data } = supabase.storage
                .from('imagenes-bnh')
                .getPublicUrl(`imginterfaz/${norm(nombreLimpio)}.png`);
            return data.publicUrl;
        },

        getUrlPersonaje(nombreArchivo) {
            if (!nombreArchivo) return '';
            const norm = (str) => str.toString().trim().toLowerCase()
                .replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e')
                .replace(/[íìïî]/g, 'i').replace(/[óòöô]/g, 'o')
                .replace(/[úùüû]/g, 'u').replace(/[ñ]/g, 'n')
                .replace(/\s+/g, '_')
                .replace(/[^a-z0-9_\-]/g, '');
            const { data } = supabase.storage
                .from('imagenes-bnh')
                .getPublicUrl(`imgpersonajes/${norm(nombreArchivo)}icon.png`);
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
    },

    // ══════════════════════════════════════════════════════
    // PERSONAJES
    // ══════════════════════════════════════════════════════
    personajes: {
        // Todos los personajes con sus stats PAC y tags
        async getAll() {
            const { data } = await supabase
                .from('personajes')
                .select('id, nombre, pot, agi, ctl, pv_actual, tags, refinado_id')
                .order('nombre');
            return data || [];
        },

        // Un personaje por nombre
        async getByNombre(nombre) {
            const { data } = await supabase
                .from('personajes')
                .select('*')
                .eq('nombre', nombre)
                .single();
            return data || null;
        },

        // Actualiza los stats PAC y PV de un personaje
        async updateStats(nombre, { pot, agi, ctl, pv_actual, tags }) {
            const payload = {};
            if (pot        !== undefined) payload.pot       = pot;
            if (agi        !== undefined) payload.agi       = agi;
            if (ctl        !== undefined) payload.ctl       = ctl;
            if (pv_actual  !== undefined) payload.pv_actual = pv_actual;
            if (tags       !== undefined) payload.tags      = tags;
            const { error } = await supabase
                .from('personajes')
                .update(payload)
                .eq('nombre', nombre);
            return !error;
        },

        // Vista calculada: PV máx, Tier, etc. (desde la SQL View)
        async getStatsCalculados() {
            const { data } = await supabase
                .from('vista_pj_stats')
                .select('*')
                .order('nombre');
            return data || [];
        }
    },

    // ══════════════════════════════════════════════════════
    // MEDALLAS
    // ══════════════════════════════════════════════════════
    medallas: {
        // Catálogo completo de medallas
        async getCatalogo() {
            const { data } = await supabase
                .from('medallas_catalogo')
                .select('*')
                .order('nombre');
            return data || [];
        },

        // Catálogo filtrado por tag
        async getCatalogoPorTag(tag) {
            const { data } = await supabase
                .from('medallas_catalogo')
                .select('*')
                .contains('tags', [tag])
                .order('nombre');
            return data || [];
        },

        // Inventario de medallas de un personaje (con datos del catálogo)
        async getInventario(personajeNombre) {
            const { data } = await supabase
                .from('medallas_inventario')
                .select(`
                    id, slot_orden, equipada, tags_heredados,
                    medallas_catalogo ( id, nombre, costo_ctl, tags, efecto_desc, tipo, quirk_tag )
                `)
                .eq('personaje_nombre', personajeNombre)
                .order('slot_orden');
            return data || [];
        },

        // Asignar o actualizar una medalla en un slot
        async upsertSlot(personajeNombre, medallaId, slotOrden, equipada = true) {
            const { error } = await supabase
                .from('medallas_inventario')
                .upsert({
                    personaje_nombre: personajeNombre,
                    medalla_id:       medallaId,
                    slot_orden:       slotOrden,
                    equipada
                }, { onConflict: 'personaje_nombre,slot_orden' });
            return !error;
        },

        // Desequipar (quitar del slot) sin borrar del inventario
        async desequipar(personajeNombre, slotOrden) {
            const { error } = await supabase
                .from('medallas_inventario')
                .update({ equipada: false })
                .eq('personaje_nombre', personajeNombre)
                .eq('slot_orden', slotOrden);
            return !error;
        },

        // Eliminar una medalla del inventario de un personaje
        async eliminarDeInventario(personajeNombre, medallaId) {
            const { error } = await supabase
                .from('medallas_inventario')
                .delete()
                .eq('personaje_nombre', personajeNombre)
                .eq('medalla_id', medallaId);
            return !error;
        },

        // CRUD catálogo (solo admin)
        async crearEnCatalogo({ nombre, costo_ctl, tags, efecto_desc, tipo, quirk_tag }) {
            const { data, error } = await supabase
                .from('medallas_catalogo')
                .insert({ nombre, costo_ctl, tags, efecto_desc, tipo, quirk_tag })
                .select('id')
                .single();
            if (error) return { ok: false, msg: error.message };
            return { ok: true, id: data.id };
        },

        async actualizarEnCatalogo(id, campos) {
            const { error } = await supabase
                .from('medallas_catalogo')
                .update(campos)
                .eq('id', id);
            return !error;
        },

        async eliminarDeCatalogo(id) {
            const { error } = await supabase
                .from('medallas_catalogo')
                .delete()
                .eq('id', id);
            return !error;
        }
    },

    // ══════════════════════════════════════════════════════
    // PUNTOS DE TAG (PT)
    // ══════════════════════════════════════════════════════
    progresion: {
        // PT actuales de un personaje (tabla puntos_tag)
        async getPuntosByPj(personajeNombre) {
            const { data } = await supabase
                .from('puntos_tag')
                .select('tag, cantidad')
                .eq('personaje_nombre', personajeNombre)
                .order('cantidad', { ascending: false });
            return data || [];
        },

        // PT de todos los personajes (para ranking global)
        async getPuntosAll() {
            const { data } = await supabase
                .from('puntos_tag')
                .select('personaje_nombre, tag, cantidad')
                .order('personaje_nombre');
            return data || [];
        },

        // Log completo de transacciones de un personaje
        async getLogByPj(personajeNombre, limit = 50) {
            const { data } = await supabase
                .from('log_puntos_tag')
                .select('*')
                .eq('personaje_nombre', personajeNombre)
                .order('creado_en', { ascending: false })
                .limit(limit);
            return data || [];
        },

        // Log de un hilo específico (para auditar qué posts generaron PT)
        async getLogByThread(threadId) {
            const { data } = await supabase
                .from('log_puntos_tag')
                .select('*')
                .eq('origen_thread_id', threadId)
                .order('creado_en', { ascending: false });
            return data || [];
        },

        // Aplica un array de transacciones PT y actualiza puntos_tag
        // transacciones = [{ personaje_nombre, tag, delta, motivo, origen_post_no, origen_thread_id }]
        async aplicarTransacciones(transacciones) {
            if (!transacciones.length) return { ok: true };

            // 1. Insertar en el log
            const { error: errLog } = await supabase
                .from('log_puntos_tag')
                .insert(transacciones);
            if (errLog) return { ok: false, msg: errLog.message };

            // 2. Upsert en puntos_tag (sumar delta al valor existente)
            // Agrupamos por (personaje_nombre, tag) para hacer un solo upsert por par
            const agrupado = {};
            transacciones.forEach(t => {
                const key = `${t.personaje_nombre}||${t.tag}`;
                agrupado[key] = (agrupado[key] || 0) + t.delta;
            });

            for (const [key, delta] of Object.entries(agrupado)) {
                const [personaje_nombre, tag] = key.split('||');
                // Intentamos actualizar primero; si no existe, insertamos
                const { data: existente } = await supabase
                    .from('puntos_tag')
                    .select('cantidad')
                    .eq('personaje_nombre', personaje_nombre)
                    .eq('tag', tag)
                    .maybeSingle();

                const nuevaCantidad = (existente?.cantidad || 0) + delta;
                await supabase
                    .from('puntos_tag')
                    .upsert({
                        personaje_nombre,
                        tag,
                        cantidad:       nuevaCantidad,
                        actualizado_en: new Date().toISOString()
                    }, { onConflict: 'personaje_nombre,tag' });
            }

            return { ok: true };
        },

        // Gasto de PT (canje): registra delta negativo
        // tipoCanje: 'gasto_stat' | 'gasto_medalla' | 'gasto_mutacion'
        async gastarPT(personajeNombre, tag, cantidad, tipoCanje) {
            return this.aplicarTransacciones([{
                personaje_nombre: personajeNombre,
                tag,
                delta:   -Math.abs(cantidad),
                motivo:  tipoCanje
            }]);
        }
    },

    // ══════════════════════════════════════════════════════
    // HISTORIAL (helpers para el sistema de PT automático)
    // ══════════════════════════════════════════════════════
    historial: {
        // Posts que aún no tuvieron sus PT procesados
        async getPostsSinProcesar(board, threadId) {
            const { data } = await supabase
                .from('historial_posts')
                .select('post_no, poster_name, reply_to, post_time')
                .eq('board', board)
                .eq('thread_id', threadId)
                .eq('pt_procesado', false)
                .order('post_no');
            return data || [];
        },

        // Marcar posts como procesados (PT ya calculados)
        async marcarProcesados(board, threadId, postNos) {
            if (!postNos.length) return;
            await supabase
                .from('historial_posts')
                .update({ pt_procesado: true })
                .eq('board', board)
                .eq('thread_id', threadId)
                .in('post_no', postNos);
        },

        // Mapa nombre_en_hilo → personaje_nombre (para resolver replies)
        // Cruza poster_name de historial_posts con personajes.nombre
        async getMapaNombres() {
            const { data } = await supabase
                .from('personajes')
                .select('nombre, tags');
            if (!data) return {};
        
            const mapa = {};
            data.forEach(p => {
                // El nombre completo siempre funciona
                mapa[p.nombre] = p;
                // Si tiene comas, cada parte también funciona por separado
                if (p.nombre.includes(',')) {
                    p.nombre.split(',').forEach(parte => {
                        const a = parte.trim();
                        if (a) mapa[a] = p;
                    });
                }
            });
            return mapa;
        }
  }
}
