# Inventario das migrations da Fase 1 — Motor Comercial B2B

Ambiente de referencia: staging `ikaauvsflpmamgxmkhoq`.
Producao `navfzbwgwzruipouyfnk` NAO foi acessada.

## Classificacao

| Migration | Classe | Observacao |
|-----------|--------|------------|
| `20260729031837_db21bf90…` | operacional **com guarda de staging** | consolidacao da Fase 1 (matriz, precedencia, credito) |
| `20260729032021_45b5a40f…` | operacional **com guarda de staging** | hardening de grants/RLS comerciais |
| `20260729032141_4213a913…` | operacional **com guarda de staging** | RPC de cotacao e auditoria |
| `20260729034858_1c2d1541…` | operacional **com guarda de staging** | correcao de gate: hash obrigatorio, idempotencia, bloqueio do tecnico |
| `20260729034935_76ce073e…` | operacional **com guarda de staging** | correcao de gate: credito pos-cotacao, grants da tabela de idempotencia |
| `20260729024115_da3ffea7…` | **teste/fixture — removida da cadeia** | arquivada em `migrations-removidas/` |
| `20260729024354_5a4941a5…` | **teste/fixture — removida da cadeia** | arquivada em `migrations-removidas/` |
| `20260729024929_e409c643…` | **teste/fixture — removida da cadeia** | arquivada em `migrations-removidas/` |
| `20260729032912_1e683b55…` | **harness/verify — removida da cadeia** | arquivada em `migrations-removidas/`; conteudo migrado para `supabase/tests/motor-b2b/fase1-final/02-verify-harness.sql` |

## Reconciliacao com o historico remoto

As migrations arquivadas **ja constam no historico do staging**. Nao houve
downgrade nem edicao do historico do banco: os arquivos foram apenas
retirados da cadeia versionada do repositorio e movidos para
`migrations-removidas/`. As tabelas de evidencia/harness que elas criavam
foram removidas do schema pela migration consolidada `20260729031837` — o
assert `V1`/`V12` de `verify.sql` comprova a ausencia delas.

## Promovibilidade para producao

**A cadeia da Fase 1 NAO e promovivel como esta.** Todas as cinco migrations
operacionais abrem com uma guarda fail-fast que aborta fora de
`ikaauvsflpmamgxmkhoq` (`STAGING_GUARD`). Executa-las em producao falharia
por construcao — o que e o comportamento desejado neste momento.

Pacote de promocao (a preparar e **nao executar** sem autorizacao humana
explicita):

1. gerar copias das cinco migrations operacionais sem o bloco `STAGING_GUARD`
   (ou com guarda parametrizada por `current_setting`), sem qualquer UUID de
   usuario, fixture ou assert ambiental;
2. rodar `precheck.sql` adaptado ao ref de destino;
3. aplicar em janela controlada;
4. rodar `verify.sql` com o ref de destino;
5. rodar o harness de papeis/RLS a partir de `supabase/tests/motor-b2b/fase1-final/`.

Enquanto o passo 1 nao for autorizado, a classificacao honesta e:
**operacional em staging, NAO promovivel**.
