import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyCandidates,chooseDailyReading,isRead,markRead,localDate} from '../public/core.mjs';

const paragraph=i=>(`Paragraph ${i}. `+'The quiet village welcomed travellers who shared stories beside the river. '.repeat(9)).trim();
const book=(id='local-example')=>({id,title:'Example Magazine',author:'Test',local:true,topic:'本机电子书',text:Array.from({length:20},(_,i)=>paragraph(i)).join('\n\n'),sections:[{title:'A journey by the river',start:0,end:9},{title:'Life in the quiet village',start:10,end:19}]});

test('每日阅读只选本机书籍，不需要词表；约五分钟并保留真实标题和连续原文',()=>{
 const b=book(),list=dailyCandidates([b,{...b,id:'public',local:false}]);
 assert.ok(list.length>1);
 for(const article of list){
  assert.ok(article.wordCount>=440&&article.wordCount<=660);
  assert.ok(article.minutes>=4&&article.minutes<=6);
  assert.equal(article.bookTitle,b.title);
  assert.equal(article.hasOriginalTitle,true);
  assert.ok(b.sections.some(s=>s.title===article.title));
  assert.ok(b.text.includes(article.paragraphs.join('\n\n')));
  assert.deepEqual(article.hits,[]);
  const indexes=article.paragraphs.map(p=>Number(p.match(/^Paragraph (\d+)/)[1]));
  assert.ok(indexes.every(i=>i<10)||indexes.every(i=>i>=10),'不得跨文章拼接');
 }
 assert.deepEqual(dailyCandidates([{...b,local:false}]),[]);
});

test('同一天读完、重新加载或新增电子书后保留当天选择；次日避开已读',()=>{
 const books=[book()],date='2026-09-26';
 const first=chooseDailyReading(books,{date});
 const choice=JSON.parse(JSON.stringify({date,id:first.id}));
 const read=markRead([],first,date);
 assert.equal(chooseDailyReading([...books,book('local-new')],{date,read,choice}).id,first.id);
 const next=chooseDailyReading(books,{date:'2026-09-27',read,choice});
 assert.ok(next);assert.notEqual(next.id,first.id);assert.equal(isRead(next,read),false);
});

test('昨天未完成时，有其他内容则次日仍换一段',()=>{
 const books=[book()],date='2026-09-26',first=chooseDailyReading(books,{date});
 assert.notEqual(chooseDailyReading(books,{date:'2026-09-27',choice:{date,id:first.id}}).id,first.id);
});

test('尊重词表阅读的段落历史；全部读完不会自动重复推荐',()=>{
 const b=book(),candidates=dailyCandidates([b]);
 const read=[{id:b.id+'-0-0',date:'2026-09-25'}];
 const next=chooseDailyReading([b],{read,date:'2026-09-26'});
 assert.ok(next);assert.equal(isRead(next,read),false);
 assert.equal(chooseDailyReading([b],{read:candidates.map(a=>({id:a.id})),date:'2026-09-27'}),null);
});

test('电子书被删除后不展示旧正文；无本机书籍时返回空',()=>{
 const b=book(),date='2026-09-26',a=chooseDailyReading([b],{date});
 assert.equal(chooseDailyReading([],{date,choice:{date,id:a.id}}),null);
 const next=chooseDailyReading([book('local-other')],{date,choice:{date,id:a.id}});
 assert.equal(next.bookId,'local-other');
});

test('旧书和 TXT 缺少文章标题时不拿文件名冒充；短内容按实际时长标注',()=>{
 const b={...book(),text:paragraph(0),sections:[]};
 const a=chooseDailyReading([b]);
 assert.equal(a.hasOriginalTitle,false);assert.equal(a.title,'原文选段');assert.equal(a.bookTitle,b.title);
 assert.ok(a.minutes<5);assert.ok(a.wordCount<440);
 assert.equal(chooseDailyReading([{...b,text:'too short'}]),null);
});

test('每日边界使用设备本地日期',()=>{
 assert.equal(localDate(new Date(2026,8,26,23,59)),'2026-09-26');
 assert.equal(localDate(new Date(2026,8,27,0,0)),'2026-09-27');
});

test('从词表阅读过部分段落，不误标为整段每日阅读已完成',()=>{
 const b=book(),date='2026-09-26',first=chooseDailyReading([b],{date});
 const start=Number(first.id.match(/-(\d+)-\d+$/)[1]);
 const read=[{id:`${b.id}-${start}-${start}`,date}];
 const selected=chooseDailyReading([b],{date,read,choice:{date,id:first.id}});
 assert.ok(selected);assert.notEqual(selected.id,first.id);assert.equal(isRead(selected,read),false);
});
