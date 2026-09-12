(() => {
  'use strict';
  const app = window.AnipastaApp;
  if (!app?.db) return;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>\"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[char]));
  const SEEN_KEY = 'anipasta_notifications_seen_v1';
  const SEEN_IDS_KEY = 'anipasta_notification_ids_v1';
  const read = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value == null ? fallback : value; } catch { return fallback; } };
  const seenIds = () => new Set(Array.isArray(read(SEEN_IDS_KEY, [])) ? read(SEEN_IDS_KEY, []).map(String) : []);
  const updateDot = () => $('headerNotificationButton')?.classList.toggle('has-notification', localStorage.getItem(SEEN_KEY) !== '1');
  function closeSearchPanel(){
    const searchPanel = $('headerSearchPanel');
    const searchButton = $('headerSearchButton');
    if (!searchPanel) return;
    searchPanel.classList.remove('show');
    searchPanel.setAttribute('aria-hidden','true');
    searchButton?.setAttribute('aria-expanded','false');
  }
  function injectStyles(){
    if($('anipastaNotificationStyles')) return;
    const style=document.createElement('style'); style.id='anipastaNotificationStyles';
    style.textContent='.anipastaNotificationWrap{position:relative;flex:0 0 auto}.anipastaNotificationButton{position:relative;width:40px;height:40px;display:grid;place-items:center;border:1px solid var(--border-2);border-radius:9px;background:var(--surface-2);color:var(--muted)}.anipastaNotificationButton:hover{border-color:var(--accent);background:var(--surface-3);color:var(--text)}.anipastaNotificationButton svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.anipastaNotificationButton.has-notification::after{content:"";position:absolute;top:6px;right:6px;width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 2px var(--surface-2)}.anipastaNotificationPanel{position:fixed;top:62px;right:24px;z-index:1100;width:min(360px,calc(100vw - 32px));display:none;overflow:hidden;border:1px solid var(--border-2);border-radius:13px;background:var(--surface);box-shadow:0 20px 60px rgba(0,0,0,.55)}.anipastaNotificationPanel.show{display:block}.anipastaNotificationHead{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px;border-bottom:1px solid var(--border)}.anipastaNotificationHead strong{font-size:14px;font-weight:800}.anipastaNotificationHead button{color:var(--accent);font-size:11px;font-weight:800}.anipastaNotificationItem{padding:14px}.anipastaNotificationItem+.anipastaNotificationItem{border-top:1px solid var(--border)}.anipastaNotificationTitle{font-size:13px;font-weight:800;line-height:1.45}.anipastaNotificationText{margin-top:7px;color:var(--muted);font-size:11px;line-height:1.6}@media(max-width:540px){.anipastaNotificationButton{width:38px;height:38px}.anipastaNotificationPanel{top:58px;right:12px;width:calc(100vw - 24px)}}';
    document.head.appendChild(style);
  }
  function injectUI(){
    const header=document.querySelector('.header'); if(!header || $('headerNotificationButton')) return;
    const wrap=document.createElement('div'); wrap.className='anipastaNotificationWrap';
    wrap.innerHTML='<button id="headerNotificationButton" class="anipastaNotificationButton" type="button" aria-label="Notifications" title="Notifications"><svg viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9Z"></path><path d="M10 21h4"></path></svg></button>';
    const panel=document.createElement('div'); panel.id='notificationPanel'; panel.className='anipastaNotificationPanel'; panel.setAttribute('aria-live','polite'); header.append(wrap,panel);
    wrap.querySelector('button').addEventListener('click',async event=>{
      event.stopPropagation();
      if(panel.classList.contains('show')){panel.classList.remove('show');return;}
      closeSearchPanel();
      panel.classList.add('show'); panel.innerHTML='<div class="anipastaNotificationItem"><div class="anipastaNotificationText">Loading notifications...</div></div>';
      try{
        const result=await app.db.from('notifications').select('id,title,message,created_at,expires_at').eq('is_active',true).gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false});
        if(result.error) throw result.error;
        const items=result.data||[];
        panel.innerHTML='<div class="anipastaNotificationHead"><strong>Notifications</strong><button id="markNotificationsRead" type="button">Mark as read</button></div>'+(items.length?items.map(item=>`<div class="anipastaNotificationItem"><div class="anipastaNotificationTitle">${esc(item.title)}</div><div class="anipastaNotificationText">${esc(item.message)}</div></div>`).join(''):'<div class="anipastaNotificationItem"><div class="anipastaNotificationText">No new notifications.</div></div>');
        const ids=seenIds(); items.forEach(item=>ids.add(String(item.id))); localStorage.setItem(SEEN_IDS_KEY,JSON.stringify([...ids])); localStorage.setItem(SEEN_KEY,'1'); updateDot();
      }catch(error){ console.warn('AniPasta notifications unavailable:',error); panel.innerHTML='<div class="anipastaNotificationHead"><strong>Notifications</strong></div><div class="anipastaNotificationItem"><div class="anipastaNotificationText">Notifications are temporarily unavailable.</div></div>'; }
    });
    panel.addEventListener('click',event=>{if(event.target.closest('#markNotificationsRead')){localStorage.setItem(SEEN_KEY,'1');updateDot();}event.stopPropagation();});
    document.addEventListener('click',event=>{if(!event.target.closest('#notificationPanel,#headerNotificationButton'))panel.classList.remove('show');});
    $('headerSearchButton')?.addEventListener('click',()=>{if(panel.classList.contains('show')) panel.classList.remove('show');});
  }
  injectStyles(); injectUI(); updateDot();
})();

