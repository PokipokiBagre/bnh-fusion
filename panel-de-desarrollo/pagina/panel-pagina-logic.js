// ============================================================
// panel-pagina-logic.js — Lógica de carga y guardado de config_ui
// ============================================================

import { supabase } from '../../bnh-auth.js';
import { paginaState } from './panel-pagina-state.js';

export async function cargarConfigUI() {
    const { data, error } = await supabase
        .from('config_ui')
        .select('*')
        .eq('hex_id', 'default')
        .single();

    if (error) {
        console.warn('No se pudo cargar config_ui:', error.message);
        return null;
    }
    paginaState.config = data;
    return data;
}

export async function guardarConfigUI() {
    const c = paginaState.pendiente;
    if (!c || Object.keys(c).length === 0) return { ok: false, msg: 'Sin cambios pendientes.' };

    const payload = {
        ...c,
        hex_id: 'default',
        updated_at: new Date().toISOString()
    };

    const { error } = await supabase
        .from('config_ui')
        .upsert(payload, { onConflict: 'hex_id' });

    if (error) return { ok: false, msg: error.message };

    paginaState.config = { ...paginaState.config, ...c };
    paginaState.pendiente = {};
    return { ok: true };
}

export function marcarCambioPagina(campo, valor) {
    if (!paginaState.pendiente) paginaState.pendiente = {};
    paginaState.pendiente[campo] = valor;
    if (!paginaState.config) paginaState.config = {};
    paginaState.config[campo] = valor;
}

export function haycambiosPagina() {
    return paginaState.pendiente && Object.keys(paginaState.pendiente).length > 0;
}
