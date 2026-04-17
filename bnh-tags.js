// ============================================================
// bnh-tags.js — Catálogo canónico de tags BNH-Fusion v2
// Colocar en la RAÍZ del proyecto.
//
// Los tags canónicos se cargan desde la tabla `tags_catalogo`
// en Supabase. Si la tabla no existe o falla, se usa el array
// hardcodeado como fallback para no romper el sistema.
//
// Para crear la tabla en Supabase (ejecutar una sola vez):
//   CREATE TABLE tags_catalogo (
//     id         bigint generated always as identity primary key,
//     nombre     text not null unique,
//     descripcion text,
//     creado_en  timestamptz default now()
//   );
//   -- Poblar con los tags actuales:
//   INSERT INTO tags_catalogo (nombre) VALUES
//     ('#U.A.'),('#Aspirante'),('#Urbano'), ... (ver TAGS_FALLBACK abajo)
//   ON CONFLICT (nombre) DO NOTHING;
//
// Una vez creada la tabla, los nuevos tags que el OP añade a
// personajes se pueden registrar también en tags_catalogo para
// que aparezcan en la autosugerencia de todos los paneles.
// ============================================================

import { supabase } from './bnh-auth.js';

// ── Fallback hardcodeado (usado si la DB falla) ───────────────
const TAGS_FALLBACK = [
  "#U.A.","#Aspirante","#Urbano","#Fuerza_Bruta","#Catastrófico",
  "#Analítica","#Trauma","#Vínculo","#Mecánica","#Disciplina",
  "#Pragmática","#Leal","#Noble","#Caótica","#Elemental",
  "#Anatómico","#Táctico","#Espacial","#Showman","#Maldición",
  "#Dramática","#Terror","#Horror","#Secreto","#Resiliencia",
  "#Tradición","#Gourmet","#Alienación","#Protector","#Eldritch",
  "#Nobleza","#Digital","#Constructo","#Héroe_Profesional","#Excéntrico",
  "#Lógica","#Tecnología","#Análisis","#Mutación","#Venganza",
  "#Insegura","#Obsesivo","#Proyección","#Crianza","#Invocación",
  "#Sonoro","#Nómada","#Ocular","#Sonrisa_Salvaje","#Almacenamiento",
  "#Bestial","#Autoridad","#Dualidad","#Paternal","#Leyenda",
  "#Riqueza","#Infantil","#Despreocupado","#Cínica","#Nostalgia",
  "#Asimilación","#Cyborg","#Bottergeist","#Posesión","#Buranku",
  "#Marionetista","#Teatro","#Invulnerable","#Powercore","#Compresión",
  "#Musculatura","#Chaneque","#Adaptación","#Mahoraga","#O-SOL",
  "#Hipervelocidad","#Élite","#Jurídico","#Contratos","#Cláusulas",
  "#The_Goat","#Inmortal","#Eternidad","#Cabeza_Redonda","#Precognición",
  "#Salto_Cuántico","#Visión","#Magma","#Calor","#Fundición",
  "#Copia","#Robo","#Tenacidad","#Transmutación","#Homúnculos",
  "#Abisales","#Madre_Soltera","#Lucky_Cat","#Seaboy","#Massbreaker"
];

// ── Estado en memoria ─────────────────────────────────────────
// Este array se rellena al llamar initTags() y se mantiene
// actualizado. Exportarlo permite importarlo como referencia viva.
export let TAGS_CANONICOS = [...TAGS_FALLBACK];

let _inicializado = false;
let _promesaInit  = null;

/**
 * Carga los tags desde tags_catalogo en Supabase.
 * Es idempotente: múltiples llamadas solo hacen un fetch real.
 * Llamar con await antes de usar TAGS_CANONICOS o crearTagInput.
 */
export async function initTags() {
    if (_inicializado) return TAGS_CANONICOS;
    if (_promesaInit)  return _promesaInit;

    _promesaInit = (async () => {
        try {
            const { data, error } = await supabase
                .from('tags_catalogo')
                .select('nombre')
                .order('nombre');

            if (!error && data && data.length > 0) {
                // Reemplazar el contenido del array en memoria
                TAGS_CANONICOS.length = 0;
                data.forEach(row => {
                    const tag = row.nombre.startsWith('#') ? row.nombre : '#' + row.nombre;
                    TAGS_CANONICOS.push(tag);
                });
            }
            // Si falla o la tabla está vacía → se quedan los TAGS_FALLBACK
        } catch (_) {
            // Red caída, tabla inexistente, etc. → fallback silencioso
        }
        _inicializado = true;
        return TAGS_CANONICOS;
    })();

    return _promesaInit;
}

