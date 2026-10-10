import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRequest} from './potplayer.mjs';
test('only passes media paths and HTTP(S) media URLs to the fixed executable',()=>{
  assert.equal(validateRequest({kind:'file',source:'D:\\Movies\\Example.mp4'}),'D:\\Movies\\Example.mp4');
  assert.equal(validateRequest({kind:'url',source:'https://example.com/video.m3u8?token=x'}),'https://example.com/video.m3u8?token=x');
  for(const request of [{kind:'file',source:'C:\\Windows\\cmd.exe'},{kind:'url',source:'file:///C:/Windows/cmd.exe'},{kind:'url',source:'https://example.com/player.html'},{kind:'url',source:'https://user:pass@example.com/a.mp4'},{kind:'file',source:'/config=anything.mp4'},{kind:'file',source:'D:\\a.mp4\n/new'}])assert.throws(()=>validateRequest(request));
});
