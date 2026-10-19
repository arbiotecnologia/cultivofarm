# Monitor/Cockpit — correção funcional focal 19/10 14:22

## Entrega implementada
- `AuthProvider` encerra sincronamente o monitor anterior em renovação/mudança/logout, cerca gerações, cancela/limpa consultas e revalida perfil, papéis e probe canônico antes de remontar conteúdo.
- Nova OS tem continuidade opt-in em memória: **somente modal aberto e escolhas fixas tipo de item, modo de aplicação e prioridade**. Não preserva texto livre, área, data, IDs/referências, `submissionId`, resultados de consulta, Blob, File ou URLs. Não é preservação integral de rascunho.
- Retorno exige mesma identidade/tenant/papéis/prontidão e fingerprint reconfirmado, lease válida. Mudança, erro, timeout, revogação, USER_UPDATED, refresh manual, logout ou unmount do provider eliminam o recibo. Não existe persistência/browser storage nem retomada de bytes.
- Mantidas lease 15s desde início do request, desconto RTT, fences de anexos, grants/RLS e gates; sem novos contratos/v6.
- Diagnóstico local limitado `auth_refresh`/`auth_reconfirmed`, sem IDs/tokens/URLs/fingerprint/payloads. Removido log de Auth event com UID.

## Cockpit
- Apresentação usa **somente campos já fornecidos pelo RPC canônico**: `status_os=aberta/aprovada` prevalece sobre badge programada. Nenhuma segunda leitura ou ação operacional adicionada.
- Pacote separado `scripts/cockpit-status-renewal`: altera somente projeção de status e filtro de estágio correspondente na RPC `rpc_cockpit_listar_esteira_v1`. Não substitui view, não modifica helper/ACL/RLS nem programação/OS.
- Fonte PRE verificada por SELECT no ref canônico: MD5 prosrc `7d56fc8280126fa2e227f7b38f83c5ea`, definição PG `c51739eb0d9f91470fa6700d1c19763d`; fonte POST candidata `36ef75405315a11e47fee042d6a575cb`.
- Antes da implantação SQL, badge da lista é fiel, mas filtro server-side ainda utiliza comportamento antigo. Instalar a candidata revisada para alinhar filtros; não compensar com filtro local sobre página parcial.
- Candidata/rollback transacionais guardados por fonte/segurança do reader e hashes da cadeia. Snapshot transacional confere funções, ACL, owners/config, relações/RLS e policies inalterados. Rollback exige POST exato. Guardas completas recusam catálogo reduzido; **não** é prova de preflight integral.

## Proteção do pacote aprovação
- Quatro SQL de `scripts/os-approval-recovery` byte-exatos, SHA verificado antes/depois. Nenhuma alteração de seus corpos.
- Baseline rollback frontend fixo `e6a67a2d4c0146760c17e6c5bf6003027dedf87f`, não HEAD móvel. Manifest/stage validam PRE≠POST e bytes do commit.
- OS B `18ea0531-ef73-4dbf-9b58-b064cfc50d0e` e programação `158a7488-0c8b-45ab-83eb-27622ce0f7fa` preservadas; sem fixture nova ou escrita de dados.

## Evidências e limites
- 92 testes focais em 7 arquivos: AuthProvider/monitor/guards/opener reais com transporte fake; RTT3s, reconfirmação, tenant/roles/revogado/tardios, formulário Nova OS real e descarte de área. 382 regressões em 10 arquivos passaram separadamente.
- PostgreSQL descartável: corpo real do reader e rollback, isolamento RLS reduzido A/B/NULL, aberta/aprovada, filtros e downstream. Candidate completo recusa catálogo reduzido antes do DDL. Auth/RBAC sintéticos **não são JWT/RLS hosted**.
- Harness automático: `build OK`, último observado 14:33:06Z, incluindo ausência dos erros TS anteriores. Checker independente app/node não executado manualmente por restrição do ambiente; não transferir recibos antigos.
- Playwright público redirecionou `/ordens-servico` para `/auth`; não houve login. Ambiente `external_unmanaged` impede sessão autenticada automática: fluxo real, histórico/revogação/anexos **não homologados** nesta rodada. Logo público quebrado observado, fora do escopo.
- Sem publicação, Edge/deploy, DDL/DML hosted, nova fixture, avanço operacional ou homologação real alegada.

## Revisão externa
1. Verificar SHA256SUMS/manifest/stage e testes negativos.
2. Executar PRE READ ONLY no ref canônico; qualquer drift é NO-GO, inclusive approval implantada paralelamente exige nova conferência, não alterar corpos para forçar PASS.
3. Revisar delta SQL, aplicar candidata por operador autorizado e executar POST; manter operações fechadas.
4. Checker independente do snapshot atual e browser real na mesma sessão: renovação com modal Nova OS, RTT, revogação/tenant/tardios e descarte de bytes. Não usar smoke vazio como PASS.