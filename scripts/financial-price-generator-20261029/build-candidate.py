"""Generates price-generator.sql.review from the template, pinning the calendar version,
locality and sealed digest from the v2 dataset. Never hand-edit the .review output."""
import hashlib, json, pathlib, sys
H = pathlib.Path(__file__).resolve().parent
PKG = H.parent / 'financial-installments-initial-20261024'
pol = json.loads((PKG / 'arbio-fsf-policy.draft.json').read_text(encoding='utf-8'))
a = pol['active_candidate']
assert pol['runtime_enabled'] is False and a['runtime_enabled'] is False
doc = json.loads((PKG / a['holiday_calendar_dataset']).read_text(encoding='utf-8'))
F = doc['integrity']['fields']


def sealed(d=doc):
    return json.dumps({k: d[k] for k in F}, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


assert hashlib.sha256(sealed().encode()).hexdigest() == doc['integrity']['sha256']
assert doc['version'] == a['holiday_calendar_dataset_version'] and doc['locality'] == a['holiday_calendar_locality'] == 'Paracatu-MG'
PINS = {'@@CAL_VERSION@@': doc['version'], '@@CAL_LOCALITY@@': doc['locality'], '@@CAL_SHA256@@': doc['integrity']['sha256']}


def build():
    s = (H / 'price-generator.template.sql').read_text(encoding='utf-8')
    for k, v in PINS.items():
        assert s.count(k) == 1, k
        s = s.replace(k, v)
    assert '@@' not in s
    out = H / 'price-generator.sql.review'
    out.write_text(s, encoding='utf-8')
    return out


if __name__ == '__main__':
    p = build()
    print(p.name, hashlib.sha256(p.read_bytes()).hexdigest(), PINS)
