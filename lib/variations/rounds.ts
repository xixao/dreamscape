import type { VariationSet } from './model';
export function layoutRounds(sets: VariationSet[]) {
 let y=0;
 return sets.map((set,index)=>{
  let x=40;
  const options=set.variations.map(variation=>{
   const width=Math.max(...variation.screens.map(s=>s.width))+320;
   const noteHeight=(variation.rationale.annotations??[]).reduce((sum,n)=>sum+Math.max(150,100+Math.ceil(n.text.length/24)*20),0)+40;
   const height=variation.screens.reduce((sum,s,i)=>sum+Math.max(s.height??1200,i===0?noteHeight:0)+80,0);
   const box={variation,x,y:180,width,height};x+=width+100;return box;
  });
  const round={set,index,x:0,y,width:Math.max(1000,x-60),height:Math.max(400,...options.map(o=>o.height))+240,options};y+=round.height+240;return round;
 });
}
export function anotherRound(set:VariationSet,feedback:string):VariationSet {
 return {id:crypto.randomUUID(),parentId:set.parentId,count:3,countFromPrompt:true,teach:true,status:'pending',variations:[],prompt:`Try another round from the same starting point and constraints. Prior request: ${set.prompt}\nPreviously explored options: ${set.variations.map(v=>v.name).join(', ')}. Explore materially different approaches rather than repeating them.\nDesigner feedback: ${feedback.trim()||'No additional feedback. Generate three alternatives.'}`};
}
