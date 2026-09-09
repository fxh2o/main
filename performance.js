(() => {
  'use strict';
  if (!window.supabase || typeof window.supabase.createClient !== 'function' || window.__ANIPASTA_PERF_PATCHED__) return;
  window.__ANIPASTA_PERF_PATCHED__ = true;
  const originalCreateClient = window.supabase.createClient;
  const animeColumns = 'id,title,poster_url,content_type,is_published,movie_duration,movie_url,download_links,created_at';
  const episodeColumns = 'id,anime_id,season_number,episode_number,video_url,created_at';
  window.supabase.createClient = function(...args){
    const client = originalCreateClient.apply(this,args);
    const originalFrom = client.from.bind(client);
    client.from = function(table,...fromArgs){
      const builder=originalFrom(table,...fromArgs);
      if(table!=='anime'&&table!=='episodes') return builder;
      let filteredByAnime=false;
      const originalEq=builder.eq.bind(builder);
      builder.eq=function(column,...eqArgs){ if(table==='episodes'&&column==='anime_id') filteredByAnime=true; return originalEq(column,...eqArgs); };
      const originalSelect=builder.select.bind(builder);
      builder.select=function(columns,...selectArgs){ if(columns==='*') columns=table==='anime'?animeColumns:episodeColumns; return originalSelect(columns,...selectArgs); };
      const originalRange=builder.range.bind(builder);
      builder.range=function(from,to,...rangeArgs){ if(table==='episodes'&&!filteredByAnime&&from===0&&to>=499) return originalRange(0,49,...rangeArgs); return originalRange(from,to,...rangeArgs); };
      return builder;
    };
    return client;
  };
})();
