import {spawn} from 'node:child_process';
import {access,stat} from 'node:fs/promises';
import path from 'node:path';
export const potPlayer='C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe';
const extensions=new Set(['.mp4','.mkv','.avi','.mov','.wmv','.webm','.flv','.ts','.m2ts','.m4v','.mpg','.mpeg','.m3u8','.mpd']);
export function validateRequest(request){
  if(!request||!['file','url'].includes(request.kind)||typeof request.source!=='string'||request.source.length>12000||/[\x00-\x1f]/.test(request.source))throw new Error('无效的播放源');
  if(request.kind==='file'){
    if(!/^[A-Za-z]:[\\/]/.test(request.source)||!extensions.has(path.win32.extname(request.source).toLowerCase()))throw new Error('仅支持普通本地媒体文件');
  }else{
    const u=new URL(request.source);
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!extensions.has(path.posix.extname(u.pathname).toLowerCase()))throw new Error('仅支持 HTTP(S) 媒体直链');
  }
  return request.source;
}
export async function launchPotPlayer(request){
  const source=validateRequest(request);
  const args=buildPlayerArgs(request);
  await access(potPlayer);
  if(request.kind==='file' && !(await stat(source)).isFile())throw new Error('视频文件不存在');
  await new Promise((resolve,reject)=>{
    // No shell: the source is one media argument, never an executable command.
    const child=spawn(potPlayer,args,{shell:false,detached:true,stdio:'ignore',windowsHide:false});
    child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});
  });
}
export function buildPlayerArgs(request){
  const args=[validateRequest(request)];
  if(request.headers!==undefined){
    if(request.kind!=='url'||!request.headers||typeof request.headers!=='object'||Array.isArray(request.headers))throw new Error('无效的媒体请求头');
    const supported=new Set(['cookie','authorization','user-agent','referer']);
    const headers=[];
    let size=0;
    for(const [name,value] of Object.entries(request.headers)){
      if(!supported.has(name.toLowerCase())||typeof value!=='string'||/[\x00-\x1f\x7f]/.test(value))throw new Error('无效的媒体请求头');
      size+=name.length+value.length;
      if(size>16000)throw new Error('媒体请求头过长');
      if(value)headers.push(name+': '+value);
    }
    if(headers.length)args.push('/headers='+headers.join('\r\n'));
  }
  return args;
}
