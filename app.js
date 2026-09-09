const supabaseConfig = window.ANIPASTA_SUPABASE_CONFIG || {};

if (!supabaseConfig.url || !supabaseConfig.key) {
  throw new Error('Configure Supabase URL and key in supabase-config.js');
}

const db = supabase.createClient(supabaseConfig.url, supabaseConfig.key);
const HISTORY_KEY = 'anipasta_watch_history';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

const state = {
  anime: [],
  current: null,
  episodes: [],
  selected: null,
  view: 'home',
  loading: false,
  currentSeason: null,
  episodePage: 0
};

let historyProvider = createLocalHistoryProvider();
let loaderTimer = null;
let loaderStartedAt = 0;
let refreshTimer = null;
let refreshInFlight = null;
let lastSuccessfulLoadAt = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTransientError(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return /network|fetch|timeout|timed out|gateway|temporar|connection|failed to load|503|502|504/.test(text);
}

async function withRetry(task, { attempts = 3, delay = 700, label = 'request' } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await task(attempt);
      if (result?.error) throw result.error;
      return result;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isTransientError(error)) throw error;
      await sleep(delay * attempt);
      console.warn(`AniPasta ${label} retry ${attempt}/${attempts - 1}`, error);
    }
  }
  throw lastError || new Error(`${label} failed`);
}

async function fetchPaged(queryFactory, pageSize = 500) {
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const result = await withRetry(() => queryFactory().range(from, to), { label: `page ${from}-${to}` });
    const rows = result.data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

function createLocalHistoryProvider() {
  const read = () => {
    try {
      const data = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(data) ? data.filter(item => item && item.animeId) : [];
    } catch {
      return [];
    }
  };

  const write = items => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 100)));
    } catch (error) {
      console.error('Unable to write watch history', error);
    }
  };

  return {
    get() {
      const validIds = new Set(state.anime.map(anime => String(anime.id)));
      const items = read().filter(item => validIds.size === 0 || validIds.has(String(item.animeId)));
      write(items);
      return items;
    },
    save(item) {
      write([{ ...item, timestamp: Date.now() }, ...read().filter(saved => String(saved.animeId) !== String(item.animeId))]);
    },
    clear() {
      try { localStorage.removeItem(HISTORY_KEY); } catch {}
    },
    remove(animeId) {
      write(read().filter(item => String(item.animeId) !== String(animeId)));
    }
  };
}

function setHistoryProvider(provider) {
  historyProvider = provider || createLocalHistoryProvider();
  renderHistory();
}

function getWatchHistory() {
  return historyProvider.get();
}

