# Pacote de promoção — Motor Comercial B2B (forward-only)

**Origem certificada:** staging `ikaauvsflpmamgxmkhoq`.
**Destino:** produção `navfzbwgwzruipouyfnk` — **NÃO EXECUTAR** sem autorização humana explícita
e posterior de promoção. Este pacote é documental; nenhum script aqui roda automaticamente.

## 1. O que foi normalizado

As 19 migrations que dependiam da tabela `public._fiscal_staging_marker` foram convertidas para
uma guarda **portátil** e idêntica em todos os arquivos:

```sql
DO $guard$
DECLARE v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NOT NULL THEN
    EXECUTE 'SELECT project_ref FROM public._fiscal_staging_marker WHERE marker = ''STAGING'' LIMIT 1'
      INTO v_ref;
  END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'STAGING_GUARD: project_ref de PRODUCAO recusado';
  END IF;
END
$guard$;
```

Semântica: **falha apenas quando o ambiente se prova PRODUÇÃO**; em banco novo (marker ausente)
segue adiante. Nenhuma semântica fiscal ou de negócio foi alterada — apenas o bloco de guarda.

Provas executadas em staging (read-only, sem efeito colateral):

| Ramo | Comando | Resultado |
|------|---------|-----------|
| Marker ausente (fresh path) | bloco com `to_regclass` de tabela inexistente | executa sem erro |
| Ref de produção | `v_ref = 'navfzbwgwzruipouyfnk'` | `ERROR P0001: STAGING_GUARD: project_ref de PRODUCAO recusado` |

Arquivos normalizados (19):

```
20260729004013  20260729004107  20260729010220  20260729014307  20260729015203
20260729021225  20260729023322  20260729023718  20260729023833  20260729031837
20260729032021  20260729032141  20260729034858  20260729230131  20260730014752
20260730020619  20260730020828  20260730021620  20260730024842
```

Ocorrências remanescentes de `_fiscal_staging_marker` fora do bloco portátil: **0**.
Guardas antigas com `RAISE EXCEPTION 'STAGING_GUARD: marker ausente'`: **0**.

## 2. Ordem de promoção (fail-fast, uma etapa por vez)

1. **Backup/PITR confirmado** em produção antes de qualquer DDL.
2. Replay forward-only das migrations do repositório na ordem cronológica de nome de arquivo.
3. Verificação pós-migração (seção 3). Qualquer item vermelho → parar e acionar rollback.
4. Deploy das Edge Functions do repositório (nenhum harness de certificação está presente —
   `fase7-*` foram deletados).
5. Reexecutar a matriz de paridade **somente** se autorizada uma janela de teste em produção;
   caso contrário, manter a certificação de staging como evidência.

## 3. Verificação pós-migração (esperado)

| Item | Consulta | Esperado |
|------|----------|----------|
| RPC de checkout versionada | `pg_get_functiondef('public.create_partner_order_secure'::regproc)` | contém `reqfp_v2` |
| Hash de carrinho | `pg_get_functiondef('public.fn_b2b_cart_hash'::regproc)` | prefixo `'v2\|'` |
| Guarda de recebível | `trg_b2b_block_receivable_before_approval` em `pg_trigger` | presente |
| Exposição de crédito | `fn_b2b_credit_exposure` | conta apenas status ≥ `aprovado` |
| Planos comerciais | `has_table_privilege('authenticated','public.commercial_payment_plans','SELECT')` | `false` |
| Idempotência | tabela `partner_order_idempotency` com `request_fingerprint` | presente |

## 4. Rollback

Usar `restoration/rollback-forward-safe.sql` (forward-safe, sem `DROP` destrutivo de dados).
Rollback de dados depende exclusivamente do PITR do passo 1.

## 5. Estado atual

- Staging: **certificado** (paridade 15/15, hardening final aprovado).
- Migrations fiscais: **normalizadas e reprodutíveis** — bloqueio anterior removido.
- Promoção: **aguardando autorização humana**; nada foi executado em produção.
