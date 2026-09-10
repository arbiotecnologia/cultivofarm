# P1 — PARADA FAIL-CLOSED ANTES DA PRIMEIRA ESCRITA

Data/hora: 2026-09-10, 16:10 UTC (13:10 America/Sao_Paulo).
HEAD real autoritativo: `cd2aa66c5afd58f25e4aed9255767e3bcad19c57`.
SQL executado: **ZERO**. Banco acessado: **NENHUM**. Publicação/deploy: **NENHUM**.

## 1. Motivo da parada

O gate do runbook exige, antes da primeira escrita, confirmação por canal
externo de que o alvo é exatamente `navfzbwgwzruipouyfnk`. A confirmação foi
executada e **falhou**:

| Canal | Valor observado | Resultado |
|---|---|---|
| Ferramentas gerenciadas de banco (migration/run_sql/read_query) | ref `yzszlzjpovmcteuxjznj` | SANDBOX PROIBIDO |
| Conexão `psql` do ambiente (`PGUSER`) | ref `yzszlzjpovmcteuxjznj` | SANDBOX PROIBIDO |
| `.env` da aplicação (drift automático do ambiente) | `yzszlzjpovmcteuxjznj` | restaurado para homologação `ikaauvsflpmamgxmkhoq` |
| Canal para produção `navfzbwgwzruipouyfnk` | inexistente | **ACESSO AUSENTE** |

Não existe, neste ambiente de execução, qualquer canal técnico direto e
inequívoco para o banco de produção. Executar a onda P1 aqui só seria possível
contra o sandbox proibido — o que é vedado. Portanto, conforme o gate final do
prompt, a execução parou **antes da primeira escrita**, sem simulação e sem
declarar como aplicado qualquer artefato.

## 2. Prova de backup registrada (aceita)

| Item | Valor |
|---|---|
| Pacote | `AR-BIO_PROD_20260910_1534_RESTAURAVEL.zip` |
| SHA-256 do pacote | `DA4AE890CB5D1A151E2FDB215F027E38B235B1C987F39D1FC2C92F467722B5D6` |
| Origem | produção `navfzbwgwzruipouyfnk`, PostgreSQL 17.6, 33 MB |
| Conteúdo | `roles.sql`, `schema.sql`, `data.sql` (Auth + metadados de Storage), histórico `supabase_migrations`, `application.dump` |
| Storage | 10 buckets, zero objetos físicos |
| Restauração isolada | `application.dump` com 3.496 itens restaurado em PostgreSQL local |
| Paridade produção × restauração | 169 tabelas públicas, 17 views, 412 funções, 458 policies, 214 triggers |
| Contagens de 190 tabelas/esquemas | zero divergências; SHA-256 `754ED7C067A28277CF1E686A80CEEE284E483B1B8C4149A5D638B4054AB0930C` |
| Histórico restaurado | 490 migrations, latest `20260723000000` |
| Segredos | nenhum arquivo contém senha de banco |

O blocker humano "backup/restore point recente" fica **RESOLVIDO** com esta
prova. Ele deixa de ser o bloqueio da P1.

## 3. Honestidade da evidência — estado das 3 views

O pacote de backup é o baseline **imediatamente anterior** à P1. Ele restaura
`public.vw_esteira_laboratorio`, `public.vw_fluxo_visita_tecnica` e
`public._src_vw_esteira_laboratorio` no estado **pré-P1**, isto é, com
`reloptions` NULL e **sem** `security_invoker`.

É **falso** afirmar que o backup já contém `security_invoker = true`. Quem deve
alterar as 3 views é a própria onda P1, pelo artefato
`20261102000000_p0d_security_invoker_views_v1.sql`, e o pós-check da onda é que
deve provar 3/3 com `security_invoker = true` e zero ERROR
`security_definer_view` no Security Advisor de produção.

## 4. Estado do pacote P1

Inalterado e pronto. Nenhuma migration histórica foi editada; nenhum artefato
foi executado; nenhum registro de ledger foi reparado; nenhuma linha foi
inserida em `promocao_execucao_registro` ou `promocao_rollback_baseline`.

Integrações externas permanecem desligadas e os slots do Vault permanecem
nulos — nada foi tocado.

## 5. Acesso que falta (único item)

Um canal de execução SQL **direto, autenticado e inequívoco** para o banco de
produção `navfzbwgwzruipouyfnk`, com:

1. capacidade de abrir transação e aplicar `BEGIN/COMMIT` com `ON_ERROR_STOP`;
2. permissão para `SET LOCAL promocao.target_ref`;
3. acesso ao CLI `supabase` autenticado no projeto de produção, para
   `migration repair --status applied <version>`;
4. leitura do Security Advisor de produção para o pós-check das views.

Enquanto esse canal não existir neste ambiente, a P1 não pode ser executada
aqui. As alternativas legítimas são: executar o pacote a partir de uma máquina
do operador com acesso a produção, seguindo `06-runbook-execucao.md` e o texto
de `07-prompt-execucao-producao.md`; ou vincular este ambiente ao projeto de
produção por canal autorizado.

## 6. Vereditos

- **P1: NÃO EXECUTADA** — parada fail-closed antes da primeira escrita, por
  ausência de acesso a produção. Não houve simulação.
- **Backup: GO** (blocker humano resolvido).
- **P2: NO-GO** — P2 depende de P1 concluída e verificada. Não foi executada.
