import test from 'node:test';
import assert from 'node:assert/strict';
import {learningWords,learningReviews,setMastered,editWord,deleteWord,selectedWord,addReadingWord} from '../public/vocabulary.mjs';
import {recommend,buildQuiz} from '../public/core.mjs';

const legacy=()=>({words:['anguish','stigma'],reviews:{anguish:{due:0,streak:2},stigma:{due:0,streak:1},removed:{due:0}},read:[]});

test('旧词库兼容；掌握暂停复习，重新加载和恢复后保留历史',()=>{
 const original=legacy();
 assert.deepEqual(learningWords(original),original.words);
 const mastered=JSON.parse(JSON.stringify(setMastered(original,'anguish',true)));
 assert.deepEqual(learningWords(mastered),['stigma']);
 assert.deepEqual(learningReviews(mastered).map(([w])=>w),['stigma']);
 assert.deepEqual(mastered.reviews.anguish,original.reviews.anguish);
 assert.deepEqual(learningWords(setMastered(mastered,'anguish',false)),original.words);
 assert.equal(learningReviews(setMastered(mastered,'anguish',false)).length,2);
 assert.equal(original.mastered,undefined);
});

test('已掌握单词不作为阅读和原句填空目标，全部掌握后无推荐',()=>{
 const text='Anguish and stigma appeared in the story. '+ 'This is a sentence about the people who lived in the village. '.repeat(5);
 const books=[{id:'sample',text,title:'Sample',author:'Test'}];
 let state=setMastered(legacy(),'anguish',true);
 const articles=recommend(books,learningWords(state));
 assert.equal(articles.length,1);
 assert.deepEqual(articles[0].hits,['stigma']);
 assert.deepEqual(buildQuiz(articles[0],learningWords(state)).map(q=>q.word),['stigma']);
 state=setMastered(state,'stigma',true);
 assert.deepEqual(recommend(books,learningWords(state)),[]);
 assert.deepEqual(learningReviews(state),[]);
});

test('修改拼写校验、去重、转移掌握状态并移除不再匹配的旧练习',()=>{
 const original=setMastered(legacy(),'anguish',true);
 const next=editWord(original,'anguish',' ANGUISHED ');
 assert.deepEqual(next.words,['anguished','stigma']);
 assert.deepEqual(next.mastered,['anguished']);
 assert.equal(next.reviews.anguish,undefined);
 assert.ok(original.reviews.anguish);
 assert.throws(()=>editWord(original,'anguish','stigma'),/已有/);
 for(const input of ['two words','x','123','<script>','a'.repeat(33)])assert.throws(()=>editWord(original,'anguish',input),/完整/);
 assert.equal(editWord(original,'anguish','anguish'),original);
});

test('移除单词清除复习，重复导入仍记得掌握状态',()=>{
 const removed=deleteWord(setMastered(legacy(),'anguish',true),'anguish');
 assert.deepEqual(removed.words,['stigma']);
 assert.equal(removed.reviews.anguish,undefined);
 assert.deepEqual(learningReviews(removed).map(([w])=>w),['stigma']);
 const reimported={...removed,words:[...removed.words,'anguish']};
 assert.deepEqual(learningWords(reimported),['stigma']);
 assert.deepEqual(learningWords(setMastered(reimported,'anguish',false)),['stigma','anguish']);
});

test('阅读选词只接受单个英文词，规范大小写、弯引号及句末标点',()=>{
 assert.equal(selectedWord(' “Village,” '),'village');
 assert.equal(selectedWord('DON’T'),"don't");
 assert.equal(selectedWord('well-known'),'well-known');
 for(const text of ['two words','123apple','123','中文','a','a'.repeat(33),'<script>',''])assert.equal(selectedWord(text),'');
});

test('阅读加词立即进入学习词库，去重并保留原有阅读和复习记录',()=>{
 const original={...legacy(),read:[{id:'book-0-2',date:'2026-09-26'}],dailyChoice:{id:'book-0-2',date:'2026-09-26'},isSample:false};
 const next=addReadingWord(original,'Village');
 assert.deepEqual(next.words,['anguish','stigma','village']);
 assert.deepEqual(learningWords(next),next.words);
 assert.deepEqual(next.reviews,original.reviews);assert.deepEqual(next.read,original.read);assert.deepEqual(next.dailyChoice,original.dailyChoice);
 assert.equal(addReadingWord(next,'VILLAGE'),next);
 assert.deepEqual(original.words,['anguish','stigma']);
 assert.throws(()=>addReadingWord(original,'two words'),/完整/);
});

test('已掌握词须明确恢复；移除后记住的掌握状态也能恢复',()=>{
 const original=setMastered(legacy(),'anguish',true);
 assert.equal(addReadingWord(original,'anguish'),original);
 const restored=addReadingWord(original,'anguish',{restore:true});
 assert.ok(learningWords(restored).includes('anguish'));assert.deepEqual(restored.reviews,original.reviews);
 const removed=deleteWord(original,'anguish');
 assert.equal(learningWords(addReadingWord(removed,'anguish')).includes('anguish'),false);
 assert.ok(learningWords(addReadingWord(removed,'anguish',{restore:true})).includes('anguish'));
});

test('词库满时明确拒绝新词，不截断原词库；已有词仍能恢复',()=>{
 const state={...legacy(),words:Array.from({length:100},(_,i)=>'word'+i),mastered:[]};
 state.words[0]='anguish';state.mastered=['anguish'];
 assert.throws(()=>addReadingWord(state,'village'),/已满/);
 assert.equal(state.words.length,100);
 assert.ok(learningWords(addReadingWord(state,'anguish',{restore:true})).includes('anguish'));
});
