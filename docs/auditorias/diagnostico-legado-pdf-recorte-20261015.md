# Registro externo e proposta focal — 15/10/2026

## Migrations aplicadas, NÃO REAPLICAR
Conteúdo exato obtido em SELECT do histórico canônico `supabase_migrations.schema_migrations`, preservado sem reformatação em `scripts/rbac-audit/applied-*`. Não se gravou em `supabase/migrations`: esse diretório é gerenciado pela ferramenta de migrations; estes arquivos são snapshots documentais, não uma nova aplicação.

| Versão real | Nome | SHA-256 do SQL aplicado |
|---|---|---|
| 20261015161648 | h_catalog_lab_biological_only_and_visit_explicit | 3e7441821b78f0cf0a7d7cf3aec0df1ddb3fe7e63a6d8e436a3edcc13a369029 |
| 20261015162631 | h_catalog_visit_selection_current_schema | 0f9276ae0047845880a54d8448a6ea3c1c1011e871767857aa53b53eeb66327f |

Converter live conferido read-only: `66e8072f7aefbe18c1417240121147a5`. Evidência externa do revisor: aplicação atômica base07f985+visita07c476; cinco triggers ativos; Bombarbio/micro elegíveis, vazio/dual não; quatro destinos recusaram produto inexistente `LAB_ITEM_NOT_MANUFACTURABLE/23514` em rollback; AR claims com iat rascunho negado, FSF sem permissão. Não é prova própria de JWT/browser/produção física. Hotfix d400 45/45 reexecutado pelo revisor e aplicado literalmente; Admin AR publicado selecionou Bombarbio/salvou encaminhamento. Revisão/finalização ainda em andamento.

Candidatos anteriores estão marcados históricos/não reaplicáveis; manifestos registram versões reais. Ownership01–13 OFF/não aplicado. Ensaios antigos permanecem evidência histórica, não instrução para executar novamente.

## Claims
Gerador usa `clock_timestamp()` para iat e exp+3600 **na execução SQL**. Foi convertido em ensaio somente leitura da RPC já aplicada + rollback, sem tentar recriar objetos. Falha anterior por falta de iat é inválida como evidência de autorização negada; não reinterpretar como FAIL de RBAC.

## Diagnóstico legado — candidato NÃO APLICADO
- SQL completo: `scripts/rbac-audit/proposed-diagnostic-legacy-identity.sql`; hash-before `a20fa0ebeeac12595aa065b0d067bf02` conferido canonicamente.
- Diff UI/PDF: `scripts/rbac-audit/proposed-diagnostic-and-pdf-ui.patch`. **Não aplicado ao src nem ao banco.**
- Mantém assinatura/ACL da RPC existente e seus guards; acrescenta `_remote_id` opcional dentro do payload, não tenant/papel do cliente. Servidor vincula id+visita após autorização; alheio/inexistente nunca vira criação. Lock de pai serializa adoção da chave e retries. Adoção ocorre somente ao editar aquela linha, nunca backfill.
- Edição legada exige versão atual+1; mesma chave/mesmo conteúdo/mesma versão resultante devolve recibo sem subir versão do pai. Chave diferente, conteúdo conflitante e versão velha falham. Atualiza a mesma linha, sem DELETE. Chave adotada imutável nas próximas edições.
- UI proposta mantém tentativa estável e lock, não enfileira legado como criação offline; erro conserva diálogo. Offline exige conexão, pois o sincronizador atual não transporta identidade remota no payload. Não ampliar silenciosamente esse contrato.
- Ramo antigo sem `_remote_id` permanece preservado: sua idempotência/CAS geral não foi certificada nem corrigida neste recorte. Desktop ainda usa DELETE/INSERT; não foi alterado pelo diff, e persistência automática de diagnóstico vazio permanece dívida separada. Não declarar solução integral de todos writers.
- Visita teste/históricos não foram alterados, removidos ou mesclados; não houve Auth/fixtures reais.

## PDF — candidato NÃO APLICADO
`buildPdfData` passa a tratar volume/dose NULL como não informado; zero real preservado. Não calcula volume a partir de dose/área, não inventa microrganismo/dose. Diff foi aplicado somente a cópia temporária para validar encaixe, não ao aplicativo.

## Provas e gates
PGlite contrato diagnóstico **10/10 PASS**, SQL completo/preflight com hash real, schema/tenant/Auth stubs; edição mesma linha, replay sem versão extra, conteúdo/key/escopo/identidade inválidos negados. Hotfix isolado **45/45 PASS** reexecutado. Não prova concorrência em duas conexões, RLS/guard de edição real ou JWT/browser. Correção permanece **GO para revisão / NO-GO para aplicação** enquanto Renato finaliza. Sem publicação/produção física/cobrança.