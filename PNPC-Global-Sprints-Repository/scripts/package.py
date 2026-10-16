from pathlib import Path
import json, zipfile
root=Path(__file__).resolve().parents[1]
src=root/'extension'
version=json.loads((src/'extension.vsomanifest').read_text())['version']
out=root/'dist'/f'PlugNPlayConsultants.global-sprints-{version}.vsix'
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(src.rglob('*')):
        if p.is_file():z.write(p,p.relative_to(src).as_posix())
print(out)

with zipfile.ZipFile(out) as check:
    assert check.testzip() is None, 'Corrupt VSIX'
    assert json.loads(check.read('extension.vsomanifest'))['version']==version, 'VSIX contribution version mismatch'
    assert f'Version="{version}"'.encode() in check.read('extension.vsixmanifest'), 'VSIX identity version mismatch'
    assert f"const DIAG_VERSION='{version}'".encode() in check.read('app.js'), 'VSIX diagnostic version mismatch'
print('Packaged VSIX identity, contribution and diagnostic versions PASS')
