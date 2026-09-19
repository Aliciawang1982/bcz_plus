import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeWords,matches,recommend,buildQuiz,schedule,SAMPLE,isRead,markRead} from '../public/core.mjs';
const books=JSON.parse(await readFile(new URL('../data/books.json',import.meta.url),'utf8'));
test('词表去重、标点分隔和数量限制',()=>{
 assert.deepEqual(normalizeWords('Anguish，stigma\nanguish 2026.09.18 今日复习'),['anguish','stigma']);
 assert.equal(normalizeWords('<script>alert(1)</script>').includes('<script>'),false);
 assert.deepEqual(normalizeWords(' 123 今日复习 '),[]);
});
test('匹配支持明确词形，同时拒绝子串误匹配',()=>{
 assert.deepEqual(matches('He was exonerated, and jotted it down.',['exonerate','jot']),['exonerate','jot']);
 assert.deepEqual(matches('stigmatize rejoins revoker',['stigma','jot','revoke']),[]);
});
test('推荐保留可核实的原文，不凭空填充目标词',()=>{
 const result=recommend(books,SAMPLE);assert.equal(result.length,3);
 for(const article of result){
  const source=books.find(b=>b.title===article.title);
  for(const paragraph of article.paragraphs)assert.ok(source.text.replace(/\s+/g,' ').includes(paragraph));
  assert.deepEqual(article.hits,matches(article.paragraphs.join(' '),SAMPLE));
  assert.ok(article.wordCount<=320);assert.ok(article.source.startsWith('https://www.gutenberg.org/'));
 }
});
test('短阅读、主题筛选和无匹配均诚实返回',()=>{
 const short=recommend(books,SAMPLE,{short:true,topic:'推理'});
 assert.ok(short.every(a=>a.wordCount<=190&&a.topic==='推理'));
 assert.deepEqual(recommend(books,['zzzzimaginarywordzzzz']),[]);
});
test('练习取自原句并保留正确词形',()=>{
 const quiz=buildQuiz({paragraphs:['He was exonerated. She jotted it down.']},['exonerate','jot']);
 assert.equal(quiz[0].answer,'exonerated');assert.equal(quiz[0].prompt,'He was ________.');
 assert.equal(quiz[1].answer,'jotted');
});
test('复习间隔递增，答错重置，输入状态不被修改',()=>{
 const now=100000000;const first=schedule(null,true,now),second=schedule(first,true,now),wrong=schedule(second,false,now);
 assert.equal(first.due,now+86400000);assert.equal(second.due,now+3*86400000);
 assert.equal(wrong.streak,0);assert.equal(wrong.due,now+86400000);assert.equal(second.streak,2);
});
test('旧格式阅读记录在重新载入后排除已读选段，允许主动重读',()=>{
 const first=recommend(books,SAMPLE);
 const read=JSON.parse(JSON.stringify(first.map(a=>({id:a.id,date:'2026-09-19'}))));
 const next=recommend(books,SAMPLE,{read});
 assert.ok(next.length);assert.ok(next.every(a=>!isRead(a,read)));
 const reread=recommend(books,SAMPLE,{read,readMode:'read'});
 assert.ok(reread.length);assert.ok(reread.every(a=>isRead(a,read)));
 const short=recommend(books,SAMPLE,{read,short:true});assert.ok(short.every(a=>!isRead(a,read)));
});
test('全部读完后保持空列表，不回填已读内容；无匹配区别于已读',()=>{
 let read=[],rounds=0;
 while(true){const result=recommend(books,SAMPLE,{read});if(!result.length)break;read.push(...result.map(a=>({id:a.id,date:'2026-09-19'})));assert.ok(++rounds<30);}
 assert.ok(read.length>3);assert.deepEqual(recommend(books,SAMPLE,{read}),[]);
 assert.ok(recommend(books,SAMPLE,{read,readMode:'read'}).length);
 assert.deepEqual(recommend(books,['zzzzimaginarywordzzzz'],{read,readMode:'read'}),[]);
});
test('段落重叠跨长度去重，本机书名中的连字符不影响身份，同书其他段落仍可读',()=>{
 const read=[{id:'local-my-book-123-456-10-12',date:'2026-09-19'}];
 assert.equal(isRead({id:'local-my-book-123-456-12-14'},read),true);
 assert.equal(isRead({id:'local-my-book-123-456-13-15'},read),false);
 assert.equal(isRead({id:'other-book-10-12'},read),false);
});
test('阅读记录不截断；次日主动重读不重复计为新阅读；练习仍能生成',()=>{
 const history=Array.from({length:1001},(_,i)=>({id:`book-${i}-${i}`,date:'2026-09-18'}));
 const article=recommend(books,SAMPLE)[0];
 const saved=markRead(history,article,'2026-09-19');assert.equal(saved.length,1002);assert.deepEqual(saved[0],history[0]);
 assert.deepEqual(markRead(saved,article,'2026-09-20'),saved);
 assert.ok(buildQuiz(article,SAMPLE).length);
});
test('换一组在有未展示选段时不重复当前组',()=>{
 const first=recommend(books,SAMPLE),second=recommend(books,SAMPLE,{seen:first.map(a=>a.id)});
 assert.ok(second.length);assert.ok(second.every(a=>!first.some(b=>b.id===a.id)));
});
