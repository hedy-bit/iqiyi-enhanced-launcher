"""Stage exact original DLLs and generate ABI-preserving exports. Never installs."""
import hashlib
import json
import shutil
from pathlib import Path
import pefile

ROOT = Path(__file__).resolve().parent
INSTALL = Path(r'D:\Program Files\IQIYI Video\LStyle\14.9.0.10269')
EXPECTED = 'c71899a1e66973ad58702c8de18d64111ebe9db7528b8769bdd3cddb985f5416'
source = INSTALL / 'avcodec-61.dll'
if hashlib.sha256(source.read_bytes()).hexdigest() != EXPECTED:
    raise SystemExit('Original DLL changed; rebuild the compatibility baseline first.')
wrapped = {'avcodec_find_decoder', 'avcodec_find_decoder_by_name', 'avcodec_open2',
           'avcodec_send_packet', 'avcodec_receive_frame', 'avcodec_free_context', 'avcodec_close'}
pe = pefile.PE(str(source))
lines = ['LIBRARY avcodec-61', 'EXPORTS']
pragmas = []
exports = []
for symbol in pe.DIRECTORY_ENTRY_EXPORT.symbols:
    if not symbol.name:
        raise SystemExit('Ordinal-only export requires explicit handling.')
    name = symbol.name.decode('ascii')
    target = name if name in wrapped else f'{name}=iqiyi_codec_original.{name}'
    if name in wrapped:
        lines.append(f'    {target} @{symbol.ordinal}')
    else:
        pragmas.append(f'#pragma comment(linker, "/export:{target},@{symbol.ordinal}")')
    exports.append({'name':name, 'ordinal':symbol.ordinal})
pe.close()
(ROOT / 'exports.def').write_text('\n'.join(lines) + '\n', encoding='ascii')
(ROOT / 'forwarders.inc').write_text('\n'.join(pragmas) + '\n', encoding='ascii')
stage = ROOT / 'stage'
stage.mkdir(exist_ok=True)
shutil.copy2(source, stage / 'iqiyi_codec_original.dll')
# Copy the complete private dependency closure; Windows system DLLs stay in Windows.
pending, visited = [source], set()
while pending:
    dependency = pending.pop()
    if dependency.name.lower() in visited:
        continue
    visited.add(dependency.name.lower())
    image = pefile.PE(str(dependency))
    for entry in getattr(image, 'DIRECTORY_ENTRY_IMPORT', []):
        name = entry.dll.decode('ascii')
        if Path(name).name != name:
            raise SystemExit('Unexpected DLL dependency path')
        local = INSTALL / name
        if local.is_file() and local.name.lower() not in visited:
            if local.name.lower() != 'avcodec-61.dll':
                shutil.copy2(local, stage / local.name)
            pending.append(local)
    image.close()
(ROOT / 'baseline.json').write_text(json.dumps({'sha256':EXPECTED, 'exports':exports}, indent=2))
print(json.dumps({'staged':str(stage), 'exports':len(exports), 'wrapped':len(wrapped)}))
