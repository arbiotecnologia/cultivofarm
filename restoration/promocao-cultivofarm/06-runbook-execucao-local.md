# Runbook — execução local da promoção estrutural para o CultivoFarm

Alvo: `swzpzcwiasxmjutrmvkm` (organização Cultivo Farm).
Origem do contrato: homologação `ikaauvsflpmamgxmkhoq`.
Proibidos em qualquer comando: `navfzbwgwzruipouyfnk`, `yzszlzjpovmcteuxjznj`.

Toda a execução acontece **na máquina do operador**. O ambiente Lovable não
possui canal autenticado para o CultivoFarm e não executa nenhuma das etapas
abaixo.

## Passo 0 — Ações manuais no dashboard Supabase (obrigatórias)

1. Projeto `swzpzcwiasxmjutrmvkm` → **Settings → Database → Connection string**
   → copiar a string do *session pooler*. Guardar como `CULTIVOFARM_DSN`
   (nunca commitar, nunca imprimir).
2. **Settings → Database → Backups**: confirmar PITR/backup ativo. Registrar
   por escrito data/hora e responsável. Sem isso, não prossiga.
3. **Database → Extensions**: habilitar `pgcrypto`, `pg_net`, `pg_cron`,
   `pg_trgm`, `uuid-ossp` (as que o precheck apontar como ausentes).
4. **Settings → API**: anotar Project URL e chave publicável — usadas só na
   etapa posterior de binding do aplicativo.
5. `supabase login` e `supabase link --project-ref swzpzcwiasxmjutrmvkm`.

> Enquanto você não autorizar explicitamente, `supabase/config.toml`, `.env` e
> `src/integrations/supabase/client.ts` continuam apontando para a homologação.
> O gate `restoration/homologacao-h9/h9f-gates/h9f-binding-gate.sh` reprova
> qualquer outro ref.

## Passo 1 — Prechecks no alvo

```bash
psql "$CULTIVOFARM_DSN" -X -v ON_ERROR_STOP=1 \
  -f restoration/promocao-cultivofarm/01-prechecks-readonly.sql \
  | tee evidencias/01-prechecks-$(date +%F).log
sha256sum evidencias/01-prechecks-$(date +%F).log
```

Aceite: `tabelas_public = 0`, `auth_users = 0`, `storage_objects = 0`,
extensões requeridas presentes, ledger vazio.

## Passo 2 — Gerar o baseline a partir da homologação

```bash
STAGING_DSN="$HOMOLOG_DSN" \
  restoration/promocao-cultivofarm/02-gerar-baseline-estrutural.sh \
  restoration/promocao-cultivofarm/gerado/
```

Produz `02-baseline-estrutural.sql`, `03-grants-policies.sql`,
`00-inventario-esperado/*.tsv` e `SHA256SUMS.txt`. Arquive os hashes.

Revise o dump antes de aplicar: remova qualquer `INSERT`, qualquer referência a
`_fiscal_staging_marker` e confirme que nenhuma linha contém os refs proibidos.

## Passo 3 — Dry-run transacional no alvo

```bash
psql "$CULTIVOFARM_DSN" -X -v ON_ERROR_STOP=1 \
  -c "BEGIN;" \
  -f restoration/promocao-cultivofarm/gerado/02-baseline-estrutural.sql \
  -c "ROLLBACK;"
```

Qualquer erro aqui interrompe a promoção. Nada persiste.

## Passo 4 — Aplicação por ondas

Ordem obrigatória: 1 extensões/schemas → 2 tabelas/índices → 3 funções/triggers
→ 4 views/matviews → 5 RLS/policies/grants → 6 cron desabilitado → 7 ledger.

Cada onda segue o envelope transacional de `05-rollback.md`. Após cada onda:

```bash
psql "$CULTIVOFARM_DSN" -X -v ON_ERROR_STOP=1 \
  -f restoration/promocao-cultivofarm/04-postchecks.sql \
  | tee evidencias/04-postchecks-onda<N>-$(date +%F).log
```

## Passo 5 — Ledger

Registrar o baseline como **uma única versão**, sem inventar histórico:

```sql
BEGIN;
SET LOCAL promocao.target_ref = 'swzpzcwiasxmjutrmvkm';
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261110000000', 'cultivofarm_baseline_estrutural_v1');
COMMIT;
```

## Passo 6 — Security Advisor

Rodar o Advisor do projeto CultivoFarm. Aceite: **0 ERROR**. Warnings
classificados e justificados por escrito no relatório final.

## Passo 7 — Etapa posterior (fora deste runbook)

- Criar `admin@arbio.com` no Auth do CultivoFarm e inserir `administrador` em
  `public.user_roles`.
- Recriar buckets de Storage vazios.
- Recriar secrets do Vault.
- Deploy das Edge Functions.
- Habilitar os jobs de cron.
- Trocar o binding do aplicativo, mediante autorização explícita.

## Registro obrigatório

Ao final, preencha `10-relatorio-final.md` com: ref efetivamente usado, logs e
hashes de cada passo, contagens de paridade, gates aprovados/reprovados,
resíduos e bloqueios.
