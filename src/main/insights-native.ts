import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { EvolutionProposal, MemoryCandidate, NativePending } from "../shared/insights";
import type { NativeMemoryBridge } from "./insights-engine";
import matter from "gray-matter";
export class HermesNativeMemory implements NativeMemoryBridge {
  constructor(private userHome: string, private script: string, private runtimeHome = userHome) {}
  private home(agentId: string) {
    if (!["parent","child-a","child-b"].includes(agentId)) throw new Error("只允许 Console 管理的 Agent");
    return path.join(this.userHome,".hermes-console/agents",agentId);
  }
  private python() {
    const root=path.join(this.runtimeHome,".hermes/hermes-agent");
    const launcher=path.join(root,".hermes/bin/hermes");
    const match=existsSync(launcher) ? readFileSync(launcher,"utf8").match(/^exec\s+(\/[^\n]+?\/bin\/python[\d.]*)\s/m) : null;
    const candidates=[match?.[1],path.join(root,".venv/bin/python"),path.join(root,"venv/bin/python")];
    const executable=candidates.find(value=>value && existsSync(value));
    if(!executable)throw new Error("找不到 Hermes Python 运行环境，记忆写入已停止");
    return {executable,root};
  }
  private call<T>(agentId:string,args:Record<string,unknown>):Promise<T> {
    const {executable,root}=this.python();
    return new Promise((resolve,reject)=>{
      const child=execFile(executable,["-I",this.script,root],{timeout:30000,maxBuffer:16*1024*1024,env:{...process.env,HERMES_HOME:this.home(agentId)}},(error,stdout)=>{
        try {const result=JSON.parse(stdout.trim());if(!result.ok)throw new Error(result.reason);if(error)throw error;resolve(result.data);} catch(e){reject(e);}
      });child.stdin?.on("error",()=>{});child.stdin?.end(JSON.stringify(args)+"\n");
    });
  }
  async configureAgent(agentId:string) { if(["parent","child-a","child-b"].includes(agentId))await this.call(agentId,{action:"configure"}); }
  async configure() { for(const agent of ["parent","child-a","child-b"])if(existsSync(this.home(agent)))await this.call(agent,{action:"configure"}); }
  async pending() {
    const items:NativePending[]=[];
    for(const agentId of ["parent","child-a","child-b"]) {
      // No subprocess merely to discover an empty queue.
      const home=this.home(agentId),pending=path.join(home,"pending"),ledger=path.join(home,"console-insights-review");
      if(!existsSync(pending) && (!existsSync(ledger) || !readdirSync(ledger).some(f=>f.endsWith('.json'))))continue;
      items.push(...(await this.call<NativePending[]>(agentId,{action:"list"})).map(item=>({...item,agentId})));
    }return items;
  }
  async memory(item:MemoryCandidate,action:"confirm"|"forget") {
    if(item.scope!=="global")return undefined;
    const payload=action==="confirm" ? {action:"add",target:"user",content:item.text} : {action:"remove",target:"user",old_text:item.text,matched_entry:item.text};
    const id=`memory-${item.id.slice(0,32)}-${action}`;
    await this.call("parent",{action:"memory",id,payload,summary:`${action==="confirm"?"确认":"忘记"}：${item.text}`});return id;
  }
  async proposal(item:EvolutionProposal,action:"apply"|"revert"):Promise<Partial<EvolutionProposal>> {
    const id=`proposal-${item.id.slice(0,32)}`;
    if(action==="revert") {await this.call("parent",{action:"undo",id});return {};}
    // Both durable rules and skills use a named native skill with an inspectable body.
    const name=`console-insight-${item.id.slice(0,12)}`;
    const scoped=item.scope==="global"?item.change:`适用项目：${item.scope}\n仅在此项目范围内使用以下内容。\n\n${item.change}`;
    const content=matter.stringify(scoped,{name,description:item.title.slice(0,150)});
    await this.call("parent",{action:"skill",id,payload:{action:"create",name,content},summary:item.title});
    return {nativeId:id,path:`skills/${name}/SKILL.md`,before:null,after:content};
  }
  async review(item:NativePending,action:"approve"|"reject"|"undo") {
    await this.call(item.agentId,{action:action==="approve"?"apply-pending":action,id:item.id,subsystem:item.subsystem,digest:item.digest});
  }
}
