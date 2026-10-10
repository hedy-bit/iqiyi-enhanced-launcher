(() => {
  const key='__iqiyiOpeningAdGuardV1';
  if(window[key])return window[key].status();
  let req;
  window.webpackChunk_iqiyi_webapp?.push([['iqiyi_opening_ads_'+Date.now()],{},r=>req=r]);
  let model,player;
  try{model=req(96847);player=req(35557).C.videoPlayerInstance;}catch{return {ready:false};}
  if(typeof player?.seekTo!=='function')return {ready:false};
  const state={videoId:null,end:0,attempted:new Set(),pending:false,skipped:0,lastResult:'',stopped:false};
  const subscriptions=[];
  let queued=false;
  async function scan(){
    if(state.stopped||state.pending)return;
    const video=model.T.getProp('videoData');
    if(!video?.tvId)return;
    const id=String(video.tvId);
    if(state.videoId!==id){state.videoId=id;state.end=0;state.attempted.clear();state.skipped=0;state.lastResult='';}
    const playing=model.T.getProp('playState');
    if(!['ad_play','ad_playing','ad_pause'].includes(playing))return;
    if(!model.M_.getProp('ad_brief_playing'))return;
    const ad=model.M_.getProp('ad_brief_data');
    if(ad?.data?.slotType!==15||ad.adId==null)return;
    const duration=Number(ad.data.duration)/1000,current=Number(player.curTime);
    if(!Number.isFinite(duration)||duration<=0||duration>60||!Number.isFinite(current))return;
    const adId=String(ad.adId);
    if(state.attempted.has(adId)||state.attempted.size>=5)return;
    // Only the opening ad sequence, never mid-rolls or normal program footage.
    if(!state.end && (current<0||current>30||current>duration))return;
    if(state.end && (current<state.end-1||current>state.end+2))return;
    const target=state.end+duration;
    if(target<=current||target>180||target>=Number(player.totalTime))return;
    state.attempted.add(adId);state.pending=true;
    let timeout;
    try{
      await Promise.race([player.seekTo(target),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('跳转超时')),4000);})]);
      if(Math.abs(Number(player.curTime)-target)>2)throw new Error('进度未到达广告末尾');
      state.end=target;state.skipped++;state.lastResult='已跳到 '+target+' 秒';
    }catch(e){state.lastResult=String(e?.message||e);}
    finally{clearTimeout(timeout);state.pending=false;schedule();}
  }
  function schedule(){if(queued||state.stopped)return;queued=true;queueMicrotask(()=>{queued=false;scan();});}
  for(const prop of ['ad_brief_data','ad_brief_playing'])subscriptions.push(model.M_.onPropChanged(prop,schedule));
  for(const prop of ['playState','videoData'])subscriptions.push(model.T.onPropChanged(prop,schedule));
  const timer=setInterval(schedule,500);
  state.status=()=>({ready:true,videoId:state.videoId,skipped:state.skipped,end:state.end,pending:state.pending,lastResult:state.lastResult});
  state.stop=()=>{state.stopped=true;clearInterval(timer);for(const s of subscriptions)s?.dispose();delete window[key];};
  window[key]=state;schedule();return state.status();
})()
