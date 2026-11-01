import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../public/desk.html',import.meta.url),'utf8');
const code=html.match(/function scoreForecasts\([\s\S]*?(?=function drawTracker)/)?.[0];
assert.ok(code);let ctx={};vm.createContext(ctx);vm.runInContext(code,ctx);
let result=ctx.scoreForecasts([{probability:.8,marketProbability:.6,outcome:'yes'},{probability:.3,marketProbability:.4,outcome:'no'},{probability:.9,outcome:null}]);
assert.equal(result.count,2);assert.equal(result.paired,2);assert.ok(Math.abs(result.ai-.065)<1e-10);assert.ok(Math.abs(result.market-.16)<1e-10);assert.equal(ctx.scoreForecasts([]).ai,null);
console.log('Forecast tracker scoring and paired market comparison passed.');
