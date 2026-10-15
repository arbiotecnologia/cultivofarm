# Hotfix independente SQL12 — APLICADO pelo revisor, NÃO REAPLICAR

Atualização 16:28 UTC: versão real `20261015162631_h_catalog_visit_selection_current_schema`, conteúdo exato arquivado em `scripts/rbac-audit/applied-20261015162631-h_catalog_visit_selection_current_schema.sql`. SHA-256 coincide com o candidato `0f9276ae0047845880a54d8448a6ea3c1c1011e871767857aa53b53eeb66327f`. Evidência externa: Bombarbio voltou no seletor publicado Admin AR e recomendação com encaminhar_para_os=true foi salva; não é reprodução própria. Seções abaixo registram o ensaio anterior, não autorização de reaplicação. Gerador agora é read-only e usa iat no momento da execução/exp+3600.

## Entrega
- Corpo completo: `scripts/rbac-audit/proposed-hotfix-catalog-visit12-current-schema.sql`.
- Teste executável isolado: `scripts/rbac-audit/check-hotfix-visit12-current-schema.mjs`.
- Gerador do ensaio hospedado transacional: `scripts/rbac-audit/build-hotfix-visit12-hosted-rollback.mjs`. Exige UUIDs dos atores AR/FSF/SA explicitamente identificados pelo revisor; não escolhe usuários nem executa SQL.
- Manifesto independente: `scripts/rbac-audit/hotfix-visit12-manifest.json`.

O SQL deve ser revisado como migration separada: não usar SQL12 do pacote ownership. Não foi criado arquivo em `supabase/migrations`, não houve DDL remoto, publicação, reparo de dados ou alteração de Auth.

## Diagnóstico do catálogo
Relato do usuário no domínio publicado: UI c476 chama `tenant_catalog_visit_selection_page`, mas a RPC ainda não existe. Leitura canônica confirmou schema atual sem `owner_organization_id`. Candidato antigo exige essa coluna e não é aplicável isoladamente.

O hotfix cria apenas a RPC paginada e defesa de referências no write. Reutiliza o corpo existente de `catalog_tenant_actor('read_prefs')`, `can_view_technical_visit` e `_assert_visita_editavel`, sem substituir nenhum. `to_jsonb(row)->>'owner_organization_id' IS NULL` compila antes de ownership e continua excluindo próprios depois. Biológicos/químicos/adubos/NULL permanecem recomendáveis, sem autorização de fabricação. Famílias não são inferidas.

Limites: 1–100 linhas, offset 0–100000, busca até 80 caracteres, include até 50 UUIDs sem NULL. Busca literal parametrizada escapa `%`, `_` e barra. Include fora da página exige referência histórica da própria visita; oculto/inativo permanece desativado, sem duplicação. Referências não alteradas sobrevivem ao update de texto; novas referências ocultas/inativas/privadas/inexistentes falham. Guard tenant revalidado após lock da visita. RLS, RPC upsert, índices, histórico, triggers de edição/laboratório e preços não são alterados.

Preflight fail-closed verifica marcador canônico, colunas utilizadas, cinco hashes live, trigger de edição, ACL do upsert e ausência das novas entradas. Reexecução não substitui objetos: aborta para revisão. Postflight verifica ACLs novas. Triggers adicionais existentes são preservados, mas integração integral com laboratório07 não foi certificada por este ensaio.

## Evidências e limites
- PGlite: **45/45 PASS**, arquivo completo incluindo preflight/postflight. Quatro helpers reproduzem definições live; hash do upsert é substituído apenas pelo stub no harness. Auth, RBAC, vínculos e schema mínimo são simulados: não Auth/RLS real.
- Casos: AR, FSF visita alheia/inexistente, SA, anon, authenticated, famílias, micro, ocultos/inativos, histórico, referências, inclusão não vinculada, SQL injection literal, paginação/payload e compatibilidade futura com owner próprio/alheio.
- Vitest existente: **9/9 PASS**, dois arquivos de catálogo/seletor. Nenhum teste visual/markup novo.
- Build automático observado: OK 16:23:49 UTC. Typecheck delegado ao harness, não executado manualmente; não atribuir PASS sem sinal específico.
- Domínio publicado aberto sem sessão: redirecionou para `/app/login`. Ambiente `external_unmanaged`: não há teste autenticado como Renato neste ensaio; relato do usuário é evidência externa, não prova própria de browser.
- Ensaio hospedado gerado, **NÃO EXECUTADO**: DDL candidata + consultas sob claims de atores reais + ROLLBACK; não altera visita/recomendações. Claims SQL não são JWT. Hidden/inactive dependem de referências reais e devem ser inspecionados, sem criar fixtures nem presumir PASS se ausentes. Writes/concorrência com Auth real continuam pendentes.

## Achado separado — diagnóstico duplicado
Visita teste `f19c8343-6205-487a-a237-df4d8ee06471` preservada. Leitura confirmou duas linhas: uma vazia com `client_uuid NULL`, outra preenchida com chave própria. Não se registram nomes/PII.

`VisitaTecnica.tsx` inicializa diagnóstico vazio e o salvamento desktop substitui linhas por DELETE/INSERT sem preservar id/client_uuid. `WizardDiagnosticoStep.tsx` edita linha remota sem client_uuid usando `editing?.clientUuid ?? crypto.randomUUID()`. A RPC recebe nova chave e insere segunda linha. Causa estrutural coerente com as linhas observadas; não houve reprodução autenticada própria.

Correção futura focal deverá preservar identidade remota no contrato de edição, não inventar chave para registro legado como se fosse criação, e impedir persistência automática de diagnóstico vazio sem intenção. Sem backfill/delete da visita teste. Achado permanece **FAIL / correção separada pendente**, não confundido com hotfix do catálogo.

## Gate
Hotfix e laboratório07 já aplicados externamente nas versões reais registradas; não executar candidatos antigos. Ownership01–13 continua gate OFF/não aplicado. Fluxo completo/produção física não certificado. Correções de diagnóstico/PDF são diff local não aplicado enquanto o revisor finaliza. Não publicar pacote ownership.