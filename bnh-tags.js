// ============================================================
// bnh-tags.js — Catálogo canónico de tags BNH-Fusion v1
// Colocar en la RAÍZ del proyecto.
// Importar desde cualquier módulo que necesite autosugerencia.
// ============================================================

export const TAGS_CANONICOS = [
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

// ── Autosugerencia de tags ────────────────────────────────────
// Devuelve hasta `max` tags que coincidan con la query,
// priorizando los tags ya existentes en la DB (tagsEnUso)
export function sugerirTags(query, tagsEnUso = [], max = 8) {
  const q = query.toLowerCase().replace(/^#/, '');
  if (!q) return [];

  const enUsoSet = new Set(tagsEnUso.map(t => t.toLowerCase()));

  // Filtra canónicos que coincidan
  const coinciden = TAGS_CANONICOS.filter(t =>
    t.toLowerCase().replace(/^#/, '').includes(q)
  );

  // Ordena: primero los que ya están en uso, luego el resto
  coinciden.sort((a, b) => {
    const aEnUso = enUsoSet.has(a.toLowerCase()) ? 0 : 1;
    const bEnUso = enUsoSet.has(b.toLowerCase()) ? 0 : 1;
    return aEnUso - bEnUso;
  });

  return coinciden.slice(0, max);
}

// ── Widget de input con autosugerencia ────────────────────────
// Uso:
//   const widget = crearTagInput('mi-input', tagsExistentes, onTagAdded);
//   document.getElementById('contenedor').appendChild(widget.el);
//
// onTagAdded(tag) se llama cuando se confirma un tag nuevo.
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
