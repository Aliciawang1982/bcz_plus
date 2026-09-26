export function learningWords(state) {
  const mastered=new Set(state.mastered||[]);
  return state.words.filter(word=>!mastered.has(word));
}
export function learningReviews(state) {
  const active=new Set(learningWords(state));
  return Object.entries(state.reviews).filter(([word])=>active.has(word));
}
export function setMastered(state,word,value) {
  if(!state.words.includes(word))return state;
  const mastered=new Set(state.mastered||[]);
  if(value)mastered.add(word);else mastered.delete(word);
  return {...state,mastered:[...mastered]};
}
export function editWord(state,oldWord,input) {
  const word=input.trim().toLowerCase().replaceAll('’',"'");
  if(!/^[a-z]+(?:['-][a-z]+)*$/.test(word)||word.length<2||word.length>32)throw Error('请输入一个完整的英文单词（2–32 个字符）。');
  if(word===oldWord)return state;
  if(state.words.includes(word))throw Error('词库中已有这个单词，请换一个拼写。');
  if(!state.words.includes(oldWord))throw Error('该单词已移除，请刷新词库。');
  const reviews={...state.reviews};delete reviews[oldWord];
  const mastered=new Set(state.mastered||[]);
  if(mastered.delete(oldWord))mastered.add(word);
  return {...state,words:state.words.map(w=>w===oldWord?word:w),reviews,mastered:[...mastered]};
}
export function deleteWord(state,word) {
  const reviews={...state.reviews};delete reviews[word];
  return {...state,words:state.words.filter(w=>w!==word),reviews};
}
