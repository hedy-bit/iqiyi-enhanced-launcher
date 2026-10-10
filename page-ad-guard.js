(() => {
  const key='__iqiyiPageAdsGuardV1',version=4;
  if(window[key]?.version===version)return window[key].status();
  const previous=window[key]?.status();
  window[key]?.stop();
  const styleId='iqiyi-local-page-ad-guard',mark='data-iqiyi-page-ad-hidden';
  const splash='[class*="adScreen_container"],[class*="adScreenNew_container"]';
  const film='[class*="filmFeed_filmFeed__"]';
  // filmFeed_ad__ is also used on ordinary movie posters. Require an actual
  // advertising badge/disclosure instead of the image styling class.
  const filmAd='[class*="filmFeed_adBadge__"],[class*="filmFeed_closeAdText__"]';
  const horizontal='[class*="videoListAdVideo_container__"]';
  const banner='[class*="banner_adBanner__"]';
  const feedAd='[class*="videolist_adTitleBox__"]';
  const cardSlot='[class*="flexResp_cardRespItem__"]';
  const list='[class*="list_list__"]';
  const closed=new WeakSet();
  const carousels=new Map();
  let carouselSkipped=0;
  function isCarouselAd(item){
    return !!item&&(item.isAd===true||item.isGame===true||
      [item.desc1,item.desc,item.title].some(v=>typeof v==='string'&&/[【\[]广告[】\]]/.test(v)));
  }
  function allowedIndex(videos,index){
    if(!Number.isInteger(index)||!isCarouselAd(videos?.[index]))return index;
    for(let step=1;step<=videos.length;step++){
      const next=(index+step)%videos.length;
      if(!isCarouselAd(videos[next]))return next;
    }
    return -1;
  }
  function scanCarousels(){
    const live=new Set();
    for(const e of document.querySelectorAll('[class*="thumbnail_thumbnailItemWrap__"]')){
      let fiber=e[Object.keys(e).find(k=>k.startsWith('__reactFiber$'))];
      let itemFound=false;
      for(let depth=0;fiber&&depth<24;depth++,fiber=fiber.return){
        const props=fiber.memoizedProps;
        if(!itemFound&&props?.item&&Number.isInteger(props.index)){
          itemFound=true;
          if(isCarouselAd(props.item))hide(e,'carousel');
          else if(e.getAttribute(mark)==='carousel')e.removeAttribute(mark);
        }
        const instance=fiber.stateNode;
        if(!Array.isArray(instance?.state?.videos)||typeof instance.onSelect!=='function')continue;
        live.add(instance);
        if(!carousels.has(instance)){
          const original=instance.onSelect;
          const wrapped=function(index,...args){
            const next=allowedIndex(this.state.videos,index);
            if(next!==index)carouselSkipped++;
            if(next<0)return;
            return original.call(this,next,...args);
          };
          instance.onSelect=wrapped;
          carousels.set(instance,{original,wrapped});
        }
        break;
      }
    }
    for(const [instance,record] of carousels){
      if(!live.has(instance)){
        if(instance.onSelect===record.wrapped)instance.onSelect=record.original;
        carousels.delete(instance);continue;
      }
      if(isCarouselAd(instance.state.videos[instance.state.selectedIndex]))
        instance.onSelect(instance.state.selectedIndex,{keepThumbPageIfHotArea:true});
    }
  }
  let stopped=false,queued=false,splashClosed=previous?.splashClosed||0;
  const css=[splash,horizontal,banner,
    `${film}:has(${filmAd})`,
    `${cardSlot}:has(${horizontal},${filmAd})`,
    `[${mark}]`
  ].join(',')+'{display:none!important;visibility:hidden!important;pointer-events:none!important;}';
  function ensureStyle(){
    let style=document.getElementById(styleId);
    if(!style){style=document.createElement('style');style.id=styleId;(document.head||document.documentElement).appendChild(style);}
    if(style.textContent!==css)style.textContent=css;
  }
  function hide(element,kind){
    if(element&&element.getAttribute(mark)!==kind)element.setAttribute(mark,kind);
  }
  function scan(){
    queued=false;if(stopped)return;
    ensureStyle();
    scanCarousels();
    // Clear recycled card marks when the virtual list replaces an ad with a video.
    for(const e of document.querySelectorAll(`[${mark}]`)){
      const kind=e.getAttribute(mark);
      const selector=kind==='film'?filmAd:kind==='horizontal'?horizontal:kind==='banner'?banner:kind==='feed'?feedAd:null;
      if(selector&&!e.matches(selector)&&!e.querySelector(selector))e.removeAttribute(mark);
      if(kind==='empty-row')e.removeAttribute(mark);
    }
    for(const e of document.querySelectorAll(filmAd))hide(e.closest(cardSlot)||e.closest(film),'film');
    for(const e of document.querySelectorAll(horizontal))hide(e.closest(cardSlot)||e,'horizontal');
    for(const e of document.querySelectorAll(banner))hide(e.closest('[class*="blockListItem_blockItem__"]')||e,'banner');
    for(const e of document.querySelectorAll(feedAd)){
      const parentList=e.closest(list);
      if(!parentList)continue;
      let card=e;
      while(card.parentElement&&card.parentElement!==parentList)card=card.parentElement;
      if(card.parentElement===parentList)hide(card,'feed');
    }
    for(const row of document.querySelectorAll('[class*="flexResp_cardRespRow__"]')){
      const children=[...row.children];
      if(children.length&&children.every(e=>e.hasAttribute(mark)||getComputedStyle(e).display==='none'))hide(row,'empty-row');
    }
    for(const root of document.querySelectorAll(splash)){
      if(closed.has(root))continue;
      const fiberKey=Object.keys(root).find(k=>k.startsWith('__reactFiber$'));
      let fiber=fiberKey&&root[fiberKey];
      for(let depth=0;fiber&&depth<16;depth++,fiber=fiber.return){
        const props=fiber.memoizedProps;
        if(typeof props?.onClose==='function'&&props.data?.ad){
          closed.add(root);
          try{props.onClose();splashClosed++;}catch{}
          break;
        }
      }
    }
  }
  function schedule(){if(!queued&&!stopped){queued=true;queueMicrotask(scan);}}
  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  const carouselTimer=setInterval(schedule,500);
  function status(){
    const counts={};
    for(const e of document.querySelectorAll(`[${mark}]`)){
      const kind=e.getAttribute(mark);counts[kind]=(counts[kind]||0)+1;
    }
    return {version,styleInstalled:!!document.getElementById(styleId),splashClosed,hidden:counts,
      carouselSkipped,carousels:carousels.size,
      selectedCarouselAds:[...carousels.keys()].filter(s=>isCarouselAd(s.state.videos[s.state.selectedIndex])).length};
  }
  window[key]={version,status,stop(){
    stopped=true;observer.disconnect();document.getElementById(styleId)?.remove();
    clearInterval(carouselTimer);
    for(const [instance,r] of carousels)if(instance.onSelect===r.wrapped)instance.onSelect=r.original;
    carousels.clear();
    for(const e of document.querySelectorAll(`[${mark}]`))e.removeAttribute(mark);
    delete window[key];
  }};
  scan();return status();
})()
