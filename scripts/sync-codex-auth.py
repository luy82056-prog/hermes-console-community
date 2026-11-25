#!/usr/bin/env python3
"""Adopt usable local Codex login changes; never refresh or modify Codex itself."""
import argparse
import base64
import fcntl
import json
import os
from pathlib import Path
import tempfile
import time

PROVIDER = 'openai-codex'

def claims(token):
    try:
        return json.loads(base64.urlsafe_b64decode(token.split('.')[1] + '==='))
    except (ValueError, IndexError, AttributeError):
        return {}

def sync(source, target):
    auth = json.loads(source.read_text())
    tokens = auth.get('tokens', {})
    incoming = claims(tokens.get('access_token'))
    if incoming.get('exp', 0) <= time.time() + 300 or not tokens.get('refresh_token'):
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    # Same advisory lock path/protocol as Hermes auth.py.
    with open(target.with_suffix('.lock'), 'a') as lock:
        os.chmod(lock.name, 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        store = json.loads(target.read_text()) if target.exists() else {}
        providers = store.setdefault('providers', {})
        previous = providers.get(PROVIDER, {})
        old_tokens = previous.get('tokens', {})
        old = claims(old_tokens.get('access_token'))
        pool = store.setdefault('credential_pool', {})
        entries = pool.setdefault(PROVIDER, [])
        # Preserve a more recently refreshed Hermes credential for the same account.
        if old_tokens.get('account_id') == tokens.get('account_id') and old.get('iat', 0) > incoming.get('iat', 0):
            return False
        if old_tokens == tokens and any(e.get('access_token') == tokens['access_token'] for e in entries):
            return False
        providers[PROVIDER] = {**previous, 'tokens': tokens, 'last_refresh': auth.get('last_refresh'), 'auth_mode': auth.get('auth_mode', 'chatgpt')}
        # Update the Console-managed entry, retaining other explicitly added accounts.
        index = next((i for i, e in enumerate(entries) if e.get('source') == 'device_code'), None)
        entry = dict(entries[index]) if index is not None else {'id': 'codex', 'label': 'Codex OAuth', 'priority': 0}
        changed = entry.get('access_token') != tokens['access_token']
        entry.update(auth_type='oauth', source='device_code', access_token=tokens['access_token'], refresh_token=tokens['refresh_token'], base_url='https://chatgpt.com/backend-api/codex', last_refresh=auth.get('last_refresh'))
        if changed:
            for key in ('last_status', 'last_status_at', 'last_error_code', 'last_error_reason', 'last_error_message', 'last_error_reset_at'):
                entry[key] = None
        if index is None:
            entries.append(entry)
        else:
            entries[index] = entry
        store.setdefault('version', 1)
        store.setdefault('active_provider', PROVIDER)
        fd, tmp = tempfile.mkstemp(prefix='.auth-sync-', dir=target.parent)
        try:
            with os.fdopen(fd, 'w') as output:
                json.dump(store, output, indent=2)
                output.write('\n')
                output.flush()
                os.fsync(output.fileno())
            os.replace(tmp, target)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
        return True

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', type=Path)
    args = parser.parse_args()
    home = Path.home()
    source = Path(os.environ.get('CODEX_HOME') or home / '.codex') / 'auth.json'
    targets = [args.target / 'auth.json'] if args.target else [home / '.hermes/auth.json', *sorted((home / '.hermes-console/agents').glob('*/auth.json')), *[home / '.hermes/profiles' / p / 'auth.json' for p in ('consoleparent', 'consolechilda', 'consolechildb')]]
    for target in targets:
        try:
            if sync(source, target):
                print('Updated Codex login:', target.parent.name)
        except FileNotFoundError:
            pass
        except Exception as error:
            # Never log credential contents or exception strings containing input.
            print('Codex sync deferred:', target.parent.name, type(error).__name__)

if __name__ == '__main__':
    main()
