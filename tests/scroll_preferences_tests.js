'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../theme/verdant/core/props.js'),'utf8');
function load(props){const c={Math,parseFloat,isFinite,window:{DPI:96,GetProperty:(k,d)=>props.has(k)?props.get(k):d,SetProperty:(k,v)=>props.set(k,v)}};vm.createContext(c);vm.runInContext(source,c);return c;}
const key='Scrolling: wheel step (px)';let props=new Map();assert.equal(load(props).WHEEL_PX,72);
props=new Map([[key,180]]);assert.equal(load(props).WHEEL_PX,72);assert.equal(props.get(key),72);
props=new Map([[key,120]]);assert.equal(load(props).WHEEL_PX,120,'explicit custom settings should survive');
props.set(key,180);assert.equal(load(props).WHEEL_PX,180,'the default migration runs only once');
console.log('4 scroll preference checks passed');
