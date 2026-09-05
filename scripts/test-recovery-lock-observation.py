#!/usr/bin/env python3
import copy
import datetime as dt
import importlib.util
import sys

spec = importlib.util.spec_from_file_location('recovery_control', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
current = dt.datetime(2026, 9, 4, 10, 40, 21, tzinfo=dt.timezone.utc)
value = {'method': 'cloudflare-dashboard', 'accountId': '072101e60b1c8cd45245512d99245d9a', 'checkedAt': current.isoformat(), 'rules': [
    {'bucket': 'logivya-production-backups-' + boundary, 'id': 'recovery-v1-production-30d', 'enabled': True, 'prefix': 'logivya-backups/recovery-v1/production/', 'retentionDays': 30}
    for boundary in ('primary', 'secondary')]}
result = module.retention_lock_observation(value, current)
assert result and result['reviewDueAt'] == (current + dt.timedelta(days=7)).isoformat()
for field, wrong in [('bucket', 'unknown'), ('prefix', 'logivya-backups/'), ('retentionDays', 1), ('enabled', False)]:
    bad = copy.deepcopy(value)
    bad['rules'][0][field] = wrong
    assert module.retention_lock_observation(bad, current) is None
for wrong in [None, {}, {**value, 'checkedAt': '2026-09-04T10:40:21'}, {**value, 'checkedAt': (current + dt.timedelta(minutes=2)).isoformat()}, {**value, 'rules': [value['rules'][0]]}, {**value, 'rules': [value['rules'][0], value['rules'][0]]}]:
    assert module.retention_lock_observation(wrong, current) is None
print('Provider observation validation passed: scope, age, both stores and enabled retention.')
