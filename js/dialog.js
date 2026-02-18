/**
 * dialog.js
 * Promise-based language-picker modal.
 *
 * Usage:
 *   const lang = await FavDialog.show('Station Name');
 *   // lang → 'Russian' | 'English' | 'German' | 'other' | null (cancelled)
 */

const FavDialog = (() => {
  let _resolve = null;

  /* ---- DOM refs ---- */
  const modal    = () => document.getElementById('favLangModal');
  const overlay  = () => document.getElementById('favDialogOverlay');
  const nameEl   = () => document.getElementById('favDialogName');
  const cancelBtn = () => document.getElementById('favDialogCancel');

  /* ---- Open ---- */
  function show(stationName) {
    return new Promise(resolve => {
      _resolve = resolve;
      nameEl().textContent = stationName || 'this station';
      modal().hidden = false;
      // Focus first option for keyboard accessibility
      const first = modal().querySelector('.modal__option');
      if (first) first.focus();
    });
  }

  /* ---- Close and resolve ---- */
  function close(lang) {
    modal().hidden = true;
    if (_resolve) {
      _resolve(lang ?? null);
      _resolve = null;
    }
  }

  /* ---- Bind events once DOM is ready ---- */
  document.addEventListener('DOMContentLoaded', () => {
    // Language option buttons
    document.querySelectorAll('.modal__option').forEach(btn => {
      btn.addEventListener('click', () => close(btn.dataset.lang));
    });

    // Cancel button
    cancelBtn().addEventListener('click', () => close(null));

    // Overlay backdrop click
    overlay().addEventListener('click', () => close(null));

    // Escape key
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !modal().hidden) close(null);
    });
  });

  return { show };
})();
