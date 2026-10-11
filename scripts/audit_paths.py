"""Reproducible, offline source-trace audit; does not assert live API behavior."""
from pathlib import Path
import json,re,datetime
root=Path(__file__).resolve().parents[1]
app=(root/'extension/app.js').read_text()
checks={
 'State PATCH with revision guard': ['async function updateWorkItemState','path:\'/rev\'','System.State'],
 'Project/type-scoped workflow metadata': ['function workflowKey(w)','workflowCategories.set(key,mapping)','workflowCategory(w,state)'],
 'ADO work-item-type states endpoint': ['/_apis/wit/workitemtypes/','/states?api-version=7.1'],
 'Assigned-item refresh trace': ['ado.refresh.completed','async function reportRefresh'],
 'Hierarchy rendering': ['function renderHierarchy','ancestorItems'],
 'Automatic progress snapshots': ['async function autoReportObservation','reports.observation.saved'],
 'Microsoft 365 calendar discovery': ['m365RefreshCalendars','https://graph.microsoft.com/v1.0/me/calendars'],
 'Demo recalculation instrumentation': ['demo.ticket.saved','demo.blocker.changed'],
 'Diagnostic export version': ['global-sprints-test-session-${DIAG_VERSION}.json'],
}
results=[]
for name,needles in checks.items():
 missing=[n for n in needles if n not in app]
 results.append({'check':name,'status':'SOURCE_PRESENT' if not missing else 'SOURCE_GAP','missing':missing})
report={'audit':'PNPC Global Sprints static pathway trace','version':'0.6.1','generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Source presence and static wiring only; no ADO/Graph runtime access','checks':results,'runtimeEvidenceRequired':['Actual Agile/Scrum process ancestry for each participating project','Customized state names and transitions by work-item type','Parent/child relationships before and after state update','Inbound external edit refresh with changed revision','Persisted progress observations across days and browser reloads','Outlook invite delivery timing and Graph response IDs']}
out=root/'docs/audit-trace-0.6.1.json';out.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'source_checks':len(results),'source_present':sum(x['status']=='SOURCE_PRESENT' for x in results),'source_gaps':[x for x in results if x['status']=='SOURCE_GAP']},indent=2))
