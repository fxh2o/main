(function () {
  'use strict';

  const app = window.AnipastaApp;
  if (!app) return;

  const $ = id => document.getElementById(id);
  const esc = app.esc;
  const FAVORITES_KEY = 'anipasta_favorites_v2';
  const HISTORY_KEY = 'anipasta_watch_history_v2';
  const NOTIFICATION_SEEN_IDS_KEY = 'anipasta_seen_notification_ids_v1';

  const STAR = '\u2605';
  const STAR_EMPTY = '\u2606';
  let favorites = new Set();
  let notifications = [];
  let notificationLoaded = false;
  let notificationLoading = false;

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn('AniPasta local storage write failed', error);
    }
  }

  function createUnlimitedHistoryProvider() {
    const read = () => {
      const data = readJson(HISTORY_KEY, []);
      return Array.isArray(data) ? data.filter(item => item && item.animeId) : [];
    };

    return {
      get() {
        return read();
      },
      save(item) {
        const next = [{ ...item, timestamp: Date.now() }, ...read().filter(saved => String(saved.animeId) !== String(item.animeId))];
        writeJson(HISTORY_KEY, next);
      },
      clear() {
        try { localStorage.removeItem(HISTORY_KEY); } catch {}
      },
      remove(animeId) {
        writeJson(HISTORY_KEY, read().filter(item => String(item.animeId) !== String(animeId)));
      }
    };
  }

  function loadFavorites() {
    const values = readJson(FAVORITES_KEY, []);
    favorites = new Set(Array.isArray(values) ? values.map(String) : []);
  }

  function saveFavorites() {
    writeJson(FAVORITES_KEY, [...favorites]);
  }

  function refreshFavoriteButtons() {
    document.querySelectorAll('[data-favorite-id]').forEach(button => {
      const active = favorites.has(String(button.dataset.favoriteId));
      button.classList.toggle('is-favorite', active);
      button.textContent = active ? STAR : STAR_EMPTY;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function toast(message) {
    let element = $('accountToast');
    if (!element) {
      element = document.createElement('div');
      element.id = 'accountToast';
      element.className = 'accountToast';
      document.body.appendChild(element);
    }
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(element._timer);
    element._timer = setTimeout(() => element.classList.remove('show'), 1800);
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
    saveFavorites();
    refreshFavoriteButtons();
  }

  function injectFavoriteButton() {
    const watchCounts = $('#watchPage #watchCounts');
    const currentAnime = app.getCurrentAnime();
    if (!watchCounts || !currentAnime) return;
    if (watchCounts.querySelector('[data-watch-favorite]')) return;

    const button = document.createElement('button');
    button.className = 'favoriteButton watchFavorite';
    button.type = 'button';
    button.dataset.favoriteId = currentAnime.id;
    button.dataset.watchFavorite = '1';
    button.title = 'Favorite';
    button.setAttribute('aria-label', 'Favorite');
    watchCounts.appendChild(button);
    refreshFavoriteButtons();
  }

  function notificationSeenIds() {
    const ids = readJson(NOTIFICATION_SEEN_IDS_KEY, []);
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
  }

  function saveNotificationSeenIds(ids) {
    writeJson(NOTIFICATION_SEEN_IDS_KEY, [...ids]);
  }

  function updateNotificationDot() {
    const button = $('headerNotificationButton');
    if (!button) return;
    const seen = notificationSeenIds();
    const unread = notifications.some(item => !seen.has(String(item.id)));
    button.classList.toggle('has-notification', unread);
  }

  function renderNotifications() {
    const panel = $('notificationPanel');
    if (!panel) return;

    const html = notifications.length
      ? notifications.map(item => `<div class="notificationItem"><div class="notificationItemTitle">${esc(item.title || 'Notification')}</div><div class="notificationItemText">${esc(item.message || '')}</div></div>`).join('')
      : '<div class="notificationItem"><div class="notificationItemTitle">No notifications</div><div class="notificationItemText">You are all caught up.</div></div>';

    panel.innerHTML = `<div class="notificationHead"><strong>Notifications</strong><button type="button" data-mark-notifications-read>Mark as read</button></div>${html}`;
    updateNotificationDot();
  }

  async function loadNotifications() {
    if (notificationLoaded || notificationLoading) return;
    if (!app.db) return;
    notificationLoading = true;
    try {
      const now = new Date().toISOString();
      const result = await app.db.from('notifications')
        .select('id,title,message,created_at,expires_at')
        .eq('is_active', true)
        .gt('expires_at', now)
        .order('created_at', { ascending: false });
      notifications = result.data || [];
      notificationLoaded = true;
      renderNotifications();
    } catch (error) {
      console.warn('Unable to load notifications', error);
      notifications = [];
      notificationLoaded = true;
      renderNotifications();
    } finally {
      notificationLoading = false;
    }
  }

  function injectNotificationButton() {
    const header = document.querySelector('.header');
    if (!header || $('headerNotificationButton')) return;

    const wrap = document.createElement('div');
    wrap.className = 'accountWrap';
    wrap.innerHTML = '<button class="headerIcon" id="headerNotificationButton" type="button" aria-label="Notifications" title="Notifications"><svg viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9Z"></path><path d="M10 21h4"></path></svg></button>';
    header.appendChild(wrap);

    const panel = document.createElement('div');
    panel.id = 'notificationPanel';
    panel.className = 'notificationPanel';
    document.body.appendChild(panel);

    const button = $('headerNotificationButton');
    button.addEventListener('click', async event => {
      event.stopPropagation();
      const isOpen = panel.classList.contains('show');
      document.querySelectorAll('.notificationPanel.show').forEach(item => item.classList.remove('show'));
      if (isOpen) return;
      await loadNotifications();
      renderNotifications();
      panel.classList.add('show');
      const ids = notificationSeenIds();
      notifications.forEach(item => ids.add(String(item.id)));
      saveNotificationSeenIds(ids);
      updateNotificationDot();
    });

    panel.addEventListener('click', event => {
      if (event.target.closest('[data-mark-notifications-read]')) {
        const ids = notificationSeenIds();
        notifications.forEach(item => ids.add(String(item.id)));
        saveNotificationSeenIds(ids);
        updateNotificationDot();
      }
      event.stopPropagation();
    });

    document.addEventListener('click', event => {
      if (!event.target.closest('#notificationPanel') && !event.target.closest('#headerNotificationButton')) {
        panel.classList.remove('show');
      }
    });
  }

  function setupFavoriteEvents() {
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-favorite-id]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(button.dataset.favoriteId);
    });

    document.addEventListener('anipasta:cards-rendered', () => {
      refreshFavoriteButtons();
      injectFavoriteButton();
    });
  }

  loadFavorites();
  app.setHistoryProvider(createUnlimitedHistoryProvider());
  injectNotificationButton();
  setupFavoriteEvents();
  refreshFavoriteButtons();
  window.setTimeout(() => loadNotifications(), 1800);
})();
