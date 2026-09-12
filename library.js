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

  const esc = value => typeof app.esc === 'function'
    ? app.esc(value)
    : String(value ?? '').replace(/[&<>\"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[char]));

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
    if (!page.classList.contains('hidden')) renderLibrary();
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
    if (location.hash === '#library') showLibrary(false);
    else hideLibrary();
  });

  window.addEventListener('hashchange', () => {
    if (location.hash === '#library') showLibrary(false);
    else hideLibrary();
  });

  if (location.hash === '#library') showLibrary(false);
  else hideLibrary();
})();
