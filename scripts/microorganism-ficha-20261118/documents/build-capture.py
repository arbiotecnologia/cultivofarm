#!/usr/bin/env python3
"""Generate explicit read-only connector capture text; never connects or executes."""
import argparse
from pathlib import Path

H = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--ref', required=True, choices=['vrlcdwmlytukrjezrrnf', 'swzpzcwiasxmjutrmvkm'])
parser.add_argument('--out', required=True)
args = parser.parse_args()
text = (H / 'capture.sql.review').read_text(encoding='utf-8')
text = text.replace('vrlcdwmlytukrjezrrnf', args.ref).replace('READ ONLY HML capture', 'READ ONLY explicit environment capture')
Path(args.out).write_text(text, encoding='utf-8', newline='\n')
print(f'Capture prepared for {args.ref}; not executed. Connector must independently prove this ref.')