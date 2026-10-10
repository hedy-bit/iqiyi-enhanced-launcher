import {readFile, appendFile, writeFile, stat, rename} from 'node:fs/promises';
import {connect, playerTargets} from './cdp.mjs';
import {launchPotPlayer} from './potplayer.mjs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const source = await readFile(new URL('./hide-watermark.js', import.meta.url), 'utf8');
const externalSource = await readFile(new URL('./potplayer-button.js', import.meta.url), 'utf8');
const openingAdSource = await readFile(new URL('./skip-opening-ads.js', import.meta.url), 'utf8');
const captureFlagSource = await readFile(new URL('./capture-flag-guard.js', import.meta.url), 'utf8');
const pageAdSource = await readFile(new URL('./page-ad-guard.js', import.meta.url), 'utf8');
const once = process.argv.includes('--once');
const restore = process.argv.includes('--restore');
const statusOnly = process.argv.includes('--status');
const logPath = new URL('./runtime.log', import.meta.url);
const statusPath = new URL('./status.json', import.meta.url);
let lastSummary = '';
let nativeRuntime=null, nextNativeStart=0;
function ensureNativeRuntime(){
  if(once||restore||statusOnly||nativeRuntime||Date.now()<nextNativeStart)return;
  nextNativeStart=Date.now()+10000;
  const child=spawn('C:\\ProgramData\\anaconda3\\python.exe',[
    fileURLToPath(new URL('./native-capture-guard.py',import.meta.url)),'--managed'
  ],{windowsHide:true,shell:false,stdio:['pipe','ignore','ignore']});
  nativeRuntime=child;
  child.on('error',error=>{log('Native capture worker error: '+error.message).catch(()=>{});});
  child.on('close',()=>{if(nativeRuntime===child)nativeRuntime=null;});
}
async function log(message) {
  if ((await stat(logPath).catch(()=>({size:0}))).size > 1048576) await rename(logPath,new URL('./runtime.previous.log',import.meta.url)).catch(()=>{});
  await appendFile(logPath,`${new Date().toISOString()} ${message}\n`);
}
do {
  ensureNativeRuntime();
  const summary = [];
  try {
    for (const target of await playerTargets()) {
      const c = await connect(target.webSocketDebuggerUrl);
      try {
        const expression = restore ? 'window.__iqiyiLogoGuardV1?.stop();window.__iqiyiPotPlayerV1?.stop();window.__iqiyiOpeningAdGuardV1?.stop();window.__iqiyiCaptureFlagTestV1?.stop();window.__iqiyiCaptureFlagGuardV1?.stop();window.__iqiyiPageAdsGuardV1?.stop()' : statusOnly ? '({...window.__iqiyiLogoGuardV1?.status(),pageAds:window.__iqiyiPageAdsGuardV1?.status()})' : source;
        const result = await c.send('Runtime.evaluate',{expression,returnByValue:true});
        if(result.exceptionDetails) throw new Error(result.exceptionDetails.text);
        summary.push({page:new URL(target.url).pathname, ...result.result.value});
        if(!restore&&!statusOnly){
          const ads=await c.send('Runtime.evaluate',{expression:pageAdSource,returnByValue:true});
          if(ads.exceptionDetails)throw new Error(ads.exceptionDetails.text);
          summary[summary.length-1].pageAds=ads.result.value;
        }
        if(!restore&&!statusOnly&&new URL(target.url).pathname!=='/index.html'){
          const capture=await c.send('Runtime.evaluate',{expression:captureFlagSource,returnByValue:true});
          if(capture.exceptionDetails) throw new Error(capture.exceptionDetails.text);
          summary[summary.length-1].captureFlag=capture.result.value;
          const opening=await c.send('Runtime.evaluate',{expression:openingAdSource,returnByValue:true});
          summary[summary.length-1].openingAds=opening.result.value;
          await c.send('Runtime.evaluate',{expression:externalSource,returnByValue:true});
          const pending=await c.send('Runtime.evaluate',{expression:'window.__iqiyiPotPlayerV1?.take()',returnByValue:true});
          const request=pending.result.value;
          if(request){
            let message='已交给 PotPlayer 打开';
            try{
              if(request.kind==='url'){
                // Ask Chromium only for cookies matching this exact media URL.
                // Never copy unrelated account cookies to a different host.
                const cookieResult=await c.send('Network.getCookies',{urls:[request.source]});
                const agent=await c.send('Runtime.evaluate',{expression:'navigator.userAgent',returnByValue:true});
                request.headers={'User-Agent':agent.result.value};
                if(cookieResult.cookies?.length)request.headers.Cookie=cookieResult.cookies.map(x=>x.name+'='+x.value).join('; ');
              }
              await launchPotPlayer(request);
            }catch(e){message='无法打开：'+e.message;}
            await c.send('Runtime.evaluate',{expression:`window.__iqiyiPotPlayerV1?.finish(${JSON.stringify(request.id)},${JSON.stringify(message)})`});
          }
        }
      } finally { c.close(); }
    }
    const text = JSON.stringify(summary);
    if (text !== lastSummary) {await log(text); lastSummary=text;}
    await writeFile(statusPath,JSON.stringify({checkedAt:new Date().toISOString(),connected:true,pages:summary},null,2));
    if (once || statusOnly || restore) console.log(text);
  } catch (error) {
    const message = `${error.name}: ${error.message}`;
    if (message!==lastSummary) {await log(message);lastSummary=message;}
    await writeFile(statusPath,JSON.stringify({checkedAt:new Date().toISOString(),connected:false,pages:[],error:message},null,2));
    if(once||statusOnly||restore) {console.error(message);process.exitCode=1;}
  }
  if(once||statusOnly||restore) break;
  await new Promise(resolve=>setTimeout(resolve,2500));
} while (true);
