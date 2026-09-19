import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {networkInterfaces} from 'node:os';
import {normalizeWords,recommend} from './public/core.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const books=JSON.parse(await readFile(path.join(root,'data/books.json'),'utf8'));
const port=Number(process.env.PORT||4317), host=process.env.HOST||'127.0.0.1';
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.gz':'application/gzip'};
function json(res,status,data) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data));}
const server=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  if(req.method!=='GET') return json(res,405,{error:'只支持读取请求'});
  if(url.pathname==='/api/recommend') {
    if(url.search.length>6000) return json(res,400,{error:'词表过长'});
    const words=normalizeWords(url.searchParams.get('words')||'');
    if(!words.length) return json(res,400,{error:'请先导入至少一个英文单词'});
    const articles=recommend(books,words,{short:url.searchParams.get('short')==='true',topic:url.searchParams.get('topic')||'all',seen:(url.searchParams.get('seen')||'').split(',')});
    return json(res,200,{articles,libraryCount:books.length,unmatched:words.filter(w=>!articles.some(a=>a.hits.includes(w)))});
  }
  if(url.pathname==='/api/health')return json(res,200,{ok:true,libraryCount:books.length});
  const relative=decodeURIComponent(url.pathname)==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);
  const file=path.resolve(root,'public',relative),publicRoot=path.join(root,'public')+path.sep;
  if(!file.startsWith(publicRoot)) return json(res,403,{error:'Forbidden'});
  const data=await readFile(file);
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(data);
 } catch(e) {json(res,e.code==='ENOENT'?404:500,{error:e.code==='ENOENT'?'页面不存在':'服务暂时不可用，请重试'});}
});
server.listen(port,host,()=>{console.log(`Word Trails: http://localhost:${port}`);if(host==='0.0.0.0')for(const list of Object.values(networkInterfaces()))for(const n of list||[])if(n.family==='IPv4'&&!n.internal)console.log(`iPhone（同一 Wi-Fi）: http://${n.address}:${port}`);});
