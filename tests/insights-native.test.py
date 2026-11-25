import unittest,tempfile,subprocess,json,re,os
from pathlib import Path
ROOT=Path.home()/'.hermes/hermes-agent'
PYTHON=re.search(r'^exec (\S+)',(ROOT/'.hermes/bin/hermes').read_text(),re.M)[1]
SCRIPT=Path(__file__).resolve().parents[1]/'scripts/insights-native.py'
class NativeTests(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory(prefix='hermes-native-test-');self.home=Path(self.tmp.name)
 def tearDown(self):self.tmp.cleanup()
 def call(self,action,expect=True,**args):
  p=subprocess.run([PYTHON,'-I',str(SCRIPT),str(ROOT)],input=json.dumps(dict(action=action,**args))+'\n',env={**os.environ,'HERMES_HOME':str(self.home)},text=True,capture_output=True,timeout=30)
  self.assertTrue(p.stdout,p.stderr);result=json.loads(p.stdout);self.assertEqual(result['ok'],expect,result);return result.get('data') or result.get('reason')
 def test_memory_gate_add_idempotence_forget_undo_and_conflict(self):
  self.call('configure');self.assertIn('write_approval: true',(self.home/'config.yaml').read_text())
  payload=dict(action='add',target='user',content='Prefer concise Chinese responses.')
  self.call('memory',id='memory-test-confirm',payload=payload,summary='test');self.call('memory',id='memory-test-confirm',payload=payload,summary='test')
  file=self.home/'memories/USER.md';self.assertEqual(file.read_text().count(payload['content']),1)
  self.call('memory',id='memory-test-forget',payload=dict(action='remove',target='user',old_text=payload['content'],matched_entry=payload['content']),summary='forget');self.assertNotIn(payload['content'],file.read_text())
  self.call('undo',id='memory-test-forget');self.assertIn(payload['content'],file.read_text());file.write_text(file.read_text()+'\nManual change')
  self.assertIn('新修改',self.call('undo',id='memory-test-confirm',expect=False));self.assertIn('Manual change',file.read_text())
 def test_skill_apply_undo_preserves_later_changes(self):
  payload=dict(action='create',name='console-test',content='---\nname: console-test\ndescription: Test only\n---\nReport checks first.\n')
  self.call('skill',id='skill-test',payload=payload,summary='test');file=self.home/'skills/console-test/SKILL.md';self.assertTrue(file.exists());self.call('undo',id='skill-test');self.assertFalse(file.exists())
if __name__=='__main__':unittest.main()
