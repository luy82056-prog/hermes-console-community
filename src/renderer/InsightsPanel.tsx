import { useEffect, useState } from "react";
import { BookOpen, Check, Clock3, Pause, Play, Search, Sparkles, Undo2, X } from "lucide-react";
import type { InsightsSnapshot, InsightResult, SourceRef } from "../shared/insights";
import "./insights.css";

const labels = { hermes:"Hermes",codex:"Codex",claude_code:"Claude Code" };
const statuses:Record<string,string>={queued:"等待",running:"处理中",completed:"完成",partial:"部分完成",failed:"失败",interrupted:"已中断",cancelled:"已暂停"};
function useInsights() {
  const [state,setState]=useState<InsightsSnapshot|null>(null),[error,setError]=useState("");
  async function refresh() {try {const result=await window.hermes.insightsStatus();if(!result.ok)throw new Error(result.reason);setState(result.data);}catch(e){setError(String(e));}}
  useEffect(()=>{
    if(!window.hermes.insightsStatus)return;
    void refresh();let timer:ReturnType<typeof setTimeout>|undefined;
    const stop=window.hermes.onInsightsUpdated(()=>{if(!timer)timer=setTimeout(()=>{timer=undefined;void refresh();},250);});
    const focused=()=>{void refresh();};window.addEventListener("focus",focused);document.addEventListener("visibilitychange",focused);
    return()=>{stop();if(timer)clearTimeout(timer);window.removeEventListener("focus",focused);document.removeEventListener("visibilitychange",focused);};
  },[]);
  return {state,error,setError,refresh};
}
function openKnowledge(file?:string) {
  if(file)sessionStorage.setItem("hermes:open-note",file);
  window.dispatchEvent(new CustomEvent("hermes:insights:navigate",{detail:"knowledge"}));
}
export function InsightsHome() {
  const {state,error}=useInsights();if(!state)return error?<p role="alert">{error}</p>:null;
  const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const today=state.documents.find(d=>d.kind==="daily"&&d.title===date),pending=state.candidates.filter(c=>c.status==="pending").length;
  return <section className="insights-home" aria-label="记忆与知识沉淀">
    <button onClick={()=>openKnowledge(today?.path)}><BookOpen size={20}/><strong>今日概述</strong><span>{today?"回看今天的收获与下一步":"记录汇总后自动生成"}</span></button>
    <button onClick={()=>window.dispatchEvent(new CustomEvent("hermes:insights:navigate",{detail:"heartprint"}))}><Check size={20}/><strong>待确认记忆 · {pending}</strong><span>查看依据，确认后生效</span></button>
    <button onClick={()=>openKnowledge(state.documents[0]?.path)}><Sparkles size={20}/><strong>最近沉淀</strong><span>{state.documents[0]?.title||"等待首次整理"}</span></button>
  </section>;
}
export function InsightsPanel({mode="knowledge",onOpenNote}:{mode?:"knowledge"|"memory";onOpenNote?:(file:string)=>void}) {
  const {state,error,setError,refresh}=useInsights();
  const [tab,setTab]=useState(mode==="memory"?"memory":"daily"),[busy,setBusy]=useState(false),[query,setQuery]=useState(""),[day,setDay]=useState("");
  const [events,setEvents]=useState<SourceRef[]>([]),[more,setMore]=useState(false),[offset,setOffset]=useState(0),[evidence,setEvidence]=useState<SourceRef|null>(null);
  const [notes,setNotes]=useState<Array<{path:string;title:string}>>([]);
  async function act(operation:()=>Promise<InsightResult<unknown>>) {setBusy(true);setError("");try{const result=await operation();if(!result.ok)throw new Error(result.reason);await refresh();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  async function inspect(id:string) {await act(async()=>{const result=await window.hermes.insightsEvidence(id);if(result.ok)setEvidence(result.data);return result;});}
  async function search(next=0) {await act(async()=>{
    const result=await window.hermes.insightsTimeline(query,day||undefined,next);
    if(result.ok){setEvents(result.data.items);setMore(result.data.more);setOffset(next);}
    if(query && next===0){const found=await window.hermes.knowledgeSearch(query);setNotes(found as Array<{path:string;title:string}>);}else setNotes([]);
    return result;
  });}
  useEffect(()=>{
    const handler=(event:Event)=>{
      const anchor=(event.target as HTMLElement)?.closest?.('a[href^="hermes-evidence:"]');
      if(anchor){event.preventDefault();void inspect(anchor.getAttribute('href')!.slice('hermes-evidence:'.length));}
    };
    document.addEventListener('click',handler);return()=>document.removeEventListener('click',handler);
  },[]);
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setEvidence(null);};document.addEventListener("keydown",close);return()=>document.removeEventListener("keydown",close);},[]);
  if(!window.hermes.insightsStatus)return null;
  if(!state)return <div className="insights-panel">{error||"读取沉淀状态…"}</div>;
  const running=state.jobs.find(j=>j.state==="running");
  const tabs=mode==="memory"?[['memory','待确认记忆'],['proposals','协作改进'],['native','原生写入与撤销']]:[['daily','每日概述'],['timeline','来源时间线 / 搜索'],['jobs','整理进度与来源']];
  const refs=(ids:string[])=><div className="insights-refs">{ids.slice(0,8).map((id,i)=><button key={id} disabled={busy} onClick={()=>void inspect(id)}>来源 {i+1}</button>)}{ids.length>8?<small>共 {ids.length} 条来源</small>:null}</div>;
  const content=<>
    <header className="insights-toolbar"><nav>{tabs.map(([id,label])=><button key={id} aria-pressed={tab===id} className={tab===id?'selected':''} onClick={()=>{setTab(id!);if(id==='timeline')void search();}}>{label}</button>)}</nav>
      <button disabled={!state.ready} onClick={()=>void act(()=>window.hermes.insightsPause(!state.paused))}>{state.paused?<Play size={14}/>:<Pause size={14}/>} {state.paused?'继续':'暂停'}</button>
      <button disabled={busy||!state.ready||Boolean(running)||state.paused} onClick={()=>void act(()=>window.hermes.insightsRun())}><Sparkles size={14}/>立即整理</button>
    </header>
    <p className="insights-status" role="status">{running?running.message:state.paused?'自动整理已暂停':state.ready?'自动整理已开启 · 上海时区 · 最近30天起步':'等待知识库目录访问'}<small>后台模型：{state.modelLabel||'Hermes 当前模型'}</small></p>
    {error||state.error?<p className="insights-error" role="alert">{error||state.error}</p>:null}
    <div className="insights-content">
      {tab==='daily'?<>{state.documents.length?<div className="insights-documents">{state.documents.filter(d=>d.kind==='daily').map(doc=><button key={doc.path} onClick={()=>onOpenNote?onOpenNote(doc.path):openKnowledge(doc.path)}><BookOpen size={18}/><strong>{doc.title}</strong><small>{doc.evidence.length} 条来源 · {new Date(doc.updatedAt).toLocaleString('zh-CN')}</small></button>)}</div>:<p>首次整理完成后，每天会汇总成一份概述。旧笔记仍保留在下面的文件树中。</p>}</>:null}
      {tab==='timeline'?<><form className="insights-search" onSubmit={e=>{e.preventDefault();void search();}}><Search size={16}/><input aria-label="搜索会话与笔记" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索原始会话与知识笔记"/><input aria-label="按日期筛选来源" type="date" value={day} onChange={e=>setDay(e.target.value)}/><button disabled={busy}>搜索</button></form>
        {notes.map(note=><button className="insights-note-hit" key={note.path} onClick={()=>onOpenNote?onOpenNote(note.path):openKnowledge(note.path)}>{note.title} · {note.path}</button>)}
        {!events.length?<p>没有匹配的来源。可在“整理进度与来源”查看索引状态。</p>:events.map(event=><article key={event.id}><header><strong>{labels[event.agent]} · {event.actor==='human'?'你的记录':event.actor==='tool'?'工具结果':'Agent 回答'}</strong><small>{event.at?new Date(event.at).toLocaleString('zh-CN'):'时间未知'}</small></header><p>{event.text.slice(0,280)}{event.text.length>280?'…':''}</p><small>{event.project||'未归属项目'}{!event.available?' · 来源不可用':''}{event.truncated?' · 原记录不完整':''}{event.attachmentsOmitted?' · 附件内容未解析':''}</small><button onClick={()=>void inspect(event.id)}>查看完整原文与位置</button></article>)}
        <div className="insights-actions"><button disabled={busy||offset===0} onClick={()=>void search(Math.max(0,offset-40))}>上一页</button><button disabled={busy||!more} onClick={()=>void search(offset+40)}>下一页</button></div></>:null}
      {tab==='jobs'?<><p>来源正文会用于当前 Hermes 模型的概述整理。每个来源可单独暂停；原始文件只读。</p>{state.sources.map(source=><label className="insights-source" key={source.id}><input type="checkbox" checked={source.enabled} disabled={busy} onChange={e=>void act(()=>window.hermes.insightsSource(source.id,e.target.checked))}/><span><strong>{labels[source.agent]} · {source.id}</strong><small>{source.root}</small>{source.problem?<small className="insights-error">{source.problem}</small>:null}</span></label>)}
        {state.coverage.map((message,i)=><p key={i} className="insights-warning">{message}</p>)}
        {state.jobs.map(job=><article key={job.id}><header><strong>{statuses[job.state]} · {job.key}</strong><small>{new Date(job.updatedAt).toLocaleString('zh-CN')}</small></header><p>{job.message}</p></article>)}</>:null}
      {tab==='memory'?<><p>旧版记忆保留在原有页面。这里的新记忆只有确认后才参与后续对话；“忘记”会阻止再次自动提炼。</p>{!state.candidates.length?<p>暂时没有待核对记忆。</p>:state.candidates.filter(c=>!['rejected','forgotten'].includes(c.status)).map(item=><article key={item.id}><header><strong>{item.status==='confirmed'?'已确认':'待确认'} · {item.origin==='explicit'?'有用户原话':item.origin==='verified'?'工具验证事实':'模型推断'}</strong><small>{item.scope==='global'?'个人范围':item.scope}</small></header><p>{item.text}</p>{item.conflicts.length?<details><summary>同类已有记忆，确认时请注意是否冲突</summary>{item.conflicts.map(id=><p key={id}>{state.candidates.find(c=>c.id===id)?.text}</p>)}</details>:null}{refs(item.evidence)}<div className="insights-actions">{item.status==='pending'?<><button disabled={busy} onClick={()=>void act(()=>window.hermes.insightsMemory(item.id,'confirm'))}>确认记住</button><button disabled={busy} onClick={()=>void act(()=>window.hermes.insightsMemory(item.id,'reject'))}>不记这条</button></>:null}<button disabled={busy} onClick={()=>void act(()=>window.hermes.insightsMemory(item.id,'forget'))}>忘记</button></div></article>)}</>:null}
      {tab==='proposals'?<><p>每周最多三条。确认后应用到主 Agent，可撤销；效果以之后的实际协作记录为准。</p>{!state.proposals.length?<p>有新的协作证据后，会在这里生成改进建议。</p>:state.proposals.filter(p=>p.status!=='rejected').map(item=><article key={item.id}><header><strong>{item.title}</strong><small>{item.status==='applied'?'已应用':item.status==='reverted'?'已撤销':'待确认'}</small></header><p>{item.problem}</p>{refs(item.evidence)}<details><summary>预览将新增的{item.kind==='skill'?'技能':'规则'}</summary><pre>{item.change}</pre></details><p>验证方式：{item.verification}</p><small>{item.observations || (item.appliedAt?`应用于 ${new Date(item.appliedAt).toLocaleString('zh-CN')}；尚无效果结论`:'尚未应用')}</small><div className="insights-actions">{item.status==='pending'?<><button disabled={busy} onClick={()=>void act(()=>window.hermes.insightsProposal(item.id,'apply'))}>确认应用</button><button disabled={busy} onClick={()=>void act(()=>window.hermes.insightsProposal(item.id,'reject'))}>暂不采用</button></>:null}{item.status==='applied'?<button disabled={busy} onClick={()=>void act(()=>window.hermes.insightsProposal(item.id,'revert'))}><Undo2 size={14}/>撤销</button>:null}</div></article>)}</>:null}
      {tab==='native'?<><p>Hermes 原生记忆与技能的待确认写入。预览包含当前原文及拟修改内容，确认后才生效。</p>{!state.nativePending.length?<p>没有原生待处理写入。</p>:state.nativePending.map(item=><article key={`${item.agentId}:${item.id}`}><strong>{item.summary}</strong><small>{item.agentId} · {item.subsystem}</small><details><summary>查看原文与拟修改内容</summary><pre>{item.detail}</pre></details><div className="insights-actions">{item.status==='applied'?<button disabled={busy} onClick={()=>void act(()=>window.hermes.insightsNative(item,'undo'))}>撤销已应用写入</button>:<><button disabled={busy||!item.digest} onClick={()=>void act(()=>window.hermes.insightsNative(item,'approve'))}>确认应用</button><button disabled={busy||!item.digest} onClick={()=>void act(()=>window.hermes.insightsNative(item,'reject'))}>拒绝</button></>}</div></article>)}</>:null}
    </div>
  </>;
  return <><section className="insights-panel" aria-label={mode==='memory'?'记忆确认与改进':'每日概述与来源'}>{mode==='knowledge'?<details><summary><Clock3 size={16}/>每日概述与来源 <small>{running?running.message:`${state.documents.filter(d=>d.kind==='daily').length} 天概述`}</small></summary>{content}</details>:content}</section>
    {evidence?<dialog open className="insights-evidence" aria-label="来源原文"><header><strong>{labels[evidence.agent]} · 来源原文</strong><button aria-label="关闭来源原文" onClick={()=>setEvidence(null)}><X size={18}/></button></header><p>{evidence.at||'时间未知'} · {evidence.project||'未归属项目'}</p><small>会话：{evidence.nativeId||evidence.sessionId}</small><code>{evidence.path}</code><small>原文摘要校验：{evidence.digest}</small>{!evidence.available?<p className="insights-error">原始来源缺失或已变化。以下为已索引内容，不能当作当前原文。</p>:null}{evidence.attachmentsOmitted?<p className="insights-warning">{evidence.attachmentsOmitted} 个附件的编码已省略；图片或音视频内容未解析，原始文件保留。</p>:null}<pre>{evidence.text}</pre></dialog>:null}
  </>;
}