(() => {
  'use strict';

  const injectReportSupportPopup = () => {
    if (document.getElementById('anipastaReportPopup')) return;

    const style = document.createElement('style');
    style.id = 'anipastaReportPopupStyles';
    style.textContent = `
      #anipastaReportPopup {
        position: fixed;
        right: 8px;
        bottom: 8px;
        z-index: 99999;
        width: fit-content;
        max-width: calc(100vw - 16px);
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 8px;
        border: 1px solid var(--border-2);
        border-radius: 8px;
        background: rgba(20, 20, 20, .96);
        box-shadow: 0 7px 20px rgba(0, 0, 0, .38);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        cursor: pointer;
        color: inherit;
        text-decoration: none;
      }
      #anipastaReportPopup:hover {
        border-color: var(--tg);
        background: rgba(24, 24, 24, .98);
      }
      #anipastaReportPopup .anipastaReportIcon {
        width: 23px;
        height: 23px;
        flex: 0 0 23px;
        display: grid;
        place-items: center;
        border-radius: 6px;
        background: rgba(34, 158, 217, .13);
        color: var(--tg);
      }
      #anipastaReportPopup .anipastaReportIcon svg {
        width: 13px;
        height: 13px;
        fill: currentColor;
      }
      #anipastaReportPopup .anipastaReportContent {
        min-width: 0;
        flex: 0 0 auto;
      }
      #anipastaReportPopup .anipastaReportText {
        color: var(--text);
        font-size: 10px;
        font-weight: 700;
        line-height: 1.3;
        white-space: nowrap;
      }
      #anipastaReportPopup .anipastaReportHint {
        margin-top: 2px;
        color: #229ed9;
        font-size: 9px;
        font-weight: 700;
        line-height: 1.2;
        white-space: nowrap;
        text-decoration: none;
      }
      #anipastaReportPopup .anipastaReportHint:hover {
        color: #5ecbff;
      }
      @media (max-width: 540px) {
        #anipastaReportPopup {
          right: 7px;
          bottom: 7px;
          width: fit-content;
          max-width: calc(100vw - 14px);
          padding: 7px;
        }
      }
    `;
    document.head.appendChild(style);

    const popup = document.createElement('a');
    popup.id = 'anipastaReportPopup';
    popup.href = 'https://t.me/Anipasta_Chat';
    popup.target = '_blank';
    popup.rel = 'noopener noreferrer';
    popup.setAttribute('aria-label', 'Report an error or request content on Telegram');
    popup.innerHTML = `
      <div class="anipastaReportIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M21.7 3.3 18.6 20c-.2 1.2-.9 1.5-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.2L6 13.7 1.1 12.2c-1.1-.3-1.1-1 .2-1.5L20.4 3c.9-.3 1.7.2 1.3.3Z"/></svg>
      </div>
      <div class="anipastaReportContent">
        <div class="anipastaReportText">Report an error or request content</div>
        <div class="anipastaReportHint">Contact us on Telegram</div>
      </div>
    `;
    document.body.appendChild(popup);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectReportSupportPopup, { once: true });
  } else {
    injectReportSupportPopup();
  }
})();
