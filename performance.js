(() => {
  'use strict';

  if (!window.supabase || typeof window.supabase.createClient !== 'function') return;
  if (window.__ANIPASTA_PERF_PATCHED__) return;
  window.__ANIPASTA_PERF_PATCHED__ = true;

  const originalCreateClient = window.supabase.createClient;
  const animeColumns = 'id,title,poster_url,content_type,is_published,movie_duration,movie_url,download_links,created_at';
  const episodeColumns = 'id,anime_id,season_number,episode_number,video_url,created_at';

  window.supabase.createClient = function patchedCreateClient(...args) {
    const client = originalCreateClient.apply(this, args);
    const originalFrom = client.from.bind(client);

    client.from = function patchedFrom(table, ...fromArgs) {
      const builder = originalFrom(table, ...fromArgs);
      if (table !== 'anime' && table !== 'episodes') return builder;

      const originalSelect = builder.select.bind(builder);
      builder.select = function patchedSelect(columns, ...selectArgs) {
        if (columns === '*') {
          columns = table === 'anime' ? animeColumns : episodeColumns;
        }
        return originalSelect(columns, ...selectArgs);
      };
      return builder;
    };

    return client;
  };
})();
