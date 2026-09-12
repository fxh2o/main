(() => {
  'use strict';

  const app = window.AnipastaApp;
  if (!app) return;

  const $ = id => document.getElementById(id);
  const page = $('libraryPage');
  const list = $('libraryList');
  const alphabet = $('libraryAlphabet');
  const count = $('libraryCount');
  const libraryButton = $('libraryButton');
  const headerHomeButton = $('headerHomeButton');

  if (!page || !list || !alphabet || !libraryButton || !headerHomeButton) return;

  const LETTERS = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  let selectedLetter = 'A';
  let libraryActivated = false;

  const esc = value => typeof app.esc === 'function'
    ? app.esc(value)
    : String(value ?? '').replace(/[&<>\"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[char]));

  function injectHeaderNavStyles() {
    if ($('anipastaHeaderNavStyles')) return;
    const style = document.createElement('style');
    style.id = 'anipastaHeaderNavStyles';
    style.textContent = `
      .header {
        display: grid !important;
        grid-template-columns: 1fr auto 1fr !important;
        align-items: center !important;
      }
      .headerCenterNav {
        grid-column: 2 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 8px !important;
      }
      .headerCenterNav .headerNavButton {
        width: auto !important;
        min-width: 76px !important;
        height: 40px !important;
        padding: 0 16px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border: 1px solid var(--border-2) !important;
        border-radius: 9px !important;
        background: var(--surface-2) !important;
        color: var(--muted) !important;
        font-size: 12px !important;
        font-weight: 800 !important;
        line-height: 1 !important;
        text-decoration: none !important;
        cursor: pointer !important;
      }
      .headerCenterNav .headerNavButton:hover {
        border-color: var(--accent) !important;
        background: var(--surface-3) !important;
        color: var(--text) !important;
      }
      .headerCenterNav .headerNavButton.active {
        border-color: var(--accent) !important;
        background: color-mix(in srgb,var(--accent) 12%,var(--surface-2)) !important;
        color: var(--text) !important;
      }
      .headerCenterNav .headerNavButton svg { display: none !important; }
      .headerCenterNav + .headerActions {
        grid-column: 3 !important;
        justify-self: end !important;
        margin-left: 0 !important;
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
      }
      .headerActions .headerNavButton { display: none !important; }
      .headerActions .headerSearchToggle { margin-left: 0 !important; }
      .headerActions .anipastaNotificationWrap { display: block !important; }
      @media (max-width: 640px) {
        .headerCenterNav .headerNavButton { min-width: 68px !important; padding: 0 12px !important; }
      }
      @media (max-width: 440px) {
        .headerCenterNav { gap: 6px !important; }
        .headerCenterNav .headerNavButton { min-width: 62px !important; height: 38px !important; padding: 0 10px !important; font-size: 11px !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function setupHeaderNavigation() {
    const header = document.querySelector('.header');
    const actions = header?.querySelector('.headerActions');
    if (!header || !actions || $('headerCenterNav')) return;

    const nav = document.createElement('nav');
    nav.id = 'headerCenterNav';
    nav.className = 'headerCenterNav';
    nav.setAttribute('aria-label', 'Primary navigation');
    header.insertBefore(nav, actions);
    nav.append(headerHomeButton, libraryButton);

    const moveNotificationToActions = () => {
      const notificationWrap = header.querySelector('.anipastaNotificationWrap');
      if (notificationWrap && notificationWrap.parentElement !== actions) actions.appendChild(notificationWrap);
    };

    moveNotificationToActions();
    const observer = new MutationObserver(moveNotificationToActions);
    observer.observe(header, { childList: true, subtree: true });
  }

  function hideLibrary() {
    page.classList.add('hidden');
    libraryButton.classList.remove('active');
  }

  function visibleAnime() {
    return (typeof app.getAnime === 'function' ? app.getAnime() : [])
      .filter(anime => anime && anime.title)
      .slice()
      .sort((a, b) => String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' }));
  }

  function startsWithSelectedLetter(title, letter) {
    const first = String(title || '').trim().charAt(0).toUpperCase();
    if (letter === '#') return !/[A-Z]/.test(first);
    return first === letter;
  }

  function renderAlphabet(items) {
    const available = new Set(items.map(anime => {
      const first = String(anime.title || '').trim().charAt(0).toUpperCase();
      return /[A-Z]/.test(first) ? first : '#';
    }));

    if (!available.has(selectedLetter)) {
      selectedLetter = available.has('A') ? 'A' : (LETTERS.find(letter => available.has(letter)) || '#');
    }

    alphabet.innerHTML = LETTERS.map(letter => {
      const disabled = !available.has(letter);
      return `<button type="button" data-library-letter="${letter}" class="${selectedLetter === letter ? 'active' : ''}" aria-label="${letter === '#' ? 'Numbers and symbols' : `Titles starting with ${letter}`}" ${disabled ? 'disabled' : ''}>${letter}</button>`;
    }).join('');
  }

  function renderLibrary() {
    const items = visibleAnime();
    renderAlphabet(items);
    const filtered = items.filter(anime => startsWithSelectedLetter(anime.title, selectedLetter));

    count.textContent = `${items.length} title${items.length === 1 ? '' : 's'}`;

    if (!items.length) {
      list.innerHTML = '<div class="libraryEmpty">Loading library...</div>';
      return;
    }

    if (!filtered.length) {
      list.innerHTML = '<div class="libraryEmpty">No titles found for this letter.</div>';
      return;
    }

    const midpoint = Math.ceil(filtered.length / 2);
    const columns = [filtered.slice(0, midpoint), filtered.slice(midpoint)];

    list.innerHTML = columns.map(column => `
      <div class="libraryCol">
        ${column.map(anime => {
          const isMovie = anime.content_type === 'movie';
          return `<div class="libraryItem">
            <button type="button" class="libraryTitle" data-library-id="${esc(anime.id)}" title="Open ${esc(anime.title)}">${esc(anime.title)}</button>
            <span class="libraryType ${isMovie ? 'movie' : ''}">${isMovie ? 'Movie' : 'Series'}</span>
          </div>`;
        }).join('')}
      </div>
    `).join('');
  }

  function showLibrary(push = true) {
    libraryActivated = true;
    hideLibrary();
    $('homePage')?.classList.add('hidden');
    $('watchPage')?.classList.add('hidden');
    $('historyPage')?.classList.add('hidden');
    $('searchPage')?.classList.add('hidden');
    $('headerSearchPanel')?.classList.remove('show');
    $('headerSearchPanel')?.setAttribute('aria-hidden', 'true');
    $('headerSearchButton')?.setAttribute('aria-expanded', 'false');
    $('searchResults')?.classList.add('hidden');

    page.classList.remove('hidden');
    libraryButton.classList.add('active');
    app.setView?.('library');
    renderLibrary();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (push && location.hash !== '#library') {
      history.pushState({ view: 'library' }, '', `${location.pathname}${location.search}#library`);
    }
  }

  function goHomeFromHeader() {
    hideLibrary();
    app.goHome?.();
  }

  libraryButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    showLibrary(true);
  });

  headerHomeButton.addEventListener('click', event => {
    event.preventDefault();
    goHomeFromHeader();
  });

  alphabet.addEventListener('click', event => {
    const button = event.target.closest('[data-library-letter]');
    if (!button || button.disabled) return;
    selectedLetter = button.dataset.libraryLetter || '#';
    renderLibrary();
    requestAnimationFrame(() => button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }));
  });

  list.addEventListener('click', event => {
    const button = event.target.closest('[data-library-id]');
    if (!button) return;
    const id = button.dataset.libraryId;
    hideLibrary();
    app.openAnimeById?.(id, null, false);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target?.id === 'search' && !page.classList.contains('hidden')) hideLibrary();
  }, true);

  document.addEventListener('anipasta:cards-rendered', () => {
    if (!page.classList.contains('hidden') && libraryActivated) renderLibrary();
  });

  const originalOpenAnime = app.openAnimeById;
  if (typeof originalOpenAnime === 'function') {
    app.openAnimeById = (...args) => {
      hideLibrary();
      return originalOpenAnime(...args);
    };
  }

  const originalGoHome = app.goHome;
  if (typeof originalGoHome === 'function') {
    app.goHome = (...args) => {
      hideLibrary();
      return originalGoHome(...args);
    };
  }

  const originalShowHistory = app.showHistoryPage;
  if (typeof originalShowHistory === 'function') {
    app.showHistoryPage = (...args) => {
      hideLibrary();
      return originalShowHistory(...args);
    };
  }

  window.addEventListener('popstate', () => {
    if (location.hash === '#library' && libraryActivated) showLibrary(false);
    else hideLibrary();
  });

  window.addEventListener('hashchange', () => {
    if (location.hash === '#library' && libraryActivated) showLibrary(false);
    else hideLibrary();
  });

  injectHeaderNavStyles();
  setupHeaderNavigation();
  hideLibrary();
})();
