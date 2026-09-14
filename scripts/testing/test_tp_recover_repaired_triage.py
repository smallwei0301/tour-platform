#!/usr/bin/python3
import hashlib,importlib.util,json,sys,unittest
from pathlib import Path

P = Path(__file__).resolve().parents[1] / "tp_recover_repaired_triage.py"
spec = importlib.util.spec_from_file_location("triage_recovery_under_test", P)
assert spec is not None and spec.loader is not None
m = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = m
spec.loader.exec_module(m)

def payload(**overrides):
 d={'task':{'status':'triage','block_kind':'capability','current_run_id':None,'worker_pid':None},'runs':[{'id':7,'outcome':'blocked','ended_at':100}],'events':[{'kind':'block_loop_detected','payload':{'kind':'capability','source_status':'ready'},'created_at':100}],'comments':[{'author':'ava','body':'CAPABILITY_BLOCK_CLEARED\nFAILED_RUN: 7\nFAILURE: test\nROOT_CAUSE: test\nEVIDENCE: repaired\nCONTINUATION: same-card','created_at':101}]}
 d.update(overrides);return d
class T(unittest.TestCase):
 def test_canonical_runtime_binding(self):
  self.assertEqual(m.CANDIDATE,Path('/root/.hermes/hermes-agent'))
  self.assertEqual(m.CANONICAL_PYTHON,Path('/root/.hermes/hermes-agent/venv/bin/python3'))
 def test_repaired_inert_capability_triage_is_eligible(self):
  result=m.evaluate_recovery(payload());self.assertTrue(result['eligible']);self.assertFalse(result['human_decision_required']);self.assertEqual(result['recovery_target_status'],'ready')
 def test_live_worker_is_rejected(self):
  x=payload();x['task']['current_run_id']=8;self.assertIn('TASK_NOT_INERT',m.evaluate_recovery(x)['reasons'])
 def test_semantic_or_owner_block_is_rejected(self):
  x=payload(events=[{'kind':'block_loop_detected','payload':{'kind':'needs_input'}}]);self.assertIn('LATEST_LOOP_NOT_CAPABILITY',m.evaluate_recovery(x)['reasons'])
 def test_recurrence_over_limit_requires_independent_completed_repair_witness(self):
  x=payload(events=[{'id':88,'task_id':'t_test','kind':'block_loop_detected','payload':{'kind':'capability','source_status':'ready','recurrences':3,'limit':2},'created_at':100}])
  self.assertIn('RECURRENCE_LIMIT_EXCEEDED_REPAIR_WITNESS_REQUIRED',m.evaluate_recovery(x)['reasons'])
 def test_over_limit_accepts_exact_completed_repair_witness(self):
  loop={'id':88,'task_id':'t_test','kind':'block_loop_detected','payload':{'kind':'capability','source_status':'ready','recurrences':3,'limit':2,'reason':'upstream t_repair remains blocked'},'created_at':100}
  binding={'event_id':88,'run_id':7,'kind':'capability','reason':'upstream t_repair remains blocked','source_status':'ready'}
  fingerprint=hashlib.sha256(json.dumps(binding,sort_keys=True,separators=(',',':')).encode()).hexdigest()
  body='CAPABILITY_BLOCK_CLEARED\nFAILED_RUN: 7\nFAILURE: test\nROOT_CAUSE: test\nEVIDENCE: repaired\nCONTINUATION: same-card\nBLOCKER_EVENT: 88\nBLOCKER_FINGERPRINT: '+fingerprint+'\nREPAIR_WITNESS_TASK: t_repair\nREPAIR_WITNESS_EVENT: 99'
  x=payload(events=[loop],comments=[{'author':'ava','body':body,'created_at':103}])
  witness={'task':{'id':'t_repair','status':'done','current_run_id':None,'worker_pid':None},'events':[{'id':99,'task_id':'t_repair','kind':'completed','created_at':102}]}
  self.assertTrue(m.evaluate_recovery(x,repair_witness=witness)['eligible'])
 def test_over_limit_rejects_blocked_or_unrelated_repair_witness(self):
  loop={'id':88,'task_id':'t_test','kind':'block_loop_detected','payload':{'kind':'capability','source_status':'ready','recurrences':3,'limit':2,'reason':'upstream t_expected remains blocked'},'created_at':100}
  binding={'event_id':88,'run_id':7,'kind':'capability','reason':'upstream t_expected remains blocked','source_status':'ready'}
  fingerprint=hashlib.sha256(json.dumps(binding,sort_keys=True,separators=(',',':')).encode()).hexdigest()
  body='CAPABILITY_BLOCK_CLEARED\nFAILED_RUN: 7\nFAILURE: test\nROOT_CAUSE: test\nEVIDENCE: repaired\nCONTINUATION: same-card\nBLOCKER_EVENT: 88\nBLOCKER_FINGERPRINT: '+fingerprint+'\nREPAIR_WITNESS_TASK: t_repair\nREPAIR_WITNESS_EVENT: 99'
  x=payload(events=[loop],comments=[{'author':'ava','body':body,'created_at':103}])
  witness={'task':{'id':'t_repair','status':'blocked','current_run_id':None,'worker_pid':None},'events':[{'id':99,'task_id':'t_repair','kind':'completed','created_at':102}]}
  reasons=m.evaluate_recovery(x,repair_witness=witness)['reasons']
  self.assertIn('REPAIR_WITNESS_TASK_NOT_TERMINAL',reasons)
  self.assertIn('REPAIR_WITNESS_NOT_REFERENCED_BY_BLOCKER',reasons)
 def test_stale_or_missing_repair_receipt_is_rejected(self):
  x=payload(comments=[{'author':'ava','body':'CAPABILITY_BLOCK_CLEARED','created_at':99}]);self.assertIn('NO_POST_RUN_AVA_REPAIR_RECEIPT',m.evaluate_recovery(x)['reasons'])
 def test_non_triage_is_rejected(self):
  x=payload();x['task']['status']='blocked';self.assertIn('TASK_NOT_TRIAGE',m.evaluate_recovery(x)['reasons'])
if __name__=='__main__':unittest.main(verbosity=2)
