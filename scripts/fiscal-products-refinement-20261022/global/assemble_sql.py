"""Embed the exact readonly baseline in an inactive artifact; never execute hosted."""
from pathlib import Path
H = Path(__file__).resolve().parent
body = (H / 'migration.sql.review').read_text()
marker = '-- Structural guard is embedded by assemble_sql.py, before any mutation.'
assert body.count(marker) == 1
(H / 'candidate.sql.review').write_text(body.replace(marker, (H / 'structural-guard.sql.review').read_text()))
print('Prepared inactive fiscal SQL with assertive structural guard')