"""Hermes-owned, read-only source bridge over pinned Orbit data. One JSON request/process.

Source credentials/configuration inventory is intentionally not exposed. stdout is protocol only.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'vendor/orbit-data'))
import json
import hashlib
import re
import contextlib
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from orbit_data.store import Store, readonly_connection
from orbit_data.service import ImportService, ImportRequest
from orbit_data.payload import restore_row
from orbit_data.source_reader import read_reference, SourceUnavailable
from orbit_data.privacy import redact

TZ = ZoneInfo('Asia/Shanghai')
MARKER = '[hermes-insights v1]'
MEDIA_DATA = re.compile(r'data:([\w.+/-]+);base64,[A-Za-z0-9+/_=-]+')
RAW_MEDIA_DATA = re.compile(r'("data"\s*:\s*")((?:iVBORw0KGgo|/9j/|UklGR|JVBERi0)[A-Za-z0-9+/=]{200,})(")')
def readable_text(text):
    text, count = MEDIA_DATA.subn(lambda m:'[附件编码已省略：'+m.group(1)+'；内容未解析，原始来源保留]',text)
    text, raw_count = RAW_MEDIA_DATA.subn(lambda m:m.group(1)+"[附件二进制编码已省略；内容未解析，原始来源保留]"+m.group(3),text)
    return redact(text), count+raw_count

def progress(value):
    print(json.dumps({'progress': value}, ensure_ascii=False), file=sys.stderr, flush=True)

def scope(db, sources):
    enabled = {(s['agent'], str(Path(s['root']).expanduser().resolve())) for s in sources if s['enabled']}
    return [r['source_id'] for r in db.execute('SELECT * FROM source') if (r['agent'],r['root_path']) in enabled]

def filtered(db, sources, day=None, query='', offset=0, limit=100, since=None, event_id=None, compact=False):
    ids = scope(db, sources)
    if not ids: return []
    conditions = ['s.source_id IN (SELECT value FROM json_each(?))', "e.kind IN ('message.user','message.assistant','tool.result')",
                  "COALESCE(s.cwd,'') NOT LIKE '%/insights-agent%'", "COALESCE(s.cwd,'') NOT LIKE '%/knowledge-cleanup%'",
                  "s.session_uid NOT IN (SELECT DISTINCT internal.session_uid FROM event internal WHERE internal.kind='message.user' AND internal.text LIKE '[hermes-insights v1]%')"]
    params = [json.dumps(ids)]
    if event_id:
        conditions.append('e.event_uid=?'); params.append(event_id)
    elif day:
        start = datetime.strptime(day,'%Y-%m-%d').replace(tzinfo=TZ)
        conditions.append('e.ts>=? AND e.ts<?'); params.extend([int(start.timestamp()*1000),int((start+timedelta(days=1)).timestamp()*1000)])
        if since:
            conditions.append('e.ts>=?');params.append(since)
    elif since:
        conditions.append('(e.ts>=? OR e.ts IS NULL)'); params.append(since)
    if query:
        conditions.append("(e.text LIKE ? ESCAPE '\\' OR s.title LIKE ? ESCAPE '\\')")
        term = '%' + query.replace('\\','\\\\').replace('%','\\%').replace('_','\\_') + '%'
        params.extend([term,term])
    sql = """SELECT e.*,s.source_id,s.native_id AS session_native_id,s.cwd,src.agent,src.root_path,
        f.relative_path,f.status AS source_status,r.sha256 AS record_digest,p.name AS project_name
        FROM event e JOIN session s USING(session_uid) JOIN source src ON src.source_id=s.source_id
        JOIN raw_record r ON r.record_uid=e.record_uid JOIN source_file f ON f.file_id=r.file_id
        LEFT JOIN project p ON p.project_id=s.project_id WHERE """ + ' AND '.join(conditions)
    if compact: sql=sql.replace('e.*,s.source_id,s.native_id AS session_native_id,s.cwd,src.agent,src.root_path,\n        f.relative_path,f.status AS source_status,r.sha256 AS record_digest,p.name AS project_name','e.event_uid,e.ts,r.sha256 AS record_digest')
    return db.execute(sql+' ORDER BY e.ts,e.session_uid,e.seq LIMIT ? OFFSET ?',[*params,limit,offset]).fetchall()

def document(db,row,verify=False,home=None):
    raw=restore_row(db,dict(row)); available=row['source_status']=='active'
    location=Path(row['root_path'])/row['relative_path']
    available=available and location.is_file()
    if verify and available:
        try: read_reference(db,row['record_uid'])
        except (SourceUnavailable, OSError, ValueError): available=False
    text, attachments=readable_text(raw.get('text') or '')
    text=re.sub(r'<hermes_context>.*?</hermes_context>','',text,flags=re.S).strip()
    result = dict(id=row['event_uid']+'~'+row['record_digest'],sourceId=row['source_id'],agent=row['agent'],sessionId=row['session_uid'],
                nativeId=row['session_native_id'],project=row['cwd'] or row['project_name'] or '',
                at=datetime.fromtimestamp(row['ts']/1000,TZ).isoformat() if row['ts'] is not None else None,
                kind=row['kind'],actor=row['actor'],path=str(location),digest=row['record_digest'],
                available=available,truncated=bool(row['text_truncated']),text=text,attachmentsOmitted=attachments)
    if home is not None:
        file=home/'evidence'/(hashlib.sha256(result['id'].encode()).hexdigest()+'.json')
        if not file.exists():
            file.parent.mkdir(parents=True,exist_ok=True);temp=file.with_suffix('.tmp');temp.write_text(json.dumps(result,ensure_ascii=False));temp.chmod(0o600);temp.replace(file)
    return result

def run(req):
    home=Path(req['home']).resolve(); method=req['method']; args=req.get('args',{})
    home.mkdir(parents=True,exist_ok=True)
    if method=='scan':
        results=[]
        for source in args['sources']:
            if not source['enabled']: continue
            root=Path(source['root']).expanduser().resolve()
            if root==home or home.is_relative_to(root) or root.is_relative_to(home):
                raise ValueError('Source and derived index must be separate')
            if source['agent'] not in ('hermes','codex','claude_code'): raise ValueError('Unsupported source')
            if not root.is_dir():
                results.append({'id':source['id'],'problem':'来源目录不存在'}); continue
            try:
                with Store(home) as store:
                    service=ImportService(store,progress=lambda p:progress({'source':source['id'],**p}),workers=1,maintenance='off')
                    try: result=service.import_source(ImportRequest(agent=source['agent'],root=root))
                    finally: service.close()
                results.append({'id':source['id'],'result':result})
            except Exception as error:
                results.append({'id':source['id'],'problem':str(error)})
        return results
    if not (home/'orbit.db').exists():
        return {'items':[],'more':False} if method=='events' else []
    with readonly_connection(home/'orbit.db') as db:
        if method=='days':
            days={}; offset=0
            while True:
                rows=filtered(db,args['sources'],since=args['since'],offset=offset,limit=100000,compact=True)
                if not rows: break
                for row in rows:
                    if row['ts'] is None: continue
                    date=datetime.fromtimestamp(row['ts']/1000,TZ).strftime('%Y-%m-%d')
                    days.setdefault(date,hashlib.sha256()).update((row['event_uid']+row['record_digest']).encode())
                offset+=len(rows)
            return [{'date':date,'digest':value.hexdigest()} for date,value in sorted(days.items())]
        if method=='events':
            limit=max(1,min(100,int(args.get('limit',50))))
            rows=filtered(db,args['sources'],args.get('day'),args.get('query','')[:200],int(args.get('offset',0)),limit+1,args.get('since'))
            return {'items':[document(db,r,args.get('verify',False),home) for r in rows[:limit]],'more':len(rows)>limit}
        if method=='evidence':
            rows=filtered(db,args['sources'],event_id=args['id'].split('~')[0],limit=1)
            if rows and args['id']==rows[0]['event_uid']+'~'+rows[0]['record_digest']: return document(db,rows[0],True,home)
            file=home/'evidence'/(hashlib.sha256(args['id'].encode()).hexdigest()+'.json')
            if file.exists():
                cached=json.loads(file.read_text())
                if cached['sourceId'] in scope(db,args['sources']):
                    text,attachments=readable_text(cached['text']);return {**cached,'available':False,'text':text,'attachmentsOmitted':attachments or cached.get('attachmentsOmitted',0)}
            raise ValueError('来源已停用或证据不存在')
        if method=='coverage':
            ids=scope(db,args['sources'])
            if not ids: return []
            issues=[]
            for row in db.execute("SELECT f.status,COUNT(*) n FROM source_file f WHERE f.source_id IN (SELECT value FROM json_each(?)) GROUP BY f.status",(json.dumps(ids),)):
                if row['status']!='active': issues.append(f"{row['n']} 个来源文件状态：{row['status']}")
            unknown=db.execute("SELECT COUNT(*) FROM raw_record r JOIN source_file f USING(file_id) WHERE f.source_id IN (SELECT value FROM json_each(?)) AND r.disposition='unparsed'",(json.dumps(ids),)).fetchone()[0]
            if unknown: issues.append(f'{unknown} 条原生记录尚未识别，未当作成功或零值')
            undated=db.execute('SELECT COUNT(*) FROM event e JOIN session s USING(session_uid) WHERE s.source_id IN (SELECT value FROM json_each(?)) AND e.ts IS NULL',(json.dumps(ids),)).fetchone()[0]
            if undated: issues.append(f'{undated} 条事件缺少时间，未归入每日概述')
            truncated=db.execute('SELECT COUNT(*) FROM event e JOIN session s USING(session_uid) WHERE s.source_id IN (SELECT value FROM json_each(?)) AND e.text_truncated=1',(json.dumps(ids),)).fetchone()[0]
            if truncated: issues.append(f'{truncated} 条事件原文不完整，已跳过语义整理')
            return issues
    raise ValueError('Unknown method')

if __name__=='__main__':
    try:
        request=json.loads(sys.stdin.readline())
        with contextlib.redirect_stdout(sys.stderr): result=run(request)
        print(json.dumps({'ok':True,'data':result},ensure_ascii=False),flush=True)
    except Exception as error:
        print(json.dumps({'ok':False,'reason':str(error)},ensure_ascii=False),flush=True)
        sys.exit(1)
