(function (root) {
  'use strict';
  function accumulate(state, now, active) {
    const gap = Math.max(0, now - state.last);
    if (gap >= 10 * 60000) state.minutes = 0;
    else if (active) state.minutes += Math.min(gap, 15000) / 60000;
    state.last = now;
    return state;
  }
  if (typeof module === 'object' && module.exports) { module.exports = { accumulate }; return; }
  const d = root.document;
  let lastInteraction = Date.now(), lastActive = Date.now(), nextNudge = 30, pausedUntil = 0;
  const state = { minutes: 0, last: Date.now() };
  const style = d.createElement('style');
  style.textContent = '.forge-care{position:fixed;right:16px;bottom:100px;z-index:10000;width:min(360px,calc(100vw - 32px));padding:18px;background:#131722;color:#f4f1e8;border:1px solid #e6b85c;border-radius:10px;box-shadow:0 8px 40px #0009;font:14px/1.5 "Segoe UI",sans-serif}.forge-care[hidden]{display:none}.forge-care p{color:#c7cbd5}.forge-care button{margin:4px;padding:8px 10px;border:1px solid #444b60;border-radius:6px;background:#242938;color:#f4f1e8;cursor:pointer}.forge-care a{color:#7aa2ff}.forge-care-toggle{position:fixed;right:12px;bottom:8px;z-index:9999;font:11px "Segoe UI",sans-serif;padding:5px 9px;background:#131722;color:#c7cbd5;border:1px solid #242938;border-radius:5px}';
  d.head.append(style);
  const panel = d.createElement('aside'); panel.className = 'forge-care'; panel.hidden = true; panel.setAttribute('aria-label','Time and support');
  const toggle = d.createElement('button'); toggle.type = 'button'; toggle.className = 'forge-care-toggle'; toggle.textContent = 'Time & support';
  d.body.append(panel,toggle);
  function button(label, action) { const b=d.createElement('button'); b.type='button'; b.textContent=label; b.onclick=action; panel.append(b); }
  function show(text) { panel.replaceChildren(); const p=d.createElement('p'); p.textContent=text; p.setAttribute('role','status'); panel.append(p); panel.hidden=false; }
  function support() {
    show('If you want to hurt yourself or someone else, tell someone you trust and seek help now. Move away from anything you could use to cause harm. If anyone is in immediate danger, call your local emergency number. For suicide crisis support in the US or Canada, call or text 988. Elsewhere, use your local crisis service.');
    for (const [label,url] of [['US: 988 Lifeline','https://988lifeline.org/'],['Canada: 9-8-8','https://988.ca/']]) { const a=d.createElement('a'); a.href=url; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent=label; panel.append(a,d.createElement('br')); }
    button('Return to chat',()=>{ pausedUntil=0; panel.hidden=true; });
  }
  function pause() {
    pausedUntil=Date.now()+10*60000; show('A ten-minute pause. Stand up, get some water, or take one useful step offline. Your conversation will be here when you return.');
    button('Resume now',()=>{pausedUntil=0;nextNudge=state.minutes+30;panel.hidden=true;}); button('Get support',support);
  }
  function nudge() {
    show(state.minutes>=60 ? 'You have spent about an hour actively using Forge. This is a good stopping point. Consider taking a longer break or turning your next step into action offline.' : 'About 30 minutes of active use. Would a short break help? Your conversation will wait.');
    button('Take 10 minutes',pause); button('Five more minutes',()=>{nextNudge=state.minutes+5;panel.hidden=true;}); button('Get support',support);
  }
  toggle.onclick=()=>{ show(`About ${Math.floor(state.minutes)} active minutes this visit. Forge should support your life beyond this screen.`); button('Take a break',pause); button('Get support',support); button('Close',()=>panel.hidden=true); };
  for(const event of ['pointerdown','keydown','touchstart']) d.addEventListener(event,()=>{lastInteraction=Date.now();},{passive:true});
  function blockDuringPause(event) {
    if(Date.now()>=pausedUntil) return;
    const sending = (event.type==='submit' && event.target.id==='composer') || (event.type==='click' && event.target.closest?.('#send')) || (event.type==='keydown' && event.target.id==='prompt' && event.key==='Enter' && !event.shiftKey);
    if(sending) { event.preventDefault();event.stopImmediatePropagation();show('Your break is active. Resume whenever you need to, including if you need support.');button('Resume now',()=>{pausedUntil=0;panel.hidden=true;});button('Get support',support); }
  }
  for(const event of ['submit','click','keydown']) d.addEventListener(event,blockDuringPause,true);
  root.setInterval(()=>{
    const now=Date.now();
    const chat=d.querySelector('#consolePanel');
    const active=!d.hidden && (!chat || !chat.hidden) && now-lastInteraction<60000;
    if(active) { if(now-lastActive>=10*60000){state.minutes=0;nextNudge=30;} lastActive=now; }
    accumulate(state,now,active);
    if(pausedUntil && now>=pausedUntil){pausedUntil=0;state.minutes=0;nextNudge=30;panel.hidden=true;}
    if(active && !pausedUntil && !panel.hidden) return;
    if(active && !pausedUntil && state.minutes>=nextNudge){nextNudge=state.minutes+30;nudge();}
  },10000);
})(typeof window==='object'?window:globalThis);
