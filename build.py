#!/usr/bin/env python3
"""Canonical Global Sprints source-first build: runs on default Windows Python (UTF-8)."""
from __future__ import annotations
import argparse, json, re, shutil, subprocess, zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parent
VERSION='1.0.49'
PACKAGE_FILES=['extension.vsomanifest','[Content_Types].xml','extension.vsixmanifest',
               'gs40-core.js','app.js','index.html',
               'vendor/msal-browser.min.js','vendor/SDK.min.js','images/icon.png']
SOURCE_FILES=['src/app-main.js','src/gs40-runtime.js','src/gs41-runtime.js','src/gs43-schedules.js','src/gs44-session.js','src/gs45-mentions.js','src/gs46-board.js','src/gs40-core.js']
TESTS=['assignment.test.cjs','process-agnostic.test.cjs','workflow-and-mentions.test.cjs',
       'identity-resolution.test.cjs','gs40-core.test.cjs','gs40-integration.test.cjs','gs40-runtime.test.cjs','gs40-license.test.cjs','gs40-preserved.test.cjs','gs41-package.test.cjs','gs42-polish.test.cjs','gs43-schedules.test.cjs','gs43-integration.test.cjs','gs44-session.test.cjs','gs44-mentions.test.cjs','gs44-api.test.cjs','gs45-mentions.test.cjs','gs45-ui.test.cjs','gs46-membership.test.cjs','gs46-reliability.test.cjs','gs47-reporting.test.cjs','gs47-observation.test.cjs','gs48-reporting.test.cjs','gs49-delivery.test.cjs','gs49-meetings.test.cjs']
ANCHOR='init();\n\n// Install static action help'

def build(out:Path,tests:bool=True):
    if (ROOT/'extension').exists():
        raise RuntimeError('Legacy extension/ tree found: remove or archive it before building.')
    source=(ROOT/'src/app-main.js').read_text(encoding='utf-8')
    runtime=(ROOT/'src/gs40-runtime.js').read_text(encoding='utf-8')+'\n'+(ROOT/'src/gs41-runtime.js').read_text(encoding='utf-8')+'\n'+(ROOT/'src/gs43-schedules.js').read_text(encoding='utf-8')+'\n'+(ROOT/'src/gs44-session.js').read_text(encoding='utf-8')+'\n'+(ROOT/'src/gs45-mentions.js').read_text(encoding='utf-8')+'\n'+(ROOT/'src/gs46-board.js').read_text(encoding='utf-8')
    core=(ROOT/'src/gs40-core.js').read_text(encoding='utf-8')
    assert source.count(ANCHOR)==1,'Application insertion point changed'
    app=source.replace(ANCHOR,'\n/* BEGIN generated v1.0.49 runtime */\n'+runtime+'\n/* END generated v1.0.49 runtime */\n\n'+ANCHOR)
    (ROOT/'app.js').write_text(app,encoding='utf-8')
    (ROOT/'gs40-core.js').write_text(core,encoding='utf-8')
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    assert f"const DIAG_VERSION='{VERSION}'" in app
    assert f'id="gsHeaderVersion">v{VERSION}</span>' in html
    assert html.count('src="app.js" type="module"')==1
    assert html.count('src="gs40-core.js"')==1
    assert 'src="gs40-runtime.js"' not in html
    vsom=json.loads((ROOT/'extension.vsomanifest').read_text(encoding='utf-8'))
    assert vsom['version']==VERSION,'ADO extension version mismatch'
    xml=ET.fromstring((ROOT/'extension.vsixmanifest').read_text(encoding='utf-8'))
    ns={'v':'http://schemas.microsoft.com/developer/vsx-schema/2011'}
    identity=xml.find('v:Metadata/v:Identity',ns)
    assert identity is not None and identity.attrib['Version']==VERSION,'VSIX version mismatch'
    assets={a.attrib.get('Path') for a in xml.findall('v:Assets/v:Asset',ns)}
    assert all(rel in assets for rel in ['app.js','gs40-core.js','index.html']),'Unaddressable required UI asset'
    assert all((ROOT/f).is_file() for f in PACKAGE_FILES),'Missing VSIX asset'
    if tests:
        for cmd in [['node','--check','app.js'],*(['node',test] for test in TESTS)]:
            subprocess.run(cmd,cwd=ROOT,check=True)
    out=out.resolve();out.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for rel in PACKAGE_FILES:z.write(ROOT/rel,rel)
    with zipfile.ZipFile(out) as z:
        assert z.testzip() is None,'Damaged VSIX file'
        assert sorted(z.namelist())==sorted(PACKAGE_FILES),'Unexpected VSIX contents'
        assert z.read('app.js').decode('utf-8')==app,'Packaged code diverged from tested source'
    print(f'PASS: v{VERSION} source-first build, {len(TESTS) if tests else 0} test files, {len(PACKAGE_FILES)} VSIX entries, {out.stat().st_size} bytes')

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',type=Path,default=Path(f'Global-Sprints-v{VERSION}.vsix'))
    parser.add_argument('--skip-tests',action='store_true')
    args=parser.parse_args()
    build(args.out,not args.skip_tests)
