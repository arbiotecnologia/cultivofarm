# H9-D — Auditoria de funções operacionais, relatórios e exposições de leitura

**Ambiente:** homologação `ikaauvsflpmamgxmkhoq` (exclusivo).
**Produção `navfzbwgwzruipouyfnk`:** não acessada, não consultada, não migrada. NO-GO mantido.
**Commit-base:** `5ae6f0bf341346c12842ea5637b54fae69e696d5` (binding restaurado a partir dele; diff líquido zero em `.env`, `client.ts`, `types.ts` — 21.850 linhas).
**Ledger:** 661 → **662** (`20261006000000`, uma única vez).

## 1. Escopo

Auditadas as **376** funções `public` `SECURITY DEFINER` executáveis por `authenticated`,
com foco nos dois conjuntos herdados da H9-C:

- **A)** 186 do domínio operação/relatório marcadas `PENDENTE_EVIDENCIA`;
- **B)** 106 funções críticas sem DML marcadas `SEM_ESCRITA_NAO_AUDITADA_EM_PROFUNDIDADE`.

Para cada função foram registrados: schema, assinatura, owner, linguagem, volatilidade,
`search_path`, ACL completa e herança, execução por `anon`, objetos sensíveis acessados,
presença de DML, SQL dinâmico, posição da guarda de identidade/papel, posição do primeiro
acesso sensível, MD5 do corpo, classificação H9-C anterior e classificação H9-D com evidência.

Artefatos determinísticos:

- `restoration/homologacao-h9/h9d-inventario/secdef-authenticated-inventory-h9d.tsv`
- `restoration/homologacao-h9/h9d-inventario/classificacao-h9d.tsv`
- `restoration/homologacao-h9/h9d-inventario/resumo-h9d.json`

## 2. Resultado consolidado

| Classificação | Qtde |
| --- | --- |
| AUTH_COMPROVADA | 323 |
| NAO_APLICAVEL (sem objeto sensível no corpo) | 47 |
| EXPOSICAO_COMPROVADA / corrigida nesta fase | 1 |
| PENDENTE_EVIDENCIA | 5 |
| **Total auditado** | **376** |

`SECURITY DEFINER` executáveis por `anon` permanecem **2** (ambos já endurecidos na H9-B,
com rate-limit antes de qualquer leitura ou escrita).

## 3. Exposição comprovada e corrigida — H9-D1

**Função:** `public.fn_run_recurring_generation()`
**Consumidores legítimos:** cron `recurring-financial-daily` (jobid 1, `0 6 * * *`, executa como
`postgres`, sem JWT) e `src/pages/financeiro/Recorrencias.tsx:104` (staff financeiro).

**Evidência da exposição (transação revertida, homologação):** sessão `authenticated` de um usuário
real **sem** papel financeiro (`is_financial_staff = false`) executou a rotina, percorreu os templates
recorrentes ativos, recebeu de volta o `template_id` e o status por template (enumeração) e provocou
escritas em `recurring_generation_log` (1 linha) e `financial_audit_log` (3 linhas) a partir de uma
fixture mínima. A função irmã `fn_generate_recurring_title` já tinha a guarda; a orquestradora não.
Toda a fixture foi criada e removida na mesma transação — verificação final: zero remanescentes
(`recurring_financial_templates` e `financial_categories` com nome de fixture = 0;
`financial_audit_log` = 861 antes e depois; `recurring_generation_log` = 0).

**Correção aplicada (`20261006000000_h9d1_authz_recurring_generation_v1`):** guarda server-side no topo
da função, idêntica ao padrão já vigente na função irmã — sessão sem JWT (cron/interno) preservada;
sessão autenticada exige `public.is_financial_staff(auth.uid())`, caso contrário `42501`. Assinatura,
retorno, ACL e callsites preservados. Idempotente (`CREATE OR REPLACE`) e reversível.

**Testes pós-correção (homologação):**

