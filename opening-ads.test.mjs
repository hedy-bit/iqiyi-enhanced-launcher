import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('./skip-opening-ads.js',import.meta.url),'utf8');
async function run({playing='ad_pause',current=5,duration=16000,slotType=15,fail=false}={}){
  const seeks=[];let ad={adId:1,data:{duration,slotType}};
  const store={getProp(k){return ({videoData:{tvId:'episode-1'},playState:playing,ad_brief_playing:true,ad_brief_data:ad})[k];},onPropChanged(){return {dispose(){}};}};
  const player={get curTime(){return current;},totalTime:1870,async seekTo(n){seeks.push(n);if(fail)throw new Error('Rejected');current=n;if(ad.adId===1){ad={adId:2,data:{duration:15000,slotType:15}};}else{playing='play';}}};
  const window={webpackChunk_iqiyi_webapp:{push(c){c[2](id=>id===96847?{M_:store,T:store}:{C:{videoPlayerInstance:player}});}}};
  const context=vm.createContext({window,queueMicrotask,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){}});
  vm.runInContext(source,context);
  await new Promise(setImmediate);await new Promise(setImmediate);
  const status=window.__iqiyiOpeningAdGuardV1.status();window.__iqiyiOpeningAdGuardV1.stop();return {seeks,status};
}
test('skips two opening ad components and stops when program state resumes',async()=>{
  const r=await run();assert.deepEqual(r.seeks,[16,31]);assert.equal(r.status.skipped,2);
});
test('does not seek normal content, mid-rolls, wrong slots or implausible durations',async()=>{
  for(const options of [{playing:'play'},{current:100},{slotType:1},{duration:999999},{duration:0}])assert.deepEqual((await run(options)).seeks,[]);
});
test('a rejected seek is not repeated indefinitely',async()=>{
  const r=await run({fail:true});assert.deepEqual(r.seeks,[16]);assert.equal(r.status.skipped,0);
});
