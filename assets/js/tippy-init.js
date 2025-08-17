// Initialize tooltips & icons on load (and provide a helper for re-renders)
(function(){
  function init(){
    if (window.tippy) tippy('[data-tippy-content]');
    if (window.lucide) lucide.createIcons();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // expose for manual calls if needed
  window.__initTips = init;
})();
