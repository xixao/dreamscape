import {describe,it,expect} from 'vitest';
import {anotherRound,layoutRounds} from './rounds';
import type {VariationSet} from './model';
const round:VariationSet={id:'r1',parentId:'source-option',count:3,teach:true,status:'ready',prompt:'Keep navigation',variations:[{id:'a',name:'A',screens:[{name:'A',layout:'{}',width:1440,height:900}],rationale:{hypothesis:'',assumption:'',tradeoff:'',decisions:[],precedents:[],test:''}}]};
describe('round navigation',()=>{
 it('keeps the same source on reroll and carries constraints and feedback',()=>{const next=anotherRound(round,'Less dense');expect(next.parentId).toBe('source-option');expect(next.id).not.toBe(round.id);expect(next.prompt).toContain('Keep navigation');expect(next.prompt).toContain('Less dense');expect(next.variations).toEqual([]);expect(round.variations).toHaveLength(1);});
 it('places new rounds below existing sections without moving earlier rounds',()=>{const first=layoutRounds([round])[0];const both=layoutRounds([round,{...round,id:'r2'}]);expect(both[0]).toEqual(first);expect(both[1].y).toBeGreaterThan(first.y+first.height);expect(first.options[0].width).toBeGreaterThan(1440);});
 it('keeps options and annotations in separate columns',()=>{const r=layoutRounds([{...round,variations:[round.variations[0],{...round.variations[0],id:'b'}]}])[0];expect(r.options[1].x).toBeGreaterThan(r.options[0].x+r.options[0].width);});
});
