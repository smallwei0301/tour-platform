from __future__ import annotations
import importlib.util, sys
from pathlib import Path

HELPER = Path(__file__).resolve().parents[1] / 'tp_recover_repaired_triage.py'
spec = importlib.util.spec_from_file_location('subtractive_triage_under_test', HELPER)
assert spec is not None and spec.loader is not None
m = importlib.util.module_from_spec(spec); sys.modules[spec.name] = m; spec.loader.exec_module(m)

def payload(*, status='triage', worker=None, current=None, outcome='blocked', kind='capability', source='ready'):
    return {
        'task': {'id':'t_x','status':status,'block_kind':kind,'worker_pid':worker,'current_run_id':current},
        'runs': [{'id':9,'outcome':outcome,'ended_at':100}],
        'events': [{'id':30,'run_id':9,'kind':'block_loop_detected','payload':{'kind':kind,'source_status':source,'recurrences':99,'limit':2},'created_at':100}],
        'comments': [],
    }

def test_inert_same_card_recovery_needs_no_receipt_witness_or_recurrence_exception():
    gate=m.evaluate_recovery(payload())
    assert gate['eligible'] is True
    assert gate['reasons']==[]
    for removed in ('receipt_created_at','blocker_fingerprint','repair_witness_task_id','repair_witness_event_id','recurrences','recurrence_limit'):
        assert removed not in gate

def test_mechanical_invariants_remain():
    assert 'TASK_NOT_TRIAGE' in m.evaluate_recovery(payload(status='blocked'))['reasons']
    assert 'TASK_NOT_INERT' in m.evaluate_recovery(payload(worker=123,current=9))['reasons']
    assert 'LATEST_RUN_NOT_TERMINAL_BLOCK' in m.evaluate_recovery(payload(outcome='success'))['reasons']
    assert 'LATEST_LOOP_NOT_RECOVERABLE' in m.evaluate_recovery(payload(kind='needs_input'))['reasons']
    assert m.evaluate_recovery(payload(source='blocked'))['eligible'] is True
    assert 'INVALID_LOOP_SOURCE_STATUS' in m.evaluate_recovery(payload(source='unknown'))['reasons']

def test_review_recovery_keeps_native_handoff_provenance_requirement():
    p=payload(source='review')
    g=m.evaluate_recovery(p)
    assert 'INVALID_REVIEW_HANDOFF_PROVENANCE' in g['reasons']
