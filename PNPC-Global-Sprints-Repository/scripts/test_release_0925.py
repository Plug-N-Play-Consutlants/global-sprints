"""Repeatable offline regression gate for Global Sprints 0.9.25."""
from pathlib import Path
import subprocess,sys,json,zipfile,hashlib
root=Path(__file__).resolve().parents[1]
checks=[['node','--check','extension/app.js'],['node','scripts/test_correctness_0924.cjs'],['node','scripts/test_hardening_0925.cjs'],['node','scripts/test_acceptance_0915.cjs'],['node','scripts/test_acceptance_0916.cjs'],['node','scripts/test_room_recovery.cjs'],['node','scripts/test_licensing.cjs'],[sys.executable,'-X','utf8','scripts/validate.py'],[sys.executable,'-X','utf8','scripts/audit_paths.py']]
for cmd in checks:
 print('RUN',' '.join(cmd),flush=True)
 subprocess.run(cmd,cwd=root,check=True)
version=json.loads((root/'extension/extension.vsomanifest').read_text())['version']
assert version=='0.9.25'
assert 'Version="0.9.25"' in (root/'extension/extension.vsixmanifest').read_text()
assert 'id="gsHeaderVersion">0.9.25' in (root/'extension/index.html').read_text()
print('PASS: source version consistency')
print('v0.9.25 OFFLINE VALIDATION PASS')
