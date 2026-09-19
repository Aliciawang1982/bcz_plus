import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const specs=[
 ['1661','The-Adventures-of-Sherlock-Holmes_1661','The Adventures of Sherlock Holmes','Arthur Conan Doyle','推理'],
 ['33','The-Scarlet-Letter_33','The Scarlet Letter','Nathaniel Hawthorne','文学'],
 ['345','Dracula_345','Dracula','Bram Stoker','文学']
];
const books=[];
for(const [id,repo,title,author,topic] of specs) {
 try {
  const res=await fetch(`https://data.jsdelivr.com/v1/package/gh/GITenberg/${repo}@master`,{signal:AbortSignal.timeout(20000)});
  if(!res.ok) throw Error(`metadata ${res.status}`);
  const meta=await res.json();
  const file=meta.files.find(f=>f.name===`${id}-0.txt`)||meta.files.find(f=>f.name===`${id}.txt`)||meta.files.find(f=>f.type==='file'&&f.name.endsWith('.txt')&&!f.name.includes('-8'));
  if(!file) throw Error('No UTF-8/ASCII text');
  const mirror=`https://cdn.jsdelivr.net/gh/GITenberg/${repo}@master/${file.name}`;
  const r=await fetch(mirror,{signal:AbortSignal.timeout(30000)}); if(!r.ok)throw Error(`text ${r.status}`);
  const full=await r.text();
  const start=full.match(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG[^\n]*\n/i);
  const end=full.match(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG/i);
  if(!start||!end) throw Error('Cannot delimit book');
  const text=full.slice(start.index+start[0].length,end.index).replaceAll('\r','').trim();
  await mkdir(path.join(root,'data','originals'),{recursive:true});
  await writeFile(path.join(root,'data','originals',`${id}.txt`),full);
  books.push({id,title,author,topic,source:`https://www.gutenberg.org/ebooks/${id}`,mirror,
    license:'Project Gutenberg · 美国公版作品；其他地区请核对当地版权期限。文本仅合并换行，未改写。',retrievedAt:new Date().toISOString(),text});
  console.log(`${title}: ${text.length} characters`);
 } catch(e) {console.error(`${title}: ${e.message}`);}
}
if(!books.length) throw Error('No sources downloaded');
await writeFile(path.join(root,'data','books.json'),JSON.stringify(books));
await writeFile(path.join(root,'public','library.json'),JSON.stringify(books));
