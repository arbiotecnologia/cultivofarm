# Programação inicial — revisão local, execução fechada

Recupera somente `rpc_programar_os_v1` e o diálogo existente. Não autoaprova, não insere programação/lote, não reprograma data diferente. Repetição idêntica retorna replay sem evento novo. Actor, tenant, readiness, feature, papéis e cadeia corrente são verificados antes/depois dos locks. B2B/vínculos, família inelegível, programação ambígua, responsável não comprovado e estados avançados permanecem negados.

**NÃO executar a candidata como liberação.** Possui exceção incondicional `PROGRAMAR_SUPPLEMENTAL_REVIEW_REQUIRED` e não contém GRANT/REVOKE. ACL authenticated/anon fechadas. O auditor precisa resolver e congelar catálogo transitivo SaaS/refresh e concorrência antes de qualquer aplicação/liberação específica. Não substituir essa exceção por GUC, claims ou flag de autorização.

PRE/POST verificam contratos já observados após aprovação/reader implantados; não certificam dependências suplementares ausentes. Fonte UI fixa: commits completos e6a67/c30af no manifesto; rollback UI SHA d181e5… diferente do candidato. Reversão SQL usa definição exata capturada na mesma sessão e hash a42d6…, nunca a reconstrução textual de referência `rollback/rpc.sql.review`. Se snapshot não existir, recusa. Nenhum ledger applied novo.

## Verificação

- `python3 test-local.py`: PostgreSQL descartável, Auth/schema simulados. Helper corrente efetivo, trigger clássico byte-exato por hash, onfarm transcrito semanticamente. Não monta todos triggers nem JWT/RLS hospedados.
- `python3 assemble.py`: verifica proteção e baselines Git imutáveis; monta SQL/manifesto/hashes sem conexão.
- `python3 test_stage.py`: bytes candidato/reversão e recusas de baseline/destino.
- `stage.py candidate|rollback /tmp/destino-vazio`: apenas UI revisada, fora do checkout.
- `snapshot/`: checkout fonte para checker independente, produzido pelo exportador existente. App/node typecheck não executados aqui.

## Bloqueios restantes

SHARE locks conservadores em lotes/links/SaaS impedem alguns phantoms, porém são globais: latência, ordem entre writers, deadlocks e refresh interno precisam ensaio completo. Timeout de espera 3s no RPC; não é homologação de concorrência full-schema. Entitlement possui dependências transitivas ainda sem fingerprints. Inserções de identidade/links externos e ABA não estão certificadas. Divergência profiles.id/user_id do responsável permanece fail-closed. Fabricação/CQ/estoque, anexos, TOKEN_REFRESHED real, v6 e contratos não são liberados.

Sem DDL/DML hosted, publicação, fixture nova, alteração de roles/perfis ou pacotes aprovados. Próximo passo é revisão independente focal desses bloqueios, não recriação da OS B.