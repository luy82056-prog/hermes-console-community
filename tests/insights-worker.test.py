"""End-to-end packaged helper regression against synthetic native logs only."""
import unittest,tempfile,subprocess,json,sqlite3,hashlib
from pathlib import Path
BIN=Path(__file__).resolve().parents[1]/'.cache/insights-dist/hermes-insights/hermes-insights'
class WorkerTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='hermes-source-test-');self.root=Path(self.tmp.name);self.sources=[]
  for agent in ['hermes','codex','claude_code']:
   root=self.root/agent;root.mkdir();self.sources.append(dict(id=agent,agent=agent,root=str(root),enabled=True))
  self.codex=self.root/'codex/sessions/rollout-fixture.jsonl';self.codex.parent.mkdir()
  self.records=[dict(type='session_meta',timestamp='2026-11-01T15:50:00Z',payload=dict(id='fixture',cwd='/fixture')),dict(type='event_msg',timestamp='2026-11-01T15:59:59Z',payload=dict(type='user_message',message='周五15:00开会。')),dict(type='event_msg',timestamp='2026-11-01T16:00:00Z',payload=dict(type='agent_message',message='上海次日事项。'))]
  self.write_codex()
  claude=self.root/'claude_code/projects/fixture/session.jsonl';claude.parent.mkdir(parents=True);claude.write_text(json.dumps(dict(type='user',sessionId='fixture',uuid='u1',timestamp='2026-11-01T15:55:00Z',cwd='/fixture',message=dict(content='我偏好简短的中文回复。')))+'\n')
  db=sqlite3.connect(self.root/'hermes/state.db');db.executescript('CREATE TABLE sessions(id TEXT PRIMARY KEY,started_at REAL,model TEXT); CREATE TABLE messages(id INTEGER PRIMARY KEY,session_id TEXT,role TEXT,content TEXT,timestamp REAL,active INTEGER);');db.execute('INSERT INTO sessions VALUES (?,?,?)',('fixture',1793548000,'test'));db.execute('INSERT INTO messages VALUES(?,?,?,?,?,?)',(1,'fixture','user','保留短事实。',1793548500,1));db.commit();db.close()
 def tearDown(self): self.tmp.cleanup()
 def write_codex(self):self.codex.write_text(''.join(json.dumps(r)+'\n' for r in self.records))
 def call(self,method,**args):
  proc=subprocess.run([str(BIN)],input=json.dumps(dict(home=str(self.root/'index'),method=method,args=dict(sources=self.sources,**args)))+'\n',text=True,capture_output=True,timeout=40)
  self.assertTrue(proc.stdout,proc.stderr);data=json.loads(proc.stdout);self.assertTrue(data['ok'],data);return data['data']
 def test_native_sources_dedup_dates_readonly_and_immutable_evidence(self):
  before={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for s in self.sources for p in Path(s['root']).rglob('*') if p.is_file()}
  result=self.call('scan');self.assertFalse([r for r in result if r.get('problem')],result)
  page=self.call('events',since=0,verify=True);self.assertEqual({e['agent'] for e in page['items']},{'hermes','codex','claude_code'});self.assertTrue(all(e['available'] for e in page['items']),page)
  ids=[e['id'] for e in page['items']];self.call('scan');self.assertEqual([e['id'] for e in self.call('events',since=0)['items']],ids)
  self.assertIn('2026-11-01',[d['date'] for d in self.call('days',since=1)]);self.assertIn('2026-11-02',[d['date'] for d in self.call('days',since=1)])
  for p,digest in before.items():self.assertEqual(hashlib.sha256(Path(p).read_bytes()).hexdigest(),digest)
  event=next(e for e in page['items'] if e['agent']=='codex' and '开会' in e['text']);self.assertTrue(self.call('evidence',id=event['id'])['available'])
  self.records[1]['payload']['message']='changed original';self.write_codex();self.call('scan');old=self.call('evidence',id=event['id']);self.assertFalse(old['available']);self.assertEqual(old['text'],event['text'])
 def test_first_day_obeys_exact_initial_thirty_day_cursor(self):
  from datetime import datetime
  self.call('scan');cutoff=int(datetime.fromisoformat('2026-11-01T16:00:00+00:00').timestamp()*1000)
  self.assertEqual(self.call('events',day='2026-11-01',since=cutoff)['items'],[])
  self.assertTrue(self.call('events',day='2026-11-02',since=cutoff)['items'])
 def test_image_encoding_is_omitted_without_truncating_real_text(self):
  self.records.append(dict(type='response_item',timestamp='2026-11-01T15:57:00Z',payload=dict(type='function_call_output',call_id='screenshot',output='Short fact: Friday 15:00. data:image/png;base64,'+'A'*1000000+' End fact: 42. '+json.dumps(dict(type='image',data='/9j/'+('A'*1000000),mimeType='image/jpeg')))))
  self.write_codex();self.call('scan');events=self.call('events',since=0)['items'];event=next(e for e in events if 'Short fact' in e['text']);self.assertLess(len(event['text']),300);self.assertEqual(event['attachmentsOmitted'],2);self.assertIn('Friday 15:00',event['text']);self.assertIn('End fact: 42',event['text']);self.assertFalse(event['truncated']);self.assertTrue(self.call('evidence',id=event['id'])['available'])
 def test_internal_session_is_not_recollected_and_missing_source_visible(self):
  self.records[1]['payload']['message']='[hermes-insights v1]\ninternal processing';self.write_codex();self.call('scan');self.assertFalse(any(e['agent']=='codex' for e in self.call('events',since=0)['items']))
  self.sources.append(dict(id='missing',agent='codex',root=str(self.root/'not-found'),enabled=True));self.assertTrue(self.call('scan')[-1]['problem'])
if __name__=='__main__':unittest.main()
