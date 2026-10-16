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

app=(root/'app.js').read_text()
html=(root/'index.html').read_text()
assert 'm365CheckNaa' not in app and 'm365EnableNaa' not in app, 'Obsolete diagnostic handler remains'
assert 'm365CheckNaa' not in html and 'm365EnableNaa' not in html, 'Obsolete diagnostic control remains'
assert 'async function m365Connect()' in app and 'async function m365Disconnect()' in app, 'Authentication handler missing'
assert 'await sdk.enableNestedAppAuth()' in app, 'NAA initialization missing'
assert 'new URL(\'./vendor/msal-browser.min.js\',import.meta.url)' in app, 'MSAL asset loading path changed'
assert 'm365ShowAccount();' in app, 'Microsoft account status missing'
print('Authentication startup invariants PASS')

assert 'm365Clear' not in app and 'm365Clear' not in html, 'Legacy authentication migration control remains'
assert 'm365RefreshCalendars' in app and 'm365RefreshCalendars' in html, 'Calendar discovery controls missing'
assert 'm365SaveCalendar' in app and 'm365SaveCalendar' in html, 'Calendar preference controls missing'
assert 'https://graph.microsoft.com/v1.0/me/calendars' in app, 'Microsoft Graph discovery missing'
assert 'No Outlook events have been created.' in app, 'Read-only calendar scope disclaimer missing'
print('Calendar discovery invariants PASS')

assert "async function m365RestoreSession()" in app and "client.getAllAccounts" in app and "client.acquireTokenSilent({account,scopes:['User.Read']})" in app, "Silent account recovery missing"
print("Microsoft 365 session recovery checks PASS")

assert 'void m365RefreshCalendars({silent:true})' in app, 'Calendar refresh after session recovery missing'
assert 'if(m365Account!==accountAtStart)return' in app, 'Stale calendar response guard missing'
print('Calendar session restoration checks PASS')

assert f"const DIAG_VERSION='{v}'" in app, 'Audit diagnostic version differs from manifest'
assert 'Access remains available in this integration preview' not in app, 'Legacy fail-open diagnostic remains'
assert 'const denied=ROOM_ENFORCE_PREVIEW&&!roomAccessAllowed()' in app, 'Initial entitlement check must restrict work areas'
print('Commercial UI gating and diagnostics version invariants PASS')
