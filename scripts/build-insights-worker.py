"""Build a self-contained helper; run using the pinned tooling in build:insights."""
import subprocess, os
from pathlib import Path
root=Path(__file__).resolve().parent.parent
subprocess.run(['pyinstaller','--noconfirm','--clean','--onedir','--console','--name','hermes-insights',
 '--paths',str(root/'vendor/orbit-data'),'--collect-all','orbit_data','--collect-data','jsonschema_specifications',
 '--distpath',str(root/'.cache/insights-dist'),'--workpath',str(root/'.cache/insights-build'),
 '--specpath',str(root/'.cache'),'--exclude-module','pytest','--exclude-module','tkinter',
 str(root/'scripts/insights-worker.py')],cwd=root,check=True,env={**os.environ,'PYTHONPATH':str(root/'vendor/orbit-data')})
