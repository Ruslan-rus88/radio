/**
 * api.js
 * Radio Browser API integration (https://api.radio-browser.info)
 * Completely free — no API key required.
 */

const RadioAPI = (() => {
  /* Radio Browser provides multiple community servers. We pick one at init. */
  const SERVERS = [
    'https://de1.api.radio-browser.info',
    'https://nl1.api.radio-browser.info',
    'https://at1.api.radio-browser.info',
  ];

  let baseUrl = SERVERS[0];

  /**
   * Try each server in order; use the first one that responds.
   */
  async function init() {
    for (const server of SERVERS) {
      try {
        const resp = await fetch(`${server}/json/stats`, { signal: AbortSignal.timeout(4000) });
        if (resp.ok) {
          baseUrl = server;
          return;
        }
      } catch {
        // try next
      }
    }
    console.warn('[RadioAPI] All servers unreachable; falling back to default.');
  }

  /**
   * Generic GET request to the API.
   * @param {string} path  - e.g. '/json/stations/search'
   * @param {Object} params - query params
   * @returns {Promise<Array>}
   */
  async function get(path, params = {}) {
    const url = new URL(`${baseUrl}${path}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });

    const resp = await fetch(url.toString(), {
      headers: { 'User-Agent': 'RadioRoman/1.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }

  /**
   * Normalize a Radio-Browser station object to our internal format.
   * @param {Object} s - raw API station
   * @returns {Object}
   */
  function normalize(s) {
    return {
      id: `api-${s.stationuuid}`,
      name: s.name || 'Unknown',
      logo: s.favicon || '',
      country: s.country || '',
      countryCode: s.countrycode || '',
      language: s.language || '',
      genre: mapGenre(s.tags || ''),
      tags: (s.tags || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 5),
      url: s.url_resolved || s.url || '',
      homepage: s.homepage || '',
      bitrate: s.bitrate || 0,
      codec: s.codec || '',
      votes: s.votes || 0,
      clickCount: s.clickcount || 0,
    };
  }

  /**
   * Map raw tag string to one of our predefined genres.
   */
  function mapGenre(tags) {
    const t = tags.toLowerCase();
    if (t.includes('jazz') || t.includes('blues')) return 'Jazz';
    if (t.includes('class')) return 'Classical';
    if (t.includes('rock') || t.includes('metal') || t.includes('punk')) return 'Rock';
    if (t.includes('electronic') || t.includes('edm') || t.includes('dance') || t.includes('techno')) return 'Electronic';
    if (t.includes('news') || t.includes('talk') || t.includes('speech')) return 'News';
    if (t.includes('pop') || t.includes('hit')) return 'Pop';
    if (t.includes('local') || t.includes('regional')) return 'Local';
    return 'Various';
  }

  /**
   * Search for stations by free text, with optional language/country filters.
   *
   * Strategy: when a query is present we search BOTH by station name AND by
   * tag (genre keyword) in parallel, then merge the results.  This means that
   * typing "jazz" returns stations whose name contains "jazz" PLUS all stations
   * tagged "jazz", giving a much richer result set.
   *
   * @param {Object} opts
   * @param {string} [opts.query]     - free-text search (name / tag)
   * @param {string} [opts.language]  - language filter
   * @param {string} [opts.country]   - country filter
   * @param {string} [opts.genre]     - genre / category filter
   * @param {number} [opts.limit=40]  - max results
   * @returns {Promise<Array>}
   */
  async function search({ query = '', language = '', country = '', genre = '', limit = 40 } = {}) {
    const common = {
      language,
      country,
      limit,
      order: 'clickcount',
      reverse: 'true',
      hidebroken: 'true',
    };

    // If a genre chip is active (but not "all"), add it as a tag filter
    const tagFromGenre = (genre && genre !== 'all') ? genre.toLowerCase() : '';

    let raw;

    if (query.trim()) {
      // Run both a name-search and a tag-search in parallel, then merge
      const [nameRes, tagRes] = await Promise.allSettled([
        get('/json/stations/search', { ...common, name: query.trim(), tag: tagFromGenre }),
        get('/json/stations/search', { ...common, tag: query.trim() }),
      ]);

      const byName = nameRes.status === 'fulfilled' ? nameRes.value : [];
      const byTag  = tagRes.status  === 'fulfilled' ? tagRes.value  : [];

      // Merge with deduplication by stationuuid
      const seen = new Set(byName.map(s => s.stationuuid));
      raw = [...byName, ...byTag.filter(s => !seen.has(s.stationuuid))];
    } else {
      // No text query — browse by language / genre only
      raw = await get('/json/stations/search', {
        ...common,
        tag: tagFromGenre,
      });
    }

    return raw.map(normalize).filter(s => s.url);
  }

  /**
   * Get trending/popular stations by language.
   * @param {string} language  - e.g. 'russian', 'english', 'german'
   * @param {number} [limit=30]
   * @returns {Promise<Array>}
   */
  async function trending(language = '', limit = 30) {
    const params = {
      language: language,
      limit: limit,
      order: 'clickcount',
      reverse: 'true',
      hidebroken: 'true',
    };
    const raw = await get('/json/stations/search', params);
    return raw.map(normalize).filter(s => s.url);
  }

  /**
   * Get top-voted stations — good for "Trending" category display.
   * @param {number} [limit=30]
   * @returns {Promise<Array>}
   */
  async function topVoted(limit = 30) {
    const raw = await get('/json/stations', {
      order: 'votes',
      reverse: 'true',
      limit: limit,
      hidebroken: 'true',
    });
    return raw.map(normalize).filter(s => s.url);
  }

  return { init, search, trending, topVoted };
})();