function historyItems() {
  return getWatchHistory()
    .map(item => {
      const anime = state.anime.find(entry => String(entry.id) === String(item.animeId));
      return anime ? { ...item, anime } : null;
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
}

async function saveWatchHistory(item) {
  try {
    await historyProvider.save(item);
    renderHistory();
  } catch (error) {
    console.error('Unable to save watch history', error);
  }
}

async function clearWatchHistory() {
  try {
    await historyProvider.clear();
    renderHistory();
    if (state.view === 'history') goHome();
  } catch (error) {
    console.error('Unable to clear watch history', error);
  }
}

async function removeHistoryItem(animeId) {
  try {
    await historyProvider.remove(animeId);
    renderHistory();
    if (state.view === 'history' && !historyItems().length) goHome();
  } catch (error) {
    console.error('Unable to remove history item', error);
  }
}

function showLoader() {
  const loader = $('anipastaLoader');
  if (!loader) return;
  clearTimeout(loaderTimer);
  loaderStartedAt = Date.now();
  loader.classList.add('show');
  loaderTimer = setTimeout(hideLoader, 15000);
}

function hideLoader() {
  const loader = $('anipastaLoader');
  if (!loader) return;
  clearTimeout(loaderTimer);
  const delay = Math.max(0, 220 - (Date.now() - loaderStartedAt));
  setTimeout(() => loader.classList.remove('show'), delay);
}

function emitCardsRendered() {
  document.dispatchEvent(new CustomEvent('anipasta:cards-rendered'));
}

function historyCard(item) {
  const anime = item.anime;
  const isMovie = anime.content_type === 'movie';
  const meta = isMovie ? 'Movie' : `S${item.seasonNumber || 1} E${item.episodeNumber || ''}`;
  return `<article class="card historyCard" data-history-id="${esc(anime.id)}">
    <div class="poster">
      ${anime.poster_url ? `<img src="${esc(anime.poster_url)}" loading="lazy" alt="">` : ''}
      <div class="poster-overlay"></div>
      <span class="historyMeta">${esc(meta)}</span>
      <button class="historyDelete" type="button" data-delete-history-id="${esc(anime.id)}" aria-label="Remove ${esc(anime.title)} from watch history" title="Remove from history">&times;</button>
    </div>
    <div class="title" title="${esc(anime.title)}">${esc(anime.title)}</div>
  </article>`;
}

function renderHistory() {
  const section = $('historySection');
  const allGrid = $('allHistoryGrid');
  if (!section || !allGrid) return;

  const items = historyItems();
  if (!items.length) {
    section.classList.add('hidden');
    $('historyGrid').innerHTML = '';
    $('viewAllHistory').classList.add('hidden');
    allGrid.innerHTML = '';
    return;
  }

  section.classList.remove('hidden');
  $('historyGrid').innerHTML = items.slice(0, 6).map(historyCard).join('');
  $('viewAllHistory').classList.toggle('hidden', items.length <= 6);

  if (state.view === 'history') {
    $('historyPage').querySelector('h2').textContent = 'Watch History';
    $('clearHistoryPage').classList.remove('hidden');
    allGrid.innerHTML = items.map(historyCard).join('');
  }
  emitCardsRendered();
}

function closeSearch() {
  $('searchResults')?.classList.add('hidden');
}

function normalizeSearchQuery(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function getSearchResults(query) {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return [];
  return state.anime.filter(anime => normalizeSearchQuery(anime.title).includes(normalized));
}

function showSearch(query) {
  const box = $('searchResults');
  if (!box) return;
  const results = getSearchResults(query);
  if (!normalizeSearchQuery(query)) {
    closeSearch();
    return;
  }
  box.innerHTML = results.length
    ? results.slice(0, 4).map(anime => `<button class="result" type="button" data-id="${esc(anime.id)}">
        ${anime.poster_url ? `<img src="${esc(anime.poster_url)}" alt="">` : ''}
        <span class="resultInfo"><span class="resultTitle">${esc(anime.title)}</span></span>
      </button>`).join('')
    : '<div class="resultEmpty">No results found</div>';
  box.classList.remove('hidden');
}

function openSearchPage(query) {
  const normalized = String(query ?? '').trim();
  if (!normalizeSearchQuery(normalized)) return;
  const results = getSearchResults(normalized);
  state.view = 'search';
  closeSearch();
  document.getElementById('headerSearchPanel')?.classList.remove('show');
  document.body.classList.remove('header-search-open');
  $('search').value = normalized;
  $('homePage').classList.add('hidden');
  $('watchPage').classList.add('hidden');
  $('historyPage').classList.add('hidden');
  $('searchPage').classList.remove('hidden');
  $('searchPageTitle').textContent = `Search Results for "${normalized}"`;
  $('searchGrid').innerHTML = results.length ? results.map(anime => animeCard(anime, { typeOnly: true })).join('') : '<div class="empty">No anime found.</div>';
  history.pushState({ view: 'search', query: normalized }, '', `#search-${encodeURIComponent(normalized)}`);
  emitCardsRendered();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function animeCard(anime, options = {}) {
  const isMovie = anime.content_type === 'movie';
  const latest = anime.latestEpisode;
  const meta = options.typeOnly
    ? `<span class="releaseMeta">${isMovie ? 'Movie' : 'Series'}</span>`
    : isMovie
      ? '<span class="releaseMeta">Movie</span>'
      : latest
        ? `<span class="releaseMeta"><span>S${latest.season_number || 1}</span><span class="dot"></span><span>E${latest.episode_number}</span></span>`
        : '';
  return `<article class="card" data-id="${esc(anime.id)}">
    <div class="poster">
      ${anime.poster_url ? `<img src="${esc(anime.poster_url)}" loading="lazy" alt="">` : ''}
      <div class="poster-overlay"></div>
      ${options.typeOnly ? '' : '<span class="newBadge">NEW</span>'}
      ${meta}
    </div>
    <div class="title" title="${esc(anime.title)}">${esc(anime.title)}</div>
  </article>`;
}

function render(list, title = 'Latest Releases', showAll = false) {
  $('heading').textContent = title;
  $('grid').innerHTML = list.length ? (showAll ? list : list.slice(0, 12)).map(animeCard).join('') : '<div class="empty">No anime found.</div>';
  emitCardsRendered();
}

async function loadAnime(options = {}) {
  if (refreshInFlight && !options.force) return refreshInFlight;
  refreshInFlight = (async () => {
    const shouldShowLoader = options.showLoader !== false;
    if (shouldShowLoader) showLoader();
    state.loading = true;
    const hadData = state.anime.length > 0;

    try {
      const animeRows = await fetchPaged(
        () => db.from('anime').select('*').eq('is_published', true).order('created_at', { ascending: false }),
        500
      );
      const publishedIds = new Set(animeRows.map(row => String(row.id)));

      const latestByAnime = {};
      if (publishedIds.size) {
        for (let from = 0; ; from += 500) {
          const result = await withRetry(
            () => db.from('episodes')
              .select('anime_id,season_number,episode_number,created_at')
              .order('created_at', { ascending: false })
              .range(from, from + 499),
            { label: `episodes ${from}-${from + 499}` }
          );
          const rows = result.data || [];
          rows.forEach(episode => {
            const id = String(episode.anime_id);
            if (publishedIds.has(id) && latestByAnime[id] == null) latestByAnime[id] = episode;
          });

          const allPublishedWithEpisodes = animeRows
            .filter(anime => anime.content_type !== 'movie')
            .every(anime => latestByAnime[String(anime.id)] != null);
          if (rows.length < 500 || allPublishedWithEpisodes) break;
        }
      }

      state.anime = animeRows
        .map(anime => ({ ...anime, latestEpisode: latestByAnime[String(anime.id)] || null }))
        .sort((a, b) => new Date(b.latestEpisode?.created_at || b.created_at) - new Date(a.latestEpisode?.created_at || a.created_at));

      render(state.anime);
      renderHistory();
      lastSuccessfulLoadAt = Date.now();

      if (!hadData) openRouteFromHash();
      else if (location.hash.startsWith('#anime-') && !state.current) openRouteFromHash();

      return state.anime;
    } catch (error) {
      console.error('AniPasta data load failed:', error);
      if (!hadData) {
        $('grid').innerHTML = '<div class="empty">Unable to load anime. Retrying automatically...</div>';
      }
      throw error;
    } finally {
      state.loading = false;
      if (shouldShowLoader) hideLoader();
      refreshInFlight = null;
    }
  })();

  try {
    return await refreshInFlight;
  } catch (error) {
    if (options.retry !== false) {
      await sleep(500);
      return loadAnime({ ...options, retry: false, force: true });
    }
    throw error;
  }
}

function startDataSync() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && !state.loading) {
      loadAnime({ showLoader: false, retry: false, force: true }).catch(error => console.warn('Background sync failed', error));
    }
  }, 60000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastSuccessfulLoadAt > 30000) {
      loadAnime({ showLoader: false, retry: false, force: true }).catch(error => console.warn('Visibility refresh failed', error));
    }
  });
}

