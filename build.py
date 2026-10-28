#!/usr/bin/env python3
"""Package the reconstructed deployable Azure DevOps extension with version checks."""
import argparse,json,re,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
FILES=['extension.vsomanifest','[Content_Types].xml','extension.vsixmanifest','licensing-contract.js','app.js','index.html','vendor/msal-browser.min.js','vendor/SDK.min.js','images/icon.png']
VERSION='1.0.39'
def build(root,out):
 j=json.loads((root/'extension.vsomanifest').read_text())
 assert j['version']==VERSION
 xml=ET.fromstring((root/'extension.vsixmanifest').read_text())
 ns={'v':'http://schemas.microsoft.com/developer/vsx-schema/2011'}
 identity=xml.find('v:Metadata/v:Identity',ns)
 assert identity is not None and identity.attrib['Version']==VERSION
 app=(root/'app.js').read_text();html=(root/'index.html').read_text()
 assert f"const DIAG_VERSION='{VERSION}'" in app
 assert f'id="gsHeaderVersion">v{VERSION}</span>' in html
 assert 'src="app.js"' in html
 for rel in FILES: assert (root/rel).is_file(),rel
 with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for rel in FILES:z.write(root/rel,rel)
 with zipfile.ZipFile(out) as z:
  assert z.testzip() is None
  assert sorted(z.namelist())==sorted(FILES)
 print(f'Built and verified {out} ({out.stat().st_size} bytes)')
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--out',type=Path,default=Path(f'Global-Sprints-v{VERSION}.vsix'));options=a.parse_args();build(Path(__file__).parent,options.out)
