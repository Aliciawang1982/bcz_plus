import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const read=name=>readFile(new URL('../public/'+name,import.meta.url),'utf8');
const source=await read('sw.js');
const scope='https://example.test/bcz_plus/';
function worker(fetcher){
 const handlers={},entries=new Map(),installed=[];
 const cache={
  addAll:async requests=>installed.push(...requests),
  put:async(request,response)=>entries.set(typeof request==='string'?request:request.url,response),
  match:async request=>entries.get(typeof request==='string'?request:request.url)?.clone()
 };
 vm.runInNewContext(source,{URL,Request,Response,fetch:fetcher,location:new URL(scope),caches:{open:async()=>cache},self:{registration:{scope},addEventListener:(type,handler)=>handlers[type]=handler,skipWaiting:async()=>{}}});
 return {installed,entries,async install(){let done;handlers.install({waitUntil:p=>done=p});await done;},async get(url){let result;handlers.fetch({request:new Request(new URL(url,scope)),respondWith:p=>result=p});return result;}};
}

test('新版页面、模块依赖与预缓存使用同一版本，避开旧资源 URL',async()=>{
 const w=worker();await w.install();
 const urls=w.installed.map(r=>r.url);
 const html=await read('index.html'),app=await read('app.mjs');
 const paths=[...html.matchAll(/(?:src|href)="(\.\/[^"?]+\.(?:css|mjs)\?[^" ]+)"/g),...app.matchAll(/from '(\.\/[^']+)'/g)].map(m=>m[1]);
 assert.equal(paths.length,4);
 const versions=new Set();
 for(const path of paths){const url=new URL(path,scope);assert.ok(url.searchParams.get('v'));versions.add(url.search);assert.ok(urls.includes(url.href),path);}
 assert.equal(versions.size,1);
 assert.ok(w.installed.every(r=>r.cache==='reload'));
});

test('脚本请求重新校验 HTTP 缓存，离线仅返回对应版本，不冒用旧脚本',async()=>{
 const calls=[];let offline=false;
 const w=worker(async req=>{calls.push(req);if(offline)throw Error('offline');return new Response('new code');});
 const version=new URL((await read('index.html')).match(/src="([^" ]+app\.mjs[^" ]*)"/)[1],scope).search;
 const path='app.mjs'+version;
 w.entries.set(scope+'app.mjs',new Response('old code'));
 assert.equal(await (await w.get(path)).text(),'new code');
 assert.equal(calls[0].cache,'no-cache');
 offline=true;
 assert.equal(await (await w.get(path)).text(),'new code');
 assert.equal((await w.get('app.mjs?v=unknown')).type,'error');
});

test('临时 HTTP 错误不覆盖已缓存的可用版本',async()=>{
 const w=worker(async()=>new Response('missing',{status:404}));
 w.entries.set(scope+'style.css?v=current',new Response('saved styles'));
 assert.equal(await (await w.get('style.css?v=current')).text(),'saved styles');
});
