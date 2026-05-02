// ============================================================
// bnh-port-state.js — Estado interno del panel flotante
// ============================================================

export const portState = {
    // Widget
    abierto:        false,
    minimizado:     false,
    pos:            null,   // { x, y } posición de la ventana

    // Sesión OP
    perfil:         null,   // { id, nombre, avatar_path }
    perfiles:       {},     // { [id]: perfil }

    // Chat
    conversaciones: [],
    convActual:     null,
    mensajes:       [],
    realtimeSub:    null,
    loadingMsgs:    false,

    // Galería
    imagenesGaleria: {},

    // Autocomplete
    grupos:         [],
    medallas:       [],

    // Archivos pendientes de envío
    pendingFiles:   [],     // [{ file, url, source, id }]
    pendingImgId:   null,   // id de galería seleccionada

    // Cita pendiente de envío
    _citaPendiente: null,   // { id, autor, preview }

    // Tab activa del panel
    tab: 'chat',            // 'chat' | 'galeria' | 'perfil'
};

// ── Persistir posición ────────────────────────────────────────
export function guardarPos(x, y) {
    try { localStorage.setItem('bnh_port_pos', JSON.stringify({ x, y })); } catch(_) {}
}
export function cargarPos() {
    try { return JSON.parse(localStorage.getItem('bnh_port_pos') || 'null'); } catch(_) { return null; }
}
export function guardarConv(id) {
    try { localStorage.setItem('bnh_port_conv', String(id)); } catch(_) {}
}
export function cargarConv() {
    try { return localStorage.getItem('bnh_port_conv') || null; } catch(_) { return null; }
}
