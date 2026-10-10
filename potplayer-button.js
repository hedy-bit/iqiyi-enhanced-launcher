(() => {
  const key='__iqiyiPotPlayerV1';
  if(window[key]?.version===3)return window[key].status();
  window[key]?.stop();
  let req;
  window.webpackChunk_iqiyi_webapp?.push([['iqiyi_potplayer_'+Date.now()],{},r=>req=r]);
  let store;
  try{store=req?.(96847)?.T;}catch{}
  const state={version:3,queue:[],busy:false,lastResult:'',identity:null,observer:null,timer:null};
  const media=/\.(mp4|mkv|avi|mov|wmv|webm|flv|ts|m2ts|m4v|mpg|mpeg|m3u8|mpd)$/i;
  function source(){
    const v=store?.getProp('videoData');
    if(!v)return {ok:false,reason:'请先选择并播放视频'};
    const candidates=[v.path,v.videoURL,...[...document.querySelectorAll('video')].map(e=>e.currentSrc)];
    if(v.isLocal){
      for(const item of candidates){if(typeof item==='string' && /^[A-Za-z]:[\\/]/.test(item) && media.test(item))return {ok:true,kind:'file',source:item,title:v.name||''};}
    }
    for(const item of candidates){
      try{const u=new URL(item);if(['https:','http:'].includes(u.protocol) && media.test(u.pathname))return {ok:true,kind:'url',source:u.href,title:v.name||''};}catch{}
    }
    return {ok:false,reason:'尚未找到当前影片的媒体文件或播放直链'};
  }
  function refresh(){
    const current=store?.getProp('videoData');
    const identity=current?.tvId||current?.path||current?.videoURL||'';
    if(identity!==state.identity){state.identity=identity;state.lastResult='';}
    const anchor=document.querySelector('[class*="actionBar_followVideoBtn__"]');
    if(!anchor)return;
    let bar=anchor;
    for(let n=0;n<5 && bar;n++,bar=bar.parentElement){if(typeof bar.className==='string' && /actionBar_/.test(bar.className) && bar.querySelector('[data-ai-entity="下载按钮"]'))break;}
    if(!bar || !bar.parentElement)return;
    let box=document.getElementById('iqiyi-potplayer-panel');
    if(!box){
      box=document.createElement('div');box.id='iqiyi-potplayer-panel';
      box.style.cssText='margin:8px 0 12px;width:100%;box-sizing:border-box;font-family:inherit;';
      const button=document.createElement('button');button.type='button';button.id='iqiyi-potplayer-button';button.textContent='▶  PotPlayer 播放';
      button.style.cssText='display:block;width:100%;height:36px;border:1px solid #00b95b;border-radius:8px;background:#153c2b;color:#5cf49c;font:inherit;font-size:14px;cursor:pointer;';
      const note=document.createElement('div');note.id='iqiyi-potplayer-note';note.setAttribute('role','status');note.style.cssText='font-size:12px;line-height:18px;color:#a9adae;margin-top:5px;';
      button.onclick=()=>{
        if(state.busy)return;
        const s=source();
        if(!s.ok){state.lastResult=s.reason;refresh();return;}
        state.busy=true;state.lastResult='正在打开 PotPlayer…';
        state.queue.push({id:Date.now().toString(36),...s});refresh();
      };
      box.append(button,note);bar.insertAdjacentElement('afterend',box);
    }
    const s=source(),button=box.querySelector('button'),note=box.querySelector('[role="status"]');
    const message=state.busy?'正在打开 PotPlayer…':state.lastResult||(!s.ok?s.reason:'使用 PotPlayer 播放当前视频');
    if(note.textContent!==message)note.textContent=message;
    button.disabled=state.busy;
    button.title=s.ok?'在 PotPlayer 中打开当前视频':s.reason;
      button.setAttribute('aria-disabled',String(state.busy));
  }
  state.take=()=>state.queue.shift()||null;
  state.finish=(id,message)=>{state.busy=false;state.lastResult=message;refresh();};
  state.status=()=>({version:state.version,button:!!document.getElementById('iqiyi-potplayer-button'),available:source().ok,reason:source().reason||'',busy:state.busy});
  state.stop=()=>{state.observer.disconnect();clearInterval(state.timer);document.getElementById('iqiyi-potplayer-panel')?.remove();delete window[key];};
  window[key]=state;
  state.observer=new MutationObserver(refresh);state.observer.observe(document.documentElement,{subtree:true,childList:true});
  state.timer=setInterval(refresh,2000);refresh();return state.status();
})()
