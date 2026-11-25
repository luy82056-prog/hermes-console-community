import base64
import importlib.util
import json
from pathlib import Path
import tempfile
import time
import unittest

spec = importlib.util.spec_from_file_location('sync_auth', Path(__file__).parents[1] / 'scripts/sync-codex-auth.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def tokens(iat, exp=None):
    payload = base64.urlsafe_b64encode(json.dumps({'iat': iat, 'exp': exp or time.time()+3600}).encode()).decode().rstrip('=')
    return {'access_token': 'test.'+payload+'.test', 'refresh_token': 'synthetic', 'account_id': 'test'}

class SyncTests(unittest.TestCase):
    def test_login_rotation_preserves_other_providers_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as d:
            source, target = Path(d)/'codex.json', Path(d)/'agent/auth.json'
            source.write_text(json.dumps({'tokens': tokens(10)}))
            target.parent.mkdir()
            target.write_text(json.dumps({'providers': {'other': {'keep': True}}}))
            self.assertTrue(m.sync(source,target))
            store=json.loads(target.read_text())
            self.assertTrue(store['providers']['other']['keep'])
            store['credential_pool'][m.PROVIDER][0]['last_status']='rate_limited'
            target.write_text(json.dumps(store))
            self.assertFalse(m.sync(source,target))
            self.assertEqual(json.loads(target.read_text())['credential_pool'][m.PROVIDER][0]['last_status'], 'rate_limited')
            source.write_text(json.dumps({'tokens': tokens(20)}))
            self.assertTrue(m.sync(source,target))
            self.assertIsNone(json.loads(target.read_text())['credential_pool'][m.PROVIDER][0]['last_status'])
            self.assertEqual(target.stat().st_mode & 0o777,0o600)
            source.write_text(json.dumps({'tokens': tokens(10)}))
            self.assertFalse(m.sync(source,target))
            source.write_text(json.dumps({'tokens': tokens(30,1)}))
            self.assertFalse(m.sync(source,target))
    def test_malformed_target_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as d:
            source,target=Path(d)/'source',Path(d)/'auth.json'
            source.write_text(json.dumps({'tokens': tokens(10)}))
            target.write_text('{broken')
            with self.assertRaises(ValueError): m.sync(source,target)
            self.assertEqual(target.read_text(),'{broken')

if __name__=='__main__': unittest.main()