/**
 * Registra un nuevo tag en tags_catalogo si no existe.
 * Llamar cuando el OP añade un tag completamente nuevo a un personaje.
 * No lanza error si falla (el tag se añade al personaje igual).
 */
export async function registrarTagEnDB(tag) {
    if (!tag) return;
    const nombre = tag.startsWith('#') ? tag : '#' + tag;
    try {
        await supabase
            .from('tags_catalogo')
            .insert({ nombre })
            .onConflict('nombre')   // ignorar si ya existe
            .maybeSingle();
        // Añadir al array en memoria si no estaba
        if (!TAGS_CANONICOS.includes(nombre)) {
            TAGS_CANONICOS.push(nombre);
            TAGS_CANONICOS.sort();
        }
    } catch (_) { /* silencioso */ }
}

// ── Autosugerencia de tags ────────────────────────────────────
export function sugerirTags(query, tagsEnUso = [], max = 8) {
    const q = query.toLowerCase().replace(/^#/, '');
    if (!q) return [];

    const enUsoSet = new Set(tagsEnUso.map(t => t.toLowerCase()));

    const coinciden = TAGS_CANONICOS.filter(t =>
        t.toLowerCase().replace(/^#/, '').includes(q)
    );

    coinciden.sort((a, b) => {
        const aEnUso = enUsoSet.has(a.toLowerCase()) ? 0 : 1;
        const bEnUso = enUsoSet.has(b.toLowerCase()) ? 0 : 1;
        return aEnUso - bEnUso;
    });

    return coinciden.slice(0, max);
}

// ── Widget de input con autosugerencia ────────────────────────
export function crearTagInput(id, tagsEnUso = [], onTagAdded = null) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;';

    wrapper.innerHTML = `
    <input id="${id}" type="text" autocomplete="off"
        placeholder="#NuevoTag o escribe para buscar..."
        style="width:100%; padding:7px 10px; border:1.5px solid var(--gray-300);
               border-radius:var(--radius); font-size:0.88em; background:white;
               color:var(--gray-900); box-sizing:border-box;">
    <div id="${id}-sugg" style="
        display:none; position:absolute; left:0; right:0; top:100%; z-index:999;
        background:white; border:1px solid var(--booru-border); border-top:none;
        border-radius:0 0 var(--radius) var(--radius);
        box-shadow:0 4px 12px rgba(0,0,0,0.1); max-height:200px; overflow-y:auto;">
    </div>`;

    const inp  = wrapper.querySelector(`#${id}`);
    const sugg = wrapper.querySelector(`#${id}-sugg`);

    function mostrarSugerencias(query) {
        const sug = sugerirTags(query, tagsEnUso);
        if (!sug.length) { sugg.style.display = 'none'; return; }
        sugg.innerHTML = sug.map(t => `
            <div data-tag="${t}" style="padding:7px 12px; cursor:pointer; font-size:0.85em;
                 color:var(--booru-link); transition:background 0.1s;"
                 onmouseover="this.style.background='var(--green-pale)'"
                 onmouseout="this.style.background=''"
                 onclick="this.parentElement._pickTag('${t.replace(/'/g, "\\'")}')">
                ${t}
            </div>`).join('');
        sugg.style.display = 'block';
        sugg._pickTag = (tag) => {
            inp.value = '';
            sugg.style.display = 'none';
            if (onTagAdded) onTagAdded(tag);
        };
    }

    inp.addEventListener('input', () => {
        const v = inp.value.trim();
        if (v.length >= 1) mostrarSugerencias(v);
        else sugg.style.display = 'none';
    });

    inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const v = inp.value.trim();
            if (!v) return;
            const tag = v.startsWith('#') ? v : '#' + v;
            inp.value = '';
            sugg.style.display = 'none';
            if (onTagAdded) onTagAdded(tag);
        }
        if (e.key === 'Escape') sugg.style.display = 'none';
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) sugg.style.display = 'none';
    });

    return { el: wrapper, input: inp };
}
