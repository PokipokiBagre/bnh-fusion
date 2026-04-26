// ============================================================
// op/op-state.js — Estado compartido del chat OP
// ============================================================
import { currentConfig } from '../bnh-auth.js';

export const STORAGE_URL = currentConfig.storageUrl;
export const BUCKET = 'imagenes-bnh';
export const FOLDER = 'op-chat';

export const opState = {
    perfil:          null,      // { id, nombre, avatar_path }
    perfiles:        {},        // { [id]: { id, nombre, avatar_path } } — todos los OPs
    conversaciones:  [],
    convActual:      null,
    mensajes:        [],
    imagenesGaleria: {},
    tab:             'chat',
    realtimeSub:     null,
    loadingMsgs:     false,
    grupos:          [],        // para autocomplete markup @Personaje@
    medallas:        [],        // para autocomplete markup !Medalla!
};

export function avatarUrl(path) {
    if (!path) return `${STORAGE_URL}/imginterfaz/no_encontrado.png`;
    return `${STORAGE_URL}/${path}?v=${Date.now()}`;
}

export function imageUrl(path) {
    if (!path) return '';
    return `${STORAGE_URL}/${path}`;
}
