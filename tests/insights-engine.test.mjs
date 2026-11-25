import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {InsightsEngine,shanghaiDay,modelSourceText} from '../dist/main/insights-engine.js';
import {KnowledgeVault} from '../dist/main/knowledge-vault.js';
function fixture(){
 const root=mkdtempSync(path.join(os.tmpdir(),'hermes-insights-test-')),home=path.join(root,'index');
 const vault=new KnowledgeVault(path.join(root,'vault'));vault.initialize();
 const date=shanghaiDay();let revision='1',offline=false,calls=0;
 const events=['hermes','codex','claude_code'].map((agent,i)=>({id:`event-${i}`,agent,sourceId:agent,sessionId:agent,nativeId:agent,project:'/fixture',at:`${date}T09:00:00+08:00`,kind:'message.user',actor:'human',path:`/fixture/${agent}`,digest:'abc',available:true,truncated:false,text:i===0?'我偏好简短的中文回复。':'周五 15:00 开会；结论 A 与结论 B 有冲突。'}));
 const nativeCalls=[];
 const options={home,vault,sources:events.map(e=>({id:e.agent,agent:e.agent,root:e.path,enabled:true})),worker:{async call(method,args){if(method==='scan')return [];if(method==='coverage')return [];if(method==='days')return [{date,digest:revision}];if(method==='events')return {items:events,more:false};if(method==='evidence'){const item=events.find(e=>e.id===args.id);if(!item)throw Error('missing');return item;}}},modelKey:()=>revision,model:async prompt=>{calls++;if(offline)throw Error('model offline');if(prompt.includes('"proposals"'))return JSON.stringify({proposals:[{title:'先报告验证',problem:'缺少验证依据',evidence:['event-0'],change:'先报告已运行的验证，再给结论。',verification:'检查未来三次回答',scope:'global',kind:'rule'}]});if(prompt.includes('将同一专题'))return JSON.stringify({body:'# 会议\n周五 15:00 开会。保留 A 与 B 的冲突。'});return JSON.stringify({facts:[{section:'已确认决定',text:'周五 15:00 开会；A 与 B 的冲突仍待解决。',evidence:events.map(e=>e.id)}],topics:[{title:'会议方法',body:'周五 15:00 开会；保留 A 与 B 的冲突。',scope:'/fixture',evidence:['event-1']}],memories:[{text:'偏好简短的中文回复。',quote:'我偏好简短的中文回复。',category:'preference',scope:'global',evidence:['event-0']}]});},native:{pending:async()=>[],memory:async(item,action)=>{nativeCalls.push(action);return item.id;},proposal:async(item,action)=>{nativeCalls.push(action);return {nativeId:item.id};},review:async()=>{}}};
 let engine=new InsightsEngine(options);
 return {root,home,vault,date,events,nativeCalls,get engine(){return engine},calls:()=>calls,setRevision:v=>revision=v,setOffline:v=>offline=v,restart:async()=>{engine.stop();engine=new InsightsEngine(options);await engine.initialize(false);}};
}
test('three sources produce one daily file; duplicate scan, retry and restart are idempotent',async()=>{
 const f=fixture();await f.engine.initialize(false);await f.engine.run(true);assert.equal(f.engine.status().error,undefined);
 assert.equal(f.engine.status().documents.filter(d=>d.kind==='daily').length,1);
 const d=f.engine.status().documents.find(d=>d.kind==='daily');assert.equal(d.evidence.length,3);const first=readFileSync(f.vault.filePath(d.path),'utf8'),calls=f.calls();
 await f.engine.run(true);await f.restart();await f.engine.run(true);assert.equal(f.calls(),calls);assert.equal(readFileSync(f.vault.filePath(d.path),'utf8'),first);assert.equal(f.engine.status().candidates.length,1);assert.ok(existsSync(path.join(f.home,'state.json.backup')));
});
test('Shanghai midnight boundary is independent of machine timezone',()=>{assert.equal(shanghaiDay('2026-11-01T15:59:59Z'),'2026-11-01');assert.equal(shanghaiDay('2026-11-01T16:00:00Z'),'2026-11-02')});
test('unconfirmed memory not injected; confirm, scope, forget, rejection and proposal undo affect context',async()=>{
 const f=fixture();await f.engine.initialize(false);await f.engine.run(true);const item=f.engine.status().candidates[0];assert.equal(item.origin,'explicit');assert.equal(await f.engine.context('unrelated'), '');
 await f.engine.decideMemory(item.id,'confirm');assert.match(await f.engine.context('unrelated'),/偏好简短/);assert.deepEqual(f.nativeCalls,['confirm']);
 assert.match(await f.engine.context('会议','/fixture'),/会议/);assert.doesNotMatch(await f.engine.context('会议','/different'),/资料 Inbox/);
 await f.engine.decideMemory(item.id,'forget');assert.doesNotMatch(await f.engine.context('unrelated'),/偏好简短/);assert.equal(f.nativeCalls[1],'forget');
 const p=f.engine.status().proposals[0];await f.engine.decideProposal(p.id,'apply');assert.match(await f.engine.context('unrelated'),/已确认协作规则/);await f.engine.decideProposal(p.id,'revert');assert.equal(await f.engine.context('unrelated'),'');
 f.setRevision('2');await f.engine.run(true);assert.equal(f.engine.status().candidates.length,1);assert.equal(f.engine.status().candidates[0].status,'forgotten');assert.ok((await f.engine.context('会议','/fixture')).length<=4000);
});
test('manual supplements survive; manual auto-block edits become visible conflicts without overwrite',async()=>{
 const f=fixture();await f.engine.initialize(false);await f.engine.run(true);const d=f.engine.status().documents.find(d=>d.kind==='daily'),file=f.vault.filePath(d.path);
 writeFileSync(file,readFileSync(file,'utf8')+'\n手写补充不能丢。\n');f.setRevision('2');await f.engine.run(true);assert.match(readFileSync(file,'utf8'),/手写补充不能丢/);
 const edited=readFileSync(file,'utf8').replace('暂无新增。','用户修改了自动块。');writeFileSync(file,edited);f.setRevision('3');await f.engine.run(true);assert.match(f.engine.status().error,/冲突/);assert.equal(readFileSync(file,'utf8'),edited);assert.equal(f.engine.status().jobs[0].state,'failed');
});
test('offline model preserves prior outputs; resumes after restart; pause does not stay running',async()=>{
 const f=fixture();await f.engine.initialize(false);f.setOffline(true);await f.engine.run(true);assert.match(f.engine.status().error,/offline/);assert.equal(f.engine.status().documents.length,0);
 f.setOffline(false);await f.restart();await f.engine.run(true);assert.ok(f.engine.status().documents.length);f.engine.pause(true);f.setRevision('2');const calls=f.calls();await f.engine.run(true);assert.equal(f.calls(),calls);f.engine.stop();assert.ok(!f.engine.status().jobs.some(j=>j.state==='running'));
});
test('missing evidence blocks confirmation; deleted candidates are not recreated; corrupt state is preserved',async()=>{
 const f=fixture();await f.engine.initialize(false);await f.engine.run(true);f.events[0].available=false;await assert.rejects(()=>f.engine.decideMemory(f.engine.status().candidates[0].id,'confirm'),/来源/);
 const d=f.engine.status().documents.find(d=>d.kind==='knowledge');rmSync(f.vault.filePath(d.path));f.setRevision('2');await f.engine.run(true);assert.equal(f.vault.exists(d.path),false);
 f.engine.stop();writeFileSync(path.join(f.home,'state.json'),'broken');await assert.rejects(()=>f.restart(),/损坏/);assert.equal(readFileSync(path.join(f.home,'state.json'),'utf8'),'broken');
});
test('shared queue serializes cleanup with memory changes',async()=>{
 const f=fixture();await f.engine.initialize(false);const order=[];await Promise.all([f.engine.exclusive(async()=>{order.push(1);await new Promise(r=>setTimeout(r,20));order.push(2)}),f.engine.exclusive(async()=>{order.push(3)})]);assert.deepEqual(order,[1,2,3]);
});
test('reject survives restart and does not silently become a confirmed preference',async()=>{
 const f=fixture();await f.engine.initialize(false);await f.engine.run(true);const id=f.engine.status().candidates[0].id;await f.engine.decideMemory(id,'reject');await f.restart();f.setRevision('new');await f.engine.run(true);assert.equal(f.engine.status().candidates.find(c=>c.id===id).status,'rejected');assert.equal(await f.engine.context('unrelated'),'');assert.deepEqual(f.nativeCalls,[]);
});
test('pause interrupts an in-flight model job and a later retry completes',async()=>{
 const f=fixture();const original=f.engine.options.model;let started;const ready=new Promise(resolve=>started=resolve);
 f.engine.options.model=async(_,signal)=>{started();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}))};
 await f.engine.initialize(false);const processing=f.engine.run(true);await ready;f.engine.pause(true);await processing;assert.equal(f.engine.status().jobs[0].state,'cancelled');assert.equal(f.engine.status().documents.length,0);
 f.engine.options.model=original;f.engine.pause(false);await f.engine.run(true);f.engine.stop();assert.ok(f.engine.status().documents.length);
});
test('invalid model evidence is not cached as a permanent failed result',async()=>{
 const f=fixture();const valid=f.engine.options.model;f.engine.options.model=async()=>JSON.stringify({facts:[{section:'完成事项',text:'Invented',evidence:['not-a-real-event']}],topics:[],memories:[]});await f.engine.initialize(false);await f.engine.run(true);assert.match(f.engine.status().error,/来源/);assert.equal(f.engine.status().documents.length,0);f.engine.options.model=valid;await f.engine.run(true);assert.equal(f.engine.status().error,undefined);assert.ok(f.engine.status().documents.length);
});
test('assistant repetitions alone do not create independent personal memory evidence',async()=>{
 const f=fixture();f.events[0].actor='assistant';await f.engine.initialize(false);await f.engine.run(true);assert.equal(f.engine.status().error,undefined);assert.equal(f.engine.status().candidates.length,0);assert.deepEqual(f.nativeCalls,[]);
});

