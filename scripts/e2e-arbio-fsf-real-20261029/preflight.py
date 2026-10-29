"""VALIDADOR DE EVIDÊNCIA FORNECIDA — não acessa rede, banco nem credenciais e NÃO verifica o runtime.
Só confere, por igualdade exata, um JSON preenchido e assinado por uma pessoa (ver evidencia-preflight.schema.md).
Saída: PREFLIGHT_RESULT READONLY=<GO|BLOCKED|DENY> WRITE_SCENARIOS=<GO|BLOCKED|DENY>; exit do escopo pedido: 0 GO, 2 BLOCKED, 1 DENY."""
import json, os, re, shutil, subprocess, sys, pathlib
from urllib.parse import urlsplit

PROD, HOMOL = 'swzpzcwiasxmjutrmvkm', 'vrlcdwmlytukrjezrrnf'
FORBIDDEN = {'yzszlzjpovmcteuxjznj', 'chkgpuawcswhefiabwsm', 'navfzbwgwzruipouyfnk', 'ikaauvsflpmamgxmkhoq'}
PROD_HOSTS = {'app.cultivofarm.com.br', 'cultivofarm.lovable.app'}
OUTPUTS = ('COMMUNICATION_DELIVERY_ENABLED', 'EMAIL_DELIVERY_ENABLED', 'WHATSAPP_DELIVERY_ENABLED', 'COMMUNICATION_INAPP_ADAPTER_ENABLED', 'WHATSAPP_WEBHOOK_ENABLED')
AUTOMATIONS = ('NF_EMISSION_ENABLED', 'SEFAZ_TRANSMISSION_ENABLED', 'BOLETO_EMISSION_ENABLED', 'AUTO_RECEIVABLE_ENABLED')
WRITE_PREREQS = ('schema_confirmed', 'synthetic_data_confirmed', 'automations_verified_blocked', 'access_confirmed')
RANK = {'GO': 0, 'BLOCKED': 1, 'DENY': 2}


class Dup(Exception): pass


def no_dups(pairs):
    keys = [k for k, _ in pairs]
    if len(keys) != len(set(keys)): raise Dup(sorted({k for k in keys if keys.count(k) > 1}))
    return dict(pairs)


