import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('./potplayer-button.js',import.meta.url),'utf8');
function resolve(video){
 const window={webpackChunk_iqiyi_webapp:{push:x=>x[2](()=>({T:{getProp:()=>video}}))}};
 const document={querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,documentElement:{}};
 return vm.runInNewContext(code,{window,document,URL,MutationObserver:class{observe(){}disconnect(){}},setInterval:()=>1,clearInterval(){}});
}
const flags={data:{ctl:{drm:true},program:{video:[{drmType:5}]}}};
test('metadata flags do not reject an otherwise usable local source',()=>{
 assert.equal(resolve({isLocal:true,path:'C:\\Videos\\sample.mp4',movieJSON:flags}).available,true);
});
test('metadata flags do not reject a direct media URL',()=>{
 assert.equal(resolve({videoURL:'https://example.com/video.mp4',movieJSON:flags}).available,true);
});
test('missing media is reported as missing, not proof of DRM',()=>{
 const result=resolve({path:'',videoURL:'',movieJSON:flags});
 assert.equal(result.available,false);
 assert.match(result.reason,/未找到/);
 assert.doesNotMatch(result.reason,/DRM/);
});
test('a watch page is not passed off as a media source',()=>{
 assert.equal(resolve({videoURL:'https://www.iqiyi.com/v_example.html'}).available,false);
});
