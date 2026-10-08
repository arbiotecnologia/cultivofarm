"""Nominal metadata inventory, not proof that a role can bypass each guard."""
import argparse
import csv
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--functions', required=True)
    parser.add_argument('--relations', required=True)
    parser.add_argument('--policies', required=True)
    args = parser.parse_args()
    sources = {kind: Path(getattr(args, kind)) for kind in ('functions', 'relations', 'policies')}
    texts = {kind: path.read_text().removeprefix('[map[nominal:').removesuffix(']]') for kind, path in sources.items()}
    files = list((ROOT / 'src').rglob('*.ts')) + list((ROOT / 'src').rglob('*.tsx')) + list((ROOT / 'supabase/functions').rglob('*.ts'))
    literal_callers = {}
    for path in files:
        for literal in set(re.findall(r'[\"\x27]([a-zA-Z0-9_/-]+)[\"\x27]', path.read_text())):
            literal_callers.setdefault(literal, []).append(str(path.relative_to(ROOT)))
    rows = []

    def add(kind, name, definition, status='UNVERIFIED', evidence='Escopo efetivo não exercitado; grant não autoriza por si só.'):
        bare = name.split('(')[0].split('.')[-1]
        callers = literal_callers.get(bare, [])
        rows.append({'tipo': kind, 'canal': name, 'estado': status, 'evidencia': evidence,
                     'callers_locais': ';'.join(callers) or 'sem caller literal localizado (não prova inacessibilidade)',
                     'definicao_ou_grants': definition})

    verified_functions = {
        'get_my_commercial_partner_context': ('projeção própria', 'scripts/rbac-audit/b2b-commercial-context.sql; src/test/saas/b2b-commercial-context-postgres.test.ts'),
        'get_my_commercial_partner_projection': ('projeção própria', 'scripts/rbac-audit/b2b-commercial-portal.sql; projeção mínima, não linha financeira'),
        'get_my_commercial_orders_projection': ('projeção própria', 'scripts/rbac-audit/b2b-commercial-own-orders.sql; pedidos resumidos, não faturamento'),
        'get_b2b_user_clients_secure': ('negado por guard verificado', 'scripts/rbac-audit/b2b-latent-channel-containment.sql; src/test/saas/b2b-latent-channels-postgres.test.ts'),
        'rpc_message_set_status': ('projeção própria', 'mutação própria owner/contexto: scripts/rbac-audit/b2b-latent-channel-containment.sql; PG local, não API'),
    }
    for line in texts['functions'].splitlines():
        if not line.strip():
            continue
        name = line.split('|')[0]
        state, evidence = verified_functions.get(name.split('(')[0].split('.')[-1], ('UNVERIFIED', 'Corpo/ACL catalogados; execução efetiva e cadeia de helpers pendentes.'))
        add('RPC/helper com EXECUTE authenticated', name, line, state, evidence)
    for line in texts['relations'].splitlines():
        if not line.strip():
            continue
        name = line.split('|')[0]
        state, evidence = 'UNVERIFIED', 'Privilégios reais catalogados; todas operações e políticas combinadas ainda não exercitadas.'
        if name == 'public.organizations':
            state, evidence = 'negado por guard verificado', 'SELECT inteiro: migration20261008222953 + nove asserções PG; demais comandos não certificados.'
        if name == 'public.partner_accounts':
            state, evidence = 'negado por guard verificado', 'SELECT inteiro: b2b-partner-row-containment + self-coherence; demais comandos não certificados.'
        if name == 'public.configuracoes_sistema':
            state, evidence = 'público intencional', 'Leitura por usuário ativo de branding global; não anon; mutação só Platform Superadmin (não certificada nesta linha).'
        add('tabela/view com privilégio authenticated', name, line, state, evidence)
    for definition in re.split(r'\n(?=(?:public|storage)\.)', texts['policies']):
        if not definition.strip():
            continue
        parts = definition.split('|')
        name = '|'.join(parts[:2])
        state, evidence = 'UNVERIFIED', 'Predicado real nominal; interação permissiva/restritiva e helpers não integralmente exercitados.'
        if 'b2b_organization_full_row_containment' in name:
            state, evidence = 'negado por guard verificado', 'src/test/saas/b2b-organizations-postgres.test.ts; gestor/técnico/extra/internal A/B/anon'
        if 'b2b_direct_partner_row_containment' in name:
            state, evidence = 'negado por guard verificado', 'src/test/saas/b2b-partner-real-rls-postgres.test.ts; SELECT inteiro'
        add('Storage policy' if parts[0].startswith('storage.') else 'policy pública', name, definition, state, evidence)
    config = (ROOT / 'supabase/config.toml').read_text()
    for path in sorted((ROOT / 'supabase/functions').glob('*/index.ts')):
        name = path.parent.name
        section = re.search(r'\[functions\.' + re.escape(name) + r'\]([^\[]*)', config)
        add('Edge (fonte local; alcance vivo UNVERIFIED)', name, str(path.relative_to(ROOT)) + '; ' + (section.group(1).strip() if section else 'verify_jwt não declarado no config local'))
    destination = ROOT / 'docs/auditorias/b2b-commercial-owner-canais-nominais-20261008.csv'
    with destination.open('w', newline='') as out:
        writer = csv.DictWriter(out, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    manifest = {'project_ref': 'swzpzcwiasxmjutrmvkm', 'evidence': 'read-only catalog metadata; not effective role execution/JWT',
                'rows': len(rows), 'sources': {kind: {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'result': path.name} for kind, path in sources.items()},
                'states': {state: sum(row['estado'] == state for row in rows) for state in sorted({row['estado'] for row in rows})}}
    (destination.with_suffix('.manifest.json')).write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps(manifest['states'], ensure_ascii=False), 'rows=', len(rows))


if __name__ == '__main__':
    main()