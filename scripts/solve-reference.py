"""Offline reference solver, independent of the browser heuristic.
Run: python -m pip install scipy; python scripts/solve-reference.py
Uses the exact exported fixture; never reads/writes user storage.
"""
import json, time, sys
from pathlib import Path
from collections import defaultdict
import numpy as np
from highspy import Highs, HighsVarType
from scipy.sparse import coo_matrix

root=Path(__file__).resolve().parents[1]
data=json.loads((root/'docs/schedule-reference-input.json').read_text(encoding='utf-8'))
role_filter=sys.argv[1] if len(sys.argv)>1 else None
if role_filter:
 data['employees']=[e for e in data['employees'] if e['workRole']==role_filter]
 ids={e['id'] for e in data['employees']}
 data['baseline']=[s for s in data['baseline'] if s['employeeId'] in ids]
employees=data['employees']; days=data['days']; candidates=[]
by_emp=defaultdict(list); by_day=defaultdict(list); coverage=defaultdict(list)
# Enumerate all continuous shifts and all legal pause positions, in 30-minute slots.
for ei,e in enumerate(employees):
 for di,d in enumerate(days):
  if d['closed'] or d['date'] in data['blocked'][e['id']]: continue
  if e.get('availableWeekdays') and d['weekday'] not in e['availableWeekdays']:continue
  for block in d['blocks']:
   for paid in range(180,481,30):
    pause=30 if paid>360 else 0
    for start in range(block['startMinutes'],block['endMinutes']-paid-pause+1,30):
     end=start+paid+pause
     # Boundary-anchored candidates plus every incumbent shift keep a compact model.
     incumbent=any(s['employeeId']==e['id'] and s['date']==d['date'] and s['startMinutes']==start and s['endMinutes']==end for s in data['baseline'])
     if start!=block['startMinutes'] and end!=block['endMinutes'] and not incumbent:continue
     pauses=[None] if not pause else [t for t in range(start+60,end-pause-59,30) if t-start<=360 and end-t-pause<=360]
     for p in pauses:
      idx=len(candidates);candidates.append((ei,di,start,end,paid,p))
      by_emp[ei].append(idx);by_day[ei,di].append(idx)
      for t in range(start,end,30):
       if p is not None and p<=t<p+pause:continue
       coverage[di,e['workRole'],t].append(idx)
       coverage[di,'ALL',t].append(idx)

cost=[0.0]*len(candidates); integrality=[1]*len(cost); lower=[0.0]*len(cost); upper=[1.0]*len(cost)
rows=[];cols=[];values=[];lo=[];hi=[]
def constraint(terms,l=-np.inf,u=np.inf):
 row=len(lo)
 for col,v in terms:rows.append(row);cols.append(col);values.append(v)
 lo.append(l);hi.append(u)
def slack(penalty,cap):
 i=len(cost);cost.append(penalty);integrality.append(0);lower.append(0);upper.append(cap);return i
for ei,e in enumerate(employees):
 constraint(((i,candidates[i][4]/30) for i in by_emp[ei]),e['targetMinutes']//30,e['targetMinutes']//30)
 for di in range(len(days)):constraint(((i,1) for i in by_day[ei,di]),u=1)
 for week in set(d['week'] for d in days):
  constraint(((i,1) for di,d in enumerate(days) if d['week']==week for i in by_day[ei,di]),u=min(6,e.get('maxDaysPerWeek',6)))
 for first in range(len(days)-6):
  constraint(((i,1) for di in range(first,first+7) for i in by_day[ei,di]),u=6)
for di,d in enumerate(days):
 if d['closed']:continue
 for block in d['blocks']:
  for t in range(block['startMinutes'],block['endMinutes'],30):
   for role in ([role_filter] if role_filter else ['KITCHEN','SERVICE_SUSHI']):
    gap=slack(1000000,1)
    constraint([(i,1) for i in coverage[di,role,t]]+[(gap,1)],l=1)
   if 1050<=t<1170:
    required=2 if role_filter=='SERVICE_SUSHI' else 1 if role_filter else 3
    gap=slack(1000,required)
    constraint([(i,1) for i in coverage[di,'ALL',t]]+[(gap,1)],l=required)
print(f'{len(candidates)} candidate shifts, {len(lo)} constraints',flush=True)
started=time.time()
solver=Highs()
solver.setOptionValue('time_limit',60.0)
solver.setOptionValue('mip_rel_gap',0.005)
solver.setOptionValue('output_flag',False)
solver.setOptionValue('threads',2)
solver.setOptionValue('presolve','off')
n=len(cost); indices=np.arange(n,dtype=np.int32)
solver.addVars(n,np.array(lower),np.array(upper))
solver.changeColsCost(n,indices,np.array(cost))
solver.changeColsIntegrality(len(candidates),indices[:len(candidates)],np.full(len(candidates),HighsVarType.kInteger,dtype=np.uint8))
matrix=coo_matrix((values,(rows,cols)),shape=(len(lo),n)).tocsr()
solver.addRows(len(lo),np.array(lo),np.array(hi),matrix.nnz,matrix.indptr.astype(np.int32),matrix.indices.astype(np.int32),matrix.data)
# Supply a complete feasible incumbent, including exact deficit variables.
x=np.zeros(n)
lookup={(employees[ei]['id'],days[di]['date'],start,end,paid,p):i for i,(ei,di,start,end,paid,p) in enumerate(candidates)}
for shift in data['baseline']:
 key=(shift['employeeId'],shift['date'],shift['startMinutes'],shift['endMinutes'],shift['paidMinutes'],shift.get('pauseStartMinutes'))
 x[lookup[key]]=1
activity=matrix@x
for row in range(len(lo)):
 if not np.isfinite(lo[row]) or activity[row]>=lo[row]:continue
 for pos in range(matrix.indptr[row],matrix.indptr[row+1]):
  col=matrix.indices[pos]
  if col>=len(candidates):x[col]=lo[row]-activity[row]
solver.setSolution(n,indices,x)
solver.run()
info=solver.getInfo(); solution=solver.getSolution()
if not solution.value_valid:raise RuntimeError(str(solver.getModelStatus()))
shifts=[]
for i,(ei,di,start,end,paid,pause_start) in enumerate(candidates):
 if solution.col_value[i]<0.5:continue
 shift=dict(id=f'reference-{i}',employeeId=employees[ei]['id'],date=days[di]['date'],startMinutes=start,endMinutes=end,paidMinutes=paid,pauseMinutes=30 if paid>360 else 0,shiftType='CUSTOM',generated=True)
 if pause_start is not None:shift['pauseStartMinutes']=pause_start
 shifts.append(shift)
output=dict(year=data['year'],month=data['month'],objective=float(info.objective_function_value),lowerBound=float(info.mip_dual_bound),relativeGap=float(info.mip_gap),status=solver.modelStatusToString(solver.getModelStatus()),seconds=time.time()-started,shifts=shifts)
(root/f'docs/schedule-reference-{role_filter or "result"}.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
print({k:v for k,v in output.items() if k!='shifts'},flush=True)
