import {SAMPLE,normalizeWords,wordRegex,forms,buildQuiz,schedule,localDate,recommend,isRead,markRead} from './core.mjs?v=20260926-2';
import {learningWords,learningReviews,setMastered,editWord,deleteWord} from './vocabulary.mjs?v=20260926-2';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DEFAULT={words:SAMPLE,mastered:[],label:'截图示例 · 7 个词',isSample:true,read:[],reviews:{},preferences:{short:false,topic:'all'}};
let state,storageOK=true;
try{const saved=JSON.parse(localStorage.getItem('word-trails-v1')||'null');state=saved&&Array.isArray(saved.words)&&saved.reviews&&Array.isArray(saved.read)?{...DEFAULT,...saved,preferences:{...DEFAULT.preferences,...saved.preferences}}:structuredClone(DEFAULT);}catch{state=structuredClone(DEFAULT);storageOK=false;}
let draft=[...state.words], articles=[],requestId=0,currentArticle=null,currentQuiz=[],seen=[],toastTimer,worker=null,workerPromise=null,previewURLs=[],busyOCR=false,libraryPromise=null,localBooks=[],localBooksPromise=null,zipPromise=null;
const asset=relative=>new URL(relative,import.meta.url).href;
let readMode='unread', readerFinished=false;
let undoVocabulary=null;
if(!Array.isArray(state.mastered))state.mastered=[];
function fetchWithTimeout(url,ms=30000,options={}){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),ms);
 return fetch(url,{...options,signal:controller.signal}).finally(()=>clearTimeout(timer));
}
function loadLibrary(){
 if(!libraryPromise)libraryPromise=fetchWithTimeout(asset('library.json')).then(r=>{if(!r.ok)throw Error('原文库暂时无法加载');return r.json();}).catch(e=>{libraryPromise=null;throw e;});
 return libraryPromise;
}
function openLocalDB(){return new Promise((resolve,reject)=>{if(!window.indexedDB)return reject(Error('当前浏览器不支持本机书库'));const request=indexedDB.open('word-trails-local',1);request.onupgradeneeded=()=>request.result.createObjectStore('books',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||Error('无法打开本机书库'));});}
async function localDBRequest(mode,action){const db=await openLocalDB();return new Promise((resolve,reject)=>{const tx=db.transaction('books',mode),store=tx.objectStore('books');let request;try{request=action(store);}catch(e){db.close();reject(e);return;}request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||Error('本机书库读写失败'));tx.oncomplete=()=>db.close();});}
async function readLocalBooks(){try{return await localDBRequest('readonly',store=>store.getAll())||[];}catch(e){console.warn('Local book storage unavailable:',e.message);return [];}}
async function saveLocalBook(book){return localDBRequest('readwrite',store=>store.put(book));}
async function removeLocalBook(id){return localDBRequest('readwrite',store=>store.delete(id));}
function renderLocalBooks(){
 const target=$('#local-books');if(!target)return;
 target.innerHTML=localBooks.length?localBooks.map(book=>`<div class="local-book-row"><span><strong>${esc(book.title)}</strong><small>${book.format.toUpperCase()} · 本机保存</small></span><button class="text-btn" data-delete-book="${esc(book.id)}">删除</button></div>`).join(''):'<p class="hint">还没有导入本机电子书。</p>';
}
async function loadAllBooks(){
 const library=await loadLibrary();
 if(!localBooksPromise)localBooksPromise=readLocalBooks().then(books=>{localBooks=books;renderLocalBooks();return books;});
 return [...library,...await localBooksPromise];
}
function loadZip(){
 if(zipPromise)return zipPromise;
 if(window.JSZip)return Promise.resolve(window.JSZip);
 zipPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=asset('vendor/jszip.min.js');script.onload=()=>window.JSZip?resolve(window.JSZip):reject(Error('EPUB 压缩组件加载失败'));script.onerror=()=>reject(Error('EPUB 压缩组件加载失败'));document.head.append(script);});
 return zipPromise;
}
function plainTextFromHTML(source){
 const doc=new DOMParser().parseFromString(source,'text/html');doc.querySelectorAll('script,style,nav,aside,header,footer').forEach(node=>node.remove());
 const blocks=[...doc.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,pre')].map(node=>node.textContent.replace(/\s+/g,' ').trim()).filter(text=>text.length>=2);
 return [...new Set(blocks)].join('\n\n')||doc.body?.textContent?.replace(/\s+/g,' ').trim()||'';
}
function zipPathJoin(base,child){const parts=(base+'/'+child).split('/');const out=[];for(const part of parts){if(!part||part==='.')continue;if(part==='..')out.pop();else out.push(part);}return out.join('/');}
async function parseEpub(file){
 const JSZip=await loadZip(),zip=await JSZip.loadAsync(await file.arrayBuffer());let paths=[];
 const container=zip.file('META-INF/container.xml');
 if(container){const xml=await container.async('text'),match=xml.match(/full-path=["']([^"']+)["']/i);if(match){const opfPath=decodeURIComponent(match[1]),opfFile=zip.file(opfPath);if(opfFile){const opf=await opfFile.async('text'),doc=new DOMParser().parseFromString(opf,'application/xml'),manifest=new Map([...doc.querySelectorAll('manifest item')].map(item=>[item.getAttribute('id'),item.getAttribute('href')]));paths=[...doc.querySelectorAll('spine itemref')].map(item=>manifest.get(item.getAttribute('idref'))).filter(Boolean).map(href=>zipPathJoin(opfPath.split('/').slice(0,-1).join('/'),decodeURIComponent(href)));}}}
 if(!paths.length)paths=Object.keys(zip.files).filter(name=>/\.(?:xhtml?|html?)$/i.test(name)).sort();
 const texts=[];for(const path of paths){const entry=zip.file(path);if(!entry)continue;const text=plainTextFromHTML(await entry.async('text'));if(text)texts.push(text);}
 return texts.join('\n\n');
}
function readableBlocks(text){
 const blocks=text.split(/\n\s*\n/).map(p=>p.replace(/\s+/g,' ').trim()).filter(p=>p.length>=25),result=[];
 for(const block of blocks){const words=(block.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).length;if(words<=260){result.push(block);continue;}const sentences=block.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[block];let current=[],count=0;for(const sentence of sentences){const n=(sentence.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).length;if(current.length&&count+n>180){result.push(current.join(' ').trim());current=[];count=0;}current.push(sentence.trim());count+=n;}if(current.length)result.push(current.join(' ').trim());}
 return result.join('\n\n');
}
async function parseLocalBook(file){
 const format=file.name.toLowerCase().endsWith('.epub')?'epub':'txt';
 const text=format==='epub'?await parseEpub(file):(await file.text()).replace(/^\uFEFF/,'').replace(/\r/g,'');
 const cleaned=readableBlocks(text);
 if(cleaned.length<80)throw Error('没有提取到足够的英文正文');
 return {id:`local-${file.name}-${file.size}-${file.lastModified}`,title:file.name.replace(/\.[^.]+$/,''),author:'本机文件',topic:'本机电子书',local:true,format,text:cleaned,source:'',mirror:'',license:'内容只保存在本机 IndexedDB；请确认你拥有个人使用权。',addedAt:Date.now()};
}
async function importLocalBooks(files){
 const list=[...files].slice(0,10);if(!list.length)return;const status=$('#ebook-status');status.textContent='正在本机读取电子书…';
 let added=0;
 for(const file of list){try{if(file.size>80*1024*1024)throw Error('文件超过 80 MB');const book=await parseLocalBook(file);await saveLocalBook(book);localBooks=[book,...localBooks.filter(item=>item.id!==book.id)];added++;}catch(e){status.textContent=`${file.name}：${e.message}`;}}
 localBooksPromise=Promise.resolve(localBooks);renderLocalBooks();$('#ebooks').value='';seen=[];if(added){status.textContent=`已导入 ${added} 本，内容只保存在本机。`;recommendations();toast('本机电子书已加入阅读来源。');}
}
const dictionary={exonerate:['v.','免除责任；证明无罪'],stigma:['n.','污名；耻辱的标记'],anguish:['n. / v.','极度痛苦；使极度痛苦'],pictorial:['adj.','图画的；用图片表达的'],dynamite:['n. / v.','炸药；用炸药爆破'],jot:['v. / n.','匆匆记下；少量，一点点'],revoke:['v.','撤销；废除']};
function save(){try{localStorage.setItem('word-trails-v1',JSON.stringify(state));}catch{storageOK=false;toast('当前浏览器无法保存，请勿关闭页面；可复制词表备份。');}}
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,4000);}
function dueReviews(){return learningReviews(state).filter(([,r])=>r.due<=Date.now());}
function stats(){
 const active=learningWords(state);
 $('#stat-words').innerHTML=`${active.length}<small> 个待学词</small>`;
 $('#stat-read').innerHTML=`${state.read.filter(x=>x.date===localDate()).length}<small> 篇原文</small>`;
 $('#stat-review').innerHTML=`${dueReviews().length}<small> 个词</small>`;
 $('#review-badge').textContent=dueReviews().length||'';
 $('#list-label').textContent=`词库 ${state.words.length} 词 · 已掌握 ${state.words.length-active.length} 词`;
 $('#home-words').innerHTML=active.slice(0,12).map(w=>`<button class="chip" data-word="${esc(w)}">${esc(w)}</button>`).join('')+(active.length>12?`<span class="chip">+${active.length-12}</span>`:'');
}
function renderVocabulary(){
 const filter=$('#vocabulary-filter').value,query=$('#vocabulary-search').value.trim().toLowerCase();
 const mastered=new Set(state.mastered);
 const words=state.words.filter(w=>w.includes(query)&&(filter==='all'||(filter==='mastered'?mastered.has(w):!mastered.has(w))));
 $('#vocabulary-count').textContent=`共 ${state.words.length} 词 · 学习中 ${learningWords(state).length} · 已掌握 ${state.words.filter(w=>mastered.has(w)).length}`;
 $('#vocabulary-list').innerHTML=words.length?words.map(word=>`<div class="vocabulary-row"><form data-edit-vocabulary="${esc(word)}"><label class="sr-only" for="vocab-${esc(word)}">编辑 ${esc(word)}</label><input id="vocab-${esc(word)}" name="word" value="${esc(word)}" maxlength="32" autocapitalize="none" autocomplete="off" spellcheck="false" required><button type="submit" class="text-btn" aria-label="保存 ${esc(word)} 的拼写">保存拼写</button></form><span class="vocabulary-state">${mastered.has(word)?'✓ 已掌握':'学习中'}</span><div class="vocabulary-actions"><button class="btn secondary" data-mastery="${esc(word)}" aria-label="${mastered.has(word)?'恢复学习':'标为已掌握'} ${esc(word)}">${mastered.has(word)?'恢复学习':'标为已掌握'}</button><button class="text-btn" data-delete-word="${esc(word)}" aria-label="移除 ${esc(word)}">移除</button></div></div>`).join(''):'<p class="hint">没有符合条件的单词。</p>';
 $('#undo-vocabulary').hidden=!undoVocabulary;
}
function vocabularyChanged(next,message){
 undoVocabulary={words:[...state.words],mastered:[...state.mastered],reviews:structuredClone(state.reviews)};
 state={...next,isSample:false};save();
 draft=[...state.words];$('#word-input').value=draft.join('\n');
 stats();renderDraft();renderVocabulary();renderReview();seen=[];recommendations();toast(message);
}
function page(name){
 if(!['home','import','review'].includes(name))name='home';
 $$('.page').forEach(p=>p.hidden=p.id!==`page-${name}`);$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===name));
 if(name==='review')renderReview();
 if(name==='import'){$('#word-input').value=draft.join('\n');renderDraft();renderVocabulary();}
 history.replaceState(null,'',`#${name}`);window.scrollTo({top:0});
}
function renderDraft(){
 $('#draft-words').innerHTML=draft.length?draft.map(w=>`<span class="chip">${esc(w)}<button data-remove="${esc(w)}" aria-label="移除 ${esc(w)}">×</button></span>`).join(''):'<p class="muted">先导入单词，再在这里核对。</p>';
 $('#draft-count').textContent=`共 ${draft.length} 个不重复单词 · 请检查拼写与被遮挡的词`;
 $('#save-words').disabled=!draft.length||busyOCR;
}
function highlight(text){
 const map=new Map();learningWords(state).forEach(w=>forms(w).forEach(f=>map.set(f,w)));
 return text.split(/([A-Za-z]+(?:['’-][A-Za-z]+)*)/g).map(t=>map.has(t.toLowerCase())?`<button class="highlight" data-word="${esc(map.get(t.toLowerCase()))}" aria-label="查看 ${esc(t)} 释义">${esc(t)}</button>`:esc(t)).join('');
}
async function recommendations(){
 const id=++requestId;$('#articles').innerHTML='<div class="loading">正在从原文中寻找你的单词…</div>';$('#unmatched').textContent='';$('#refresh').disabled=true;
 const due=dueReviews().map(([w])=>w);const words=learningWords(state);
 if(!words.length){
  articles=[];$('#refresh').disabled=false;
  $('#recommend-caption').textContent='只为学习中的单词推荐阅读。';
  $('#articles').innerHTML=`<div class="empty"><h3>${state.words.length?'当前词库中的单词已全部掌握。':'词库里还没有单词。'}</h3><p>可以添加新词，或在词库中将单词恢复学习。</p><button class="btn secondary" data-page="import">管理我的词库</button></div>`;return;
 }
 try{
  const library=await loadAllBooks();
  const options={short:state.preferences.short,topic:state.preferences.topic,read:state.read,readMode};
  const selected=recommend(library,words,{...options,seen});
  const hasRead=readMode==='unread'&&!selected.length&&recommend(library,words,{...options,readMode:'read',limit:1}).length>0;
  const data={articles:selected,libraryCount:library.length,unmatched:words.filter(w=>!selected.some(a=>a.hits.includes(w)))};
  if(id!==requestId)return;
  articles=data.articles;seen.push(...articles.map(a=>a.id));
  $('#recommend-caption').textContent=`从 ${data.libraryCount} 部作品中匹配${readMode==='read'?'已读':'未读'}选段${due.length?'，同时带上到期复习词':''}。同一本书的不同选段会分别记录。`;
  if(articles.length)renderArticleCards();
  else $('#articles').innerHTML=readMode==='read'?'<div class="empty"><h3>当前条件下还没有已读选段。</h3><button class="btn secondary" data-reading-mode="unread">返回未读推荐</button></div>':hasRead?'<div class="empty"><h3>当前条件下的匹配选段已读完。</h3><p>可以更换词表、主题或导入新书，也可以主动重读。</p><button class="btn secondary" data-reading-mode="read">查看已读内容</button></div>':'<div class="empty"><h3>这次还没有合适的选段。</h3><p>试试「全部主题」或更长的阅读长度；下方也可继续查找网络原文。</p></div>';
  if(data.unmatched.length)$('#unmatched').innerHTML=`本组未覆盖：${data.unmatched.map(w=>`<a href="https://www.bing.com/search?q=${encodeURIComponent('"'+w+'" English article') }" target="_blank" rel="noopener noreferrer">${esc(w)} ↗</a>`).join('')}<br>点击可自行搜索更多原文；外部搜索结果尚未核实。`;
 }catch(e){if(id===requestId)$('#articles').innerHTML='<div class="empty"><h3>暂时无法加载原文</h3><p>请检查网络，再点击「换一组」重试。首次打开需要下载原文库。</p></div>';}
 finally{if(id===requestId)$('#refresh').disabled=false;}
}
function renderArticleCards(){
 $('#articles').innerHTML=articles.map((a,i)=>{
  const completed=isRead(a,state.read);
  return `<article class="article-card"><div class="card-cover cover-${i}"><div class="cover-label">${esc(a.topic)} / ORIGINAL READING</div><div class="cover-title">${esc(a.author.split(' ').slice(-1)[0])}<br><i>in context.</i></div><div class="cover-line"></div></div><div class="card-content"><div class="card-meta"><span>${esc(a.difficulty)} · 约 ${a.minutes} 分钟</span><span class="read-status">${completed?'✓ 已读':'未读'}</span></div><h3>${esc(a.title)}</h3><p class="card-preview">${esc(a.paragraphs.find(p=>a.hits.some(w=>wordRegex(w).test(p)))||a.paragraphs[0])}</p><div class="chips">${a.hits.map(w=>`<span class="chip">${esc(w)}</span>`).join('')}</div><div class="card-bottom"><span>${a.wordCount} 词 · ${a.local?'本机电子书':'Gutenberg 原文选段'}</span><button data-read="${i}">${completed?'重新阅读':'开始阅读'} ↗</button></div></div></article>`;
 }).join('');
}
function changeReadMode(mode){readMode=mode;$('#reading-mode').value=mode;seen=[];recommendations();}
function openReader(index){
 currentArticle=articles[index];if(!currentArticle)return;
 readerFinished=false;
 currentQuiz=buildQuiz(currentArticle,learningWords(state));
 const sourceLine=currentArticle.local?`<span>本机电子书 · 不上传</span><p>${esc(currentArticle.license)}</p>`:`<a href="${esc(currentArticle.source)}" target="_blank" rel="noopener noreferrer">查看原作 ↗</a><a href="${esc(currentArticle.mirror)}" target="_blank" rel="noopener noreferrer">纯文本镜像 ↗</a><p>${esc(currentArticle.license)}</p>`;
 $('#reader-content').innerHTML=`<div class="reader-body"><span class="pill" style="background:#eaf0df">${esc(currentArticle.topic)} · 原版选段 · ${currentArticle.wordCount} 词</span><h2>${esc(currentArticle.title)}</h2><p class="byline">${esc(currentArticle.author)} · 约 ${currentArticle.minutes} 分钟</p><p class="hint">点击高亮词查看常用释义。以下段落保持原文，未作简写。</p><div class="reader-article">${currentArticle.paragraphs.map(p=>`<p>${highlight(p)}</p>`).join('')}</div><div class="source-line">${sourceLine}</div><button class="btn primary full reading-action" id="finish-reading">读完了，用原句巩固一下 →</button><div id="reading-quiz"></div></div>`;
 $('#reader').showModal();$('#reader').scrollTop=0;
}
function quizHTML(q,index,context){return `<div class="question"><p>${esc(q.prompt)}</p><form class="answer-row" data-quiz-context="${context}" data-index="${index}"><input name="answer" aria-label="${context==='review'?'复习':'阅读'}第 ${index+1} 题答案" placeholder="填入原句中的词形" autocomplete="off" autocapitalize="none" spellcheck="false" required maxlength="40"><button class="btn primary" type="submit">核对答案</button></form><div class="feedback" aria-live="polite"></div></div>`;}
function finishReading(){
 // Keep every completed range. Re-reading must not discard older records or count as new reading.
 if(!isRead(currentArticle,state.read))state.read=markRead(state.read,currentArticle,localDate());
 save();stats();readerFinished=true;renderArticleCards();
 $('#finish-reading').hidden=true;
 $('#reading-quiz').innerHTML=`<div class="quiz-box"><h3>把熟悉，变成记得。</h3><p class="hint">根据刚刚的原句填空。答题后安排下一次复习。</p>${currentQuiz.map((q,i)=>quizHTML(q,i,'reading')).join('')}</div>`;
 $('#reading-quiz').scrollIntoView({behavior:'smooth',block:'start'});
}
let reviewQuiz=[];
function renderReview(){
 const all=learningReviews(state),due=dueReviews();reviewQuiz=due.map(([word,r])=>({...r.quiz,word}));
 $('#review-content').innerHTML=`<div class="review-summary"><div><strong>${due.length}</strong> 个词等待重逢</div><div><strong>${all.length}</strong> 个词已加入复习</div></div>`+
 (due.length?`<div class="review-list">${due.map(([word,r],i)=>`<article class="review-card"><div class="eyebrow">来自你读过的原文</div><h3>${esc(r.title)}</h3>${quizHTML(r.quiz,i,'review')}</article>`).join('')}</div>`:`<div class="empty"><h3>${all.length?'今天的复习已完成。':'读过的句子，会在这里等你。'}</h3><p>${all.length?`下次复习：${new Date(Math.min(...all.map(([,r])=>r.due))).toLocaleString('zh-CN',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})}。`:'读完一篇原文并完成填空，就会自动安排复习。'}</p><button class="btn primary" data-page="home">去读一小段 ↗</button></div>`)+
 (all.length?`<div class="section-head" style="margin-top:32px"><h2>记忆足迹</h2><span class="muted">按答题结果安排 1、3、7、14、30 天复习</span></div><div class="chips">${all.map(([w,r])=>`<button class="chip" data-word="${esc(w)}">${esc(w)} · ${r.lastResult?'已答对':'再巩固'}</button>`).join('')}</div>`:'');
}
function submitQuiz(form){
 const context=form.dataset.quizContext,index=Number(form.dataset.index),q=context==='reading'?currentQuiz[index]:reviewQuiz[index];if(!q||form.dataset.done)return;
 if(!learningWords(state).includes(q.word))return;
 const input=form.elements.answer.value.trim();if(!input)return;
 const correct=input.toLowerCase()===q.answer.toLowerCase();
 const previous=state.reviews[q.word];
 state.reviews[q.word]={...previous,...schedule(previous,correct),quiz:q,title:context==='reading'?currentArticle.title:previous.title};
 save();stats();form.dataset.done='true';form.querySelector('button').disabled=true;form.elements.answer.disabled=true;
 const feedback=form.nextElementSibling;feedback.classList.toggle('wrong',!correct);feedback.textContent=correct?`答对了！${q.answer} · 已安排下次复习。`:`原句用的是 ${q.answer}。已加入明天的复习，再遇见一次。`;
 if(context==='review'&&!dueReviews().length)toast('今天到期的词已复习完。');
}
function showWord(word){
 const entry=dictionary[word];
 $('#word-detail').innerHTML=`<div class="eyebrow">A WORD IN CONTEXT</div><h2>${esc(word)}</h2>${entry?`<span class="muted">${entry[0]}</span><p>${entry[1]}</p>`:'<p>这个词暂未收录本地释义，可打开下方词典查询。</p>'}<p class="hint">常用释义供参考，请结合原句判断具体含义。</p><div class="dict-links"><a href="https://dictionary.cambridge.org/dictionary/english-chinese-simplified/${encodeURIComponent(word)}" target="_blank" rel="noopener noreferrer">剑桥英汉词典 ↗</a><a href="https://www.bing.com/search?q=${encodeURIComponent(word+' definition')}" target="_blank" rel="noopener noreferrer">更多释义 ↗</a></div>`;
 $('#word-dialog').showModal();
}
async function loadOCR(){
 if(worker)return worker;
 if(!workerPromise)workerPromise=(async()=>{
  if(!window.Tesseract)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=asset('vendor/tesseract.min.js');script.onload=resolve;script.onerror=()=>reject(Error('识别组件加载失败，请改用粘贴单词。'));document.head.append(script);});
  worker=await window.Tesseract.createWorker('eng',1,{workerPath:asset('vendor/worker.min.js'),corePath:asset('vendor/core'),langPath:asset('vendor/lang'),gzip:false,logger:m=>{if(m.status==='recognizing text')$('#ocr-status').textContent=`正在识别英文单词 ${Math.round(m.progress*100)}%…`;}});
  await worker.setParameters({tessedit_pageseg_mode:'11'});return worker;
 })().catch(e=>{workerPromise=null;throw e;});
 return workerPromise;
}
async function cropImage(file){
 const src=URL.createObjectURL(file);previewURLs.push(src);const img=new Image();img.src=src;await img.decode();
 const preview=document.createElement('img');preview.src=src;preview.alt='待核对的词表截图';$('#previews').append(preview);
 // 百词斩竖屏截图的英文列在左侧；去掉页头、右侧状态和日期。
 const tall=img.height/img.width>1.65;
 const sx=tall?img.width*.055:0,sy=tall?img.height*.255:0,sw=tall?img.width*.60:img.width,sh=img.height-sy;
 const scale=Math.min(1.7,1800/sw),canvas=document.createElement('canvas');canvas.width=Math.round(sw*scale);canvas.height=Math.round(sh*scale);
 canvas.getContext('2d').drawImage(img,sx,sy,sw,sh,0,0,canvas.width,canvas.height);return canvas;
}
async function recognize(files){
 if(busyOCR)return;
 const list=[...files].slice(0,10);if(!list.length)return;
 if(list.some(f=>f.size>15*1024*1024)){toast('请选择小于 15 MB 的截图。');return;}
 busyOCR=true;$('#screenshots').disabled=true;$('#save-words').disabled=true;
 previewURLs.forEach(URL.revokeObjectURL);previewURLs=[];$('#previews').innerHTML='';$('#ocr-status').textContent='正在准备本机识别，首次加载可能需要片刻…';
 let extracted=[];
 try{
  const w=await loadOCR();
  for(let i=0;i<list.length;i++){
   const canvas=await cropImage(list[i]);const {data}=await w.recognize(canvas);
   const candidates=(data.words||[]).filter(x=>x.confidence>=60&&/^[a-zA-Z][a-zA-Z'-]{1,31}$/.test(x.text)&&x.bbox.y1-x.bbox.y0>canvas.width*.033).map(x=>x.text);
   extracted.push(...candidates);$('#ocr-status').textContent=`已识别 ${i+1}/${list.length} 张截图…`;
  }
  draft=normalizeWords(extracted.join('\n'));$('#word-input').value=draft.join('\n');renderDraft();
  $('#ocr-status').textContent=draft.length?`识别到 ${draft.length} 个候选词。请特别核对工具栏遮挡处，残缺词不会自动补全。`:'没有识别到清晰的英文单词，请使用实况文本复制后粘贴。';
 }catch(e){$('#ocr-status').textContent='截图识别暂时不可用。请使用 iPhone 实况文本复制单词，粘贴到下方继续。';console.warn('OCR unavailable:',e.message);}
 finally{busyOCR=false;$('#screenshots').disabled=false;renderDraft();$('#screenshots').value='';}
}
document.addEventListener('click',event=>{
 const target=event.target.closest('button,a');if(!target)return;
 if(target.dataset.page)page(target.dataset.page);
 if(target.dataset.word)showWord(target.dataset.word);
 if(target.dataset.read!==undefined)openReader(Number(target.dataset.read));
 if(target.dataset.readingMode)changeReadMode(target.dataset.readingMode);
 if(target.dataset.mastery){const word=target.dataset.mastery;const mastered=!state.mastered.includes(word);vocabularyChanged(setMastered(state,word,mastered),mastered?'已掌握：不再用于推荐和复习。':'已恢复学习。');}
 if(target.dataset.deleteWord)vocabularyChanged(deleteWord(state,target.dataset.deleteWord),'已移除单词，可点击「撤销上次修改」恢复。');
 if(target.dataset.remove){draft=draft.filter(w=>w!==target.dataset.remove);$('#word-input').value=draft.join('\n');renderDraft();}
 if(target.dataset.deleteBook){removeLocalBook(target.dataset.deleteBook).then(()=>{localBooks=localBooks.filter(book=>book.id!==target.dataset.deleteBook);localBooksPromise=Promise.resolve(localBooks);renderLocalBooks();seen=[];recommendations();toast('本机电子书已删除。');}).catch(()=>toast('删除失败，请重试。'));}
 if(target.id==='finish-reading')finishReading();
});
document.addEventListener('submit',event=>{
 if(event.target.matches('[data-quiz-context]')){event.preventDefault();submitQuiz(event.target);}
 if(event.target.matches('[data-edit-vocabulary]')){event.preventDefault();try{const next=editWord(state,event.target.dataset.editVocabulary,event.target.elements.word.value);if(next!==state)vocabularyChanged(next,'拼写已更新；旧拼写的练习已移除。');}catch(e){toast(e.message);}}
});
$('#vocabulary-search').oninput=renderVocabulary;
$('#vocabulary-filter').onchange=renderVocabulary;
$('#undo-vocabulary').onclick=()=>{if(!undoVocabulary)return;state={...state,...undoVocabulary};undoVocabulary=null;save();draft=[...state.words];$('#word-input').value=draft.join('\n');stats();renderDraft();renderVocabulary();renderReview();seen=[];recommendations();toast('已撤销上次词库修改。');};
$('#parse-words').onclick=()=>{draft=normalizeWords($('#word-input').value);renderDraft();toast(`已整理 ${draft.length} 个单词`);};
$('#word-input').addEventListener('input',()=>{draft=normalizeWords($('#word-input').value);renderDraft();});
$('#load-sample').onclick=()=>{draft=[...SAMPLE];$('#word-input').value=draft.join('\n');renderDraft();};
$('#save-words').onclick=()=>{
 draft=normalizeWords($('#word-input').value);if(!draft.length){toast('请先输入英文单词。');return;}
 state.words=$('#merge-words').checked&&!state.isSample?[...new Set([...state.words,...draft])].slice(0,100):draft;
 state.reviews=Object.fromEntries(Object.entries(state.reviews).filter(([w])=>state.words.includes(w)));
 undoVocabulary=null;draft=[...state.words];renderVocabulary();
 state.label=`${$('#purpose').value} · 导入于 ${localDate()}`;state.isSample=false;save();stats();page('home');seen=[];recommendations();toast('词表已保存，开始在原文里遇见它们。');
};
$('#screenshots').onchange=e=>recognize(e.target.files);
$('#ebooks').onchange=e=>importLocalBooks(e.target.files);
$('#refresh').onclick=recommendations;
$('#reading-mode').onchange=e=>changeReadMode(e.target.value);
$('#reader').addEventListener('close',()=>{if(readerFinished){readerFinished=false;recommendations();}});
$('#start-reading').onclick=()=>articles.length?openReader(0):$('#articles').scrollIntoView({behavior:'smooth'});
$('#close-reader').onclick=()=>$('#reader').close();$('#close-word').onclick=()=>$('#word-dialog').close();
$('#about').onclick=()=>$('#about-dialog').showModal();$('#close-about').onclick=()=>$('#about-dialog').close();
$('#length').value=state.preferences.short?'short':'normal';$('#topic').value=state.preferences.topic;
$('#length').onchange=e=>{state.preferences.short=e.target.value==='short';save();seen=[];recommendations();};
$('#topic').onchange=e=>{state.preferences.topic=e.target.value;save();seen=[];recommendations();};
$('#date-label').textContent=new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});
window.addEventListener('hashchange',()=>page(location.hash.slice(1)));
stats();renderDraft();renderLocalBooks();page(location.hash.slice(1)||'home');recommendations();
if(!storageOK)toast('当前浏览器无法持久保存进度。');
if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register(asset('sw.js'),{updateViaCache:'none'}).catch(()=>{});
