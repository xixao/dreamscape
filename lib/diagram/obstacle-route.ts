import { getHandlePosition, type Box, type Point, type Side, type PathResult } from './geometry';

const GAP = 36;
const directions: Record<Side, Point> = {left:{x:-1,y:0},right:{x:1,y:0},top:{x:0,y:-1},bottom:{x:0,y:1}};
export function segmentHitsBox(a: Point, b: Point, box: Box): boolean {
  return a.x === b.x
    ? a.x > box.x && a.x < box.x + box.width && Math.max(a.y,b.y) > box.y && Math.min(a.y,b.y) < box.y + box.height
    : a.y > box.y && a.y < box.y + box.height && Math.max(a.x,b.x) > box.x && Math.min(a.x,b.x) < box.x + box.width;
}
export type ObstacleRoute = PathResult & { points: Point[]; blocked: boolean };
const cache = new Map<string, ObstacleRoute>();
function result(points: Point[], blocked=false): ObstacleRoute {
  const simple = points.filter((p,i) => !i || p.x!==points[i-1].x || p.y!==points[i-1].y);
  for(let i=simple.length-2;i>0;i--) if((simple[i-1].x===simple[i].x&&simple[i].x===simple[i+1].x)||(simple[i-1].y===simple[i].y&&simple[i].y===simple[i+1].y))simple.splice(i,1);
  const lengths=simple.slice(1).map((p,i)=>Math.abs(p.x-simple[i].x)+Math.abs(p.y-simple[i].y));
  let remaining=lengths.reduce((a,b)=>a+b,0)/2, label=simple[0];
  for(let i=0;i<lengths.length;i++){if(remaining<=lengths[i]){const t=lengths[i]?remaining/lengths[i]:0;label={x:simple[i].x+(simple[i+1].x-simple[i].x)*t,y:simple[i].y+(simple[i+1].y-simple[i].y)*t};break;}remaining-=lengths[i];}
  return {path:simple.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' '),labelX:label.x,labelY:label.y,points:simple,blocked};
}

/** Orthogonal visibility-grid A*. No route is accepted through an obstacle.
 * Geometry-keyed bounded cache keeps selection/hover renders inexpensive. */
export function routeAroundObstacles(source: Box, sourceSide: Side, target: Box, targetSide: Side, obstacles: readonly Box[]): ObstacleRoute {
  const geometry=(box:Box)=>[box.x,box.y,box.width,box.height];
  const key=JSON.stringify([geometry(source),sourceSide,geometry(target),targetSide,obstacles.map(geometry)]);
  const cached=cache.get(key);if(cached)return cached;
  const a=getHandlePosition(source,sourceSide),b=getHandlePosition(target,targetSide);
  const extend=(p:Point,side:Side)=>({x:p.x+directions[side].x*(GAP+2),y:p.y+directions[side].y*(GAP+2)});
  const start=extend(a,sourceSide),end=extend(b,targetSide);
  const same=(x:Box,y:Box)=>x.x===y.x&&x.y===y.y&&x.width===y.width&&x.height===y.height;
  const boxes=[...obstacles.filter(o=>!same(o,source)&&!same(o,target)),source,...(same(source,target)?[]:[target])].map(o=>({x:o.x-GAP,y:o.y-GAP,width:o.width+GAP*2,height:o.height+GAP*2}));
  const xs=[...new Set([start.x,end.x,...boxes.flatMap(o=>[o.x,o.x+o.width])])].sort((a,b)=>a-b);
  const ys=[...new Set([start.y,end.y,...boxes.flatMap(o=>[o.y,o.y+o.height])])].sort((a,b)=>a-b);
  const nx=xs.length,ny=ys.length;
  const point=(i:number)=>({x:xs[i%nx],y:ys[Math.floor(i/nx)]});
  const first=ys.indexOf(start.y)*nx+xs.indexOf(start.x),last=ys.indexOf(end.y)*nx+xs.indexOf(end.x);
  // Each vertex has two arrival axes; changing axis has a bend penalty.
  const costs=new Float64Array(nx*ny*2).fill(Infinity),previous=new Int32Array(nx*ny*2).fill(-1);
  const heap:{state:number;cost:number;score:number}[]=[];
  const push=(item:typeof heap[number])=>{let i=heap.length;heap.push(item);while(i>0){const p=(i-1)>>1;if(heap[p].score<=item.score)break;heap[i]=heap[p];i=p;}heap[i]=item;};
  const pop=()=>{const item=heap[0],tail=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].score<heap[c].score)c++;if(heap[c].score>=tail.score)break;heap[i]=heap[c];i=c;}heap[i]=tail;}return item;};
  const h=(p:Point)=>Math.abs(p.x-end.x)+Math.abs(p.y-end.y);
  for(let d=0;d<2;d++){costs[first*2+d]=0;push({state:first*2+d,cost:0,score:h(start)});}
  let found=-1;
  while(heap.length){const current=pop();if(current.cost!==costs[current.state])continue;const v=current.state>>1,p=point(v);if(v===last){found=current.state;break;}
    const x=v%nx,y=Math.floor(v/nx);
    for(const [next,axis] of [[x>0?v-1:-1,0],[x+1<nx?v+1:-1,0],[y>0?v-nx:-1,1],[y+1<ny?v+nx:-1,1]]){
      if(next<0)continue;const q=point(next);if(boxes.some(box=>segmentHitsBox(p,q,box)))continue;
      const state=next*2+axis,cost=current.cost+Math.abs(p.x-q.x)+Math.abs(p.y-q.y)+((current.state%2)!==axis?40:0);
      if(cost>=costs[state])continue;costs[state]=cost;previous[state]=current.state;push({state,cost,score:cost+h(q)});
    }
  }
  let route:ObstacleRoute;
  if(found<0)route=result([a,start,{x:start.x,y:end.y},end,b],true);
  else {const points:Point[]=[];for(let s=found;s>=0;s=previous[s])points.push(point(s>>1));route=result([a,...points.reverse(),b]);}
  if(obstacles.some(o=>!same(o,source)&&!same(o,target)&&(segmentHitsBox(a,start,o)||segmentHitsBox(end,b,o))))route={...route,blocked:true};
  if(cache.size>=500)cache.clear();cache.set(key,route);return route;
}
