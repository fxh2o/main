(function () {
  const app = window.AnipastaApp;
  const sb = app.db;
  const $ = id => document.getElementById(id);
  const esc = app.esc;
  const HEART = '\u2605';
  const HEART_EMPTY = '\u2606';
  const FAVORITES_KEY = 'anipasta_favorites_v2';
  const HISTORY_KEY = 'anipasta_watch_history_v2';
  const NOTIFICATION_SEEN_KEY = 'anipasta_notification_seen_v1';
  const NOTIFICATION_SEEN_IDS_KEY = 'anipasta_seen_notification_ids_v1';

  let user = null;
  let profile = {};
  let favorites = new Set();
  let dynamicNotifications = [];

  function toast(message) {
    const element = $('accountToast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(element._timer);
    element._timer = setTimeout(() => element.classList.remove('show'), 2400);
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { console.error('AniPasta local storage error', error); }
  }

  // Watch history and favourites are intentionally local and unlimited.
  // Supabase remains responsible for authentication/profile data only.
  function createUnlimitedLocalHistoryProvider() {
    const read = () => {
      const data = readJson(HISTORY_KEY, []);
      return Array.isArray(data) ? data.filter(item => item && item.animeId) : [];
    };
    const write = items => writeJson(HISTORY_KEY, items);
    return {
      get() { return read(); },
      save(item) {
        const current = read();
        write([{ ...item, timestamp: Date.now() }, ...current.filter(saved => String(saved.animeId) !== String(item.animeId))]);
      },
      clear() { try { localStorage.removeItem(HISTORY_KEY); } catch {} },
      remove(animeId) { write(read().filter(item => String(item.animeId) !== String(animeId))); }
    };
  }

  function loadLocalFavorites() {
    const values = readJson(FAVORITES_KEY, []);
    favorites = new Set(Array.isArray(values) ? values.map(String) : []);
  }

  function saveLocalFavorites() {
    writeJson(FAVORITES_KEY, [...favorites]);
  }

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

  function injectFavoriteButton() {
    const watchCounts = document.querySelector('#watchPage #watchCounts');
    const currentAnime = app.getCurrentAnime();
    if (watchCounts && currentAnime && !watchCounts.querySelector('[data-watch-favorite]')) {
      const button = document.createElement('button');
      button.className = 'favoriteButton watchFavorite';
      button.type = 'button';
      button.dataset.favoriteId = currentAnime.id;
      button.dataset.watchFavorite = '1';
      button.title = 'Favorite';
      button.setAttribute('aria-label', 'Favorite');
      button.textContent = favorites.has(String(currentAnime.id)) ? HEART : HEART_EMPTY;
      watchCounts.appendChild(button);
    }
    refreshFavoriteButtons();
  }

  function toggleFavorite(id) {
    const key = String(id);
    if (favorites.has(key)) {
      favorites.delete(key);
      toast('Removed from favorites');
    } else {
      favorites.add(key);
      toast('Added to favorites');
    }
    saveLocalFavorites();
    refreshFavoriteButtons();
  }

  function showFavorites() {
    const animeList = app.getAnime();
    const list = [...favorites]
      .map(id => animeList.find(anime => String(anime.id) === String(id)))
      .filter(anime => anime && anime.is_published !== false);

    $('homePage').classList.add('hidden');
    $('watchPage').classList.add('hidden');
    $('searchPage').classList.add('hidden');
    $('historyPage').classList.remove('hidden');
    app.setView('favorites');
    $('historyPage').querySelector('h2').textContent = 'Favorites';
    $('clearHistoryPage').classList.add('hidden');
    $('allHistoryGrid').innerHTML = list.length
      ? list.map(anime => `<article class="card" data-id="${esc(anime.id)}"><div class="poster">${anime.poster_url ? `<img src="${esc(anime.poster_url)}" loading="lazy" alt="">` : ''}<div class="poster-overlay"></div><span class="releaseMeta">${anime.content_type === 'movie' ? 'Movie' : 'Series'}</span></div><div class="title" title="${esc(anime.title)}">${esc(anime.title)}</div></article>`).join('')
      : '<div class="empty">No favorites yet.</div>';
    history.pushState({ view: 'favorites' }, '', `${location.pathname}${location.search}#favorites`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function modal(type) {
    if (type === 'login') return `<div class="accountModal"><button class="modalClose" data-close-account>&times;</button><h2>Login</h2><form id="accountForm"><input name="email" type="email" placeholder="Email" required autocomplete="email"><input name="password" type="password" placeholder="Password" required autocomplete="current-password"><button class="accountPrimary">Login</button></form><button class="modalLink" data-open-account="signup">Create Account</button><div id="accountError"></div></div>`;
    if (type === 'signup') return `<div class="accountModal"><button class="modalClose" data-close-account>&times;</button><h2>Create Account</h2><form id="accountForm"><input name="username" placeholder="Username" minlength="3" maxlength="30" pattern="[A-Za-z0-9_]+" required autocomplete="username"><input name="email" type="email" placeholder="Email" required autocomplete="email"><input name="password" type="password" placeholder="Password (8+ characters)" minlength="8" required autocomplete="new-password"><button class="accountPrimary">Create Account</button></form><button class="modalLink" data-open-account="login">Already have an account?</button><div id="accountError"></div></div>`;
    if (type === 'email') return `<div class="accountModal"><button class="modalClose" data-close-account>&times;</button><h2>Email</h2><p>Your account email</p><input value="${esc(user?.email || '')}" disabled><div id="accountError"></div></div>`;
    if (type === 'password') return `<div class="accountModal"><button class="modalClose" data-close-account>&times;</button><h2>Change Password</h2><form id="passwordForm"><input name="password" type="password" placeholder="New password (8+ characters)" minlength="8" required autocomplete="new-password"><button class="accountPrimary">Change Password</button></form><div id="accountError"></div></div>`;
    return `<div class="accountModal"><button class="modalClose" data-close-account>&times;</button><h2>Username</h2><form id="profileForm"><input name="username" value="${esc(profile.username || '')}" minlength="3" maxlength="30" pattern="[A-Za-z0-9_]+" required><button class="accountPrimary">Save Username</button></form><div id="accountError"></div></div>`;
  }

  function openModal(type) {
    const overlay = $('accountOverlay');
    overlay.innerHTML = modal(type);
    overlay.dataset.type = type;
    overlay.classList.add('show');
  }

  function closeModal() {
    $('accountOverlay').classList.remove('show');
    $('accountOverlay').innerHTML = '';
  }

  async function request(task) {
    const result = await task();
    if (result?.error) throw result.error;
    return result;
  }

  async function touchProfile() {
    if (!user) return;
    try { await request(() => sb.from('profiles').update({ last_activity_at: new Date().toISOString() }).eq('id', user.id)); } catch (error) { console.warn('Unable to update activity', error); }
  }

  async function submitAccountForm(form, type) {
    const fields = new FormData(form);
    const error = $('accountError');
    if (error) error.textContent = '';
    try {
      if (type === 'login') {
        const result = await request(() => sb.auth.signInWithPassword({ email: fields.get('email'), password: fields.get('password') }));
        closeModal();
        user = result.data.user;
        await loadProfile();
        toast('Logged in');
        return;
      }
      if (type === 'signup') {
        const username = String(fields.get('username')).trim();
        const taken = await request(() => sb.from('profiles').select('id').eq('username', username).maybeSingle());
        if (taken.data) { error.textContent = 'Username already taken'; return; }
        const result = await request(() => sb.auth.signUp({ email: fields.get('email'), password: fields.get('password'), options: { data: { username } } }));
        closeModal();
        if (result.data.user && result.data.session) { user = result.data.user; await loadProfile(); }
        toast(result.data.session ? 'Account created' : 'Check your email to confirm');
        return;
      }
      if (type === 'profile') {
        const username = String(fields.get('username')).trim();
        const result = await request(() => sb.from('profiles').update({ username, updated_at: new Date().toISOString() }).eq('id', user.id));
        profile.username = username;
        closeModal();
        renderAccount();
        toast('Username updated');
        return result;
      }
    } catch (requestError) { error.textContent = requestError.message || 'Account request failed.'; }
  }

  async function changePassword(form) {
    const error = $('accountError');
    try {
      await request(() => sb.auth.updateUser({ password: new FormData(form).get('password') }));
      await touchProfile();
      closeModal();
      toast('Password changed');
    } catch (requestError) { error.textContent = requestError.message || 'Password update failed.'; }
  }

  async function loadProfile() {
    if (!user) return;
    try {
      const result = await request(() => sb.from('profiles').select('username').eq('id', user.id).maybeSingle());
      profile = result.data || {};
    } catch (error) { profile = {}; console.warn('Unable to load profile', error); }
    renderAccount();
    refreshFavoriteButtons();
    await touchProfile();
  }

  function getSeenNotificationIds() {
    const raw = readJson(NOTIFICATION_SEEN_IDS_KEY, []);
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  }

  function saveSeenNotificationIds(ids) { writeJson(NOTIFICATION_SEEN_IDS_KEY, [...ids]); }

  async function loadNotifications() {
    try {
      const result = await request(() => sb.from('notifications').select('id,title,message,created_at,expires_at').eq('is_active', true).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }));
      dynamicNotifications = result.data || [];
    } catch { dynamicNotifications = []; }
    renderNotificationCenter();
  }

  function notificationSeen() { return localStorage.getItem(NOTIFICATION_SEEN_KEY) === '1'; }
  function setNotificationSeen(value) { try { if (value) localStorage.setItem(NOTIFICATION_SEEN_KEY, '1'); else localStorage.removeItem(NOTIFICATION_SEEN_KEY); } catch {} updateNotificationDot(); }

  function updateNotificationDot() {
    const button = $('headerNotificationButton');
    if (!button) return;
    const seen = getSeenNotificationIds();
    const unreadDynamic = dynamicNotifications.some(item => !seen.has(String(item.id)));
    button.classList.toggle('has-notification', Boolean(user) && (!notificationSeen() || unreadDynamic));
  }

  function renderNotificationCenter() {
    const panel = $('notificationPanel');
    if (!panel) return;
    if (!user) { panel.innerHTML = ''; panel.classList.remove('show'); updateNotificationDot(); return; }
    const dynamicHtml = dynamicNotifications.map(n => `<div class="notificationItem"><div class="notificationItemTitle">${esc(n.title)}</div><div class="notificationItemText">${esc(n.message)}</div></div>`).join('');
    panel.innerHTML = `<div class="notificationHead"><strong>Notifications</strong><button type="button" data-mark-notifications-read>Mark as read</button></div><div class="notificationItem"><div class="notificationItemTitle">AniPasta account</div><div class="notificationItemText">Your watch history and favourites are stored locally on this device with no item limit.</div><div class="notificationItemText">Your login account stores authentication and profile information only.</div></div>${dynamicHtml}`;
    updateNotificationDot();
  }

  function openNotificationPanel() {
    if (!user) { openModal('login'); return; }
    const panel = $('notificationPanel');
    renderNotificationCenter();
    panel.classList.add('show');
    setNotificationSeen(true);
  }

  function closeHeaderPanels(except = '') {
    const searchPanel = $('headerSearchPanel');
    const accountMenu = $('accountMenu');
    const notificationPanel = $('notificationPanel');
    if (except !== 'search') { searchPanel?.classList.remove('show'); document.body.classList.remove('header-search-open'); $('searchResults')?.classList.add('hidden'); }
    if (except !== 'account') accountMenu?.classList.remove('show');
    if (except !== 'notification') notificationPanel?.classList.remove('show');
  }

  function injectAccountShell() {
    if ($('accountButton')) return;
    const header = document.querySelector('.header');
    const accountWrap = document.createElement('div');
    accountWrap.className = 'accountWrap';
    accountWrap.innerHTML = `<div class="headerTools"><button class="headerIcon" id="headerSearchButton" type="button" aria-label="Search" title="Search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 5 5"></path></svg></button><button class="headerIcon" id="headerNotificationButton" type="button" aria-label="Notifications" title="Notifications"><svg viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9Z"></path><path d="M10 21h4"></path></svg></button><button class="headerIcon accountHeaderIcon" id="accountButton" type="button" aria-label="Account" title="Account"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"></circle><path d="M5 21c.8-4 3.2-6 7-6s6.2 2 7 6"></path></svg></button></div><div id="accountMenu" class="accountMenu"></div>`;
    header.appendChild(accountWrap);
    const searchPanel = document.createElement('div');
    searchPanel.id = 'headerSearchPanel';
    searchPanel.className = 'headerSearchPanel';
    searchPanel.appendChild(document.querySelector('.searchWrap'));
    document.body.appendChild(searchPanel);
    const overlay = document.createElement('div');
    overlay.id = 'accountOverlay';
    overlay.className = 'accountOverlay';
    document.body.appendChild(overlay);
    const notificationPanel = document.createElement('div');
    notificationPanel.id = 'notificationPanel';
    notificationPanel.className = 'notificationPanel';
    document.body.appendChild(notificationPanel);
    const toastElement = document.createElement('div');
    toastElement.id = 'accountToast';
    toastElement.className = 'accountToast';
    document.body.appendChild(toastElement);
  }

  function bindEvents() {
    $('headerSearchButton').addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      const panel = $('headerSearchPanel');
      const wasOpen = panel?.classList.contains('show');
      closeHeaderPanels();
      if (!wasOpen) { panel?.classList.add('show'); document.body.classList.add('header-search-open'); $('search')?.focus(); }
    });
    $('headerNotificationButton').addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      const panel = $('notificationPanel');
      const wasOpen = panel?.classList.contains('show');
      closeHeaderPanels();
      if (!wasOpen) openNotificationPanel();
    });
    $('accountButton').addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      const menu = $('accountMenu');
      const wasOpen = menu?.classList.contains('show');
      closeHeaderPanels();
      if (!wasOpen) menu?.classList.add('show');
    });

    document.addEventListener('anipasta:cards-rendered', injectFavoriteButton);
    document.addEventListener('click', async event => {
      const favoriteButton = event.target.closest('[data-favorite-id]');
      if (favoriteButton) { event.preventDefault(); event.stopPropagation(); toggleFavorite(favoriteButton.dataset.favoriteId); return; }
      const action = event.target.closest('[data-account-action]');
      if (action) {
        event.preventDefault(); event.stopPropagation(); closeHeaderPanels();
        const type = action.dataset.accountAction;
        try {
          if (['login', 'signup', 'email', 'password'].includes(type)) openModal(type);
          else if (type === 'history') app.showHistoryPage();
          else if (type === 'favorites') showFavorites();
          else if (type === 'logout') { await request(() => sb.auth.signOut()); user = null; profile = {}; renderAccount(); renderNotificationCenter(); toast('Logged out'); }
        } catch (error) { toast(error.message || 'Account action failed.'); }
        return;
      }
      const modalSwitch = event.target.closest('[data-open-account]');
      if (modalSwitch) { event.preventDefault(); event.stopPropagation(); openModal(modalSwitch.dataset.openAccount); return; }
      if (event.target.closest('[data-mark-notifications-read]')) { event.preventDefault(); event.stopPropagation(); const ids = getSeenNotificationIds(); dynamicNotifications.forEach(n => ids.add(String(n.id))); saveSeenNotificationIds(ids); setNotificationSeen(true); return; }
      if (event.target.closest('[data-close-account]') || event.target.id === 'accountOverlay') { closeModal(); return; }
      if (!event.target.closest('#headerSearchPanel, #headerSearchButton, #accountMenu, #accountButton, #notificationPanel, #headerNotificationButton')) closeHeaderPanels();
    });

    document.addEventListener('submit', async event => {
      if (event.target.id === 'accountForm') { event.preventDefault(); await submitAccountForm(event.target, $('accountOverlay').dataset.type); }
      else if (event.target.id === 'profileForm') { event.preventDefault(); await submitAccountForm(event.target, 'profile'); }
      else if (event.target.id === 'passwordForm') { event.preventDefault(); await changePassword(event.target); }
    });

    window.addEventListener('scroll', () => closeHeaderPanels(), { passive: true });
  }

  async function start() {
    injectAccountShell();
    bindEvents();
    loadLocalFavorites();

    // Replace the old 100-item local provider with an unlimited local provider.
    app.setHistoryProvider(createUnlimitedLocalHistoryProvider());
    renderAccount();
    renderNotificationCenter();
    injectFavoriteButton();

    try {
      const sessionResult = await sb.auth.getSession();
      if (sessionResult.data?.session?.user) {
        user = sessionResult.data.session.user;
        await loadProfile();
        await loadNotifications();
      } else {
        renderAccount();
      }
    } catch (error) { console.warn('Unable to restore auth session', error); }

    sb.auth.onAuthStateChange(async (event, session) => {
      if (!session?.user) { user = null; profile = {}; dynamicNotifications = []; renderAccount(); renderNotificationCenter(); return; }
      if (!user || user.id !== session.user.id || event === 'USER_UPDATED') {
        user = session.user;
        await loadProfile();
        await loadNotifications();
      }
    });
  }

  start();
})();
