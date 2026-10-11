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
