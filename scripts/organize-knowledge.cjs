// One-time, source-preserving organization. Run on a copied vault before deployment.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const matter = require('gray-matter');
const { KnowledgeVault } = require('../dist/main/knowledge-vault.js');
const { knowledgeMetadata, knowledgeTopic, isTransientConversation } = require('../dist/shared/knowledge-taxonomy.js');
const root = path.resolve(process.argv[2] || path.join(require('node:os').homedir(), 'Documents/Hermes Knowledge'));
const apply = process.argv.includes('--apply');
const vault = new KnowledgeVault(root);
const marker = path.join(root, '.hermes-console/organization-v1.json');
if(fs.existsSync(marker)) throw Error('Already organized; refusing to reclassify manual work.');
const before = vault.snapshot();
const seen = new Map(), occupied = new Set(), mapping = new Map();
const plans = before.notes.map(note => {
 const raw = fs.readFileSync(path.join(root,note.path),'utf8'), parsed=matter(raw), data={...parsed.data};
 const question=(parsed.content.match(/## 我的问题\s*\n([\s\S]*?)(?=\n## |$)/)?.[1] || '').replace(/^>+\s?/gm,'').trim();
 const generated=data.source==='hermes-conversation';
 let {kind,status,topic,reason}=knowledgeMetadata(data,note.path,parsed.content);
 let target=note.path, duplicateOf='';
 const base=path.basename(note.path);
 if(note.path.startsWith('Daily/') || (generated && /^\d{4}-\d{2}-\d{2}\.md$/.test(base))) {
   target=`Archive/对话日志/${base}`;kind='log';status='archived';topic='通用';reason='原始对话日志，仅供追溯';
 } else if(note.path.startsWith('Learning/Second Brain/')) {
   topic=knowledgeTopic(note.title,question);
   const fingerprint=crypto.createHash('sha256').update((question+'\n'+(parsed.content.match(/## 精炼结论\n([\s\S]*?)(?=\n## |$)/)?.[1]||'')).replace(/\s+/g,'')).digest('hex');
   const transient=isTransientConversation(question||note.title) || /- 状态：(failed|cancelled)/.test(parsed.content) || (question.length<12 && !/方法|原则|知识/.test(question));
   duplicateOf=seen.get(fingerprint)||'';
   if(duplicateOf) {status='archived';target=`Archive/重复材料/${base}`;reason='问题与摘要完全重复，保留原文供追溯';}
   else if(transient) {status='archived';target=`Archive/操作与片段/${base}`;reason='操作请求、简短反馈或缺少上下文的对话片段';}
   else {status='inbox';target=`Inbox/待整理/${topic}/${base}`;reason='历史对话提取，来源保留；须核对后收录';}
   kind=/每次.*(写|输出)|之后.*(风格|评估)|不要.*(抽象|语气)/.test(question)?'preference':/基本信息|健康风险评估报告/.test(question)?'profile':'material';
   seen.set(fingerprint,note.path);
 } else if(/^未命名笔记/.test(note.title) && /开始记录你的想法/.test(parsed.content)) {
   target=`Archive/空白模板/${base}`;kind='material';status='archived';topic='通用';reason='未填写的初始化模板';
 } else if(note.title==='欢迎来到 Hermes Knowledge') {
   target=`Knowledge/使用指南/${base}`;kind='knowledge';status='active';topic='技术工具';reason='知识库使用说明';
 } else if(note.path.startsWith('Projects/')) {
   kind='project';status='active';topic='职业发展';reason='已有职业资产项目；按原文区分计划、目标与已核验成果';
 }
 if(occupied.has(target.toLowerCase())) target=target.replace(/\.md$/,`-${crypto.createHash('sha256').update(note.path).digest('hex').slice(0,6)}.md`);
 occupied.add(target.toLowerCase());mapping.set(note.path,target);
 const tags=[topic, kind==='preference'?'协作偏好':kind==='profile'?'个人记录':kind==='project'?'职业资产':kind==='log'?'对话日志':status==='archived'?'历史材料':status==='inbox'?'来源材料':'知识导航'];
 if(data.tags) data.previous_tags=data.tags;
 Object.assign(data,{title:note.title,tags:[...new Set(tags)],kind,status,topic,classification_reason:reason,organized_version:1,original_path:note.path,created:data.created||note.createdAt,updated:data.updated||note.updatedAt});
 return {source:note.path,target,raw,body:parsed.content,data,duplicateOf,mtime:fs.statSync(path.join(root,note.path)).mtime};
});
function rewrite(body, source, destination) {
 const resolve=target=>{
  const clean=decodeURIComponent(target).replace(/\.md$/,'');
  for(const candidate of [clean+'.md',path.posix.normalize(path.posix.join(path.posix.dirname(source),clean+'.md'))])if(mapping.has(candidate))return candidate;
  const matches=before.notes.filter(n=>path.basename(n.path,'.md')===clean);
  return matches.length===1?matches[0].path:null;
 };
 body=body.replace(/\[\[([^\]|#]+)(#[^\]|]+)?(\|[^\]]+)?\]\]/g,(all,target,anchor,alias)=>{
  const old=resolve(target);return old?`[[${mapping.get(old).replace(/\.md$/,'')}${anchor||''}${alias||'|'+path.basename(target,'.md')}]]`:all;
 });
 return body.replace(/(!?\[[^\]]*\])\(([^)]+)\)/g,(all,label,href)=>{
  if(/^(https?:|data:|#|mailto:)/.test(href))return all;
  const [ref,anchor]=href.split('#');let decoded;try{decoded=decodeURIComponent(ref);}catch{return all;}
  const old=path.posix.normalize(path.posix.join(path.posix.dirname(source),decoded));
  const target=mapping.get(old)||old;
  if(!mapping.has(old)&&!fs.existsSync(path.join(root,old)))return all;
  return `${label}(${path.posix.relative(path.posix.dirname(destination),target)}${anchor?'#'+anchor:''})`;
 });
}
const counts={};for(const p of plans)counts[p.data.status]=(counts[p.data.status]||0)+1;
console.log(JSON.stringify({originalNotes:plans.length,states:counts,topics:Object.fromEntries([...new Set(plans.filter(p=>p.data.status==='inbox').map(p=>p.data.topic))].map(t=>[t,plans.filter(p=>p.data.status==='inbox'&&p.data.topic===t).length])),archivedExamples:plans.filter(p=>p.data.status==='archived'&&p.data.kind!=='log').slice(0,15).map(p=>p.data.title)},null,2));
if(!apply) process.exit(0);
for(const p of plans) {
 if(p.duplicateOf)p.data.duplicate_of=mapping.get(p.duplicateOf);
 const absolute=path.join(root,p.target);fs.mkdirSync(path.dirname(absolute),{recursive:true});
 const body=rewrite(p.body,p.source,p.target);
 fs.writeFileSync(absolute,matter.stringify(body,p.data));fs.utimesSync(absolute,p.mtime,p.mtime);
}
for(const p of plans)if(p.source!==p.target&&!plans.some(other=>other.target===p.source))fs.unlinkSync(path.join(root,p.source));
const statePath=path.join(root,'.hermes-console/second-brain.json');
if(fs.existsSync(statePath)){const state=JSON.parse(fs.readFileSync(statePath));for(const capture of state.captures||[])for(const key of ['dailyPath','knowledgePath'])if(mapping.has(capture[key]))capture[key]=mapping.get(capture[key]);fs.writeFileSync(statePath,JSON.stringify(state,null,2));}
const added=[];
function add(relative,title,body,tags,kind='knowledge',topic=tags[0]){
 if(fs.existsSync(path.join(root,relative)))throw Error('Generated destination already exists: '+relative);
 vault.writeGenerated(relative,matter.stringify(`# ${title}\n\n${body}\n`,{title,tags,kind,status:'active',topic,source:'knowledge-organization',classification_reason:'基于原始材料整理；来源可追溯',organized_version:1}));added.push(relative);
}
const wiki=p=>`[[${p.target.replace(/\.md$/,'')}|${p.data.title.replace(/[\]|]/g,'')}]]`;
const topics=[...new Set(plans.filter(p=>p.data.status==='inbox').map(p=>p.data.topic))].sort();
for(const topic of topics){
 const entries=plans.filter(p=>p.data.status==='inbox'&&p.data.topic===topic);
 add(`Knowledge/主题索引/${topic}.md`,`${topic} · 材料索引`, `这些是待核对的历史材料，索引不代表内容已被验证。相近主题不自动当作重复；历史个人状态不视为当前事实。\n\n${entries.map(p=>'- '+wiki(p)).join('\n')}`,[topic,'主题索引'],'material',topic);
}
const learning=plans.find(p=>p.data.title.includes('先博后渊')&&p.body.includes('整套体系'));
if(learning)add('Knowledge/学习方法/先博后渊：先建立知识地图.md','先博后渊：先建立知识地图',`## 从原始自述整理\n\n- 先了解整个领域的主要部分、相互关系和可延伸方向，再选择具体方向深入。\n- 将当前课程放回整体知识地图，知道正在学什么，以及为什么学。\n- 同时看见不同方向，能够比较选择，减少只追逐眼前信息带来的反复投入。\n\n这是个人学习经验的整理，不构成普遍有效性的验证；原对话中助手援引的人物和理论未在这里当作已核实依据。\n\n## 来源\n\n${wiki(learning)}`,['学习方法','知识地图']);
const writing=plans.find(p=>p.body.includes('每次我让你写完文章以后')&&p.body.includes('利他性'));
if(writing)add('Profile/协作偏好/写作后评估读者价值.md','写作后评估读者价值',`用户在原始对话中明确要求：每次写完文章，同时评估文章的利他性，说明对读者的影响，并给出可以改善表达和内容的具体建议。\n\n这是写作协作偏好，不是新的待办，也不代表原文章已经具备这些价值。\n\n## 原始依据\n\n${wiki(writing)}`,['内容创作','协作偏好'],'preference','内容创作');
add('Knowledge/职业发展/职业成果的证据边界.md','职业成果的证据边界','依据现有职业资产总览与成长基线：\n\n- 计划、意向和目标不能记作已经完成的项目。\n- 每条成果记录保留来源、个人角色和证据状态。\n- 尚未提供实际作品或效果数据的条目保留为待验证；不能补写成果或增长数字。\n- 周度复盘比较同类证据，保留旧版本，不把一次讨论直接当成能力提升。\n\n## 来源\n\n[[Projects/个人职业资产/00-职业资产总览|职业资产总览]]\n\n[[Projects/个人职业资产/01-成长基线|成长基线]]',['职业发展','证据管理']);
add('Knowledge/00-知识库导航.md','知识库导航',`## 使用方式\n\n- **正式内容**：已整理的知识、项目入口、明确表达的协作偏好，以及主题导航。\n- **待整理**：自动提取的候选材料；核对正文、来源、适用范围后点击“确认收录”。\n- **已归档**：对话日志、操作过程、重复材料、空白模板。原文保留，可恢复到待整理。\n\n类型用于区分知识与方法、项目资料、个人记录、协作偏好、参考材料和历史记录；主题和 1–3 个标签用于检索，不再根据助手回答中的所有词语铺满标签。\n\n## 优先入口\n\n- [[Projects/个人职业资产/00-职业资产总览|个人职业资产与作品集]]\n- [[Knowledge/学习方法/先博后渊：先建立知识地图|学习方法：先建立地图]]\n- [[Profile/协作偏好/写作后评估读者价值|写作协作偏好]]\n- [[Knowledge/职业发展/职业成果的证据边界|职业成果的证据边界]]\n\n## 按主题查材料\n\n${topics.map(t=>`- [[Knowledge/主题索引/${t}|${t}]]`).join('\n')}\n\n## 本次整理\n\n原有 ${plans.length} 篇笔记全部保留，其中 ${counts.active||0} 篇已有正式内容、${counts.inbox||0} 篇待核对材料、${counts.archived||0} 篇历史归档。文件夹迁移保留链接和原路径；原文有完整备份。\n\n## 参考 Cola 的边界\n\n参考本机 Cola 的长期记忆、日级临时材料、项目工作区分离方式，以及事实、偏好、特征、阶段状态的区分。这里没有复制 Cola 的个人记忆，也没有把项目资料混入用户人格画像。\n\n## 之后的入库规则\n\n自动收集先进入待整理，模型问答、权限反馈、安装过程和失败任务只进历史日志。只把可复用、来源明确的内容收录为正式知识。阶段性个人记录需标注日期，未经确认的推断保持待整理。`,['知识管理','导航']);
const after=vault.snapshot();
if(after.notes.length!==before.notes.length+added.length)throw Error('Note count mismatch');
const broken=[];
for(const note of before.notes)for(const target of note.links){const mapped=after.notes.find(n=>n.path===mapping.get(note.path));if(!mapped.links.includes(mapping.get(target)))broken.push([note.path,target]);}
if(broken.length)throw Error('Lost pre-existing resolved links: '+JSON.stringify(broken));
for(const p of plans){const saved=matter(fs.readFileSync(path.join(root,p.target),'utf8'));if(saved.content!==rewrite(p.body,p.source,p.target))throw Error('Body mismatch '+p.source);}
fs.writeFileSync(marker,JSON.stringify({version:1,at:new Date().toISOString(),reference:'Local Cola: memory, bookmarks, project boundaries',beforeCount:before.notes.length,afterCount:after.notes.length,added,mapping:Object.fromEntries(mapping),counts},null,2));
console.log(JSON.stringify({verified:true,originalBodiesPreserved:plans.length,resolvedLinksPreserved:before.notes.reduce((n,p)=>n+p.links.length,0),newNotes:added.length,afterCount:after.notes.length,untagged:after.notes.filter(n=>!n.tags.length).length},null,2));
