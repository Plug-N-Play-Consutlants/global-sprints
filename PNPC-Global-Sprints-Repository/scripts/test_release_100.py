"""Offline release-candidate gate; does not certify live services."""
from pathlib import Path
import subprocess,sys,json,zipfile,hashlib
root=Path(__file__).resolve().parents[1]
for cmd in [['node','--check','extension/app.js'],['node','scripts/test_correctness_0924.cjs'],['node','scripts/test_hardening_0925.cjs'],['node','scripts/test_acceptance_0915.cjs'],['node','scripts/test_acceptance_0916.cjs'],['node','scripts/test_room_recovery.cjs'],['node','scripts/test_licensing.cjs'],[sys.executable,'-X','utf8','scripts/validate.py'],[sys.executable,'-X','utf8','scripts/audit_paths.py']]:
 print('RUN',' '.join(cmd),flush=True);subprocess.run(cmd,cwd=root,check=True)
app=(root/'extension/app.js').read_text();html=(root/'extension/index.html').read_text()
assert 'let startupTabReady=false;' in app
assert 'if(startupTabReady)document.body.classList.remove' in app
assert app.index('try{showTab(selected,false);initialTabRendered=true;}')<app.index('startupTabReady=true;',app.index('try{showTab(selected,false);initialTabRendered=true;}'))
assert '.gs-initializing .gs-tab-panel,.gs-initializing .gs-tabs,.gs-initializing .gs-context{visibility:hidden}' in html
v=json.loads((root/'extension/extension.vsomanifest').read_text())['version']
assert v=='1.0.0' and 'Version="1.0.0"' in (root/'extension/extension.vsixmanifest').read_text()
assert 'id="gsHeaderVersion">1.0.0' in html
print('PASS: startup visibility, version consistency and offline regression suite')
