(() => {
  'use strict';

  const app = window.AnipastaApp;
  const db = app?.db;
  if (!db) return;

  const player = () => document.getElementById('player');
  const loader = () => document.getElementById('anipastaLoader');

  function mount(url, title) {
    const target = player();
    if (!target || !url) return;
    const current = target.querySelector('iframe');
    if (current?.src === url) return;

    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.title = title || 'AniPasta Player';
    iframe.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    target.className = '';
    target.replaceChildren(iframe);
  }

  async function preplayHomeAnime(id) {
    try {
      const result = await db.from('episodes')
        .select('video_url,episode_number,season_number,created_at')
        .eq('anime_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const row = result.data;
      if (row?.video_url) mount(String(row.video_url).trim(), `Episode ${row.episode_number || ''}`);
    } catch {}
  }

  document.addEventListener('click', event => {
    const homeCard = event.target.closest?.('#grid .card[data-id]');
    if (homeCard) {
      preplayHomeAnime(homeCard.dataset.id);
      return;
    }

    if (event.target.closest?.('#episodes [data-episode]')) {
      window.setTimeout(() => loader()?.classList.remove('show'), 350);
    }
  }, true);
})();
