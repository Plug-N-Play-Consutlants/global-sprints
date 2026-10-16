"""Single repeatable v0.9.24 offline validation entry point."""
import subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
checks=[['node','--check','extension/app.js'],['node','scripts/test_correctness_0924.cjs'],['node','scripts/test_acceptance_0915.cjs'],['node','scripts/test_acceptance_0916.cjs'],['node','scripts/test_room_recovery.cjs'],['node','scripts/test_licensing.cjs'],[sys.executable,'-X','utf8','scripts/validate.py'],[sys.executable,'-X','utf8','scripts/audit_paths.py']]
for command in checks:
 print('RUN',' '.join(command),flush=True)
 subprocess.run(command,cwd=root,check=True)
print('v0.9.24 offline release validation PASS')
