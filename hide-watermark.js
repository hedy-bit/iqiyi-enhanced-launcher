(() => {
  const key = '__iqiyiLogoGuardV1';
  const version = 5;
  // PlayerHandler may become available after the first startup injection.
  if (window[key]?.version === version && window[key].status().nativeHook) return window[key].status();
  const previous = window[key]?.status();
  try { window[key]?.stop(); }
  catch (error) {
    // An older failed-initialization guard detached its observer, then tried to
    // restore an undefined native handler. Recover that specific startup state.
    if (previous?.nativeHook !== false) throw error;
    document.getElementById('iqiyi-local-watermark-guard')?.remove();
    delete window[key];
  }
  // Only the client's known default video watermark assets, never page branding.
  const selector = 'img[src*="/watermark_rightTop."],img[src*="/watermark_rightTop_"],img[src*="/watermark_rightBottom."]';
  // Verified player floating-ad component (Layer/Inlayer). Exclude full-screen
  // Whole overlays; keep normal player controls, subtitles and dialogs intact.
  const overlaySelector = '.ad-layer.overlayAd-container:not(.whole)';
  const styleId = 'iqiyi-local-watermark-guard';
  const state = {version, startedAt: Date.now(), active:previous?.active || false, timer: null, observer: null, pauseAdsClosed:previous?.pauseAdsClosed || 0, instantPauseCloses:previous?.instantPauseCloses || 0, nativePauseSwitchesBlocked:0, nativeHook:false};
  let nativeHandler, originalNativeCall, guardedNativeCall;
  try {
    let requireModule;
    window.webpackChunk_iqiyi_webapp?.push([['iqiyi_guard_native_v5_'+Date.now()],{},r=>{requireModule=r;}]);
    const handler = requireModule?.(33368)?.PlayerHandler;
    if (typeof handler?.call === 'function') {
      nativeHandler = handler;
      originalNativeCall = handler.call;
      guardedNativeCall = function(method, payload, ...rest) {
        // Suppress only the native switch to the pause-ad surface. Preserve
        // every other playback command and allow its original close command.
        if (method === 'set-string' && payload?.key === 'show_max_ad' && payload.value?.bshow === true) {
          state.nativePauseSwitchesBlocked++;
          payload = {...payload, value:{...payload.value, bshow:false}};
        }
        return originalNativeCall.call(this, method, payload, ...rest);
      };
      handler.call = guardedNativeCall;
      state.nativeHook = handler.call === guardedNativeCall;
    }
  } catch { /* Unknown future client: retain the verified immediate-close fallback. */ }
  const handledPauseButtons = new WeakSet();
  const handledPauseRoots = new WeakSet();
  function dismissPauseAd() {
    for (const root of document.querySelectorAll('[class*="pauseMax_pauseMax__"]')) {
      if (handledPauseRoots.has(root)) continue;
      // This component's onAdClose clears only the pause ad. The normal close
      // button calls it after a 500ms enlargement timer; it never resumes video.
      const fiberKey = Object.keys(root).find(k => k.startsWith('__reactFiber$'));
      let fiber = fiberKey && root[fiberKey];
      for (let depth = 0; fiber && depth < 12; depth++, fiber = fiber.return) {
        const props = fiber.memoizedProps;
        if (typeof props?.onAdClose !== 'function' || typeof props.allowVisible !== 'boolean' || !props.adData?.screenshot?.lwa_path || !props.playerSize) continue;
        handledPauseRoots.add(root);
        props.onAdClose();
        state.pauseAdsClosed++;
        state.instantPauseCloses++;
        break;
      }
    }
    for (const button of document.querySelectorAll('[class*="pauseMax_closeAdBtn__"]')) {
      if (handledPauseRoots.has(button.closest('[class*="pauseMax_pauseMax__"]'))) continue;
      if (handledPauseButtons.has(button)) continue;
      if (button.textContent.replace(/\s/g,'') !== '关闭广告，放大暂停画面') continue;
      const style = getComputedStyle(button);
      if (!button.getClientRects().length || style.display === 'none' || style.visibility === 'hidden') continue;
      // Use the player's own close action so its paused-frame layout also updates.
      handledPauseButtons.add(button);
      button.click();
      state.pauseAdsClosed++;
    }
  }
  function ensureStyle() {
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      (document.head || document.documentElement).appendChild(style);
    }
    const css = `${overlaySelector}{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;}` + `[class*="pauseMax_pauseMax__"]{opacity:0!important;pointer-events:none!important;}[class*="pauseMax_pauseMax__"],[class*="pauseMax_pauseMax__"] *{transition-duration:0s!important;transition-delay:0s!important;animation-duration:0.001ms!important;animation-delay:0s!important;animation-iteration-count:1!important;}` + (state.active ? `${selector}{opacity:0!important;pointer-events:none!important;}` : '');
    if (style.textContent !== css) style.textContent = css;
  }
  function scan() {
    const count = document.querySelectorAll(selector).length;
    if (count && !state.active && !state.timer) {
      state.timer = setTimeout(() => {state.active = true; state.timer = null; ensureStyle();}, 3000);
    }
    ensureStyle();
    dismissPauseAd();
  }
  state.observer = new MutationObserver(scan);
  state.observer.observe(document.documentElement, {childList:true, characterData:true, subtree:true, attributes:true, attributeFilter:['src','class','style','hidden']});
  state.status = () => ({
    active:state.active,
    version,
    pauseAdsClosed:state.pauseAdsClosed,
    instantPauseCloses:state.instantPauseCloses,
    nativeHook:state.nativeHook,
    nativePauseSwitchesBlocked:state.nativePauseSwitchesBlocked,
    overlayMatched:document.querySelectorAll(overlaySelector).length,
    overlayHidden:[...document.querySelectorAll(overlaySelector)].filter(e=>getComputedStyle(e).display==='none').length,
    matched:document.querySelectorAll(selector).length,
    hidden:[...document.querySelectorAll(selector)].filter(e=>getComputedStyle(e).opacity==='0').length
  });
  state.stop = () => {
    state.observer.disconnect(); clearTimeout(state.timer);
    if (nativeHandler && nativeHandler.call === guardedNativeCall) nativeHandler.call = originalNativeCall;
    document.getElementById(styleId)?.remove(); delete window[key];
  };
  window[key] = state;
  scan();
  return state.status();
})()
