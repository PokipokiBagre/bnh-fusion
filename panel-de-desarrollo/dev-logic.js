// ============================================================
// dev-logic.js — Lógica de Sincronización y Logs
// ============================================================

import { supabase } from '../bnh-auth.js'; 
import { devState, norm } from './dev-state.js';
import { stState } from './estadisticas/panel-stats-state.js';
import { haycambiosPagina } from './pagina/panel-pagina-logic.js';

// --- [PENDIENTE] MÓDULOS EN CONSTRUCCIÓN ---
// import { db } from '../bnh-db.js';
// import { objState } from './objetos/panel-objetos-state.js';
// import { hzState } from './hechizos/panel-hechizos-state.js'; 
// import { mapaDevState } from './mapa/panel-mapa-state.js';
// import { getPjStat, ... } from './estadisticas/panel-stats-logic.js';
// import { getCantidadActual } from './objetos/panel-objetos-logic.js'; 
// import { contarCambiosPendientes as contarCambiosMapa } from './mapa/panel-mapa-logic.js';

export function revisarCambiosPendientes() {
    const btnSync = document.getElementById('btn-sync-global');
    if (!btnSync) return;

    let hayCambios = false;

    // --- Módulos Activos ---
    if (Object.keys(stState.colaStats || {}).length > 0) hayCambios = true;
    if (Object.keys(stState.colaNotas || {}).length > 0) hayCambios = true;
    if (Object.keys(stState.colaEstadosConfig || {}).length > 0) hayCambios = true;
    if ((stState.colaBorrarEstados || []).length > 0) hayCambios = true;
    if (haycambiosPagina && haycambiosPagina()) hayCambios = true;

    // --- [PENDIENTE] ---
    /*
    if (Object.keys(objState.colaInventario).length > 0) hayCambios = true;
    if (Object.keys(objState.colaEquipados).length > 0) hayCambios = true; 
    if (Object.values(objState.colaNuevosObjetos).some(o => o.nombre.trim() !== '')) hayCambios = true;
    if (Object.keys(objState.colaEdicionObjetos).length > 0) hayCambios = true;
    if (Object.keys(hzState.colaAsignaciones).length > 0) hayCambios = true; 
    if (Object.keys(hzState.colaVisibilidad).length > 0) hayCambios = true;
    if (contarCambiosMapa() > 0) hayCambios = true;
    */

    if (hayCambios) btnSync.classList.remove('oculto');
    else btnSync.classList.add('oculto');
}

export function actualizarLogGlobal() {
    const logPorPJ = {};

    // --- LÓGICA DE ESTADÍSTICAS ---
    for (const pjKey in (stState.colaStats || {})) {
        const realPj = devState.listaPersonajes.find(p => norm(p.nombre) === norm(pjKey))?.nombre || pjKey;
        const cambios = stState.colaStats[pjKey];
        const dbPj = stState.statsDB[pjKey] || {};

        for (const flatKey in cambios) {
            if (flatKey.endsWith('.null') || flatKey.startsWith('__')) continue;

            const cantNueva = cambios[flatKey];
            const parts = flatKey.split('.');
            const campoRaiz = parts[0];
            const subCampo = parts.length > 1 ? parts[1] : null;

            let cantVieja = !subCampo ? (dbPj[campoRaiz] ?? 0) : (dbPj[campoRaiz]?.[subCampo] ?? 0);

            if (typeof cantNueva === 'number' && typeof cantVieja === 'number') {
                const delta = cantNueva - cantVieja;
                if (delta === 0) continue;
                if (!logPorPJ[realPj]) logPorPJ[realPj] = [];
                const sign = delta > 0 ? '+' : '';
                logPorPJ[realPj].push(`${subCampo || campoRaiz} ${sign}${delta} (${cantNueva})`);
            }
        }
    }

    // --- [PENDIENTE] LÓGICA DE OBJETOS, HECHIZOS Y MAPA ---
    /*
    // Aquí irá la lectura de objState.colaInventario, hzState.logCasteosSession, etc...
    */

    // --- RENDERIZADO DEL LOG ---
    let logText = "";
    if (logPorPJ['__global__'] && logPorPJ['__global__'].length > 0) {
        logPorPJ['__global__'].forEach(line => { logText += `${line}\n`; });
        logText += `\n`;
    }
    for (const pj in logPorPJ) {
        if (pj === '__global__') continue;
        if (logPorPJ[pj].length > 0) {
            logText += `${pj}\n`;
            logPorPJ[pj].forEach(line => { logText += `${line}\n`; });
            logText += `\n`;
        }
    }

    const textarea = document.getElementById('log-global-textarea');
    if (textarea) textarea.value = logText.trim();
}

