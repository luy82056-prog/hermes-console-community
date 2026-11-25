"""Approved native memory/skill writes, scoped to one Console profile.
Uses Hermes' own pending/apply API, with file snapshots for conflict-checked undo.
"""
import os, sys, json, hashlib, base64, re, contextlib
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from pm.environments import activate_dependencies, owning_home_root
profile_home = os.environ["HERMES_HOME"]
owner = owning_home_root(Path(sys.argv[1]))
try:
    if owner: os.environ["HERMES_HOME"] = str(owner)
    activate_dependencies(Path(sys.argv[1]))
finally:
    os.environ["HERMES_HOME"] = profile_home
import hermes_yaml as yaml

def sha(value): return hashlib.sha256(value.encode()).hexdigest()
def encode(value): return base64.b64encode(value).decode()
def write(file, content):
    file.parent.mkdir(parents=True,exist_ok=True)
    temp=file.with_suffix(file.suffix+'.tmp');temp.write_bytes(content);temp.chmod(0o600);temp.replace(file)
def contained(home,p):
    p=Path(p)
    if not p.resolve().is_relative_to(home.resolve()) or any(x.is_symlink() for x in [p,*p.parents] if x.is_relative_to(home)): raise ValueError('目标超出 Console profile 或包含符号链接')
    return p
def snapshot(home,roots):
    data={}
    for root in roots:
        contained(home,root)
        files=list(root.rglob('*')) if root.is_dir() else [root]
        for file in files:
            contained(home,file)
            if file.is_file(): data[str(file.relative_to(home))]=encode(file.read_bytes())
    return data

def run(req):
    home=Path(os.environ['HERMES_HOME']);action=req['action'];ledger=home/'console-insights-review'
    from tools import write_approval as wa
    from tools.memory_tool import load_on_disk_store, apply_memory_pending
    from tools.skill_manager_tool import apply_skill_pending, _find_skill, _resolve_skill_dir
    def targets(subsystem,payload):
        if subsystem=='memory': return [home/'memories/USER.md',home/'memories/MEMORY.md']
        operations=payload.get('operations') if payload.get('action')=='batch' else [payload]
        out=[]
        for operation in operations or []:
            name=operation.get('name') or payload.get('name')
            if not isinstance(name,str) or '..' in name or name.startswith('/'): raise ValueError('技能名称无效')
            found=_find_skill(name)
            target=found['path'] if found else _resolve_skill_dir(name,operation.get('category'))
            out.append(contained(home,target))
        if not out: raise ValueError('没有可预览目标')
        return out
    def preview(record):
        roots=targets(record['subsystem'],record['payload'])
        before=snapshot(home,roots)
        detail=json.dumps({'before':{k:base64.b64decode(v).decode('utf-8',errors='replace') for k,v in before.items()},'proposed':record['payload']},ensure_ascii=False,indent=2)
        return dict(id=record['id'],subsystem=record['subsystem'],summary=record['summary'],detail=detail,digest=sha(json.dumps(record,sort_keys=True)+json.dumps(before,sort_keys=True)),status='pending')
    if action=='configure':
        file=home/'config.yaml'; original=file.read_text() if file.exists() else ''
        data=yaml.safe_load(original) or {}
        for subsystem in ['memory','skills']: data.setdefault(subsystem,{})['write_approval']=True
        if yaml.safe_load(original)!=data:
            backup=ledger/'config.before.yaml'
            if not backup.exists(): write(backup,original.encode())
            write(file,yaml.safe_dump(data,allow_unicode=True,sort_keys=False).encode())
        return None
    if action=='list':
        items=[]
        for subsystem in ['memory','skills']:
            for record in wa.list_pending(subsystem):
                try: items.append(preview(record))
                except Exception as e: items.append(dict(id=record['id'],subsystem=subsystem,summary=record['summary'],detail=str(e),digest='',status='pending'))
        if ledger.exists():
            for file in sorted(ledger.glob('receipt-*.json'),reverse=True)[:30]:
                record=json.loads(file.read_text())
                if record.get('state')=='applied' and not record['id'].startswith(('memory-','proposal-')): items.append(dict(id=record['id'],subsystem=record['subsystem'],summary=record['summary'],detail='已应用，可撤销。撤销前会检查后续修改。',digest=sha(file.read_text()),status='applied'))
        return items
    identifier=req.get('id','')
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',identifier): raise ValueError('记录 ID 无效')
    receipt=ledger/f'receipt-{identifier}.json'
    if action=='undo':
        record=json.loads(receipt.read_text())
        if req.get('digest') and sha(receipt.read_text())!=req['digest']: raise ValueError('记录已变化')
        roots=[contained(home,home/r) for r in record['roots']]
        if snapshot(home,roots)!=record['after']: raise ValueError('应用后目标已有新修改，不能覆盖；原文在恢复记录中')
        for relative in set(record['after'])-set(record['before']): contained(home,home/relative).unlink()
        for relative,data in record['before'].items(): write(contained(home,home/relative),base64.b64decode(data))
        record['state']='reverted';write(receipt,json.dumps(record,ensure_ascii=False).encode());return record
    if action=='apply-pending' or action=='reject':
        subsystem=req['subsystem'];record=wa.get_pending(subsystem,identifier)
        if record is None: raise ValueError('待确认记录已不存在')
        if preview(record)['digest']!=req['digest']: raise ValueError('预览后原文或建议已变化，请刷新后确认')
        if action=='reject': wa.discard_pending(subsystem,identifier);return None
        payload=record['payload'];summary=record['summary']
    elif action in ('memory','skill'):
        if receipt.exists():
            existing=json.loads(receipt.read_text())
            if existing.get('state')=='applied': return existing
            if existing.get('state')=='applying':
                roots=[contained(home,home/r) for r in existing['roots']]
                if snapshot(home,roots)!=existing['before']: raise ValueError('上次写入中断且目标已变化，已保留恢复记录，请先核对后恢复')
        subsystem='memory' if action=='memory' else 'skills';payload=req['payload'];summary=req['summary']
        record=wa.stage_write(subsystem,payload,summary=summary,origin='background_review')
        if wa.get_pending(subsystem,record['id']) is None: raise ValueError('原生待确认记录写入失败')
    else: raise ValueError('未知原生操作')
    roots=targets(subsystem,payload);before=snapshot(home,roots)
    audit=dict(id=identifier,subsystem=subsystem,summary=summary,state='applying',roots=[str(r.relative_to(home)) for r in roots],before=before)
    write(receipt,json.dumps(audit,ensure_ascii=False).encode())
    result=apply_memory_pending(payload,load_on_disk_store()) if subsystem=='memory' else apply_skill_pending(payload)
    if isinstance(result,str): result=json.loads(result)
    if not result.get('success'): raise ValueError(result.get('error') or result.get('message') or '原生写入未成功')
    audit.update(after=snapshot(home,roots),state='applied');write(receipt,json.dumps(audit,ensure_ascii=False).encode())
    wa.discard_pending(subsystem,record['id'])
    return audit

if __name__=='__main__':
    try:
        req=json.loads(sys.stdin.readline())
        with contextlib.redirect_stdout(sys.stderr): result=run(req)
        print(json.dumps({'ok':True,'data':result},ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'ok':False,'reason':str(e)},ensure_ascii=False));sys.exit(1)
