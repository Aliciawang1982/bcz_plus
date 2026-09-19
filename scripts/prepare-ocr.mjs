import {mkdir,writeFile,stat} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dest=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public/vendor');
const files=[
 ['tesseract.min.js','https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'],
 ['worker.min.js','https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js'],
 ['LICENSE-tesseract.txt','https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/LICENSE.md'],
 ['LICENSE-core.txt','https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/LICENSE'],
 ['core/tesseract-core-lstm.wasm.js','https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-lstm.wasm.js'],
 ['core/tesseract-core-simd-lstm.wasm.js','https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm.js'],
 ['lang/eng.traineddata','https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz'],
 ['LICENSE-tessdata.txt','https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@4.1.0/LICENSE']
];
const results=await Promise.allSettled(files.map(async([file,url])=>{
 try{if((await stat(path.join(dest,file))).size>1000){console.log(`${file}: already present`);return;}}catch{}
 const urls=file==='lang/eng.traineddata' ? [url,url.replace('cdn.jsdelivr.net','fastly.jsdelivr.net'),url.replace('https://cdn.jsdelivr.net/npm/','https://unpkg.com/')] : [url];
 const controller=new AbortController();
 const data=await Promise.any(urls.map(async candidate=>{
  const res=await fetch(candidate,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});if(!res.ok)throw Error(`${file}: ${res.status}`);
  let data=Buffer.from(await res.arrayBuffer());if(candidate.endsWith('.gz'))data=gunzipSync(data);return data;
 }));controller.abort();
 await mkdir(path.dirname(path.join(dest,file)),{recursive:true});await writeFile(path.join(dest,file),data);console.log(`${file}: ${data.length} bytes`);
}));
for(const r of results)if(r.status==='rejected'){console.error(r.reason);process.exitCode=1;}