- negativo: `authenticated` de baixo privilégio → `42501` (`permission_denied`);
- positivo 1: sessão sem JWT (caminho do cron) → executa, 0 linhas elegíveis;
- positivo 2: staff financeiro → `is_financial_staff = true`, executa, 0 linhas elegíveis;
- ACL final: `postgres`, `authenticated`, `service_role` (mantida por design — a autorização passou a
  ser server-side, sem quebrar o callsite legítimo do portal financeiro).

**Forward/rollback:** `restoration/homologacao-h9/h9d-forwards/` e `h9d-rollbacks/`.
O forward **não está** em `supabase/migrations/` porque a plataforma continua bloqueando escrita direta
nessa pasta. Portanto, a promoção **não pode** depender apenas de varrer `supabase/migrations/`: o
arquivo exato está rastreado, com versão e SHA-256, em
`restoration/homologacao-h9/h9c-applied-forwards.json` (agora com 2 entradas) e validado pelo gate
estático `src/test/security/h9c-applied-forwards.static.test.ts`. Esse conjunto é **disjunto** das 59
migrations repo-only em quarentena permanente.

## 4. Pendências de evidência (sem exposição comprovada)

Nenhuma delas retorna PII, credencial, token, caminho de Storage ou valor financeiro; todas exigem
decisão de menor privilégio com refatoração de dependências, portanto foram deferidas para a H9-E:

1. `get_cliente_id_for_user(uuid)` e `get_cliente_ids_for_user(uuid)` — aceitam UID arbitrário e
   devolvem UUIDs de clientes vinculados. São predicados usados dentro de policies RLS; revogar
   EXECUTE exigiria reescrever as policies dependentes.
2. `fn_catalogo_preco_canonico(uuid,uuid,text,numeric)` — preço canônico de catálogo legível por
   qualquer `authenticated`; consumido pelo portal B2B. Avaliar escopo por parceiro.
3. `fn_fiscal_company_crt()` — devolve o CRT do emitente único; sem PII.
4. `fn_microorganism_regulatory_facts(uuid)` — metadados regulatórios internos (MAPA/NCM/CEST) por
   microrganismo; sem PII e sem dado financeiro.

## 5. Estado do ambiente após a fase

- Ledger: **662**; `20261006000000` registrada exatamente uma vez.
- `SECURITY DEFINER` executáveis por `authenticated`: **376**; por `anon`: **2**.
- Advisors de segurança e performance: categorias e totais inalterados pela H9-D
  (a correção é de corpo de função, sem alterar grants, RLS ou índices).
- Crons inalterados: jobid 1 (`0 6 * * *`), 2 (`*/30 * * * *`), 5 (`15 3 * * *`), 8, 9 e 18 — todos ativos.
- Certificado, secrets, Auth, Storage, frontend funcional e as 59 repo-only: intocados.
- Fixtures: zero remanescentes.

## 6. Decisão

**GO** para H9-E em homologação. **NO-GO** para produção.

## 7. Prompt proposto para a H9-E

> INICIE E CONCLUA A FASE H9-E — MENOR PRIVILÉGIO NAS LEITURAS AMPLAS E REDUÇÃO DE SUPERFÍCIE
> `SECURITY DEFINER`, SOMENTE HOMOLOGAÇÃO `ikaauvsflpmamgxmkhoq`; produção `navfzbwgwzruipouyfnk`
> proibida. Ledger inicial 662, última `20261006000000`. Objetivo: resolver as 5 pendências da H9-D
> (`get_cliente_id_for_user`, `get_cliente_ids_for_user`, `fn_catalogo_preco_canonico`,
> `fn_fiscal_company_crt`, `fn_microorganism_regulatory_facts`), mapeando policies e callsites
> dependentes antes de qualquer revogação, com forward/rollback idempotentes em versão posterior a
> `20261006000000`, testes positivo/negativo, atualização do manifesto de applied-forwards, dos gates
> H7P/H7O e do roadmap. Não alterar advisors de performance, cron, Auth, Storage, certificado ou
> frontend. Preservar H9-B, H9-C, H9-D e as 59 repo-only.
