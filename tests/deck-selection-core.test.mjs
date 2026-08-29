import test from 'node:test';
import assert from 'node:assert/strict';
import {DECK_SLOT_COUNT,createDeckSelectionController,deckIndexToNumber,deckNumberToIndex} from '../browser/deck-selection-core.mjs';

function store(seed={}){const m=new Map(Object.entries(seed));return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v))};}

test('Deck 1..12 can be selected exactly',()=>{const c=createDeckSelectionController();for(let n=1;n<=DECK_SLOT_COUNT;n++){const s=c.selectDeckNumber(n);assert.equal(s.selectedDeckNumber,n);assert.equal(s.selectedDeckIndex,n-1);}});

test('selection persists and reloads',()=>{const s=store();createDeckSelectionController({storage:s}).selectDeckNumber(9);assert.equal(createDeckSelectionController({storage:s}).snapshot().selectedDeckNumber,9);});

test('bad persisted state falls back to Deck 1',()=>{for(const raw of ['-1','12','999','NaN','']){assert.equal(createDeckSelectionController({storage:store({'gameroad:selectedDeckIndex':raw})}).snapshot().selectedDeckNumber,1);}});

test('out-of-range selection fails instead of substituting another deck',()=>{const c=createDeckSelectionController();assert.throws(()=>c.selectDeckNumber(0),RangeError);assert.throws(()=>c.selectDeckNumber(13),RangeError);assert.equal(deckNumberToIndex(12),11);assert.equal(deckIndexToNumber(0),1);});
