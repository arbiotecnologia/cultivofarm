# Fase H2 — Certificação Runtime no Staging Temporário

> Status final desta rodada: **BLOQUEADO POR CREDENCIAIS**
> Nenhuma escrita realizada em qualquer projeto Supabase.
> Produção `navfzbwgwzruipouyfnk` intocada. Staging `ikaauvsflpmamgxmkhoq`
> inacessível a partir deste sandbox.

## 0. Ambiente (mascarado) e anti-produção

| Verificação                                | Resultado                                |
|--------------------------------------------|------------------------------------------|
| `FISCAL_TEST_ENV == "STAGING"`             | ❌ variável ausente no sandbox            |
| `PGHOST` (psql direto)                     | ❌ ausente                                |
| Anon/service role do staging temporário    | ❌ não injetado                           |
| URL/REST do staging temporário             | ❌ não injetada                           |
| Marker `public._fiscal_staging_marker`     | ❌ inverificável (sem conexão)            |
| Contexto Supabase disponível no sandbox    | apenas produção `navfz…yfnk` (PROIBIDO)  |
| `supabase/config.toml → project_id`        | `navfz…yfnk` (produção — não usar)       |

Regra do próprio prompt aplicada literalmente: “Se credenciais/marker
faltarem ou apontarem para produção, NÃO improvise e não escreva: pare
cedo, rode apenas verificações locais úteis e relate exatamente o gate
faltante.” Feito.

Nenhum segredo, JWT, anon/service role ou URL com credencial foi
impresso, logado ou incorporado a arquivo.

## 1. Gate faltante (bloqueante para H2)

Para prosseguir com H2 é necessário injetar no sandbox, no início da
próxima execução, todos os itens abaixo — escopados exclusivamente ao
projeto temporário `ikaauvsflpmamgxmkhoq` (AR-Bio-TEMP):

1. `FISCAL_TEST_ENV=STAGING`
2. Credenciais Postgres do staging (`PGHOST`, `PGPORT`, `PGDATABASE`,
   `PGUSER`, `PGPASSWORD`) OU string `postgresql://…` equivalente.
3. `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`
   **do staging temporário** (não da produção).
4. Confirmação de que `public._fiscal_staging_marker` retorna
   `'STAGING'` com `project_ref = 'ikaauvsflpmamgxmkhoq'` — a criação
   desse marker precede qualquer escrita de H2.
5. Confirmação humana explícita de que produção não recebe qualquer
   comando desta rodada.

Sem esses cinco itens, H2 não pode iniciar. Não haverá fallback
automático nem improviso.

## 2. Verificações locais úteis executadas nesta rodada

Executadas sem tocar em banco. Todas contra o repositório atual.

| Gate local                                       | Resultado |
|--------------------------------------------------|-----------|
| `bun run typecheck` (`tsc --noEmit`)             | ✅        |
| `scripts/fiscal-secrets-scan.sh`                 | ✅ nenhum segredo real |
| `scripts/fiscal-integration-scan.sh`             | ✅ nenhuma emissão em runtime |
| `scripts/verify-fiscal-types.ts`                 | ✅ 9 tabelas / 5 views / 2 RPCs |
| `bunx vitest run` (2ª execução, referência)      | 1341 ✅ / 3 skipped / 0 falhas |
| `bunx vitest run` (1ª execução)                  | 1340 ✅ / 1 falha transitória / 3 skipped |
| `bun run build`                                  | ✅ (SW gerado) |
| Lint dedicado                                    | ⚠ script `lint` não configurado (gate ausente, documentado em H1) |

Observação sobre a falha transitória: a 1ª execução do Vitest reportou
`1 failed` sem imprimir o assert (`grep` posterior não encontrou
`AssertionError`), e a reexecução ficou 100% verde. Padrão típico de
timeout de setup na suíte pesada (transform 8s, environment 992s
acumulados). Não é falha reprodutível de contrato; será re-observado
no início de H2 e, se reincidir, isolado sob autorização.

## 3. Estado das migrations canônicas (não aplicadas neste sandbox)

Ordem a ser respeitada em H2 sobre o schema-base já existente do staging
(fail-fast, sem repair automático, sem `restoration/migrations`):

1. `20260721000000_fiscal_fase2_fundacao.sql`
2. `20260721010000_fiscal_fase2_1_hardening.sql`
3. `20260722000000_fiscal_fase3_0_1_integridade.sql`
4. `20260723000000_fiscal_fase3_15_central_config.sql`
5. `20260724000000_fiscal_fase3_16_homologacao_certificados.sql`
6. `20260725000000_fiscal_fase3_17_homologation_readiness.sql`
7. `20260726000000_fiscal_fase3_18_draft_status_check.sql`
8. `20260727000000_fiscal_fase3_19_rtc_2026.sql`

Se o schema-base anterior não existir no temporário, aplicar antes toda
a cadeia canônica necessária de `supabase/migrations/` na ordem
cronológica. Não aplicar apenas as fiscais sobre schema incompleto.

## 4. Escopo NÃO executado por falta do gate (fica intacto para H2)

- Inventário real de `pg_catalog`, políticas, grants, RPCs no staging.
- Dry-run/checksums e aplicação incremental das 8 migrations.
- Regeneração de `types.ts` a partir do staging.
- Criação server-side dos usuários sintéticos `FISCAL_TEST_H2_*`
  (administrador, gestor, financeiro, cliente_produtor A/B,
  parceiro_b2b, authenticated sem papel) e obtenção de JWTs.
- Smoke/RLS por resultado real (SELECT/INSERT/UPDATE/DELETE + owner A/B).
- RPCs: evento manual, CRUD/deactivate de perfis, readiness v2, RTC
  empresa/produto/serviço + novas RPCs `service_profile` (incluindo
  `source_reference` sem `service_id`, CONFLICT, inativo, autorização).
- `mask_sensitive_jsonb` no PostgreSQL (objetos/arrays/níveis, CI,
  `accessToken/private_key/client_secret`, `null`, idempotência).
- Certificado A1 sintético (senha temporária, verificação de
  não-persistência de PFX/senha, revogação/cleanup) + interface bridge SO
  (sem simular acesso do navegador ao keystore).
- Confirmação `production_enabled=false` e provider OFF no runtime
  (nenhuma chamada a Focus/PlugNotas/SEFAZ/prefeitura).
- Backfill sintético + smoke SQL + harness RLS + contagens antes/depois.
- Teardown completo de todos os `FISCAL_TEST_H2_*`.

## 5. Riscos residuais

- Suíte Vitest apresenta falha transitória rara em execuções paralelas
  pesadas — monitorar em H2.
- `types.ts` continua dependendo de regeneração pós-aplicação em
  staging (gate externo já registrado em H1).
- Script `lint` ausente impede gate automatizado local de estilo.
- Nenhum risco novo introduzido (nenhuma escrita ocorreu).

## 6. Créditos consumidos

Rodada H2 (esta): ~3 créditos (2 verificações de ambiente, 1 suíte de
gates locais, relatório). Muito abaixo do teto de 30. Interrompido
cedo por gate faltante, conforme instrução.

## 7. Status final

**BLOQUEADO POR CREDENCIAIS.**

H3 **não** foi iniciada. Produção **não** foi tocada. Frontend **não**
foi deployado. Aguardando injeção dos itens listados em §1 antes de
retomar H2.
