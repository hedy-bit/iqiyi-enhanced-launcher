import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPlayerArgs} from './potplayer.mjs';
test('passes media headers as one argument to the fixed player',()=>{
 const args=buildPlayerArgs({kind:'url',source:'https://example.com/test.m3u8',headers:{Cookie:'session=test','User-Agent':'test-agent'}});
 assert.deepEqual(args,['https://example.com/test.m3u8','/headers=Cookie: session=test\r\nUser-Agent: test-agent']);
});
test('rejects injected header lines and unrelated headers',()=>{
 for(const headers of [{Cookie:'a=b\r\nHost: attacker.invalid'},{Host:'attacker.invalid'}]){
  assert.throws(()=>buildPlayerArgs({kind:'url',source:'https://example.com/test.mp4',headers}));
 }
});
