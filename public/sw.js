const VERSION='20260926-5';
const CACHE='word-trails-static-v9';
const asset=path=>new URL(path,self.registration.scope).href;
// Keep these URLs in step with index.html and the module imports in app.mjs.
const SHELL=['./','style.css','app.mjs','core.mjs','vocabulary.mjs','icon.svg'].map(path=>asset(/\.(css|mjs)$/.test(path)?`${path}?v=${VERSION}`:path));
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('word-trails-shell-')||k.startsWith('word-trails-static-'))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==location.origin||!url.href.startsWith(self.registration.scope)||url.pathname.includes('/api/'))return;
 // Revalidate the page and its code rather than mixing new HTML with HTTP-cached code.
 const isShell=event.request.mode==='navigate'||/\.(?:html|css|mjs|js)$/.test(url.pathname)&&!url.pathname.includes('/vendor/');
 event.respondWith((async()=>{
  try{
   const response=await fetch(isShell?new Request(event.request,{cache:'no-cache'}):event.request);
   if(!response.ok)throw Error('Resource unavailable');
   const copy=response.clone();
   await caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
   return response;
  }catch{
   const cache=await caches.open(CACHE);
   const cached=await cache.match(event.request);
   if(cached)return cached;
   if(event.request.mode==='navigate')return await cache.match(asset('./'))||Response.error();
   return Response.error();
  }
 })());
});
