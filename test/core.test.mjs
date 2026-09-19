import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeWords,matches,recommend,buildQuiz,schedule,SAMPLE} from '../public/core.mjs';
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
