// Runs only inside the local iQIYI processes selected by the Python controller.
const user=Process.getModuleByName('user32.dll');
const api=(name,ret,args)=>new NativeFunction(user.getExportByName(name),ret,args);
const owner=api('GetWindowThreadProcessId','uint',['pointer','pointer']);
const getAffinity=api('GetWindowDisplayAffinity','int',['pointer','pointer']);
const setAffinity=api('SetWindowDisplayAffinity','int',['pointer','uint']);
const enumerate=api('EnumWindows','int',['pointer','pointer']);
let enabled=true, banned=false, blocked=0, lastError=null;
const saved=new Map();
function owned(hwnd) {
  const pid=Memory.alloc(4);owner(hwnd,pid);return pid.readU32()===Process.id;
}
function read(hwnd) {
  const value=Memory.alloc(4);
  return getAffinity(hwnd,value)?value.readU32():null;
}
const hook=Interceptor.attach(user.getExportByName('SetWindowDisplayAffinity'),{
  onEnter(args) {
    if(!enabled||!owned(args[0]))return;
    const requested=args[1].toUInt32();
    const desired=banned?1:0;
    if(requested!==desired){blocked++;args[1]=ptr(desired);}
  }
});
function windows(change) {
  const result=[];
  const callback=new NativeCallback(hwnd=>{
    if(!owned(hwnd))return 1;
    const before=read(hwnd);
    if(before===null)return 1;
    const key=hwnd.toString();
    const desired=banned?1:0;
    if(change && before!==desired) {
      if(!saved.has(key))saved.set(key,before);
      if(!setAffinity(hwnd,desired))lastError='SetWindowDisplayAffinity returned false';
    }
    result.push({hwnd:key,affinity:read(hwnd)});
    return 1;
  },'int',['pointer','pointer']);
  enumerate(callback,ptr(0));
  return result;
}
rpc.exports={
  identity:()=>({pid:Process.id,path:Process.mainModule.path}),
  tick(isBan){
    if(typeof isBan!=='boolean')throw new Error('is_ban must be boolean');
    banned=isBan;
    return {pid:Process.id,is_ban:banned,blocked,windows:windows(true),lastError};
  },
  test(){
    const target=windows(false).find(x=>x.affinity===0);
    if(!target||banned)return {tested:false};
    const hwnd=ptr(target.hwnd);
    try {
      const beforeCount=blocked;
      setAffinity(hwnd,1);
      return {tested:true,requested:1,actual:read(hwnd),intercepted:blocked>beforeCount};
    } finally {setAffinity(hwnd,0);}
  },
  stop(){
    enabled=false;hook.detach();
    for(const [key,value] of saved) {
      const hwnd=ptr(key);if(owned(hwnd))setAffinity(hwnd,value);
    }
    saved.clear();
  }
};
