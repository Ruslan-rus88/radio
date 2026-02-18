/**
 * app.js
 * Main application orchestrator.
 *
 * Default state: Favourites is always shown when the search bar is empty.
 * Search state : API results shown while the user has an active query.
 *
 * Clearing (or never typing in) the search bar always returns to favourites.
 * Lang tabs filter favourites by their saved favLanguage, or refine API
 * results by language while a search is active.
 */

const App = (() => {
  /* ---- State ---- */
  let savedApiPool     = [];    // API stations persisted in localStorage
  let displayedStations = [];
  let activeLanguage   = 'all';
  let searchQuery      = '';
  let showingFavourites = false;
  let searchDebounce   = null;

  /* ---- DOM refs ---- */
  const searchInput    = () => document.getElementById('searchInput');
  const clearSearchBtn = () => document.getElementById('clearSearch');
  const favToggle      = () => document.getElementById('favToggle');
  const darkToggle     = () => document.getElementById('darkToggle');
  const apiFetchStatus = () => document.getElementById('apiFetchStatus');
  const emptyTitle     = () => document.getElementById('emptyTitle');
  const emptySubtitle  = () => document.getElementById('emptySubtitle');
  const sectionHeader  = () => document.querySelector('.section-header');

  /* ============================================================
     Boot
     ============================================================ */
  async function boot() {
    Player.init();
    restoreDarkMode();

    bindLangTabs();
    bindSearch();
    bindFavToggle();
    bindDarkToggle();

    // Re-hydrate API stations from localStorage
    savedApiPool = Favorites.getSavedStations();

    // Init Radio Browser API server list in background
    RadioAPI.init().catch(() => {});

    // Favourites is the default view — shown whenever search is empty
    enterFavouritesMode();
  }

  function setEmptyMessage(title, sub) {
    const t = emptyTitle();
    const s = emptySubtitle();
    if (t) t.textContent = title;
    if (s) s.textContent = sub;
  }

  /* ============================================================
     API search
     ============================================================ */
  async function runApiSearch(query) {
    sectionHeader().hidden = false;
    StationsUI.showLoading();
    showApiStatus(true);

    try {
      const langHint = activeLanguage !== 'all' ? activeLanguage : '';
      const results  = await RadioAPI.search({ query, language: langHint, limit: 60 });
      displayedStations = results;
    } catch (err) {
      console.warn('[App] API search failed:', err.message);
      displayedStations = [];
      setEmptyMessage('Search failed', 'Check your connection and try again');
    } finally {
      showApiStatus(false);
      StationsUI.hideLoading();
    }

    Player.setPlaylist(displayedStations);
    StationsUI.render(displayedStations, `Results for "${query}"`);

    if (!displayedStations.length) {
      setEmptyMessage(`No results for "${query}"`, 'Try a different name, genre, or country');
    }
  }

  /* ============================================================
     Favourites view
     Filters savedApiPool by favLanguage when a lang tab is active.
     ============================================================ */
  function showFavourites() {
    sectionHeader().hidden = false;

    // Refresh pool from localStorage in case it changed
    savedApiPool = Favorites.getSavedStations();

    const favIds = new Set(Favorites.getAll());
    let pool = savedApiPool.filter(s => favIds.has(s.id));

    // Filter by the assigned category when a specific language tab is active
    if (activeLanguage !== 'all') {
      pool = pool.filter(s => (s.favLanguage || 'other') === activeLanguage);
    }

    displayedStations = pool;
    Player.setPlaylist(displayedStations);
    StationsUI.render(displayedStations, 'My Favourites');

    if (!pool.length) {
      if (activeLanguage !== 'all') {
        setEmptyMessage(
          `No ${activeLanguage} favourites`,
          `Save a station under "${activeLanguage}" to see it here`
        );
      } else {
        setEmptyMessage(
          'No favourites yet',
          'Heart any station while searching to save it here'
        );
      }
    }
  }

  /* ============================================================
     Lang tabs — dual purpose: filter search results OR filter favourites
     ============================================================ */
  function bindLangTabs() {
    document.querySelectorAll('.lang-tabs__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Update active state
        document.querySelectorAll('.lang-tabs__btn').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');

        activeLanguage = btn.dataset.lang;

        if (showingFavourites) {
          // In fav mode: language tab filters by assigned favLanguage category
          showFavourites();
        } else {
          // In search mode: language tab refines API search
          if (searchQuery.trim()) {
            runApiSearch(searchQuery.trim());
          } else {
            // No active search — go back to favourites for this language
            enterFavouritesMode();
          }
        }
      });
    });
  }

  /* ============================================================
     Search
     ============================================================ */
  function bindSearch() {
    searchInput().addEventListener('input', e => {
      searchQuery = e.target.value;
      clearSearchBtn().hidden = !searchQuery;

      clearTimeout(searchDebounce);

      if (!searchQuery.trim()) {
        // Search cleared — return to favourites
        enterFavouritesMode();
        return;
      }

      // Exit favourites mode when user starts typing
      if (showingFavourites) leaveFavouritesMode();

      searchDebounce = setTimeout(() => runApiSearch(searchQuery.trim()), 320);
    });

    clearSearchBtn().addEventListener('click', () => {
      searchInput().value = '';
      searchQuery = '';
      clearSearchBtn().hidden = true;
      enterFavouritesMode();
      searchInput().focus();
    });
  }

  /* ============================================================
     Header heart button — clears search and shows favourites
     ============================================================ */
  function bindFavToggle() {
    favToggle().addEventListener('click', () => {
      searchInput().value = '';
      searchQuery = '';
      clearSearchBtn().hidden = true;
      enterFavouritesMode();
    });
  }

  function enterFavouritesMode() {
    showingFavourites = true;
    favToggle().classList.add('active');

    // Reset lang tab to "All" so the user sees all favourites first
    document.querySelectorAll('.lang-tabs__btn').forEach(b => {
      const isAll = b.dataset.lang === 'all';
      b.classList.toggle('active', isAll);
      b.setAttribute('aria-selected', isAll ? 'true' : 'false');
    });
    activeLanguage = 'all';

    showFavourites();
  }

  function leaveFavouritesMode() {
    showingFavourites = false;
    favToggle().classList.remove('active');
    // Restore "All" as active tab
    document.querySelectorAll('.lang-tabs__btn').forEach(b => {
      const isAll = b.dataset.lang === 'all';
      b.classList.toggle('active', isAll);
      b.setAttribute('aria-selected', isAll ? 'true' : 'false');
    });
    activeLanguage = 'all';
  }

  /* ============================================================
     Dark mode
     ============================================================ */
  function bindDarkToggle() {
    darkToggle().addEventListener('click', () => {
      const html   = document.documentElement;
      const isDark = html.getAttribute('data-theme') === 'dark';
      const next   = isDark ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      localStorage.setItem('radiowave_theme', next);
      darkToggle().innerHTML = isDark
        ? '<i class="fas fa-moon"></i>'
        : '<i class="fas fa-sun"></i>';
    });
  }

  function restoreDarkMode() {
    const saved = localStorage.getItem('radiowave_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    darkToggle().innerHTML = saved === 'dark'
      ? '<i class="fas fa-sun"></i>'
      : '<i class="fas fa-moon"></i>';
  }

  function showApiStatus(visible) {
    apiFetchStatus().hidden = !visible;
  }

  /* ============================================================
     Public helpers called by other modules
     ============================================================ */
  function playStation(station) {
    Player.play(station);
  }

  function updateFavBadge() {
    const count  = Favorites.count();
    const badge  = document.getElementById('favCount');
    badge.textContent = count;
    badge.hidden = count === 0;

    Player.updateFavIcon();

    // Refresh favourites view live if currently open
    if (showingFavourites) showFavourites();
  }

  /* ---- Init ---- */
  document.addEventListener('DOMContentLoaded', () => {
    boot();
    updateFavBadge();
  });

  return { playStation, updateFavBadge };
})();
