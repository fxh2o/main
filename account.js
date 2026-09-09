(function () {
  const app = window.AnipastaApp;
  const sb = app.db;
  const $ = id => document.getElementById(id);
  const esc = app.esc;
  const HEART = '\u2605';
  const HEART_EMPTY = '\u2606';

  let user = null;
  let profile = {};
  let favorites = new Set();
  let cloudHistory = [];
  let dynamicNotifications = [];
  let accountLoadPromise = null;
  let accountLoadUserId = null;

  async function accountRequest(task, label) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const result = await task();
        if (result?.error) throw result.error;
        return result;
      } catch (error) {
        lastError = error;
        if (attempt === 3) throw error;
        const text = String(error?.message || error || '').toLowerCase();
        if (!/network|fetch|timeout|gateway|temporar|connection|502|503|504/.test(text)) throw error;
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      }
    }
    throw lastError || new Error(`${label || 'Account request'} failed`);
  }

  async function touchActivity() {
    if (!user) return;
    try {
      await accountRequest(() => sb.from('profiles').update({ last_activity_at: new Date().toISOString() }).eq('id', user.id), 'activity update');
    } catch (error) {
      console.warn('Unable to update account activity', error);
    }
  }

  function toast(message) {
    const element = $('accountToast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(element._timer);
    element._timer = setTimeout(() => element.classList.remove('show'), 2400);
  }

  function setCloudHistory(rows) {
    cloudHistory = (rows || []).map(row => ({
      animeId: row.anime_id,
      episodeId: row.episode_id,
      seasonNumber: row.season_number,
      episodeNumber: row.episode_number,
      contentType: row.content_type,
      timestamp: new Date(row.watched_at).getTime()
    }));

    app.setHistoryProvider({
      get: () => cloudHistory.slice(),
      async save(item) {
        if (!user) return;
        const row = {
          user_id: user.id,
          anime_id: item.animeId,
          episode_id: item.episodeId || null,
          season_number: item.seasonNumber ?? null,
          episode_number: item.episodeNumber ?? null,
          content_type: item.contentType || 'episode',
          watched_at: new Date().toISOString()
        };
        await accountRequest(() => sb.from('watch_history').upsert(row, { onConflict: 'user_id,anime_id' }), 'save watch history');
        const rows = await accountRequest(() => sb.from('watch_history').select('anime_id,watched_at').eq('user_id', user.id).order('watched_at', { ascending: false }), 'load watch history');
        const allRows = rows.data || [];
        if (allRows.length > 30) {
          const oldIds = allRows.slice(30).map(entry => entry.anime_id);
          if (oldIds.length) await accountRequest(() => sb.from('watch_history').delete().eq('user_id', user.id).in('anime_id', oldIds), 'trim watch history');
        }
        cloudHistory = [{ ...item, timestamp: Date.now() }, ...cloudHistory.filter(saved => String(saved.animeId) !== String(item.animeId))].slice(0, 30);
        await touchActivity();
        renderNotificationCenter();
      },
      async clear() {
        if (!user) return;
        await accountRequest(() => sb.from('watch_history').delete().eq('user_id', user.id), 'clear watch history');
        cloudHistory = [];
      },
      async remove(animeId) {
        if (!user) return;
        await accountRequest(() => sb.from('watch_history').delete().eq('user_id', user.id).eq('anime_id', animeId), 'remove watch history');
        cloudHistory = cloudHistory.filter(saved => String(saved.animeId) !== String(animeId));
      }
    });
  }

  async function loadAccountData() {
    if (!user) return;
    const activeUserId = user.id;
    if (accountLoadPromise && accountLoadUserId === activeUserId) return accountLoadPromise;

    accountLoadUserId = activeUserId;
    accountLoadPromise = (async () => {
      const [profileResult, favoritesResult, historyResult] = await Promise.all([
        accountRequest(() => sb.from('profiles').select('username').eq('id', activeUserId).maybeSingle(), 'profile load'),
        accountRequest(() => sb.from('favorites').select('anime_id,created_at').eq('user_id', activeUserId).order('created_at', { ascending: false }), 'favorites load'),
        accountRequest(() => sb.from('watch_history').select('anime_id,episode_id,season_number,episode_number,content_type,watched_at').eq('user_id', activeUserId).order('watched_at', { ascending: false }), 'history load')
      ]);

      if (!user || user.id !== activeUserId) return;
      profile = profileResult.data || {};

      const favoriteRows = favoritesResult.data || [];
      if (favoriteRows.length > 60) {
        const oldFavoriteIds = favoriteRows.slice(60).map(row => row.anime_id);
        if (oldFavoriteIds.length) await accountRequest(() => sb.from('favorites').delete().eq('user_id', activeUserId).in('anime_id', oldFavoriteIds), 'trim favorites');
      }
      favorites = new Set(favoriteRows.slice(0, 60).map(row => String(row.anime_id)));

      const historyRows = historyResult.data || [];
      if (historyRows.length > 30) {
        const oldHistoryIds = historyRows.slice(30).map(row => row.anime_id);
        if (oldHistoryIds.length) await accountRequest(() => sb.from('watch_history').delete().eq('user_id', activeUserId).in('anime_id', oldHistoryIds), 'trim history');
      }
      setCloudHistory(historyRows.slice(0, 30));

      renderAccount();
      refreshFavoriteButtons();
      renderNotificationCenter();
    })();

    try {
      await accountLoadPromise;
    } catch (error) {
      console.warn('Unable to load account data', error);
      toast('Unable to load account data. Please try again.');
      throw error;
    } finally {
      if (accountLoadUserId === activeUserId) {
        accountLoadPromise = null;
        accountLoadUserId = null;
      }
    }
  }

  async function bootAccount(accountUser) {
    if (!accountUser) return;
    user = accountUser;
    await touchActivity();
    await loadAccountData();
    await loadDynamicNotifications();
    renderAccount();
    refreshFavoriteButtons();
    renderNotificationCenter();
  }

  const NOTIFICATION_SEEN_KEY = 'anipasta_notification_seen_v1';
  const NOTIFICATION_SEEN_IDS_KEY = 'anipasta_seen_notification_ids_v1';

  function getSeenNotificationIds() {
    try {
      const raw = JSON.parse(localStorage.getItem(NOTIFICATION_SEEN_IDS_KEY) || '[]');
      return Array.isArray(raw) ? new Set(raw.map(String)) : new Set();
    } catch { return new Set(); }
  }

  function saveSeenNotificationIds(ids) {
    try { localStorage.setItem(NOTIFICATION_SEEN_IDS_KEY, JSON.stringify([...ids].slice(-100))); } catch {}
  }

  async function loadDynamicNotifications() {
    if (!user) { dynamicNotifications = []; return; }
    try {
      const result = await accountRequest(() => sb.from('notifications').select('id,title,message,created_at,expires_at').eq('is_active', true).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }), 'notifications load');
      dynamicNotifications = result.data || [];
    } catch (error) {
      console.warn('Unable to load notifications', error);
      dynamicNotifications = [];
    }
  }

  function isNotificationSeen() {
    try { return localStorage.getItem(NOTIFICATION_SEEN_KEY) === '1'; } catch { return false; }
  }

  function setNotificationSeen(value) {
    try {
      if (value) localStorage.setItem(NOTIFICATION_SEEN_KEY, '1');
      else localStorage.removeItem(NOTIFICATION_SEEN_KEY);
    } catch {}
    updateNotificationDot();
  }

  function updateNotificationDot() {
    const button = $('headerNotificationButton');
    if (!button) return;
    const seenIds = getSeenNotificationIds();
    const hasDynamicUnread = Boolean(user) && dynamicNotifications.some(n => !seenIds.has(String(n.id)));
    const hasWelcomeUnread = Boolean(user) && !isNotificationSeen();
    button.classList.toggle('has-notification', Boolean(user) && (hasWelcomeUnread || hasDynamicUnread));
  }

  function renderNotificationCenter() {
    const panel = $('notificationPanel');
    if (!panel) { updateNotificationDot(); return; }
    if (!user) {
      panel.innerHTML = '';
      panel.classList.remove('show');
      updateNotificationDot();
      return;
    }
    const historyCount = Math.min(cloudHistory.length, 30);
    const favoriteCount = Math.min(favorites.size, 60);
    const inactiveText = 'Your account may be automatically removed after 30 consecutive days without meaningful activity, together with its stored account data. Login, anime watching, favourites, and relevant account/profile activity reset this period.';
    const dynamicHtml = dynamicNotifications.map(n => `<div class="notificationItem" data-notification-id="${esc(n.id)}"><div class="notificationItemTitle">${esc(n.title)}</div><div class="notificationItemText">${esc(n.message)}</div></div>`).join('');
    panel.innerHTML = `<div class="notificationHead"><strong>Notifications</strong><button type="button" data-mark-notifications-read>Mark as read</button></div><div class="notificationItem"><div class="notificationItemTitle">Thanks for creating an account on AniPasta!</div><div class="notificationItemText">Your account currently keeps <b>${historyCount}</b>/30 watch history items and <b>${favoriteCount}</b>/60 favourites.</div><div class="notificationItemText">${inactiveText}</div></div>${dynamicHtml}`;
    updateNotificationDot();
  }

  function openNotificationPanel() {
    const panel = $('notificationPanel');
    if (!panel || !user) return;
    renderNotificationCenter();
    panel.classList.add('show');
    setNotificationSeen(true);
  }

  function closeNotificationPanel() { $('notificationPanel')?.classList.remove('show'); }

  function renderAccount() {
    const button = $('accountButton');
    const menu = $('accountMenu');
    if (!button || !menu) return;
    if (!user) {
      button.title = 'Account';
      menu.innerHTML = '<button data-account-action="login">Login</button><button data-account-action="signup">Create Account</button>';
      return;
    }
    button.title = profile.username || 'Account';
    menu.innerHTML = `<div class="accountUser"><strong>${esc(profile.username || 'Account')}</strong><span>${esc(user.email || '')}</span></div><button data-account-action="history">Watch History</button><button data-account-action="favorites">Favorites</button><button data-account-action="email">Email</button><button data-account-action="password">Change Password</button><button class="logout" data-account-action="logout">Logout</button>`;
  }

  function refreshFavoriteButtons() {
    document.querySelectorAll('[data-favorite-id]').forEach(button => {
      const isFavorite = favorites.has(String(button.dataset.favoriteId));
      button.classList.toggle('is-favorite', isFavorite);
      button.textContent = isFavorite ? HEART : HEART_EMPTY;
    });
  }

  async function enforceFavoriteLimit() {
    if (!user) return;
    const result = await accountRequest(() => sb.from('favorites').select('anime_id,created_at').eq('user_id', user.id).order('created_at', { ascending: false }), 'favorite limit check');
    const rows = result.data || [];
    if (rows.length <= 60) return;
    const oldIds = rows.slice(60).map(row => row.anime_id);
    if (oldIds.length) await accountRequest(() => sb.from('favorites').delete().eq('user_id', user.id).in('anime_id', oldIds), 'trim favorites');
    favorites = new Set(rows.slice(0, 60).map(row => String(row.anime_id)));
  }

  async function toggleFavorite(id) {
    if (!user) { openModal('login'); return; }
    const key = String(id);
    const result = favorites.has(key)
      ? await accountRequest(() => sb.from('favorites').delete().eq('user_id', user.id).eq('anime_id', id), 'remove favorite')
      : await accountRequest(() => sb.from('favorites').insert({ user_id: user.id, anime_id: id }), 'add favorite');

    if (!result) return;
    if (favorites.has(key)) favorites.delete(key); else favorites.add(key);
    try { await enforceFavoriteLimit(); await touchActivity(); }
    catch (error) { toast(error.message || 'Unable to update favorite limit'); }
    refreshFavoriteButtons();
    renderNotificationCenter();
    toast(favorites.has(key) ? 'Added to favorites' : 'Removed from favorites');
  }

  function modal(type) {
    if (type === 'login') return `<div class="accountModal"><button class="modalClose" data-close-account>&times;</button><h2>Login</h2><form id="accountForm"><input name="email" type="email" placeholder="Email" required autocomplete="email"><input name="password" type="password" placeholder="Password" required autocomplete="current-password"><button class="accountPrimary">Login</button></form><button class="modalLink" data-open-account="signup">Create Account</button><div id="accountError"></div></div>`;
    if (type === 'signup') return `<div class="accountModal"><button class="modalClose" data-close-account>&times;</button><h2>Create Account</h2><form id="accountForm"><input name="username" placeholder="Username" minlength="3" maxlength="30" pattern="[A-Za-z0-9_]+" required autocomplete="username"><input name="email" type="email" placeholder="Email" required autocomplete="email"><input name="password" type="password" placeholder="Password (8+ characters)" minlength="8" required autocomplete="new-password"><button class="accountPrimary">Create Account</button></form><button class="modalLink" data-open-account="login">Already have an account?</button><div id="accountError"></div></div>`;
    if (type === 'email') return `<div class="accountModal"><button class="modalClose" data-close-account>&times;</button><h2>Email</h2><p>Your account email</p><input value="${esc(user.email || '')}" disabled><div id="accountError"></div></div>`;
    if (type === 'password') return '<div class="accountModal"><button class="modalClose" data-close-account>&times;</button><h2>Change Password</h2><form id="passwordForm"><input name="password" type="password" placeholder="New password (8+ characters)" minlength="8" required autocomplete="new-password"><button class="accountPrimary">Change Password</button></form><div id="accountError"></div></div>';
    return `<div class="accountModal"><button class="modalClose" data-close-account>&times;</button><h2>Username</h2><form id="profileForm"><input name="username" value="${esc(profile.username || '')}" minlength="3" maxlength="30" pattern="[A-Za-z0-9_]+" required><button class="accountPrimary">Save Username</button></form><div id="accountError"></div></div>`;
  }

  function openModal(type) {
    const overlay = $('accountOverlay');
    overlay.innerHTML = modal(type);
    overlay.dataset.type = type;
    overlay.classList.add('show');
  }

  function closeModal() { $('accountOverlay').classList.remove('show'); $('accountOverlay').innerHTML = ''; }

  async function submitAccountForm(form, type) {
    const fields = new FormData(form);
    const error = $('accountError');
    if (error) error.textContent = '';

    try {
      if (type === 'login') {
        const result = await accountRequest(() => sb.auth.signInWithPassword({ email: fields.get('email'), password: fields.get('password') }), 'login');
        closeModal();
        await bootAccount(result.data.user);
        toast('Logged in');
        return;
      }

      if (type === 'signup') {
        const username = String(fields.get('username')).trim();
        const taken = await accountRequest(() => sb.from('profiles').select('id').eq('username', username).maybeSingle(), 'username check');
        if (taken.data) { error.textContent = 'Username already taken'; return; }
        const result = await accountRequest(() => sb.auth.signUp({ email: fields.get('email'), password: fields.get('password'), options: { data: { username } } }), 'signup');
        closeModal();
        if (result.data.user && result.data.session) await bootAccount(result.data.user);
        toast(result.data.session ? 'Account created' : 'Check your email to confirm');
        return;
      }

      const username = String(fields.get('username')).trim();
      const result = await accountRequest(() => sb.from('profiles').update({ username, updated_at: new Date().toISOString() }).eq('id', user.id), 'profile update');
      if (result.error) { error.textContent = result.error.code === '23505' ? 'Username already taken' : result.error.message; return; }
      profile.username = username;
      await touchActivity();
      closeModal();
      renderAccount();
      toast('Username updated');
    } catch (requestError) {
      error.textContent = requestError.message || 'Account request failed.';
    }
  }

  async function changePassword(form) {
    const error = $('accountError');
    try {
      const result = await accountRequest(() => sb.auth.updateUser({ password: new FormData(form).get('password') }), 'password update');
      if (result.error) throw result.error;
      await touchActivity();
      closeModal();
      toast('Password changed');
    } catch (requestError) { error.textContent = requestError.message || 'Password update failed.'; }
  }

  async function showFavorites() {
    if (!user) { openModal('login'); return; }
    try {
      const result = await accountRequest(() => sb.from('favorites').select('anime_id,created_at,anime:anime_id(id,title,poster_url,content_type,is_published)').eq('user_id', user.id).order('created_at', { ascending: false }), 'favorites page');
      const list = (result.data || []).map(row => row.anime).filter(anime => anime && anime.is_published);
      await touchActivity();
      $('homePage').classList.add('hidden');
      $('watchPage').classList.add('hidden');
      $('searchPage').classList.add('hidden');
      $('historyPage').classList.remove('hidden');
      app.setView('favorites');
      $('historyPage').querySelector('h2').textContent = 'Favorites';
      $('clearHistoryPage').classList.add('hidden');
      $('allHistoryGrid').innerHTML = list.length ? list.map(anime => `<article class="card" data-id="${esc(anime.id)}"><div class="poster">${anime.poster_url ? `<img src="${esc(anime.poster_url)}" loading="lazy" alt="">` : ''}<div class="poster-overlay"></div><span class="releaseMeta">${anime.content_type === 'movie' ? 'Movie' : 'Series'}</span></div><div class="title" title="${esc(anime.title)}">${esc(anime.title)}</div></article>`).join('') : '<div class="empty">No favorites yet.</div>';
      history.pushState({ view: 'favorites' }, '', `${location.pathname}${location.search}#favorites`);
    } catch (error) { toast(error.message || 'Unable to load favorites.'); }
  }

  function injectAccountShell() {
    if ($('accountButton')) return;
    const header = document.querySelector('.header');
    const accountWrap = document.createElement('div');
    accountWrap.className = 'accountWrap';
    accountWrap.innerHTML = `<div class="headerTools"><button class="headerIcon" id="headerSearchButton" type="button" aria-label="Search" title="Search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 5 5"></path></svg></button><button class="headerIcon" id="headerNotificationButton" type="button" aria-label="Notifications" title="Notifications"><svg viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9Z"></path><path d="M10 21h4"></path></svg></button><button class="headerIcon accountHeaderIcon" id="accountButton" type="button" aria-label="Account" title="Account"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"></circle><path d="M5 21c.8-4 3.2-6 7-6s6.2 2 7 6"></path></svg></button></div><div id="accountMenu" class="accountMenu"></div>`;
    header.appendChild(accountWrap);
    const searchPanel = document.createElement('div');
    searchPanel.id = 'headerSearchPanel'; searchPanel.className = 'headerSearchPanel'; searchPanel.appendChild(document.querySelector('.searchWrap')); document.body.appendChild(searchPanel);
    const overlay = document.createElement('div'); overlay.id = 'accountOverlay'; overlay.className = 'accountOverlay'; document.body.appendChild(overlay);
    const notificationPanel = document.createElement('div'); notificationPanel.id = 'notificationPanel'; notificationPanel.className = 'notificationPanel'; document.body.appendChild(notificationPanel);
    const toastElement = document.createElement('div'); toastElement.id = 'accountToast'; toastElement.className = 'accountToast'; document.body.appendChild(toastElement);
  }

  function injectFavoriteButtons() {
    const watchCounts = document.querySelector('#watchPage #watchCounts');
    const currentAnime = app.getCurrentAnime();
    if (watchCounts && currentAnime && !watchCounts.querySelector('[data-watch-favorite]')) {
      const button = document.createElement('button');
      button.className = 'favoriteButton watchFavorite'; button.type = 'button'; button.dataset.favoriteId = currentAnime.id; button.dataset.watchFavorite = '1'; button.title = 'Favorite'; button.setAttribute('aria-label', 'Favorite'); button.textContent = favorites.has(String(currentAnime.id)) ? HEART : HEART_EMPTY; watchCounts.appendChild(button);
    }
    refreshFavoriteButtons();
  }

  function resetLoggedOutState() {
    user = null; profile = {}; favorites = new Set(); cloudHistory = []; dynamicNotifications = []; accountLoadPromise = null; accountLoadUserId = null;
    app.setHistoryProvider(null); renderAccount(); refreshFavoriteButtons(); renderNotificationCenter();
  }

  function closeHeaderPanels(except = '') {
    const searchPanel = $('headerSearchPanel'); const accountMenu = $('accountMenu'); const notificationPanel = $('notificationPanel');
    if (except !== 'search') { searchPanel?.classList.remove('show'); document.body.classList.remove('header-search-open'); $('searchResults')?.classList.add('hidden'); }
    if (except !== 'account') accountMenu?.classList.remove('show');
    if (except !== 'notification') notificationPanel?.classList.remove('show');
  }

  function bindEvents() {
    $('headerSearchButton').addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); const panel = $('headerSearchPanel'); const wasOpen = panel?.classList.contains('show'); closeHeaderPanels(); if (!wasOpen) { panel?.classList.add('show'); document.body.classList.add('header-search-open'); $('search')?.focus(); } });
    $('headerNotificationButton').addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); const panel = $('notificationPanel'); const wasOpen = panel?.classList.contains('show'); closeHeaderPanels(); if (!wasOpen) openNotificationPanel(); });
    $('accountButton').addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); const menu = $('accountMenu'); const wasOpen = menu?.classList.contains('show'); closeHeaderPanels(); if (!wasOpen) menu?.classList.add('show'); });
    document.addEventListener('anipasta:cards-rendered', injectFavoriteButtons);
    window.addEventListener('scroll', () => closeHeaderPanels(), { passive: true });
    document.addEventListener('click', async event => {
      const favoriteButton = event.target.closest('[data-favorite-id]');
      if (favoriteButton) { event.preventDefault(); event.stopPropagation(); closeHeaderPanels(); await toggleFavorite(favoriteButton.dataset.favoriteId); return; }
      const action = event.target.closest('[data-account-action]');
      if (action) {
        event.preventDefault(); event.stopPropagation(); closeHeaderPanels();
        const type = action.dataset.accountAction;
        try {
          if (['login', 'signup', 'email', 'password'].includes(type)) openModal(type);
          else if (type === 'history') app.showHistoryPage();
          else if (type === 'favorites') await showFavorites();
          else if (type === 'logout') { await accountRequest(() => sb.auth.signOut(), 'logout'); resetLoggedOutState(); toast('Logged out'); }
        } catch (error) { toast(error.message || 'Account action failed.'); }
        return;
      }
      const modalSwitch = event.target.closest('[data-open-account]');
      if (modalSwitch) { event.preventDefault(); event.stopPropagation(); openModal(modalSwitch.dataset.openAccount); return; }
      if (event.target.closest('[data-mark-notifications-read]')) { event.preventDefault(); event.stopPropagation(); const seenIds = getSeenNotificationIds(); dynamicNotifications.forEach(n => seenIds.add(String(n.id))); saveSeenNotificationIds(seenIds); setNotificationSeen(true); updateNotificationDot(); return; }
      if (event.target.closest('[data-close-account]') || event.target.id === 'accountOverlay') { closeModal(); return; }
      if (!event.target.closest('#headerSearchPanel, #headerSearchButton, #accountMenu, #accountButton, #notificationPanel, #headerNotificationButton')) closeHeaderPanels();
    });

    document.addEventListener('submit', async event => {
      if (event.target.id === 'accountForm') { event.preventDefault(); await submitAccountForm(event.target, $('accountOverlay').dataset.type); }
      else if (event.target.id === 'profileForm') { event.preventDefault(); await submitAccountForm(event.target, 'profile'); }
      else if (event.target.id === 'passwordForm') { event.preventDefault(); await changePassword(event.target); }
    });

    document.addEventListener('click', event => {
      const target = event.target.closest('.ep,.card[data-id]');
      if (!target || event.target.closest('[data-favorite-id]')) return;
      if (!user) { event.preventDefault(); event.stopImmediatePropagation(); closeHeaderPanels(); openModal('login'); return; }
      const card = target.closest('.card[data-id]');
      if (card) {
        const historyItem = window.findHistoryItem?.(card.dataset.id);
        if (historyItem) { event.preventDefault(); event.stopImmediatePropagation(); closeHeaderPanels(); app.openAnimeById(card.dataset.id, historyItem.episodeId ?? null, false); }
      }
    }, true);
  }

  function start() {
    injectAccountShell(); bindEvents(); renderAccount(); renderNotificationCenter(); injectFavoriteButtons();
    sb.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) { try { await bootAccount(data.session.user); } catch {} }
      else resetLoggedOutState();
    }).catch(error => { console.warn('Unable to restore auth session', error); resetLoggedOutState(); });

    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) { resetLoggedOutState(); return; }
      if (session.user && (!user || user.id !== session.user.id || event === 'USER_UPDATED')) {
        bootAccount(session.user).catch(error => console.warn('Account state refresh failed', error));
      }
    });
  }

  start();
})();
