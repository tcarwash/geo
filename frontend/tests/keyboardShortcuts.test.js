import test from 'node:test';
import assert from 'node:assert/strict';
import {shortcutAction} from '../src/keyboardShortcuts.js';

const key=(key,extra={})=>shortcutAction({key,target:{tagName:'DIV',isContentEditable:false,...extra.target},ctrlKey:false,metaKey:false,altKey:false,...extra});

test('maps unmodified g and l keys to place search and layers',()=>{
  assert.equal(key('g'),'goto');
  assert.equal(key('L'),'layers');
});

test('ignores navigation shortcuts while typing or with modifiers',()=>{
  for(const target of [{tagName:'INPUT'},{tagName:'TEXTAREA'},{tagName:'SELECT'},{tagName:'DIV',isContentEditable:true}])assert.equal(key('g',{target}),null);
  assert.equal(key('l',{ctrlKey:true}),null);
  assert.equal(key('g',{altKey:true}),null);
  assert.equal(key('l',{metaKey:true}),null);
});

test('keeps Escape globally available to dismiss panels and drawing modes',()=>{
  assert.equal(key('Escape',{target:{tagName:'INPUT'}}),'escape');
});
