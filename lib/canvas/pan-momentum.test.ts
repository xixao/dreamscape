import {expect,it} from 'vitest';
import {panMomentum} from './pan-momentum';
it('coasts in the throw direction at the sampled release speed',()=>{
  expect(panMomentum([{x:0,y:0,time:0},{x:50,y:-25,time:50}],55)).toEqual({x:200,y:-100,duration:600});
});
it('stops after a pause or a slow drag and caps fast throws',()=>{
  expect(panMomentum([{x:0,y:0,time:0},{x:50,y:0,time:50}],150)).toBeNull();
  expect(panMomentum([{x:0,y:0,time:0},{x:1,y:0,time:50}],50)).toBeNull();
  const result=panMomentum([{x:0,y:0,time:0},{x:5000,y:5000,time:10}],10)!;
  expect(Math.hypot(result.x,result.y)).toBeCloseTo(600);
  expect(panMomentum([{x:0,y:0,time:0}],0)).toBeNull();
});
