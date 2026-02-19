/**
 * stations.js
 * Responsible for rendering station cards into the DOM.
 */

const StationsUI = (() => {
  /** Reference to the grid container */
  const grid = () => document.getElementById('stationGrid');
  const emptyState = () => document.getElementById('emptyState');
  const loadingState = () => document.getElementById('loadingState');
  const stationCount = () => document.getElementById('stationCount');
  const sectionTitle = () => document.getElementById('sectionTitle');

  /**
   * Render an array of station objects as cards.
   * @param {Array} stations
   * @param {string} [titleText]
   */
  function render(stations, titleText) {
    const g = grid();
    g.innerHTML = '';

    // Update title & count
    if (titleText) sectionTitle().textContent = titleText;
    const count = stations.length;
    stationCount().textContent = `${count} station${count !== 1 ? 's' : ''}`;

    if (!count) {
      emptyState().hidden = false;
      return;
    }

    emptyState().hidden = true;

    stations.forEach((station, index) => {
      const card = buildCard(station, index);
      g.appendChild(card);
    });
  }

  /**
   * Build a single station card DOM element.
   * @param {Object} station
   * @param {number} index - used for staggered animation delay
   * @returns {HTMLElement}
   */
  function buildCard(station, index) {
    const isFav      = Favorites.has(station.id);
    const isDefault  = Favorites.isDefault(station.id);
    const isPlaying  = Player.currentStationId() === station.id;

    const card = document.createElement('article');
    card.className = `station-card${isPlaying ? ' is-playing' : ''}`;
    card.dataset.id = station.id;
    card.style.animationDelay = `${Math.min(index * 0.04, 0.5)}s`;
    card.setAttribute('aria-label', `Play ${station.name}`);

    card.innerHTML = `
      <div class="station-card__top">
        ${buildLogo(station)}
        <button
          class="station-card__fav${isFav ? ' is-fav' : ''}${isDefault ? ' is-default' : ''}"
          aria-label="${isDefault ? 'Default favourite' : isFav ? 'Remove from favourites' : 'Add to favourites'}"
          data-fav-id="${station.id}"
          title="${isDefault ? 'Default favourite — always kept' : isFav ? 'Remove from favourites' : 'Add to favourites'}"
          ${isDefault ? 'disabled' : ''}
        >
          <i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
        </button>
      </div>

      <div class="station-card__body">
        <span class="station-card__name" title="${escapeHtml(station.name)}">${escapeHtml(station.name)}</span>
        <div class="station-card__meta">
          <span>${escapeHtml(station.country || 'Unknown')}</span>
          <span>${escapeHtml(station.language || '—')}</span>
          <span>${escapeHtml(station.genre || 'Various')}</span>
        </div>
      </div>

      <div class="station-card__footer">
        <button class="station-card__play-btn" data-play-id="${station.id}" aria-label="Play ${escapeHtml(station.name)}">
          ${isPlaying
            ? `<div class="equalizer" aria-label="Now playing">
                 <div class="equalizer__bar"></div>
                 <div class="equalizer__bar"></div>
                 <div class="equalizer__bar"></div>
                 <div class="equalizer__bar"></div>
               </div> Live`
            : '<i class="fas fa-play"></i> Play'
          }
        </button>
        ${station.bitrate
          ? `<span class="station-card__codec">${station.bitrate}k ${station.codec || ''}</span>`
          : ''}
      </div>
    `;

    // Whole card click → play (but not on fav button)
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-fav-id]')) return;
      App.playStation(station);
    });

    // Fav button — show language dialog when adding, remove silently when already faved
    const favBtn = card.querySelector('[data-fav-id]');
    favBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (Favorites.has(station.id)) {
        // Remove without dialog
        Favorites.toggle(station.id);
      } else {
        // Ask user which category this station belongs to
        const lang = await FavDialog.show(station.name);
        if (lang === null) return; // user cancelled — do nothing
        Favorites.toggle(station.id, station, lang);
      }
      updateCardFavState(station.id);
      App.updateFavBadge();
    });

    return card;
  }

  /**
   * Build the logo portion of the card.
   * Falls back to an icon if no logo URL provided.
   */
  function buildLogo(station) {
    if (station.logo && station.logo.trim() !== '') {
      return `
        <div class="station-card__logo">
          <img
            src="${escapeHtml(station.logo)}"
            alt="${escapeHtml(station.name)} logo"
            loading="lazy"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
          />
          <span class="station-card__logo-fallback" style="display:none">
            <i class="fas fa-broadcast-tower"></i>
          </span>
        </div>`;
    }
    return `
      <div class="station-card__logo">
        <span class="station-card__logo-fallback">
          <i class="fas fa-broadcast-tower"></i>
        </span>
      </div>`;
  }

  /**
   * Toggle the favourite icon on a specific card without a full re-render.
   */
  function updateCardFavState(stationId) {
    const card = document.querySelector(`.station-card[data-id="${stationId}"]`);
    if (!card) return;

    const btn       = card.querySelector('[data-fav-id]');
    const icon      = btn.querySelector('i');
    const isFav     = Favorites.has(stationId);
    const isDefault = Favorites.isDefault(stationId);

    btn.className = `station-card__fav${isFav ? ' is-fav' : ''}${isDefault ? ' is-default' : ''}`;
    btn.disabled  = isDefault;
    btn.setAttribute('aria-label', isDefault ? 'Default favourite' : isFav ? 'Remove from favourites' : 'Add to favourites');
    icon.className = `${isFav ? 'fas' : 'far'} fa-heart`;
  }

  /**
   * Update the "is-playing" visual state across all cards.
   * Called by the player when a new station starts.
   */
  function updatePlayState(stationId) {
    document.querySelectorAll('.station-card').forEach(card => {
      const id = card.dataset.id;
      const isNow = id === stationId;
      card.classList.toggle('is-playing', isNow);

      const btn = card.querySelector('.station-card__play-btn');
      if (!btn) return;
      btn.innerHTML = isNow
        ? `<div class="equalizer" aria-label="Now playing">
             <div class="equalizer__bar"></div>
             <div class="equalizer__bar"></div>
             <div class="equalizer__bar"></div>
             <div class="equalizer__bar"></div>
           </div> Live`
        : '<i class="fas fa-play"></i> Play';
    });
  }

  /** Show skeleton loading state */
  function showLoading() {
    grid().innerHTML = '';
    emptyState().hidden = true;
    loadingState().hidden = false;
  }

  /** Hide skeleton loading state */
  function hideLoading() {
    loadingState().hidden = true;
  }

  /** Simple HTML escape to prevent XSS from external data */
  function escapeHtml(str) {
    if (typeof str !== 'string') return str ?? '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return {
    render,
    updatePlayState,
    updateCardFavState,
    showLoading,
    hideLoading,
  };
})();
