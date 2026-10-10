"""Isolated ABI and generated-PNG decoding test. Never starts or changes iQIYI."""
import ctypes as C
import hashlib
import json
import os
import shutil
import struct
import subprocess
import zlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import pefile

ROOT = Path(__file__).resolve().parent
STAGE = ROOT / 'stage'
shutil.copy2(ROOT / 'build/Release/avcodec-61.dll', STAGE / 'avcodec-61.dll')
baseline = json.loads((ROOT / 'baseline.json').read_text())
assert hashlib.sha256((STAGE / 'iqiyi_codec_original.dll').read_bytes()).hexdigest() == baseline['sha256']
directory = os.add_dll_directory(str(STAGE))
original = C.CDLL(str(STAGE / 'iqiyi_codec_original.dll'))
proxy = C.CDLL(str(STAGE / 'avcodec-61.dll'))
util = C.CDLL(str(STAGE / 'avutil-59.dll'))
pe = pefile.PE(str(STAGE / 'avcodec-61.dll'))
symbols = {s.name.decode():s.ordinal for s in pe.DIRECTORY_ENTRY_EXPORT.symbols if s.name}
for item in baseline['exports']:
    assert symbols.get(item['name']) == item['ordinal'], item
    assert getattr(proxy, item['name'])
    assert proxy[item['ordinal']]
pe.close()

def bind(module, name, result, *args):
    fn = getattr(module, name)
    fn.restype = result
    fn.argtypes = list(args)
    return fn

P, I = C.c_void_p, C.c_int
alloc = bind(util, 'av_mallocz', P, C.c_size_t)
frame_alloc = bind(util, 'av_frame_alloc', P)
frame_free = bind(util, 'av_frame_free', None, C.POINTER(P))
version = bind(proxy, 'avcodec_version', C.c_uint)
assert version() == bind(original, 'avcodec_version', C.c_uint)()
get_name = bind(proxy, 'avcodec_get_name', C.c_char_p, I)
png_id = next(i for i in range(1, 300) if get_name(i) == b'png')

def chunk(kind, body):
    return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body))
png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 16, 16, 8, 2, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress((b'\0' + b'\xff\x40\x20' * 16) * 16))
       + chunk(b'IEND', b''))

def decode(module, codec_id=png_id, payload=png):
    find = bind(module, 'avcodec_find_decoder', P, I)
    find_name = bind(module, 'avcodec_find_decoder_by_name', P, C.c_char_p)
    codec = find(codec_id)
    assert codec
    if codec_id == png_id:
        assert codec == find_name(b'png')
    context = P(bind(module, 'avcodec_alloc_context3', P, P)(codec))
    packet = P(bind(module, 'av_packet_alloc', P)())
    frame = P(frame_alloc())
    assert context and packet and frame
    try:
        opened = bind(module, 'avcodec_open2', I, P, P, P)(context, codec, None)
        assert opened == 0
        data = alloc(len(payload) + 64)
        assert data
        C.memmove(data, payload, len(payload))
        assert bind(module, 'av_packet_from_data', I, P, P, I)(packet, data, len(payload)) == 0
        send = bind(module, 'avcodec_send_packet', I, P, P)
        receive = bind(module, 'avcodec_receive_frame', I, P, P)
        results = [send(context, packet), receive(context, frame), receive(context, frame),
                   send(context, None), receive(context, frame)]
        assert results[0:2] == [0, 0], results
        return results
    finally:
        frame_free(C.byref(frame))
        bind(module, 'av_packet_free', None, C.POINTER(P))(C.byref(packet))
        bind(module, 'avcodec_free_context', None, C.POINTER(P))(C.byref(context))

reference = decode(original)
assert decode(proxy) == reference
with ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(lambda _:decode(proxy), range(40)))
assert all(item == reference for item in results)
av1_id = next(i for i in range(1, 300) if get_name(i) == b'av1')
control = ROOT.parent / '.private/av1-10bit-control.mp4'
converted = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(control), '-map', '0:v:0',
                            '-c', 'copy', '-f', 'ivf', 'pipe:1'],
                           capture_output=True, timeout=15, creationflags=0x08000000)
assert converted.returncode == 0
ivf = converted.stdout
assert ivf[:4] == b'DKIF' and ivf[8:12] == b'AV01'
header_size = struct.unpack_from('<H', ivf, 6)[0]
frame_size = struct.unpack_from('<I', ivf, header_size)[0]
av1_packet = ivf[header_size + 12:header_size + 12 + frame_size]
assert len(av1_packet) == frame_size
av1_reference = decode(original, av1_id, av1_packet)
assert decode(proxy, av1_id, av1_packet) == av1_reference
snapshot = bind(proxy, 'iqiyi_proxy_snapshot', C.c_uint32, P, C.c_uint32)
buffer = C.create_string_buffer(snapshot(None, 0))
assert snapshot(buffer, len(buffer)) == len(buffer)
stats = json.loads(buffer.value)
assert stats['activeContexts'] == 0
png_stats = next(c for c in stats['codecs'] if c['name'] == 'png')
assert png_stats['opened'] == png_stats['sent'] == png_stats['received'] == 41, stats
assert png_stats['type'] == 0
report = {'passed':True, 'scope':'isolated generated PNG, not client or DRM playback',
          'preservedExportsAndOrdinals':len(baseline['exports']),
          'versionMatches':True, 'decodeReturnValuesMatch':reference,
          'concurrentContextsTested':40, 'syntheticAv1ReturnValuesMatch':av1_reference,
          'stats':stats}
(ROOT / 'test-report.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
