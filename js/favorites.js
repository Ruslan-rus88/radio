/**
 * favorites.js
 * Manages favourite stations stored in localStorage.
 *
 * Two separate keys:
 *   - radiowave_favourites      → string[]  (station IDs)
 *   - radiowave_extra_stations  → { [id]: stationObject }  (full objects + favLanguage)
 *
 * Every station in extraMap has a `favLanguage` property:
 *   'Russian' | 'English' | 'German' | 'other'
 *
 * Existing entries without a `favLanguage` are treated as 'other' at read time.
 */

const Favorites = (() => {
  const IDS_KEY   = 'radiowave_favourites';
  const EXTRA_KEY = 'radiowave_extra_stations';

  /* ---- persist helpers ---- */

  function loadIds() {
    try {
      const raw = localStorage.getItem(IDS_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  }

  function saveIds(set) {
    try { localStorage.setItem(IDS_KEY, JSON.stringify([...set])); } catch {}
  }

  /** @returns {Object.<string, Object>} id → full station object */
  function loadExtra() {
    try {
      const raw = localStorage.getItem(EXTRA_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function saveExtra(map) {
    try { localStorage.setItem(EXTRA_KEY, JSON.stringify(map)); } catch {}
  }

  /* ---- default stations seeded on first visit ---- */

  const DEFAULTS_KEY = 'radiowave_defaults_seeded';

  const DEFAULT_EXTRA = {
    "api-96683d44-c7f1-47d3-a9c5-f7d0c65d8b66": {
      "id": "api-96683d44-c7f1-47d3-a9c5-f7d0c65d8b66",
      "name": "Zaycev.FM Relax",
      "logo": "https://pcradio.ru/images/stations/61b09c6e8cebd.jpg",
      "country": "The Russian Federation", "countryCode": "RU",
      "language": "", "genre": "Various",
      "tags": ["chill", "lounge", "relax"],
      "url": "https://abs.zaycev.fm/relax128k",
      "homepage": "https://www.zaycev.fm/relax",
      "bitrate": 0, "codec": "MP3", "votes": 53, "clickCount": 5,
      "favLanguage": "Russian"
    },
    "api-c004dd47-2dab-47af-bdad-6c9226ea5b3b": {
      "id": "api-c004dd47-2dab-47af-bdad-6c9226ea5b3b",
      "name": "Zaycev.FM NewRock",
      "logo": "https://top-radio.ru/assets/image/radio/180/zaycev-new-rock.jpg",
      "country": "The Russian Federation", "countryCode": "RU",
      "language": "", "genre": "Rock",
      "tags": ["alternative rock", "rock"],
      "url": "https://abs.zaycev.fm/rock128k",
      "homepage": "https://www.zaycev.fm/rock",
      "bitrate": 0, "codec": "MP3", "votes": 22, "clickCount": 1,
      "favLanguage": "Russian"
    },
    "api-32fc6c88-c5cb-4e5c-aecf-833bfe89eaf1": {
      "id": "api-32fc6c88-c5cb-4e5c-aecf-833bfe89eaf1",
      "name": "Zaycev.FM Pop",
      "logo": "https://pcradio.ru/images/stations/61b09c69159cc.jpg",
      "country": "The Russian Federation", "countryCode": "RU",
      "language": "", "genre": "Pop",
      "tags": ["hits", "pop music"],
      "url": "https://abs.zaycev.fm/pop128k",
      "homepage": "https://www.zaycev.fm/pop",
      "bitrate": 0, "codec": "MP3", "votes": 33, "clickCount": 0,
      "favLanguage": "Russian"
    },
    "api-9606f727-0601-11e8-ae97-52543be04c81": {
      "id": "api-9606f727-0601-11e8-ae97-52543be04c81",
      "name": "1LIVE",
      "logo": "https://www1.wdr.de/radio/1live/resources/img/favicon/apple-touch-icon.png",
      "country": "Germany", "countryCode": "DE",
      "language": "german", "genre": "Rock",
      "tags": ["ard", "public radio", "rock", "top 40", "wdr"],
      "url": "http://wdr-1live-live.icecast.wdr.de/wdr/1live/live/mp3/128/stream.mp3",
      "homepage": "https://einslive.de/",
      "bitrate": 128, "codec": "MP3", "votes": 29899, "clickCount": 252,
      "favLanguage": "German"
    }
  };

  const DEFAULT_IDS = Object.keys(DEFAULT_EXTRA);

  /**
   * Seed default favourites the very first time the app loads.
   * Skipped on every subsequent visit (tracked by DEFAULTS_KEY flag).
   */
  function seedDefaults() {
    if (localStorage.getItem(DEFAULTS_KEY)) return;
    try {
      // Merge defaults into whatever is already stored (may be empty)
      const existingExtra = loadExtra();
      const existingIds   = loadIds();
      DEFAULT_IDS.forEach(id => {
        existingExtra[id] = DEFAULT_EXTRA[id];
        existingIds.add(id);
      });
      saveExtra(existingExtra);
      saveIds(existingIds);
      localStorage.setItem(DEFAULTS_KEY, '1');
    } catch {}
  }

  seedDefaults();

  /* ---- state ---- */

  let favIds  = loadIds();
  let extraMap = loadExtra();

  /* ---- public API ---- */

  /**
   * Check if a station ID is a favourite.
   * @param {string} id
   */
  function has(id) {
    return favIds.has(id);
  }

  /**
   * Add or remove a station from favourites.
   *
   * When adding, `stationObj` and `favLanguage` must be provided so the station
   * can be re-hydrated and filtered on the Favourites view after a page reload.
   *
   * @param {string}      id
   * @param {Object|null} [stationObj]   - full station object
   * @param {string}      [favLanguage]  - 'Russian' | 'English' | 'German' | 'other'
   */
  function toggle(id, stationObj, favLanguage) {
    if (favIds.has(id)) {
      // Default stations are permanent — cannot be removed
      if (DEFAULT_IDS.includes(id)) return;
      favIds.delete(id);
      if (extraMap[id]) {
        delete extraMap[id];
        saveExtra(extraMap);
      }
    } else {
      // Add
      favIds.add(id);
      if (stationObj) {
        extraMap[id] = {
          ...stationObj,
          favLanguage: favLanguage || 'other',
        };
        saveExtra(extraMap);
      }
    }
    saveIds(favIds);
  }

  /**
   * All favourite IDs.
   * @returns {string[]}
   */
  function getAll() {
    return [...favIds];
  }

  /**
   * Total count of favourites.
   * @returns {number}
   */
  function count() {
    return favIds.size;
  }

  /**
   * Return saved full station objects for favourites that are persisted in
   * extraMap (all API-sourced stations).  Used to re-hydrate the pool on boot.
   * @returns {Object[]}
   */
  function getSavedStations() {
    return Object.values(extraMap)
      .filter(s => favIds.has(s.id))
      .map(s => ({ favLanguage: 'other', ...s })); // default favLanguage for legacy entries
  }

  /**
   * Prune extra-station entries that are no longer in the favourites set.
   */
  function prune() {
    let dirty = false;
    for (const id of Object.keys(extraMap)) {
      if (!favIds.has(id)) {
        delete extraMap[id];
        dirty = true;
      }
    }
    if (dirty) saveExtra(extraMap);
  }

  prune();

  /** Returns true if the station is a permanent default. */
  function isDefault(id) {
    return DEFAULT_IDS.includes(id);
  }

  return { has, toggle, getAll, count, getSavedStations, isDefault };
})();
