import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
const publicFile=name=>new URL('../public/'+name,import.meta.url);
test('静态入口支持 GitHub Pages 仓库子路径',async()=>{
 const html=await readFile(publicFile('index.html'),'utf8');
 assert.doesNotMatch(html,/(?:src|href)="\/(?!\/)/);
 const manifest=JSON.parse(await readFile(publicFile('manifest.webmanifest'),'utf8'));
 assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');
});
test('推荐完全在客户端运行，静态原文库与已核实来源一致',async()=>{
 const app=await readFile(publicFile('app.mjs'),'utf8');assert.doesNotMatch(app,/fetch\([^\n]*\/api\//);
 const deployed=await readFile(publicFile('library.json'),'utf8');
 const original=await readFile(new URL('../data/books.json',import.meta.url),'utf8');assert.equal(deployed,original);
});
test('OCR 模型和两种浏览器 WASM 内核已包含在部署文件中',async()=>{
 for(const file of ['vendor/lang/eng.traineddata','vendor/core/tesseract-core-lstm.wasm.js','vendor/core/tesseract-core-simd-lstm.wasm.js']){
  assert.ok((await stat(publicFile(file))).size>1000000,file);
 }
});
