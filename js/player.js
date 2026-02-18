/**
 * player.js
 * Controls the sticky audio player at the bottom of the page.
 */

const Player = (() => {
  /* ---- DOM refs ---- */
  const audioEl = () => document.getElementById('audioElement');
  const playerEl = () => document.getElementById('player');
  const playBtn = () => document.getElementById('playBtn');
  const prevBtn = () => document.getElementById('prevBtn');
  const nextBtn = () => document.getElementById('nextBtn');
  const muteBtn = () => document.getElementById('muteBtn');
  const volumeSlider = () => document.getElementById('volumeSlider');
  const volumeValue = () => document.getElementById('volumeValue');
  const playerName = () => document.getElementById('playerName');
  const playerGenre = () => document.getElementById('playerGenre');
  const playerLogo = () => document.getElementById('playerLogo');
  const playerStatus = () => document.getElementById('playerStatus');
  const playerStatusText = () => document.getElementById('playerStatusText');
  const playerFavBtn = () => document.getElementById('playerFavBtn');

  /* ---- State ---- */
  let _currentStation = null;
  let _playlist = [];           // array of station objects that are currently visible
  let _isPlaying = false;
  let _volume = 80;
  let _muted = false;
  let _retryCount = 0;
  const MAX_RETRIES = 2;

  /* ---- Wake Lock ---- */
  let _wakeLock = null;

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      _wakeLock = await navigator.wakeLock.request('screen');
      // Re-acquire if the page becomes visible again (e.g. tab switch back)
      _wakeLock.addEventListener('release', () => { _wakeLock = null; });
    } catch { /* permission denied or not supported — silently ignore */ }
  }

  function releaseWakeLock() {
    if (_wakeLock) {
      _wakeLock.release().catch(() => {});
      _wakeLock = null;
    }
  }

  // Re-acquire wake lock when the page becomes visible while playing
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && _isPlaying && !_wakeLock) {
      requestWakeLock();
    }
  });

  /* ---- Media Session (lock-screen controls + background audio) ---- */
  function updateMediaSession(station) {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title:  station.name  || 'Radio Roman',
      artist: station.genre || '',
      album:  station.country || '',
      artwork: station.logo
        ? [{ src: station.logo, sizes: '512x512', type: 'image/jpeg' }]
        : [],
    });

    navigator.mediaSession.setActionHandler('play',          () => { if (!_isPlaying) togglePlay(); });
    navigator.mediaSession.setActionHandler('pause',         () => { if  (_isPlaying) togglePlay(); });
    navigator.mediaSession.setActionHandler('stop',          () => { if  (_isPlaying) togglePlay(); });
    navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
    navigator.mediaSession.setActionHandler('nexttrack',     () => playNext());
    // Car head units often send seek signals — map them to prev/next station
    navigator.mediaSession.setActionHandler('seekbackward',  () => playPrev());
    navigator.mediaSession.setActionHandler('seekforward',   () => playNext());
  }

  function setMediaSessionState(playing) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }

  /* ---- Public: current station ID ---- */
  function currentStationId() {
    return _currentStation ? _currentStation.id : null;
  }

  /* ---- Public: update the playlist for prev/next navigation ---- */
  function setPlaylist(stations) {
    _playlist = stations || [];
    updateNavButtons();
  }

  /* ---- Public: load and play a station ---- */
  function play(station) {
    if (!station || !station.url) return;

    const audio = audioEl();
    _currentStation = station;
    _isPlaying = false;
    _retryCount = 0;

    // Update UI
    playerEl().hidden = false;
    setStatus('loading');
    updateInfo(station);
    updateFavIcon();

    // Set audio source
    audio.src = station.url;
    audio.volume = _volume / 100;
    audio.muted = _muted;

    // Register lock-screen controls before playback starts
    updateMediaSession(station);

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setStatus('live');
          _isPlaying = true;
          setPlayIcon(true);
          requestWakeLock();
          setMediaSessionState(true);
        })
        .catch(err => {
          console.warn('[Player] Playback error:', err.message);
          if (_retryCount < MAX_RETRIES) {
            _retryCount++;
            setTimeout(() => audio.play().catch(() => setStatus('error')), 1500);
          } else {
            setStatus('error');
          }
        });
    }

    setPlayIcon(true);
    updateNavButtons();

    // Update card visuals
    StationsUI.updatePlayState(station.id);
  }

  /* ---- Toggle play/pause ---- */
  function togglePlay() {
    const audio = audioEl();
    if (!_currentStation) return;

    if (_isPlaying) {
      audio.pause();
      _isPlaying = false;
      setPlayIcon(false);
      setStatus('idle');
      releaseWakeLock();
      setMediaSessionState(false);
    } else {
      // Resume or reload stream
      if (audio.src) {
        setStatus('loading');
        audio.play()
          .then(() => {
            _isPlaying = true;
            setPlayIcon(true);
            setStatus('live');
            requestWakeLock();
            setMediaSessionState(true);
          })
          .catch(() => setStatus('error'));
      }
    }
  }

  /* ---- Skip to previous station in playlist ---- */
  function playPrev() {
    if (!_currentStation || !_playlist.length) return;
    const idx = _playlist.findIndex(s => s.id === _currentStation.id);
    if (idx > 0) play(_playlist[idx - 1]);
  }

  /* ---- Skip to next station in playlist ---- */
  function playNext() {
    if (!_currentStation || !_playlist.length) return;
    const idx = _playlist.findIndex(s => s.id === _currentStation.id);
    if (idx < _playlist.length - 1) play(_playlist[idx + 1]);
  }

  /* ---- Volume ---- */
  function setVolume(val) {
    _volume = Math.max(0, Math.min(100, val));
    audioEl().volume = _volume / 100;
    volumeSlider().value = _volume;
    volumeValue().textContent = `${_volume}%`;
    updateMuteIcon();
  }

  function toggleMute() {
    _muted = !_muted;
    audioEl().muted = _muted;
    updateMuteIcon();
  }

  /* ---- Helpers ---- */
  function setStatus(status) {
    const el = playerStatus();
    const classes = ['player__status--idle', 'player__status--loading', 'player__status--live', 'player__status--error'];
    el.classList.remove(...classes);
    el.classList.add(`player__status--${status}`);

    const labels = {
      idle:    'Idle',
      loading: 'Connecting…',
      live:    'Live',
      error:   'Error',
    };
    playerStatusText().textContent = labels[status] || status;
  }

  function updateInfo(station) {
    playerName().textContent = station.name || 'Unknown';
    playerGenre().textContent = [station.genre, station.country].filter(Boolean).join(' · ');

    const logoEl = playerLogo();
    if (station.logo && station.logo.trim() !== '') {
      logoEl.innerHTML = `
        <img
          src="${station.logo}"
          alt="${station.name} logo"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
        />
        <i class="fas fa-broadcast-tower" style="display:none"></i>`;
    } else {
      logoEl.innerHTML = '<i class="fas fa-broadcast-tower"></i>';
    }
  }

  function setPlayIcon(playing) {
    const btn = playBtn();
    btn.innerHTML = playing
      ? '<i class="fas fa-pause"></i>'
      : '<i class="fas fa-play"></i>';
    btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  function updateMuteIcon() {
    const btn = muteBtn();
    if (_muted || _volume === 0) {
      btn.innerHTML = '<i class="fas fa-volume-xmark"></i>';
    } else if (_volume < 50) {
      btn.innerHTML = '<i class="fas fa-volume-low"></i>';
    } else {
      btn.innerHTML = '<i class="fas fa-volume-high"></i>';
    }
  }

  function updateNavButtons() {
    if (!_playlist.length || !_currentStation) {
      prevBtn().disabled = true;
      nextBtn().disabled = true;
      return;
    }
    const idx = _playlist.findIndex(s => s.id === _currentStation.id);
    prevBtn().disabled = idx <= 0;
    nextBtn().disabled = idx >= _playlist.length - 1;
  }

  function updateFavIcon() {
    if (!_currentStation) return;
    const btn       = playerFavBtn();
    const isFav     = Favorites.has(_currentStation.id);
    const isDefault = Favorites.isDefault(_currentStation.id);
    btn.className   = `player__btn player__btn--small${isFav ? ' is-fav' : ''}${isDefault ? ' is-default' : ''}`;
    btn.disabled    = isDefault;
    btn.innerHTML   = `<i class="${isFav ? 'fas' : 'far'} fa-heart"></i>`;
    btn.setAttribute('aria-label', isDefault ? 'Default favourite' : isFav ? 'Remove from favourites' : 'Add to favourites');
    btn.title       = isDefault ? 'Default favourite — always kept' : '';
  }

  /* ---- Init: wire up DOM events once ---- */
  function init() {
    const audio = audioEl();

    // Audio events
    audio.addEventListener('waiting', () => setStatus('loading'));
    audio.addEventListener('playing', () => {
      _isPlaying = true;
      setPlayIcon(true);
      setStatus('live');
      requestWakeLock();
      setMediaSessionState(true);
    });
    audio.addEventListener('pause', () => {
      _isPlaying = false;
      setPlayIcon(false);
      releaseWakeLock();
      setMediaSessionState(false);
    });
    audio.addEventListener('error', () => {
      setStatus('error');
      _isPlaying = false;
      setPlayIcon(false);
      releaseWakeLock();
      setMediaSessionState(false);
    });
    audio.addEventListener('stalled', () => setStatus('loading'));

    // Control buttons
    playBtn().addEventListener('click', togglePlay);
    prevBtn().addEventListener('click', playPrev);
    nextBtn().addEventListener('click', playNext);
    muteBtn().addEventListener('click', toggleMute);

    volumeSlider().addEventListener('input', (e) => {
      setVolume(parseInt(e.target.value, 10));
      if (_muted && _volume > 0) {
        _muted = false;
        audio.muted = false;
      }
    });

    // Favourite button inside player — show language dialog when adding
    playerFavBtn().addEventListener('click', async () => {
      if (!_currentStation) return;
      if (Favorites.has(_currentStation.id)) {
        // Remove without dialog
        Favorites.toggle(_currentStation.id);
      } else {
        // Ask user which category
        const lang = await FavDialog.show(_currentStation.name);
        if (lang === null) return; // cancelled
        Favorites.toggle(_currentStation.id, _currentStation, lang);
      }
      updateFavIcon();
      StationsUI.updateCardFavState(_currentStation.id);
      App.updateFavBadge();
    });

    // Keyboard shortcuts (space = play/pause, m = mute)
    document.addEventListener('keydown', (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'KeyM') {
        toggleMute();
      } else if (e.code === 'ArrowLeft' && e.altKey) {
        playPrev();
      } else if (e.code === 'ArrowRight' && e.altKey) {
        playNext();
      }
    });

    // Initialize volume display
    setVolume(_volume);
  }

  return {
    init,
    play,
    togglePlay,
    currentStationId,
    setPlaylist,
    updateFavIcon,
  };
})();