test('generated dependency lines are excluded only from model projection while short facts and originals survive',()=>{
 const text='事实：周五 15:00。\nvar a=Object.create(null);'+('webpackModule();'.repeat(3000))+'\n结论仍待验证。';
 const event={kind:'tool.result',text};const result=modelSourceText(event);assert.ok(result.length<200);assert.match(result,/周五 15:00/);assert.match(result,/结论仍待验证/);assert.equal(event.text,text);assert.equal(modelSourceText({kind:'message.user',text}),text);
});
test('long days get a final evidence-checked overview rather than concatenated batch conclusions',async()=>{
 const f=fixture();f.events[0].text='记录项目进展。'.repeat(6000);let consolidated=false;
 f.engine.options.model=async prompt=>{
  if(prompt.includes('"proposals"'))return JSON.stringify({proposals:[]});
  if(prompt.includes('汇总分批事实')){consolidated=true;return JSON.stringify({facts:[{section:'已确认决定',text:'账号已确认；权限尚未验证。',evidence:['event-0','event-1']}]});}
  const batch=JSON.parse(prompt.slice(prompt.lastIndexOf('\n[')+1));return JSON.stringify({facts:batch.map(e=>({section:'下一步',text:e.id==='event-0'?'等待确认账号。':'账号已经确认。',evidence:[e.id]})),topics:[],memories:[]});
 };
 await f.engine.initialize(false);await f.engine.run(true);assert.equal(f.engine.status().error,undefined);assert.equal(consolidated,true);const doc=f.engine.status().documents.find(d=>d.kind==='daily');const text=readFileSync(f.vault.filePath(doc.path),'utf8');assert.match(text,/账号已确认；权限尚未验证/);assert.doesNotMatch(text,/等待确认账号/);assert.ok(f.events[0].text.length>30000);
});