export async function ejecutarGuardadoGlobal() {
    const btnSync = document.getElementById('btn-sync-global');
    btnSync.innerText = "⏳ SINCRONIZANDO CON LA BASE DE DATOS...";
    btnSync.style.pointerEvents = "none";

    try {
        const statsUpserts = [];
        const estadosUpserts = [];
        const deletePromises = []; 

        // --- GUARDADO DE ESTADÍSTICAS ---
        const pjsConCambiosStats = new Set([...Object.keys(stState.colaStats || {}), ...Object.keys(stState.colaNotas || {})]);

        for (const pjKey of pjsConCambiosStats) {
            const realPj = devState.listaPersonajes.find(p => norm(p.nombre) === norm(pjKey))?.nombre || pjKey;
            const cambios = stState.colaStats[pjKey] || {};
            const notasCambios = stState.colaNotas[pjKey] || {};
            
            let updatedPj = stState.statsDB[pjKey] ? JSON.parse(JSON.stringify(stState.statsDB[pjKey])) : {
                hex: 0, asistencia: 0, vidaRojaActual: 0, baseVidaRojaMax: 0, baseVidaAzul: 0, baseGuardaDorada: 0, baseDanoRojo: 0, baseDanoAzul: 0, baseElimDorada: 0,
                afinidadesBase: {}, hechizosEfecto: {}, buffs: {}, notasAfinidad: {}, estados: {}
            };
            
            if (!updatedPj.afinidadesBase) updatedPj.afinidadesBase = {};
            if (!updatedPj.hechizosEfecto) updatedPj.hechizosEfecto = {};
            if (!updatedPj.buffs) updatedPj.buffs = {};
            if (!updatedPj.notasAfinidad)  updatedPj.notasAfinidad = {};
            if (!updatedPj.estados)        updatedPj.estados = {};

            for (const flatKey in cambios) {
                if (flatKey.endsWith('.null') || flatKey.startsWith('__')) continue; 
                const keys = flatKey.split('.');
                if (keys.length === 1) updatedPj[keys[0]] = cambios[flatKey];
                else {
                    if (!updatedPj[keys[0]]) updatedPj[keys[0]] = {};
                    updatedPj[keys[0]][keys[1]] = cambios[flatKey];
                }
            }

            for (const flatKey in notasCambios) {
                updatedPj.notasAfinidad[flatKey] = notasCambios[flatKey];
            }

            statsUpserts.push({
                nombre: realPj,
                hex: updatedPj.hex,
                asistencia: updatedPj.asistencia,
                vida_roja_actual: updatedPj.vidaRojaActual,
                base_vida_roja_max: updatedPj.baseVidaRojaMax,
                base_vida_azul: updatedPj.baseVidaAzul,
                base_guarda_dorada: updatedPj.baseGuardaDorada,
                base_dano_rojo: updatedPj.baseDanoRojo,
                base_dano_azul: updatedPj.baseDanoAzul,
                base_elim_dorada: updatedPj.baseElimDorada,
                estados: updatedPj.estados,
                notas_afinidad: updatedPj.notasAfinidad 
            });
        }

        for (const id in stState.colaEstadosConfig) {
            estadosUpserts.push({ id: id, ...stState.colaEstadosConfig[id] });
        }
        if ((stState.colaBorrarEstados || []).length > 0) {
            deletePromises.push(supabase.from('estados_config').delete().in('id', stState.colaBorrarEstados));
        }

        if (deletePromises.length > 0) {
            const resultDeletes = await Promise.all(deletePromises);
            const errDel = resultDeletes.find(r => r && r.error);
            if (errDel) throw new Error("Ejecutando deletes: " + errDel.error.message);
        }

        if (statsUpserts.length > 0) {
            const { error: errSt } = await supabase.from('personajes').upsert(statsUpserts, { onConflict: 'nombre' });
            if (errSt) throw new Error("Estadísticas: " + errSt.message);
        }
        
        if (estadosUpserts.length > 0) {
            const { error: errEst } = await supabase.from('estados_config').upsert(estadosUpserts, { onConflict: 'id' });
            if (errEst) throw new Error("Estados: " + errEst.message);
        }

        // --- [PENDIENTE] GUARDADO DE OBJETOS, HECHIZOS Y MAPA ---
        /*
        // Aquí irán los upserts de objState, hzState y mapaDevState
        */

        btnSync.innerText = "✅ CAMBIOS APLICADOS";
        btnSync.style.background = "#004a00";
        btnSync.style.borderColor = "#00ff00";
        btnSync.style.color = "white";

        setTimeout(() => { window.location.reload(); }, 1000);

    } catch (e) {
        console.error("Error guardando en BD:", e);
        alert("Ocurrió un error guardando en Supabase:\n" + e.message);
        btnSync.innerText = "❌ ERROR AL GUARDAR";
        btnSync.style.background = "#4a0000";
        btnSync.style.pointerEvents = "auto";
    }
}
