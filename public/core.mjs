export const SAMPLE = ['exonerate', 'stigma', 'anguish', 'pictorial', 'dynamite', 'jot', 'revoke'];
const FORMS = {
  exonerate: ['exonerate','exonerates','exonerated','exonerating'],
  stigma: ['stigma','stigmas','stigmata'], anguish: ['anguish','anguished'],
  pictorial: ['pictorial','pictorials'], dynamite: ['dynamite','dynamited'],
  jot: ['jot','jots','jotted','jotting'], revoke: ['revoke','revokes','revoked','revoking']
};
export function normalizeWords(text) {
  return [...new Set((text.toLowerCase().match(/[a-z]+(?:['’-][a-z]+)*/g) || [])
    .map(w => w.replaceAll('’', "'")).filter(w => w.length >= 2 && w.length <= 32))].slice(0,100);
}
export function forms(word) { return FORMS[word] || [word]; }
export function escapeRegex(text) { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
export function wordRegex(word, flags='gi') { return new RegExp('\\b(?:'+forms(word).map(escapeRegex).join('|')+')\\b',flags); }
export function matches(text,words) { return words.filter(w=>wordRegex(w).test(text)); }
export function countWords(text) { return (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).length; }
export function localDate(now=new Date()) { return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; }
export function schedule(previous, correct, now=Date.now()) {
  const streak=correct ? Math.min((previous?.streak||0)+1,5) : 0;
  const days=correct ? [1,1,3,7,14,30][streak] : 1;
  return { streak, due: now + days*86400000, lastResult:correct, reviewedAt:now };
}
export function extractCandidates(book, words, maxLength=320) {
  const paras=book.text.split(/\n\s*\n/).map(p=>p.replace(/\s+/g,' ').trim()).filter(Boolean);
  const result=[];
  for(let i=0;i<paras.length;i++) {
    if(!matches(paras[i],words).length || countWords(paras[i])>maxLength) continue;
    let start=i, end=i, length=countWords(paras[i]);
    if(i>0 && length+countWords(paras[i-1])<=maxLength) { start--; length+=countWords(paras[i-1]); }
    while(length<130 && end+1<paras.length && length+countWords(paras[end+1])<=maxLength) { end++; length+=countWords(paras[end]); }
    if(length<45) continue;
    const paragraphs=paras.slice(start,end+1), text=paragraphs.join('\n\n');
    const hits=matches(text,words);
    result.push({id:`${book.id}-${start}-${end}`,title:book.title,author:book.author,source:book.source,
      mirror:book.mirror,license:book.license,topic:book.topic,local:!!book.local,paragraphs,hits,wordCount:length,
      minutes:Math.max(1,Math.ceil(length/110)),difficulty: length>220?'进阶阅读':'短篇起步',
      score:hits.length*100-Math.abs(length-170)/5});
  }
  return result;
}
// IDs keep the book identity and paragraph range, including for older saved records.
export function isRead(article, history=[]) {
  const range=/^(.*)-(\d+)-(\d+)$/;
  const current=article.id.match(range);
  return history.some(record=>{
    if(record.id===article.id)return true;
    const previous=record.id?.match(range);
    return !!(current&&previous&&current[1]===previous[1]&&Number(current[2])<=Number(previous[3])&&Number(previous[2])<=Number(current[3]));
  });
}
export function markRead(history, article, date) {
  return history.some(record=>record.id===article.id)?history:[...history,{id:article.id,date}];
}
export function recommend(books, words, {limit=3,seen=[],short=false,topic='all',read=[],readMode='unread'}={}) {
  let candidates=books.filter(b=>topic==='all'||b.topic===topic).flatMap(b=>extractCandidates(b,words,short?190:320));
  candidates=candidates.filter(a=>readMode==='all'||(readMode==='read'?isRead(a,read):!isRead(a,read)));
  const selected=[], covered=new Set(), seenSet=new Set(seen);
  const unseen=candidates.filter(a=>!seenSet.has(a.id));
  if(unseen.length)candidates=unseen;
  while(selected.length<limit && candidates.length) {
    candidates.sort((a,b)=>(b.score+matches(b.paragraphs.join(' '),words.filter(w=>!covered.has(w))).length*100-(seenSet.has(b.id)?200:0))-(a.score+matches(a.paragraphs.join(' '),words.filter(w=>!covered.has(w))).length*100-(seenSet.has(a.id)?200:0)));
    const next=candidates.shift(); selected.push(next); next.hits.forEach(w=>covered.add(w));
    candidates=candidates.filter(c=>c.id!==next.id && !c.paragraphs.some(p=>next.paragraphs.includes(p)));
  }
  return selected;
}
export function buildQuiz(article, words) {
  const sentences=article.paragraphs.join(' ').match(/[^.!?]+[.!?]+[”’"']?|[^.!?]+$/g)||[];
  return matches(article.paragraphs.join(' '),words).slice(0,3).map(word=>{
    const sentence=sentences.find(s=>wordRegex(word).test(s))?.trim();
    if(!sentence) return null;
    return {word,sentence,answer:sentence.match(wordRegex(word))[0],prompt:sentence.replace(wordRegex(word),'________')};
  }).filter(Boolean);
}
