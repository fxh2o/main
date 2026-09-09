(() => {
  'use strict';

  const DOWNLOAD_HASH_PREFIX = '#anime-';
  const DOWNLOAD_SUFFIX = '-download';
  const CHAT_URL = 'https://t.me/Anipasta_Chat';

  function esc(value) {
    return String(value ?? '').replace(/[&<>\"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function getDownloadId() {
    const params = new URLSearchParams(window.location.search || '');
    const queryId = params.get('download') === '1' ? params.get('anime') : null;
    if (queryId) return decodeURIComponent(queryId);

    const hash = window.location.hash || '';
    if (!hash.startsWith(DOWNLOAD_HASH_PREFIX) || !hash.endsWith(DOWNLOAD_SUFFIX)) return null;
    const rawId = hash.slice(DOWNLOAD_HASH_PREFIX.length, -DOWNLOAD_SUFFIX.length);
    return rawId ? decodeURIComponent(rawId) : null;
  }

  function getDownloadLinks(anime) {
    if (!anime) return {};
    const value = anime.download_links;
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function injectStyles() {
    if (document.getElementById('anipastaDownloadStyles')) return;
    const style = document.createElement('style');
    style.id = 'anipastaDownloadStyles';
    style.textContent = `
      #downloadPage{max-width:1180px;margin:0 auto;padding:24px 16px 48px;}
      .downloadTop{display:flex;align-items:center;gap:14px;margin-bottom:18px;}
      .downloadBack{display:none !important;}
      .downloadHeading{min-width:0;}
      .downloadHeading h1{margin:0;font-size:28px;line-height:1.15;}

      .downloadInfoBox{display:grid;gap:0;margin-bottom:16px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.025);overflow:hidden;}
      .downloadInfoItem{display:grid;grid-template-columns:170px minmax(0,1fr);align-items:center;gap:18px;padding:12px 16px;}
      .downloadInfoItem + .downloadInfoItem{border-top:1px solid rgba(255,255,255,.07);}
      .downloadInfoTitle{font-size:13px;font-weight:800;color:var(--text,#fff);white-space:nowrap;}
      .downloadInfoText{margin:0;color:rgba(255,255,255,.68);font-size:12px;line-height:1.45;}
      .downloadInfoText a{color:var(--accent,#f5c518);font-weight:800;text-decoration:none;}
      .downloadInfoText a:hover{text-decoration:underline;}

      .downloadEmpty{padding:24px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.025);text-align:center;}
      .downloadEmpty h2{margin:0 0 8px;font-size:20px;}
      .downloadEmpty p{margin:0 0 16px;opacity:.72;line-height:1.55;}
      .downloadRequest{display:inline-flex;align-items:center;justify-content:center;padding:11px 16px;border-radius:9px;background:#229ED9;color:#fff;font-weight:800;text-decoration:none;}
      .downloadRequest:hover{filter:brightness(1.08);}
      .downloadSeasons{display:grid;gap:16px;}
      .downloadSeason{border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.025);overflow:hidden;}
      .downloadSeasonHead{padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.07);font-size:18px;font-weight:800;}
      .downloadQualities{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:14px 16px 16px;}
      .downloadQuality{display:flex;align-items:center;justify-content:center;min-height:46px;padding:10px 12px;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:rgba(255,255,255,.03);font-weight:800;text-decoration:none;color:inherit;transition:.16s ease;}
      .downloadQuality:hover{transform:translateY(-1px);border-color:var(--accent,#6cf);background:rgba(255,255,255,.06);}
      .downloadMissing{opacity:.45;cursor:not-allowed;}
      .episodesColumn{min-width:0;display:block;}
      .episodesColumn .episodesPanel{width:100%;}
      .animeDownloadBar{display:block;width:100%;margin:10px 0 0;padding:10px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.025);box-sizing:border-box;}
      .animeDownloadInfo,.animeDownloadIcon,.animeDownloadText,.animeDownloadTitle,.animeDownloadSubtitle{display:none !important;}
      .animeDownloadButton{display:flex;align-items:center;justify-content:center;width:100%;min-height:42px;padding:10px 18px;border:1px solid rgba(245,197,24,.3);border-radius:10px;background:var(--accent,#f5c518);color:#090909;font:inherit;font-weight:800;cursor:pointer;white-space:nowrap;transition:.16s ease;box-shadow:0 8px 22px rgba(245,197,24,.13);}
      .animeDownloadButton:hover{transform:translateY(-2px);background:#ffd84b;border-color:rgba(255,255,255,.18);box-shadow:0 12px 28px rgba(245,197,24,.2);}
      @media(max-width:760px){
        .downloadInfoItem{grid-template-columns:1fr;gap:3px;padding:11px 14px;}
      }
      @media(max-width:640px){.downloadQualities{grid-template-columns:1fr 1fr}.downloadTop{align-items:flex-start}.downloadHeading h1{font-size:22px;}}
      @media(max-width:400px){.downloadQualities{grid-template-columns:1fr;}}
    `;
    document.head.appendChild(style);
  }

  function ensurePage() {
    if (document.getElementById('downloadPage')) return document.getElementById('downloadPage');
    const page = document.createElement('main');
    page.id = 'downloadPage';
    page.className = 'page hidden';
    const watch = document.getElementById('watchPage');
    if (watch) watch.insertAdjacentElement('afterend', page);
    else document.body.appendChild(page);
    return page;
  }

  function renderDownloadPage(anime) {
    const page = ensurePage();
    const links = getDownloadLinks(anime);
    const seasons = Object.keys(links)
      .filter(season => /^\d+$/.test(String(season)))
      .sort((a, b) => Number(a) - Number(b));

    document.querySelectorAll('main.page, main.watch').forEach(el => el.classList.add('hidden'));
    page.classList.remove('hidden');

    const hasAny = seasons.some(season => {
      const row = links[season];
      return row && typeof row === 'object' && ['480p', '720p', '1080p'].some(q => String(row[q] || '').trim());
    });

    page.innerHTML = `
      <div class="downloadTop">
        <div class="downloadHeading">
          <h1>${esc(anime?.title || 'Anime')} — Download</h1>
        </div>
      </div>

      <div class="downloadInfoBox">
        <div class="downloadInfoItem">
          <div class="downloadInfoTitle">Download format</div>
          <p class="downloadInfoText">Single-episode downloads are not available. We provide <strong>full-season ZIP files only</strong>.</p>
        </div>
        <div class="downloadInfoItem">
          <div class="downloadInfoTitle">Link not opening?</div>
          <p class="downloadInfoText">Try a VPN such as 1.1.1.1 (WARP), then open the download link again.</p>
        </div>
        <div class="downloadInfoItem">
          <div class="downloadInfoTitle">Need help?</div>
          <p class="downloadInfoText">Report any download issue in our <a href="${CHAT_URL}" target="_blank" rel="noopener noreferrer">Telegram Group</a> with the anime name, season, quality, and problem.</p>
        </div>
      </div>

      ${hasAny ? `
        <div class="downloadSeasons">
          ${seasons.map(season => {
            const row = links[season] && typeof links[season] === 'object' ? links[season] : {};
            const qualities = ['480p', '720p', '1080p'];
            const buttons = qualities.map(quality => {
              const url = String(row[quality] || '').trim();
              return url
                ? `<a class="downloadQuality" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${quality}</a>`
                : `<span class="downloadQuality downloadMissing">${quality} — Unavailable</span>`;
            }).join('');
            return `<section class="downloadSeason"><div class="downloadSeasonHead">Season ${esc(season)}</div><div class="downloadQualities">${buttons}</div></section>`;
          }).join('')}
        </div>`
        : `<div class="downloadEmpty">
             <h2>Download link not available</h2>
             <p>This anime download link has not been added yet. Please request the download link in our Telegram chat.</p>
             <a class="downloadRequest" href="${CHAT_URL}" target="_blank" rel="noopener noreferrer">Request Download Link</a>
           </div>`}
    `;
  }

  function showDownloadRoute() {
    const id = getDownloadId();
    if (id == null) return false;
    const app = window.AnipastaApp;
    const anime = app?.getAnime?.().find(item => String(item.id) === String(id));
    if (!anime) return false;
    renderDownloadPage(anime);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  }

  function restoreWatchPage() {
    const watch = document.getElementById('watchPage');
    const page = document.getElementById('downloadPage');
    const app = window.AnipastaApp;
    if (!watch || !app?.getCurrentAnime?.()) return;
    page?.classList.add('hidden');
    watch.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function ensureEpisodesColumn() {
    const watchGrid = document.querySelector('#watchPage .watchGrid');
    const episodesPanel = document.querySelector('#watchPage .episodesPanel');
    if (!watchGrid || !episodesPanel) return null;

    let column = watchGrid.querySelector('.episodesColumn');
    if (!column) {
      column = document.createElement('div');
      column.className = 'episodesColumn';
      watchGrid.insertBefore(column, episodesPanel);
      column.appendChild(episodesPanel);
    } else if (episodesPanel.parentElement !== column) {
      column.appendChild(episodesPanel);
    }
    return column;
  }

  function placeDownloadBar() {
    const bar = document.getElementById('anipastaDownloadBar');
    const column = ensureEpisodesColumn();
    const episodes = document.querySelector('#watchPage #episodeNav');
    if (!bar || !column || !episodes) return;

    bar.classList.add('download-after-episodes');
    if (bar.parentElement !== column || bar.previousElementSibling !== episodes && bar.previousElementSibling !== document.querySelector('#watchPage .episodesPanel')) {
      column.appendChild(bar);
    }
    if (bar.parentElement !== column) column.appendChild(bar);
  }

  function openDownload(anime) {
    if (!anime) return;
    const url = new URL(window.location.href);
    url.searchParams.set('download', '1');
    url.searchParams.set('anime', String(anime.id));
    history.pushState({ view: 'download', animeId: String(anime.id) }, '', url.pathname + url.search + url.hash);
    renderDownloadPage(anime);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function addDownloadButton() {
    const column = ensureEpisodesColumn();
    if (!column) return;

    const existing = document.getElementById('anipastaDownloadBar');
    if (existing) {
      placeDownloadBar();
      return;
    }

    const bar = document.createElement('div');
    bar.id = 'anipastaDownloadBar';
    bar.className = 'animeDownloadBar download-after-episodes';
    bar.innerHTML = `<button id="anipastaDownloadButton" class="animeDownloadButton" type="button">DOWNLOAD</button>`;

    column.appendChild(bar);

    document.getElementById('anipastaDownloadButton')?.addEventListener('click', () => {
      const anime = window.AnipastaApp?.getCurrentAnime?.();
      if (anime) openDownload(anime);
    });

    placeDownloadBar();
  }

  function clearDownloadRouteBeforeHome() {
    document.getElementById('downloadPage')?.classList.add('hidden');
    const params = new URLSearchParams(window.location.search || '');
    params.delete('download');
    params.delete('anime');
    const search = params.toString();
    const cleanUrl = window.location.pathname + (search ? `?${search}` : '');
    history.replaceState({ view: 'home' }, '', cleanUrl);
  }

  function leaveDownloadViewForAppRoute() {
    document.getElementById('downloadPage')?.classList.add('hidden');
    const params = new URLSearchParams(window.location.search || '');
    params.delete('download');
    params.delete('anime');
    const search = params.toString();
    const cleanUrl = window.location.pathname + (search ? `?${search}` : '');
    history.replaceState({ view: 'app-route' }, '', cleanUrl);
  }

  function sync() {
    addDownloadButton();
    if (showDownloadRoute()) return;
    restoreWatchPage();
  }

  injectStyles();
  document.addEventListener('click', event => {
    if (event.target.closest?.('#homeButton')) {
      clearDownloadRouteBeforeHome();
      return;
    }

    if (event.target.closest?.('#searchResults, #searchGrid .card[data-id]')) {
      leaveDownloadViewForAppRoute();
    }
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.closest?.('#search')) {
      leaveDownloadViewForAppRoute();
    }
  }, true);
  window.addEventListener('popstate', sync);
  window.addEventListener('hashchange', sync);
  window.addEventListener('resize', placeDownloadBar);
  document.addEventListener('anipasta:cards-rendered', sync);
  window.addEventListener('load', sync, { once: true });
  window.setTimeout(sync, 300);
  window.setTimeout(sync, 1200);
})();
