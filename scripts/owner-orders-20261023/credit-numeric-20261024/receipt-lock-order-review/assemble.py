"""Normalize only external transaction delimiters; preserve every embedded SQL byte.

Local review assembly only. Never connects to a database.
"""
from pathlib import Path
import re

NAMES = ('preflight.sql', 'candidate.sql.review', 'postflight.sql',
         'rollback.sql.review', 'containment.sql.review')
DELIMITER = re.compile(r'^\s*(?:BEGIN(?: TRANSACTION)?(?: READ ONLY)?|COMMIT|ROLLBACK);\s*$', re.I)
DOLLAR = re.compile(r'\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$')

def external_lines(sql):
    """Line offsets outside dollar-quoted DO/function bodies (this captured format)."""
    tag = None
    for line in sql.splitlines(keepends=True):
        outside = tag is None
        # All captured dollar delimiters are outside quoted SQL literals/comments;
        # skip comment-only lines, retaining them byte-exact.
        if not line.lstrip().startswith('--'):
            for match in DOLLAR.finditer(line):
                if tag is None:
                    tag = match.group()
                elif match.group() == tag:
                    tag = None
        yield line, outside
    assert tag is None, 'unterminated captured dollar body'

def normalize(sql, readonly=False):
    lines = list(external_lines(sql))
    controls = [line.strip().upper() for line, outside in lines if outside and DELIMITER.fullmatch(line)]
    assert controls and controls[0].startswith('BEGIN') and controls[-1] in ('COMMIT;', 'ROLLBACK;'), controls
    body = ''.join(line for line, outside in lines if not (outside and DELIMITER.fullmatch(line)))
    return ('BEGIN READ ONLY;\n' if readonly else 'BEGIN;\n') + body + 'COMMIT;\n'

def assemble(directory):
    for name in NAMES:
        path = directory / name
        path.write_text(normalize(path.read_text(), name in ('preflight.sql', 'postflight.sql')))

if __name__ == '__main__':
    assemble(Path(__file__).resolve().parent)