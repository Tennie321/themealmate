import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../public/desk.html',import.meta.url),'utf8');
const code=html.match(/function paperStats\([\s\S]*?(?=function drawPaper)/)?.[0];assert.ok(code);let ctx={Number,Math};vm.createContext(ctx);vm.runInContext(code,ctx);
let stats=ctx.paperStats([{side:'YES',price:.4,fee:.02,outcome:'yes'},{side:'NO',price:.3,fee:.01,outcome:'yes'},{side:'YES',price:.5,fee:.02,outcome:null}]);assert.equal(stats.count,2);assert.equal(stats.wins,1);assert.equal(stats.losses,1);assert.equal(stats.winRate,.5);assert.ok(Math.abs(stats.net-.27)<1e-10);assert.ok(Math.abs(stats.profitFactor-.58/.31)<1e-10);assert.equal(ctx.paperStats([]).winRate,null);assert.equal(ctx.paperStats([{side:'YES',price:.4,fee:.02,outcome:'yes'}]).noLosses,true);console.log('Paper strategy win rate, P/L and profit factor passed.');
