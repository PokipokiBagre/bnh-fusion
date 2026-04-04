// ============================================================
// bnh-guard.js — Guardián de Campaña BNH
// Agregar como PRIMER <script> en cada subpágina
// <script src="../bnh-guard.js"></script>   ← NO type="module"
// ============================================================
(function () {
    if (!localStorage.getItem('bnh_selected')) {
        sessionStorage.setItem('bnh_redirect_after_select', window.location.href);
        // Usamos la ruta base exacta de tu repo en GitHub Pages
        window.location.replace('/bnh-fusion/index.html');
    }
})();
