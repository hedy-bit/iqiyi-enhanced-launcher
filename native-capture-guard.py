"""Local iQIYI capture guard. No network service, uploads, or executable patches."""
import json, sys, threading, time, ctypes
from pathlib import Path

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'vendor'))
import frida

kernel=ctypes.WinDLL('kernel32',use_last_error=True)
kernel.CreateMutexW.restype=ctypes.c_void_p
kernel.CreateMutexW.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_wchar_p]
mutex=kernel.CreateMutexW(None,False,'Local\\HedyIqiyiNativeCaptureGuardV1')
if not mutex or ctypes.get_last_error()==183:
    raise SystemExit('Native capture guard already running or mutex unavailable')

stop=threading.Event()
if '--managed' in sys.argv:
    def watch_parent():
        sys.stdin.read()
        stop.set()
    threading.Thread(target=watch_parent,daemon=True).start()

settings=json.loads((ROOT/'config.json').read_text(encoding='utf-8-sig'))
install=Path(settings['InstallRoot']).resolve()
source=(ROOT/'native-capture-guard.js').read_text(encoding='utf-8')
device=frida.get_local_device()
sessions={}
retry_after={}
last_report=None

def write_status(value):
    global last_report
    text=json.dumps(value,ensure_ascii=False)
    (ROOT/'native-capture-status.json').write_text(text,encoding='utf-8')
    summary=json.dumps(value.get('processes'),ensure_ascii=False)
    if summary!=last_report:
        log=ROOT/'native-capture.log'
        if log.exists() and log.stat().st_size>1048576:
            log.replace(ROOT/'native-capture.previous.log')
        with log.open('a',encoding='utf-8') as f:
            f.write(text+'\n')
        last_report=summary

try:
    while not stop.is_set() and not (ROOT/'STOP').exists():
        reports=[]
        try:
            config=json.loads((ROOT/'capture-settings.json').read_text(encoding='utf-8-sig'))
            banned=config['is_ban']
            if type(banned) is not bool:
                raise ValueError('is_ban must be a JSON boolean')
            processes=[p for p in device.enumerate_processes() if p.name.lower() in ('qyplayer.exe','qyclient.exe')]
            live={p.pid for p in processes}
            for pid in list(sessions):
                if pid not in live:
                    session,script=sessions.pop(pid)
                    try: session.detach()
                    except frida.Error: pass
            for p in processes:
                try:
                    if p.pid not in sessions:
                        if retry_after.get(p.pid,0)>time.monotonic():continue
                        session=device.attach(p.pid)
                        try:
                            # Validate the executable before installing any hook.
                            check=session.create_script('rpc.exports={path:()=>Process.mainModule.path};')
                            check.load()
                            actual=Path(check.exports_sync.path()).resolve()
                            check.unload()
                            if not actual.is_relative_to(install) or actual.name.lower()!=p.name.lower():
                                raise ValueError('Target outside configured iQIYI installation')
                            script=session.create_script(source)
                            script.load()
                            sessions[p.pid]=(session,script)
                        except Exception:
                            session.detach()
                            raise
                    session,script=sessions[p.pid]
                    result=script.exports_sync.tick(banned)
                    result['name']=p.name
                    if '--self-test' in sys.argv:
                        result['test']=script.exports_sync.test()
                    reports.append(result)
                except Exception as e:
                    reports.append({'pid':p.pid,'name':p.name,'error':str(e)})
                    retry_after[p.pid]=time.monotonic()+30
                    old=sessions.pop(p.pid,None)
                    if old:
                        try: old[0].detach()
                        except frida.Error: pass
            write_status({'checkedAt':time.time(),'is_ban':banned,'processes':reports})
        except Exception as e:
            write_status({'checkedAt':time.time(),'error':str(e),'processes':reports})
        if '--self-test' in sys.argv:break
        stop.wait(1)
finally:
    for session,script in sessions.values():
        try: script.exports_sync.stop()
        except Exception: pass
        try: session.detach()
        except Exception: pass
    kernel.CloseHandle.argtypes=[ctypes.c_void_p]
    kernel.CloseHandle(mutex)
