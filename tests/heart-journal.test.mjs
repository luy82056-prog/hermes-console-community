import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HeartJournal, parseNativeMemories } from '../dist/main/heart-journal.js';
import { classifyJournal } from '../dist/shared/heart-journal.js';
import { extractHeartprintMemories } from '../dist/main/heartprint-memory.js';
function fixture(t) { const dir = mkdtempSync(path.join(os.tmpdir(), 'heart-journal-')); t.after(() => rmSync(dir, {recursive:true,force:true})); const file = path.join(dir,'journal.json'); return { journal: new HeartJournal(file), file }; }
test('native baselines, deduplication, replacement and restart preserve a real timeline', t => {
 const {journal,file}=fixture(t);
 journal.sync('Hermes', parseNativeMemories('我重视亲密关系\n§\n我想改善业务'), '2026-09-01T00:00:00Z');
 assert.equal(journal.entries().length,2);
 assert.ok(journal.entries().every(e=>e.kind==='baseline'));
 journal.sync('Hermes',['我重视亲密关系','我想改善业务']);
 assert.equal(journal.entries().length,2);
 journal.sync('Hermes',['我学会了表达情绪','我想改善业务'],'2026-09-02T00:00:00Z');
 assert.equal(journal.entries().filter(e=>e.kind==='removed').length,1);
 assert.equal(journal.entries().filter(e=>e.kind==='added').length,1);
 assert.equal(new HeartJournal(file).entries().length,4);
});
test('manual classification survives synchronization and restart',t=>{
 const {journal,file}=fixture(t);journal.sync('Hermes',['客户关系']);const id=journal.entries()[0].id;
 journal.categorize(id,'emotion');journal.sync('Hermes',['客户关系']);
 assert.equal(new HeartJournal(file).entries()[0].topic,'emotion');
 assert.throws(()=>journal.categorize(id,'invalid'));
});
test('working-memory eviction never erases historical Console observations',t=>{
 const {journal}=fixture(t);journal.capture(['我希望学习商业知识'],'2026-08-01T00:00:00Z');journal.capture(['我喜欢读书']);journal.capture(['我喜欢读书']);
 assert.equal(journal.entries().length,2);assert.ok(journal.entries().every(e=>e.kind==='added'));
});
test('corrupt archive is preserved rather than silently overwritten',t=>{
 const {journal,file}=fixture(t);writeFileSync(file,'broken');assert.throws(()=>journal.sync('Hermes',['x']));assert.equal(readFileSync(file,'utf8'),'broken');
});
test('native secrets are excluded and personal insights can be captured',t=>{
 const {journal}=fixture(t);journal.sync('Hermes',['api_key=secret-value','我重视亲密关系']);assert.equal(journal.entries().length,1);
 assert.equal(classifyJournal('我学会了表达自己的情绪'),'emotion');
 assert.equal(classifyJournal('我的业务是教育服务'),'business');
 assert.equal(extractHeartprintMemories('我意识到亲密关系需要主动表达自己的情绪。').length,1);
 assert.equal(extractHeartprintMemories('帮我写一篇商业文章。').length,0);
});

test('purpose classification fixes screenshots without treating every project as business',()=>{
 const cases = [
  ['已完成一本书的学习并内化为技能。核心方法论总结。资料目录 /Users/example/notes', 'learning'],
  ['文章完成后将学到的知识点自动归档到内置知识库，不要存到 Obsidian。', 'tools'],
  ['用户说“梳理复盘”时，默认保留其思路并整理成项目分析提纲；可反问，但不要套用随笔或文章写作格式。','preference'],
  ['资料收集工作流：关注 skills/MCP/research agents/抓取工具。小红书只读已配。','tools'],
  ['用户允许在资料收集工作流中使用Cookie/登录态，但偏好低风险：只读、低频、最小权限。','tools'],
  ['User wants future writing collaboration sessions to follow the skill as the default support mode.','preference'],
  ['For the user\'s article about亲密关系: key favored expressions include love.','preference'],
  ['Notion API 已配置成功，周报数据库与技能已创建。','tools'],
  ['我开始学习 API 调用与编程。','learning'],
  ['希望系统学习石油、降息、利率与通胀之间的关系。','learning'],
  ['User is learning finance for personal investing, not employment.','learning'],
  ['User manages sales and business revenue.','business'],
  ['目前主要从事教育相关工作，未来继续深耕教育。','business'],
  ['我学会了表达自己的情绪。','emotion'],
  ['健康档案更新：腰椎疼痛，情绪担忧。PDF路径 /Users/example/report.pdf','life'],
  ['这个项目已经处理好了。','other'],
  ['关注 business management 和 emotional resonance。','other'],
 ];
 for(const [text,topic] of cases) assert.equal(classifyJournal(text),topic,text);
});
test('legacy reclassification preserves original evidence and likely manual choices with a backup',t=>{
 const {journal,file}=fixture(t);
 const entries=[
 {id:'a',text:'资料收集工作流：只读工具',topic:'business',source:'Hermes',kind:'baseline',at:'2026-09-01'},
 {id:'b',text:'客户关系',topic:'emotion',source:'Hermes',kind:'baseline',at:'2026-09-01'},
 ];
 const raw=JSON.stringify({version:1,sources:{Hermes:entries.map(e=>e.text)},entries});writeFileSync(file,raw);
 const migrated=journal.entries();
 assert.equal(migrated.find(e=>e.id==='a').topic,'tools');
 assert.equal(migrated.find(e=>e.id==='b').topic,'emotion');
 assert.equal(migrated.find(e=>e.id==='b').classificationSource,'manual');
 assert.equal(readFileSync(file+'.before-rules-v2','utf8'),raw);
 assert.deepEqual(migrated.slice().reverse().map(({id,text,source,at,kind})=>({id,text,source,at,kind})),entries.map(({id,text,source,at,kind})=>({id,text,source,at,kind})));
});
test('manual corrections apply to duplicates, removal and re-addition across sources',t=>{
 const {journal,file}=fixture(t);journal.sync('A',['客户关系']);journal.sync('B',['客户关系']);
 journal.categorize(journal.entries()[0].id,'emotion');
 assert.ok(journal.entries().every(e=>e.topic==='emotion'));
 journal.sync('A',[]);journal.sync('A',['客户关系']);journal.capture(['客户关系']);
 assert.ok(new HeartJournal(file).entries().every(e=>e.topic==='emotion' && e.classificationSource==='manual'));
});