function stopPlayer() {
  const player = $('player');
  if (!player) return;
  const iframe = player.querySelector('iframe');
  if (iframe) {
    try { iframe.src = 'about:blank'; } catch {}
  }
  player.replaceChildren();
  player.className = 'placeholder';
  player.textContent = 'Select an episode to start watching';
}

function goHome() {
  stopPlayer();
  state.current = null;
  state.episodes = [];
  state.selected = null;
  state.currentSeason = null;
  state.episodePage = 0;
  state.view = 'home';
  closeSearch();
  $('watchPage').classList.add('hidden');
  $('historyPage').classList.add('hidden');
  $('searchPage').classList.add('hidden');
  $('homePage').classList.remove('hidden');
  $('search').value = '';
  $('videoControls').classList.remove('hidden');
  render(state.anime);
  renderHistory();
  history.replaceState({ view: 'home' }, '', location.pathname + location.search);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function loadIframe(url, title) {
  if (!url) {
    stopPlayer();
    $('player').textContent = 'Video URL not available';
    hideLoader();
    return;
  }
  showLoader();
  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.title = title;
  iframe.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'no-referrer-when-downgrade';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation');
  iframe.addEventListener('load', () => setTimeout(hideLoader, 250), { once: true });
  $('player').className = '';
  $('player').replaceChildren(iframe);
  setTimeout(hideLoader, 9000);
}

function currentSeasonEpisodes() {
  return state.episodes.filter(episode => Number(episode.season_number || 1) === Number(state.currentSeason));
}

function renderEpisodePage() {
  const list = currentSeasonEpisodes();
  const maxPage = Math.max(0, Math.ceil(Math.max(0, list.length - 25) / 25));
  state.episodePage = Math.max(0, Math.min(state.episodePage, maxPage));
  const visible = list.slice(state.episodePage * 25, state.episodePage * 25 + 25);
  $('episodes').className = 'episodes';
  $('episodes').innerHTML = visible.length
    ? visible.map(episode => `<button id="ep${esc(episode.id)}" class="ep ${String(state.selected?.id) === String(episode.id) ? 'active' : ''}" type="button" data-episode="${esc(episode.id)}"><span class="epNo">${String(episode.episode_number).padStart(2, '0')}</span></button>`).join('')
    : '<div class="empty episodeEmpty">No episodes yet.</div>';
  $('episodePrev').disabled = state.episodePage <= 0;
  $('episodeNext').disabled = state.episodePage >= maxPage;
}

function ensureEpisodeVisible(episode) {
  const season = Number(episode.season_number || 1);
  if (Number(state.currentSeason) !== season) {
    state.currentSeason = season;
    state.episodePage = 0;
  }
  document.querySelectorAll('.season').forEach(button => button.classList.toggle('active', Number(button.dataset.season) === season));
  const list = currentSeasonEpisodes();
  const index = list.findIndex(item => String(item.id) === String(episode.id));
  if (index >= 0 && (index < state.episodePage * 25 || index >= state.episodePage * 25 + 25)) {
    const maxPage = Math.max(0, Math.ceil(Math.max(0, list.length - 25) / 25));
    state.episodePage = Math.min(maxPage, Math.floor(index / 25));
  }
  renderEpisodePage();
}

async function play(id) {
  const episode = state.episodes.find(item => String(item.id) === String(id));
  if (!episode || !state.current) return;
  state.selected = episode;
  ensureEpisodeVisible(episode);
  $('now').textContent = `S${episode.season_number || 1} E${episode.episode_number}`;
  const url = String(episode.video_url || '').trim();
  if (url) loadIframe(url, `Episode ${episode.episode_number}`);
  else { stopPlayer(); $('player').textContent = 'Video URL not available'; }
  updateNav();
  await saveWatchHistory({ animeId: state.current.id, episodeId: episode.id, seasonNumber: Number(episode.season_number || 1), episodeNumber: Number(episode.episode_number || 0), contentType: 'episode' });
}

function showSeason(season, reset = true) {
  state.currentSeason = Number(season);
  if (reset) state.episodePage = 0;
  document.querySelectorAll('.season').forEach(button => button.classList.toggle('active', Number(button.dataset.season) === Number(season)));
  renderEpisodePage();
  const active = document.querySelector(`.season[data-season="${Number(season)}"]`);
  if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
}

function updateNav() {
  const index = state.episodes.findIndex(episode => String(episode.id) === String(state.selected?.id));
  $('prevBtn').disabled = index <= 0;
  $('nextBtn').disabled = index < 0 || index >= state.episodes.length - 1;
}

function changeEpisode(direction) {
  if (!state.selected) return;
  const index = state.episodes.findIndex(episode => String(episode.id) === String(state.selected.id));
  const next = state.episodes[index + direction];
  if (next) play(next.id);
}

function moveSeason(direction) {
  const buttons = [...document.querySelectorAll('.season')];
  if (!buttons.length) return;
  const index = Math.max(0, buttons.findIndex(button => Number(button.dataset.season) === Number(state.currentSeason)));
  const next = buttons[Math.max(0, Math.min(buttons.length - 1, index + direction))];
  if (next) showSeason(next.dataset.season);
}

function moveEpisodePage(direction) {
  const list = currentSeasonEpisodes();
  const maxPage = Math.max(0, Math.ceil(Math.max(0, list.length - 25) / 25));
  state.episodePage = Math.max(0, Math.min(maxPage, state.episodePage + direction));
  renderEpisodePage();
}

async function fetchEpisodesForAnime(animeId) {
  return fetchPaged(
    () => db.from('episodes').select('*').eq('anime_id', animeId).order('season_number').order('episode_number'),
    500
  );
}

async function loadRelated(currentId) {
  $('episodeNav').classList.remove('hidden');
  $('seasonNav').classList.add('hidden');
  const result = await withRetry(
    () => db.from('anime').select('id,title,poster_url,content_type,is_published,movie_duration,created_at').eq('is_published', true).eq('content_type', 'movie').neq('id', currentId).order('created_at', { ascending: false }).limit(6),
    { label: 'related movies' }
  );
  const list = result.data || [];
  $('episodes').className = 'relatedMovies';
  $('episodes').innerHTML = list.length
    ? list.map(movie => `<button type="button" class="relatedMovie" data-related-id="${esc(movie.id)}">${movie.poster_url ? `<img src="${esc(movie.poster_url)}" alt="">` : ''}<span class="relatedInfo"><span class="relatedTitle">${esc(movie.title)}</span><span class="relatedDuration">${esc(movie.movie_duration || 'Duration not set')}</span></span></button>`).join('')
    : '<div class="empty">No related movies yet.</div>';
}

async function openAnimeById(id, resumeEpisodeId = null, openLatest = false) {
  const anime = state.anime.find(item => String(item.id) === String(id));
  if (!anime) return;

  showLoader();
  state.current = anime;
  state.view = 'watch';
  closeSearch();
  document.getElementById('headerSearchPanel')?.classList.remove('show');
  document.body.classList.remove('header-search-open');
  $('search').value = '';
  $('homePage').classList.add('hidden');
  $('historyPage').classList.add('hidden');
  $('searchPage').classList.add('hidden');
  $('watchPage').classList.remove('hidden');
  $('animeTitle').textContent = anime.title;
  $('miniPoster').src = anime.poster_url || '';
  document.querySelector('[data-watch-favorite]')?.remove();
  stopPlayer();
  $('now').textContent = '';
  $('seasonNav').classList.remove('hidden');
  $('episodeNav').classList.remove('hidden');
  $('videoControls').classList.remove('hidden');
  history.pushState({ view: 'watch', id: String(anime.id) }, '', `#anime-${encodeURIComponent(anime.id)}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });

  try {
    if (anime.content_type === 'movie') {
      $('watchCounts').innerHTML = `<div class="countLine"><b>Movie</b><span>|</span><b>${esc(anime.movie_duration || 'Duration N/A')}</b></div>`;
      $('sideTitle').textContent = 'More Movies';
      $('seasonNav').classList.add('hidden');
      $('now').classList.add('hidden');
      $('prevBtn').classList.add('hidden');
      $('nextBtn').classList.add('hidden');
      $('videoControls').classList.add('hidden');
      await loadRelated(anime.id);
      loadIframe(String(anime.movie_url || '').trim(), anime.title);
      await saveWatchHistory({ animeId: anime.id, episodeId: null, seasonNumber: null, episodeNumber: null, contentType: 'movie' });
      emitCardsRendered();
      return;
    }

    $('sideTitle').textContent = 'Episodes';
    $('now').classList.remove('hidden');
    $('prevBtn').classList.remove('hidden');
    $('nextBtn').classList.remove('hidden');
    $('videoControls').classList.remove('hidden');

    state.episodes = await fetchEpisodesForAnime(anime.id);
    state.selected = null;
    state.episodePage = 0;

    const seasons = [...new Set(state.episodes.map(episode => Number(episode.season_number) || 1))].sort((a, b) => a - b);
    $('watchCounts').innerHTML = `<div class="countLine"><b>${seasons.length} Season${seasons.length !== 1 ? 's' : ''}</b><span>|</span><b>${state.episodes.length} Episode${state.episodes.length !== 1 ? 's' : ''}</b></div>`;
    updateNav();

    if (!state.episodes.length) {
      $('seasons').innerHTML = '';
      $('episodes').innerHTML = '<div class="empty episodeEmpty">No episodes yet.</div>';
      $('episodePrev').disabled = true;
      $('episodeNext').disabled = true;
      return;
    }

    state.currentSeason = seasons[0];
    $('seasons').innerHTML = seasons.map((season, index) => `<button type="button" class="season ${index ? '' : 'active'}" data-season="${season}">Season ${season}</button>`).join('');
    showSeason(seasons[0]);

    if (openLatest) {
      const latest = state.episodes.reduce((best, episode) => {
        if (!best) return episode;
        const newerSeason = Number(episode.season_number || 1) > Number(best.season_number || 1);
        const newerEpisode = Number(episode.season_number || 1) === Number(best.season_number || 1) && Number(episode.episode_number || 0) > Number(best.episode_number || 0);
        return newerSeason || newerEpisode ? episode : best;
      }, null);
      if (latest) await play(latest.id);
    } else if (resumeEpisodeId != null) {
      const resume = state.episodes.find(episode => String(episode.id) === String(resumeEpisodeId));
      if (resume) await play(resume.id);
    }
    emitCardsRendered();
  } catch (error) {
    console.error('Unable to open anime:', error);
    $('episodes').className = 'episodes';
    $('episodes').innerHTML = `<div class="empty episodeEmpty">Unable to load episodes. Please try again.</div>`;
  } finally {
    hideLoader();
  }
}

function showHistoryPage() {
  const items = historyItems();
  if (!items.length) { goHome(); return; }
  state.view = 'history';
  closeSearch();
  $('search').value = '';
  $('homePage').classList.add('hidden');
  $('watchPage').classList.add('hidden');
  $('searchPage').classList.add('hidden');
  $('historyPage').classList.remove('hidden');
  $('historyPage').querySelector('h2').textContent = 'Watch History';
  $('clearHistoryPage').classList.remove('hidden');
  $('allHistoryGrid').innerHTML = items.map(historyCard).join('');
  history.pushState({ view: 'history' }, '', `${location.pathname}${location.search}#watch-history`);
  emitCardsRendered();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openAbout() {
  const panel = $('anipastaAbout');
  if (!panel) return;
  panel.classList.add('show');
  panel.setAttribute('aria-hidden', 'false');
}

function closeAbout() {
  const panel = $('anipastaAbout');
  if (!panel) return;
  panel.classList.remove('show');
  panel.setAttribute('aria-hidden', 'true');
}

function setupTelegramPopup() {
  const popup = $('anipastaTelegramPopup');
  if (!popup) return;
  const close = () => { popup.classList.remove('show'); popup.setAttribute('aria-hidden', 'true'); };
  popup.querySelector('.anipastaTgClose')?.addEventListener('click', close);
  popup.addEventListener('click', event => { if (event.target === popup) close(); });
  popup.classList.add('show');
  popup.setAttribute('aria-hidden', 'false');
  window.setTimeout(close, 5000);
}

function openRouteFromHash() {
  if (location.hash === '#watch-history') showHistoryPage();
  else if (location.hash.startsWith('#anime-')) openAnimeById(decodeURIComponent(location.hash.slice(7)));
  else if (location.hash.startsWith('#search-')) openSearchPage(decodeURIComponent(location.hash.slice(8)));
}

function bindEvents() {
  $('homeButton').addEventListener('click', () => {
    if (state.view !== 'home') goHome();
    else loadAnime({ showLoader: true, retry: true, force: true }).catch(() => {});
  });
  $('search').addEventListener('input', event => showSearch(event.target.value));
  $('search').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); openSearchPage(event.target.value); }
  });
  $('searchResults').addEventListener('click', event => {
    const button = event.target.closest('[data-id]');
    if (!button) return;
    const item = historyItems().find(entry => String(entry.anime.id) === String(button.dataset.id));
    openAnimeById(button.dataset.id, item?.episodeId ?? null, false);
  });
  $('searchGrid').addEventListener('click', event => {
    const card = event.target.closest('.card[data-id]');
    if (!card) return;
    const item = historyItems().find(entry => String(entry.anime.id) === String(card.dataset.id));
    openAnimeById(card.dataset.id, item?.episodeId ?? null, false);
  });
  $('grid').addEventListener('click', event => {
    const card = event.target.closest('.card');
    if (card) openAnimeById(card.dataset.id, null, true);
  });
  $('historyGrid').addEventListener('click', event => {
    const deleteButton = event.target.closest('[data-delete-history-id]');
    if (deleteButton) { event.preventDefault(); event.stopPropagation(); removeHistoryItem(deleteButton.dataset.deleteHistoryId); return; }
    const card = event.target.closest('[data-history-id]');
    if (!card) return;
    const item = historyItems().find(entry => String(entry.anime.id) === String(card.dataset.historyId));
    if (item) openAnimeById(item.anime.id, item.episodeId);
  });
  $('allHistoryGrid').addEventListener('click', event => {
    const deleteButton = event.target.closest('[data-delete-history-id]');
    if (deleteButton) { event.preventDefault(); event.stopPropagation(); removeHistoryItem(deleteButton.dataset.deleteHistoryId); return; }
    const historyCardElement = event.target.closest('[data-history-id]');
    const animeCardElement = event.target.closest('[data-id]');
    if (historyCardElement) {
      const item = historyItems().find(entry => String(entry.anime.id) === String(historyCardElement.dataset.historyId));
      if (item) openAnimeById(item.anime.id, item.episodeId);
    } else if (animeCardElement) openAnimeById(animeCardElement.dataset.id);
  });
  $('viewAllHistory').addEventListener('click', showHistoryPage);
  $('clearHistory').addEventListener('click', clearWatchHistory);
  $('clearHistoryPage').addEventListener('click', clearWatchHistory);
  $('seasons').addEventListener('click', event => { const button = event.target.closest('[data-season]'); if (button) showSeason(button.dataset.season); });
  $('episodes').addEventListener('click', event => {
    const episode = event.target.closest('[data-episode]');
    if (episode) { play(episode.dataset.episode); return; }
    const relatedMovie = event.target.closest('[data-related-id]');
    if (relatedMovie) openAnimeById(relatedMovie.dataset.relatedId);
  });
  $('prevBtn').addEventListener('click', () => changeEpisode(-1));
  $('nextBtn').addEventListener('click', () => changeEpisode(1));
  $('seasonPrev').addEventListener('click', () => moveSeason(-1));
  $('seasonNext').addEventListener('click', () => moveSeason(1));
  $('episodePrev').addEventListener('click', () => moveEpisodePage(-1));
  $('episodeNext').addEventListener('click', () => moveEpisodePage(1));
  document.addEventListener('click', event => { if (!event.target.closest('.searchWrap')) closeSearch(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeAbout(); });
  $('anipastaAbout')?.addEventListener('click', event => { if (event.target.id === 'anipastaAbout') closeAbout(); });
  window.addEventListener('hashchange', () => {
    if (!location.hash && state.view !== 'home') goHome();
    else openRouteFromHash();
  });
  window.addEventListener('popstate', () => { if (!location.hash.startsWith('#anime-')) stopPlayer(); });
  window.addEventListener('pagehide', stopPlayer);
}

window.AnipastaApp = {
  db,
  esc,
  getAnime: () => state.anime.slice(),
  getCurrentAnime: () => state.current,
  getView: () => state.view,
  setHistoryProvider,
  renderHistory,
  showHistoryPage,
  goHome,
  openAnimeById,
  openAbout,
  setView: view => { state.view = view; },
  showLoader,
  hideLoader,
  refresh: () => loadAnime({ showLoader: false, retry: true, force: true })
};

window.getWatchHistory = getWatchHistory;
window.historyItems = historyItems;
window.saveWatchHistory = saveWatchHistory;
window.clearWatchHistory = clearWatchHistory;
window.removeHistoryItem = removeHistoryItem;
window.findHistoryItem = animeId => historyItems().find(entry => String(entry.anime.id) === String(animeId)) || null;
window.showHistoryPage = showHistoryPage;
window.goHome = goHome;
window.openAnimeById = openAnimeById;
window.openAbout = openAbout;
window.closeAbout = closeAbout;

bindEvents();
showLoader();
setupTelegramPopup();
startDataSync();
loadAnime({ retry: true, force: true }).catch(error => {
  console.error('Initial AniPasta load failed:', error);
});
