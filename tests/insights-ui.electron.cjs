// Real renderer, IPC, engine and native Hermes memory in an isolated profile.
const {app,BrowserWindow,ipcMain}=require('electron');
const {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync}=require('fs');
const path=require('path'),os=require('os'),assert=require('assert/strict');
const {InsightsEngine,shanghaiDay}=require('../dist/main/insights-engine.js');
const {HermesNativeMemory}=require('../dist/main/insights-native.js');
const {KnowledgeVault}=require('../dist/main/knowledge-vault.js');
const root=mkdtempSync(path.join(os.tmpdir(),'hermes-insights-ui-'));app.setPath('userData',path.join(root,'electron'));
const vault=new KnowledgeVault(path.join(root,'vault'));vault.initialize();
const native=new HermesNativeMemory(root,path.resolve(__dirname,'../scripts/insights-native.py'),os.homedir());
mkdirSync(path.join(root,'.hermes-console/agents/parent'),{recursive:true});
const event={id:'fixture-evidence',agent:'hermes',sourceId:'hermes',sessionId:'fixture',nativeId:'fixture',project:'/fixture',at:new Date().toISOString(),kind:'message.user',actor:'human',path:'/fixture/session.jsonl',digest:'fixture-only',available:true,truncated:false,text:'请使用简短中文回复；我的项目按周五十五点复盘。'};
let win;
const engine=new InsightsEngine({home:path.join(root,'insights'),vault,sources:[{id:'hermes',agent:'hermes',root:'/fixture',enabled:true}],worker:{async call(method){if(method==='scan'||method==='coverage')return [];if(method==='days')return [{date:shanghaiDay(),digest:'fixture'}];if(method==='events')return {items:[event],more:false};if(method==='evidence')return event;}},model:async prompt=>JSON.stringify(prompt.includes('"proposals"')?{proposals:[{title:'先列验证结果',problem:'记录需要可验证',evidence:[event.id],change:'每次结束时先列实际运行的验证结果。',verification:'观察未来三次工作记录。',scope:'global',kind:'rule'}]}:{facts:[{section:'下一步',text:'周五十五点复盘。',evidence:[event.id]}],topics:[{title:'每周复盘方法',body:'周五十五点复盘项目进展。',scope:'/fixture',evidence:[event.id]}],memories:[{text:'偏好简短中文回复。',quote:'请使用简短中文回复',category:'preference',scope:'global',evidence:[event.id]}]}),native,changed:()=>{if(win&&!win.isDestroyed())win.webContents.send('updated')}});
const wrap=fn=>async(_, ...args)=>{try{return {ok:true,data:await fn(...args)}}catch(e){return {ok:false,reason:e.message}}};
const methods={insightsStatus:()=>engine.status(),insightsRun:()=>engine.run(true),insightsPause:v=>engine.pause(v),insightsSource:(...a)=>engine.source(...a),insightsTimeline:(...a)=>engine.timeline(...a),insightsEvidence:id=>engine.evidence(id),insightsMemory:(...a)=>engine.decideMemory(...a),insightsProposal:(...a)=>engine.decideProposal(...a),insightsNative:(...a)=>engine.reviewNative(...a)};
for(const [name,fn]of Object.entries(methods))ipcMain.handle(name,wrap(fn));
ipcMain.handle('knowledgeSearch',(_,q)=>vault.search(q));
const output=path.resolve(__dirname,'../.cache/insights-ui');mkdirSync(output,{recursive:true});
require('esbuild').buildSync({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {InsightsPanel,InsightsHome} from './src/renderer/InsightsPanel';import './src/renderer/styles.css';createRoot(document.getElementById('root')).render(<><InsightsHome/><InsightsPanel/><InsightsPanel mode="memory"/></>);`,resolveDir:path.resolve(__dirname,'..'),loader:'tsx'},bundle:true,outfile:path.join(output,'bundle.js'),format:'iife',jsx:'automatic',loader:{'.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl','.svg':'dataurl'},define:{'process.env.NODE_ENV':'"production"'}});
writeFileSync(path.join(output,'index.html'),'<html><head><meta charset="utf-8"><link rel="stylesheet" href="bundle.css"><style>body{padding:20px}</style></head><body><div id="root"></div><script src="bundle.js"></script></body></html>');
writeFileSync(path.join(output,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');const api={};for(const name of ${JSON.stringify([...Object.keys(methods),'knowledgeSearch'])})api[name]=(...args)=>ipcRenderer.invoke(name,...args);api.onInsightsUpdated=cb=>{const fn=()=>cb();ipcRenderer.on('updated',fn);return()=>ipcRenderer.removeListener('updated',fn)};contextBridge.exposeInMainWorld('hermes',api);`);
app.whenReady().then(async()=>{
 const errors=[];try{
 await native.configure();await engine.initialize(false);
 win=new BrowserWindow({width:1440,height:1100,show:false,webPreferences:{preload:path.join(output,'preload.cjs')}});win.webContents.on('console-message',(_,level,message)=>{if(level===3)errors.push(message)});
 const js=code=>win.webContents.executeJavaScript(code);
 const wait=async check=>{for(let i=0;i<100;i++){if(await js(check))return;await new Promise(r=>setTimeout(r,100))}throw Error('Timeout '+check)};
 const click=text=>js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled);if(!b)throw Error('missing ${text}');b.click()})()`);
 await win.loadFile(path.join(output,'index.html'));await wait(`document.body.textContent.includes('首次整理完成后')`);
 await js(`document.querySelector('.insights-panel details > summary').click()`);await click('来源时间线 / 搜索');await wait(`document.body.textContent.includes('周五十五点复盘')`);await click('查看完整原文与位置');await wait(`!!document.querySelector('dialog')`);assert.match(await js(`document.querySelector('dialog pre').textContent`),/简短中文/);
 await js(`document.querySelector('[aria-label="关闭来源原文"]')?.click()`);
 await click('立即整理');await wait(`document.body.textContent.includes('确认记住')`);
 assert.equal(await engine.context('unrelated'),'');await click('确认记住');await wait(`document.body.textContent.includes('已确认 · 有用户原话')`);
 const memoryFile=path.join(root,'.hermes-console/agents/parent/memories/USER.md');assert.match(readFileSync(memoryFile,'utf8'),/偏好简短中文/);assert.match(await engine.context('unrelated'),/已确认preference/);
 await click('协作改进');await wait(`document.body.textContent.includes('先列验证结果')`);await click('确认应用');await wait(`document.body.textContent.includes('已应用')`);assert.match(await engine.context('unrelated'),/已确认协作规则/);await click('撤销');await wait(`document.body.textContent.includes('已撤销')`);assert.doesNotMatch(await engine.context('unrelated'),/已确认协作规则/);
 await click('待确认记忆');await click('忘记');await wait(`!document.body.textContent.includes('已确认 · 有用户原话')`);assert.doesNotMatch(readFileSync(memoryFile,'utf8'),/偏好简短中文/);assert.equal(await engine.context('unrelated'),'');
 await click('每日概述');assert.equal(engine.status().documents.filter(d=>d.kind==='daily').length,1);assert.equal(engine.status().documents.filter(d=>d.kind==='knowledge').length,1);
 writeFileSync(path.join(output,'verified.png'),(await win.webContents.capturePage()).toPNG());assert.deepEqual(errors,[]);console.log('PASS: source → daily → knowledge → native memory confirmation → new-conversation context → proposal undo → forget (isolated profile)');engine.stop();app.exit(0);
 }catch(e){console.error(e);engine.stop();app.exit(1)}
});
