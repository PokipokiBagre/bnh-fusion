// ============================================================
// bnh-guard.js — Guardián de Campaña BNH
// Agregar como PRIMER <script> en cada subpágina
// <script src="../bnh-guard.js"></script>   ← NO type="module"
// ============================================================
(function () {
    if (!localStorage.getItem('bnh_selected')) {
        sessionStorage.setItem('bnh_redirect_after_select', window.location.href);
        const depth = window.location.pathname.split('/').filter(Boolean).length;
        const root = '../'.repeat(depth - 1) || './';
        window.location.replace(root + 'index.html');
    }
})();
