import test from 'node:test';
import assert from 'node:assert/strict';
import {learningWords,learningReviews,setMastered,editWord,deleteWord} from '../public/vocabulary.mjs';
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
