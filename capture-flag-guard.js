(() => {
  const key='__iqiyiCaptureFlagGuardV1';
  if(window[key]) return window[key].status();
  window.__iqiyiCaptureFlagTestV1?.stop();
  let req;
  window.webpackChunk_iqiyi_webapp?.push([['capture_flag_guard_'+Date.now()],{},r=>req=r]);
  const store=req?.(96847)?.M_;
  if(!store || typeof store.setProp!=='function') return {installed:false,reason:'player store unavailable'};
  const original=store.setProp;
  let changes=0, stopped=false, savedFlag, hasSavedFlag=false;
  function normalize(value) {
    if(!value || typeof value!=='object') return value;
    savedFlag=value.forbid_record_screen;
    hasSavedFlag=Object.prototype.hasOwnProperty.call(value,'forbid_record_screen');
    if(value.forbid_record_screen!==false) changes++;
    return {...value,forbid_record_screen:false};
  }
  function wrapped(name,value,...args) {
    return original.call(this,name,name==='playMixer'?normalize(value):value,...args);
  }
  function force() {
    if(stopped) return;
    const value=store.getProp('playMixer');
    if(value && value.forbid_record_screen!==false) original.call(store,'playMixer',normalize(value));
  }
  store.setProp=wrapped;
  const initial=store.getProp('playMixer');
  if(initial) original.call(store,'playMixer',normalize(initial));
  const timer=setInterval(force,250);
  window[key]={
    status:()=>({installed:!stopped,hooked:store.setProp===wrapped,current:store.getProp('playMixer')?.forbid_record_screen,changes}),
    stop:()=>{
      stopped=true;clearInterval(timer);
      if(store.setProp===wrapped) {
        store.setProp=original;
        const value=store.getProp('playMixer');
        if(value) {
          const restored={...value};
          if(hasSavedFlag) restored.forbid_record_screen=savedFlag;
          else delete restored.forbid_record_screen;
          original.call(store,'playMixer',restored);
        }
      }
      delete window[key];
    }
  };
  return window[key].status();
})();
