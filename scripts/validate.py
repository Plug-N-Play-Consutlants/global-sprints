from pathlib import Path
import json, re, sys, xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[1]/'extension'
required=['[Content_Types].xml','extension.vsomanifest','extension.vsixmanifest','index.html','app.js','images/icon.png','vendor/SDK.min.js','vendor/msal-browser.min.js']
for n in required:
    assert (root/n).is_file(), f'Missing: {n}'
v=json.loads((root/'extension.vsomanifest').read_text())['version']
xml=(root/'extension.vsixmanifest').read_text()
assert f'Version="{v}"' in xml, 'Manifest versions differ'
for n in ['index.html','app.js','vendor/SDK.min.js','vendor/msal-browser.min.js']:
    assert f'Path="{n}" Addressable="true"' in xml, f'Not addressable: {n}'
print('Static asset and manifest checks PASS for',v)
