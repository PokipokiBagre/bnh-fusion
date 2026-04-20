// fusions/
import { bnhAuth, supabase } from '../bnh-auth.js';
import { db } from '../bnh-db.js';
import { fusionsState, setPersonajes, setPtGlobales, personajes, ptGlobales, STORAGE_URL } from './fusions-state.js';
import { renderSelectores, updateCharCard, renderResultado } from './fusions-ui.js';
import { calcularResultadoFusion } from './fusions-logic.js';
import { cargarFusiones, activarFusion } from '../bnh-fusion.js';

window.onload = async () => {
    const fav = document.getElementById('dynamic-favicon');
    if (fav) fav.href = `${STORAGE_URL}/imginterfaz/icon.png`;

    await bnhAuth.init();
    
    try {
        await cargarFusiones(); // Carga fusiones activas actuales del core
        const [pjData, ptData] = await Promise.all([
            db.personajes.getAll(),
            db.progresion.getPuntosAll()
        ]);
        setPersonajes(pjData);
        setPtGlobales(ptData);
    } catch(e) {
        document.getElementById('pantalla-carga').innerHTML = `<p style="color:red;">Error de conexión.</p>`;
        return;
    }

    document.getElementById('pantalla-carga').classList.add('oculto');
    document.getElementById('interfaz-fusiones').classList.remove('oculto');

    _exponerGlobales();
    renderSelectores();
};

function _exponerGlobales() {
    // Al seleccionar un pj en el combo box
    window._fusionSelectPJ = (idTarget, nombre) => {
        if (idTarget === 'pja') fusionsState.pjA = nombre;
        if (idTarget === 'pjb') fusionsState.pjB = nombre;
        updateCharCard(idTarget, nombre);
        document.getElementById('resultado-fusion').classList.add('oculto'); // Ocultar resultado viejo
    };

    // Al presionar el botón de simular
    window._fusionSimular = () => {
        fusionsState.d100 = parseInt(document.getElementById('inp-d100').value) || 0;
        
        if (!fusionsState.pjA || !fusionsState.pjB) return alert('Debes seleccionar dos personajes distintos.');
        if (fusionsState.pjA === fusionsState.pjB) return alert('El sujeto A y B no pueden ser el mismo.');
        if (fusionsState.d100 < 1 || fusionsState.d100 > 100) return alert('Ingresa un rendimiento válido (1-100).');

        const objA = personajes.find(p => p.nombre === fusionsState.pjA);
        const objB = personajes.find(p => p.nombre === fusionsState.pjB);

        fusionsState.resultadoCalculado = calcularResultadoFusion(objA, objB, fusionsState.d100, ptGlobales);
        renderResultado(fusionsState.resultadoCalculado);
    };

    // Al presionar oficializar
    window._fusionOficializar = async () => {
        const ok = confirm(`¿Estás seguro de fusionar a ${fusionsState.pjA} y ${fusionsState.pjB} con un ${fusionsState.d100}% de compatibilidad?`);
        if (!ok) return;

        const res = await activarFusion(fusionsState.pjA, fusionsState.pjB, fusionsState.d100);
        if (res.ok) {
            alert('¡Fusión completada con éxito!');
            window.location.reload(); // Recarga limpia para reflejar estado
        } else {
            alert('Error al fusionar: ' + res.msg);
        }
    };
}