def main(env, root):
    ro, wr, log = ['GO'], ['GO'], []
    def mark(target, level, msg):
        for t in target:
            t[0] = max(t[0], level, key=RANK.get)
        log.append(f'{level} {msg}')
    BOTH = (ro, wr)
    print('INFO validador de evidência fornecida: não verifica runtime, rede ou credenciais')
    # tooling / cwd
    if shutil.which('rg') is None: mark(BOTH, 'DENY', 'ferramenta rg ausente')
    client = root / 'src/integrations/supabase/client.ts'
    if not client.is_file(): mark(BOTH, 'DENY', f'raiz do projeto inválida ({root})')
    else:
        if shutil.which('rg'):
            for r in sorted(FORBIDDEN):
                p = subprocess.run(['rg', '-q', '--fixed-strings', r, 'src', 'supabase/config.toml', '--glob', '!src/test/**'], cwd=root)
                if p.returncode == 0: mark(BOTH, 'DENY', f'ref proibido {r} no código')
                elif p.returncode != 1: mark(BOTH, 'DENY', f'falha do rg ({p.returncode})')
            p = subprocess.run(['rg', '-q', '-e', 'SERVICE_ROLE_KEY', '-e', 'cm9sZSI6InNlcnZpY2Vfcm9sZS', 'src', '--glob', '!src/test/**'], cwd=root)
            if p.returncode == 0: mark(BOTH, 'DENY', 'chave service_role no frontend')
            elif p.returncode != 1: mark(BOTH, 'DENY', f'falha do rg ({p.returncode})')
        mig = root / 'supabase/migrations'
        if mig.is_dir() and any(f.name.endswith('.review') for f in mig.iterdir()): mark(BOTH, 'DENY', '.review em migrations')
        log.append('INFO cliente do repositório é informativo; não prova para onde o app em execução aponta')
    mode, scope = env.get('PREFLIGHT_MODE', ''), env.get('PREFLIGHT_SCOPE', '')
    if mode not in ('PROD_READONLY', 'HOMOLOG_ISOLATED'): mark(BOTH, 'DENY', f'modo desconhecido/ausente ({mode or "vazio"})')
    if scope not in ('READONLY', 'WRITE_SCENARIOS'): mark(BOTH, 'DENY', f'escopo desconhecido/ausente ({scope or "vazio"})')
    if mode == 'PROD_READONLY': mark((wr,), 'DENY', 'produção nunca tem escopo de escrita')
    ev, path = None, env.get('PREFLIGHT_EVIDENCE', '')
    try: ev = json.loads(pathlib.Path(path).read_text(encoding='utf-8'), object_pairs_hook=no_dups)
    except Dup as e: mark(BOTH, 'DENY', f'chave repetida na evidência {e}')
    except Exception: mark(BOTH, 'BLOCKED', 'evidência ausente/ilegível')
    if path and ev is None and log and log[-1].startswith(('DENY chave', 'BLOCKED evidência')): pass
    elif not isinstance(ev, dict):
        mark(BOTH, 'DENY', f'raiz da evidência não é objeto JSON ({type(ev).__name__})'); ev = None
    if ev is not None:
        if ev.get('mode') != mode: mark(BOTH, 'DENY', 'modo da evidência difere do modo pedido')
        ref = ev.get('observed_project_ref')
        if not isinstance(ref, str) or not ref: mark(BOTH, 'BLOCKED', 'ref observado ausente')
        elif ref in FORBIDDEN: mark(BOTH, 'DENY', 'ref observado proibido')
        elif mode == 'PROD_READONLY' and ref != PROD: mark(BOTH, 'DENY', 'ref observado ≠ produção')
        elif mode == 'HOMOLOG_ISOLATED' and ref == PROD: mark(BOTH, 'DENY', 'homolog com ref observado de produção')
        elif mode == 'HOMOLOG_ISOLATED' and ref != HOMOL: mark(BOTH, 'DENY', 'ref observado ≠ homolog aprovado')
        u = ev.get('runtime_url')
        try:
            sp = urlsplit(u) if isinstance(u, str) else None
            host, scheme = (sp.hostname, sp.scheme) if sp else (None, None)
        except Exception:
            host, scheme = None, None
        if not isinstance(u, str) or scheme != 'https' or not host: mark(BOTH, 'BLOCKED', 'URL de runtime ausente/inválida')
        elif mode == 'PROD_READONLY' and host not in PROD_HOSTS: mark(BOTH, 'DENY', 'URL não é de produção')
        elif mode == 'HOMOLOG_ISOLATED' and host in PROD_HOSTS: mark(BOTH, 'DENY', 'homolog com URL de produção')
        if not (isinstance(ev.get('commit'), str) and re.fullmatch(r'[0-9a-f]{40}', ev['commit'])): mark(BOTH, 'BLOCKED', 'commit observado ausente/inválido (40 hex)')
        out = ev.get('outputs')
        if not isinstance(out, dict) or set(out) != set(OUTPUTS): mark(BOTH, 'BLOCKED', 'saídas: conjunto exato de 5 chaves ausente')
        elif any(out[k] is not False for k in OUTPUTS): mark(BOTH, 'DENY', 'saída externa não está false')
        h = ev.get('human_check')
        if not (isinstance(h, dict) and all(isinstance(h.get(k), str) and h[k].strip() for k in ('reviewer', 'checked_at', 'statement'))): mark(BOTH, 'BLOCKED', 'conferência humana ausente')
        if mode == 'HOMOLOG_ISOLATED':
            au, pr = ev.get('automations'), ev.get('write_prereqs')
            if not isinstance(au, dict) or set(au) != set(AUTOMATIONS): mark((wr,), 'BLOCKED', 'automações NF/SEFAZ/boleto/auto-receivable não comprovadas')
            elif any(au[k] is not False for k in AUTOMATIONS): mark((wr,), 'DENY', 'automação de escrita ligada')
            if not isinstance(pr, dict) or set(pr) != set(WRITE_PREREQS) or any(pr[k] is not True for k in WRITE_PREREQS): mark((wr,), 'BLOCKED', 'pré-requisitos de escrita (schema/massa/automações/acessos) não confirmados')
    for l in log: print(l)
    print(f'PREFLIGHT_RESULT READONLY={ro[0]} WRITE_SCENARIOS={wr[0]}')
    res = {'READONLY': ro[0], 'WRITE_SCENARIOS': wr[0]}.get(scope, 'DENY')
    return {'GO': 0, 'BLOCKED': 2, 'DENY': 1}[res]


if __name__ == '__main__':
    root = pathlib.Path(os.environ.get('PREFLIGHT_ROOT') or pathlib.Path(__file__).resolve().parents[2])
    sys.exit(main(os.environ, root))
