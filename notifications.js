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
    $('headerSearchButton')?.addEventListener('click',()=>{
      if(panel.classList.contains('show')) panel.classList.remove('show');
    });
  }
  injectStyles(); injectUI(); updateDot();
})();

(() => {
  'use strict';

  const applyTelegramSupportPopup = () => {
    const popup = document.getElementById('anipastaTelegramPopup');
    if (!popup) return;

    const title = popup.querySelector('#anipastaTgTitle');
    const text = popup.querySelector('.anipastaTgText');
    const link = popup.querySelector('.anipastaTgJoin');
    const icon = popup.querySelector('.anipastaTgIcon');

    if (title) title.textContent = 'Need help?';
    if (text) text.textContent = 'Report an error or request content on Telegram.';
    if (link) {
      link.textContent = 'Open Telegram';
      link.href = 'https://t.me/Anipasta_Chat';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', 'Open AniPasta Telegram chat');
    }

    if (icon) {
      icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.7 3.3 18.6 20c-.2 1.2-.9 1.5-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.2L6 13.7 1.1 12.2c-1.1-.3-1.1-1 .2-1.5L20.4 3c.9-.3 1.7.2 1.3.3Z"/></svg>';
    }

    if (!document.getElementById('anipastaTelegramSupportPatch')) {
      const style = document.createElement('style');
      style.id = 'anipastaTelegramSupportPatch';
      style.textContent = `
        #anipastaTelegramPopup {
          position: fixed !important;
          inset: auto 18px 18px auto !important;
          z-index: 100001 !important;
          width: min(330px, calc(100vw - 24px)) !important;
          height: auto !important;
          display: block !important;
          padding: 0 !important;
          background: transparent !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: opacity .2s ease, visibility .2s ease;
        }

        #anipastaTelegramPopup.show {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
        }

        #anipastaTelegramPopup .anipastaTgBox {
          width: 100% !important;
          padding: 14px 46px 14px 14px !important;
          border: 1px solid var(--border-2) !important;
          border-radius: 12px !important;
          background: rgba(20, 20, 20, .97) !important;
          box-shadow: 0 14px 38px rgba(0,0,0,.5) !important;
          text-align: left !important;
          transform: translateY(8px) !important;
          transition: transform .2s ease !important;
          backdrop-filter: blur(16px) !important;
          -webkit-backdrop-filter: blur(16px) !important;
        }

        #anipastaTelegramPopup.show .anipastaTgBox {
          transform: translateY(0) !important;
        }

        #anipastaTelegramPopup .anipastaTgIcon {
          width: 30px !important;
          height: 30px !important;
          display: grid !important;
          place-items: center !important;
          margin: 0 0 9px !important;
          border-radius: 8px !important;
          background: rgba(34, 158, 217, .14) !important;
          color: var(--tg) !important;
        }

        #anipastaTelegramPopup .anipastaTgIcon svg {
          width: 17px !important;
          height: 17px !important;
          fill: currentColor !important;
        }

        #anipastaTelegramPopup .anipastaTgTitle {
          margin: 0 !important;
          color: var(--text) !important;
          font-size: 14px !important;
          font-weight: 800 !important;
          line-height: 1.3 !important;
        }

        #anipastaTelegramPopup .anipastaTgText {
          margin: 5px 0 11px !important;
          color: var(--muted) !important;
          font-size: 11px !important;
          line-height: 1.5 !important;
        }

        #anipastaTelegramPopup .anipastaTgJoin {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          min-height: 30px !important;
          padding: 0 11px !important;
          border: 1px solid rgba(34, 158, 217, .5) !important;
          border-radius: 7px !important;
          background: rgba(34, 158, 217, .14) !important;
          color: #7ed3ff !important;
          font-size: 11px !important;
          font-weight: 800 !important;
          text-decoration: none !important;
          transition: background .15s ease, border-color .15s ease, color .15s ease !important;
        }

        #anipastaTelegramPopup .anipastaTgJoin:hover {
          border-color: var(--tg) !important;
          background: rgba(34, 158, 217, .22) !important;
          color: #fff !important;
        }

        #anipastaTelegramPopup .anipastaTgClose {
          position: absolute !important;
          top: 8px !important;
          right: 8px !important;
          width: 28px !important;
          height: 28px !important;
          min-width: 28px !important;
          display: grid !important;
          place-items: center !important;
          border: 1px solid var(--border-2) !important;
          border-radius: 7px !important;
          background: var(--surface-2) !important;
          color: var(--muted) !important;
          font-size: 17px !important;
          line-height: 1 !important;
        }

        #anipastaTelegramPopup .anipastaTgClose:hover {
          border-color: var(--accent) !important;
          color: var(--text) !important;
        }

        @media (max-width: 540px) {
          #anipastaTelegramPopup {
            inset: auto 12px 12px 12px !important;
            width: auto !important;
          }

          #anipastaTelegramPopup .anipastaTgBox {
            padding: 13px 44px 13px 13px !important;
          }
        }
      `;
      document.head.appendChild(style);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTelegramSupportPopup, { once: true });
  } else {
    applyTelegramSupportPopup();
  }
})();
