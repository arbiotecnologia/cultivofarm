"""Exact map of the 38 captured real triggers required by b2b-downstream-audit AGENTS.

Each captured (name, table) must exist, be enabled (tgenabled <> 'D') and keep
the captured pg_get_triggerdef text. A count alone (10/120) is never accepted.
"""
import hashlib
import json
import re
from pathlib import Path

DEFS = 'scripts/b2b-solid-packaging-order-20261106/captured/triggers/_triggerdefs.live-20261106.sql'


def expected(root):
    text = (Path(root) / DEFS).read_text()
    rows = []
    for line in text.splitlines():
        m = re.match(r"(CREATE (?:CONSTRAINT )?TRIGGER (\w+) .*? ON (public\.\w+) .*?);?$", line.strip())
        if m:
            rows.append(dict(name=m.group(2), table=m.group(3), definition=m.group(1).rstrip(';')))
    assert len(rows) == 38, len(rows)
    return rows


def snapshot(B, root, label):
    exp = expected(root)
    actual = json.loads(B.last("""SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,
      'table',c.relnamespace::regnamespace::text||'.'||c.relname,'enabled',t.tgenabled::text,
      'definition',pg_get_triggerdef(t.oid))),'[]'::jsonb)::text
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal;"""))
    by = {(a['name'], a['table']): a for a in actual}
    mapped = []
    for e in exp:
        a = by.get((e['name'], e['table']))
        mapped.append(dict(name=e['name'], table=e['table'], present=a is not None,
                           enabled=None if a is None else a['enabled'],
                           definition_equal=a is not None and a['definition'] == e['definition'],
                           captured_md5=hashlib.md5(e['definition'].encode()).hexdigest()))
    ok = all(m['present'] and m['enabled'] != 'D' and m['definition_equal'] for m in mapped)
    return dict(label=label, expected=38, mapped=len(mapped), all_present_enabled_identical=ok,
                failures=[m for m in mapped if not (m['present'] and m['enabled'] != 'D' and m['definition_equal'])],
                triggers=mapped)


def assert_and_write(B, root, out, label):
    snap = snapshot(B, root, label)
    (Path(out) / f'triggers38-{label}.json').write_text(json.dumps(snap, indent=2) + '\n')
    assert snap['all_present_enabled_identical'], snap['failures']
    return snap
