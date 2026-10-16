# Vínculos externos — Fase 2 candidata

Data: 16/10/2026. Estado: **CANDIDATA NÃO APLICADA, UI FECHADA**. Implementação autorizada pelo titular; promoção depende de auditoria técnica independente, não de uma aprovação humana genérica. Publicação solicitada da F1 e validação visual em andamento não são aprovação desta F2.

## Entrega e recorte

Primeiro recorte: editar **somente dados comuns** de `cliente_produtor` e `parceiro_b2b`, preservando integralmente perfil de acesso e vínculos. **Não é gestão completa**. Técnico B2B, perfis mistos, conversão interno/externo, troca/desassociação, Auth, e-mail de acesso, senha, SMTP e estados permanecem bloqueados. Nenhum registro hospedado foi alterado, nenhuma migration aplicada, nenhum deploy/publicação executado neste delta.

Artefatos em `scripts/user-links-phase2/` (fora de `supabase/migrations`):
- `candidate.sql.review`: extensão da RPC v1, gate false, CAS/ledger privados e token no leitor F1.
- `baseline-admin-edit.sql.review`: contrato anterior completo para comparar/restaurar branch interna.
- `eligible.sql.review`: seleção server-side paginada preparatória; não autoriza troca, não montada na UI.
- `preflight-readonly.sql`: definições/ACL/colunas/policies/triggers a recapturar antes de promoção; executor deve comprovar ref canônico.
- `rollback.sql.review`: fechamento e roteiro de restauração sem apagar histórico.
- `ui-closed.patch.review` e `build-ui-diff.py`: diff **não aplicado** à tela, reproduzível; constante false.
- `test-local.py`: PostgreSQL descartável via socket `/tmp`, schema/Auth reduzidos; nunca usar conexão remota.

`src/lib/configuracoes/externalUserEditCandidate.ts` não possui callsite em produção; `EXTERNAL_USER_EDIT_PHASE2_REVIEWED=false`. Seu teste integra a suíte existente. A tela em execução continua somente leitura para externos.

## Contrato e evidência hospedada somente leitura

Destino comprovado: `swzpzcwiasxmjutrmvkm`; cliente canônico existente, sem cliente paralelo. RPC `admin_edit_user_profile_v1(uuid,timestamptz,jsonb,app_role[],uuid[],uuid,uuid)`, SECURITY INVOKER, ACL authenticated/service_role; MD5 da definição capturada: `a57004b451d6b6010ac8a0e8353dc38f`. Candidato falha se baseline divergir ou já estiver instalado (não é reaplicável cegamente).

Contrato original: Admin da mesma empresa, alvo superadmin negado, allowlist de seis campos comuns, CAS updated_at, roles internos, parâmetros de links vazios; externos recusados. Candidato mantém assinatura/branch original sem overload/RPC v2. `_external_edit` explícito abre exclusivamente `common_preserve_links`, via helper privado que deriva ator/tenant, verifica readiness/Admin/empresa ativa e recusa superadmin.

**partner_users:** somente `id, partner_id, user_id, created_at, papel`; UNIQUE(user_id). Não existem `ativo`, `is_active`, `revoked_at`. A expressão `ativo` no leitor pertence a **partner_accounts**, nunca à associação. Validade B2B é existência física da associação.

**user_clientes:** revogação completa existente (`is_active, revoked_at, revoked_by, valid_from, valid_until`, mais principal/access_level/assigned_by). Nenhuma flag nova inventada. Guards/SELECT admin existentes não são ampliados para DML direto.

## CAS, concorrência e replay

- Gate SQL false independente do gate UI. Lock `cf_user_guards_v1.state FOR UPDATE NOWAIT`, o mesmo singleton tomado por triggers de identity/link; depois perfis ator/alvo ordenados, roles, todos links, clientes/parceiros relacionados e empresa ativa. Writes legados em ordem inversa produzem contenção explícita, sem retry automático. Singleton global limita throughput; auditor deve verificar todos writers/triggers live, especialmente caminhos privilegiados.
- SHA-256 sobre perfil inteiro, roles inteiros, todos links (inclusive revogados/fora de alcance), estado/propriedade de referências e **vigência efetiva por now()**. CAS exige esse token e updated_at. Expiração por tempo também causa conflito; não comparar relógio do browser.
- Digest opaco é versão, não autorização. Leitor F1 conserva seus campos e adiciona expected_version; nenhum snapshot privado é retornado. Referência sem propriedade demonstrada impede escrita mesmo que apenas dados comuns sejam alterados.
- Seis campos obrigatórios no payload são intencionais, não contagem das colunas de profiles: evita limpeza silenciosa por campo ausente. Identidade, tenant, estado, e-mail e campos desconhecidos negados. Campos nullable aceitam null; nome/telefone validados server-side.
- Receipt único por ator/tenant/chave UUID; hash cobre alvo, stamp, envelope, campos, roles e parâmetros de vínculo. Mesma chave com outro payload falha. Ator/tenant/readiness/tipo/ownership/gate são revalidados **antes** de replay. Resultado anterior só retorna se version_after ainda corresponder ao estado atual; mudança posterior gera conflito, não falso sucesso antigo.
- Ledger privado registra motivo, versões, antes/depois dos campos comuns e resultado; sem grants de leitura/DML ao cliente. Trigger recusa UPDATE/DELETE/TRUNCATE. Administrador do banco pode alterar schema: imutabilidade não significa proteção contra proprietário da infraestrutura.
- Helpers executáveis usados pelo wrapper revalidam todos os checks; helper de digest/autorizações fechado. Não há concessão nova de DML em profiles/roles/links. Revisar também ACL/USAGE do schema privado existente antes da instalação.

## Leitores e impacto da troca (proposta, não implementada)

Famílias canônicas conhecidas: `get_user_partner_id`, `b2b_commercial_context`, `get_my_commercial_partner_context`, `get_cliente_ids_for_user`, guardas de cliente/fazenda/solicitação/aplicação/visita e RLS dependentes. Leituras TS: `usePartnerUsers`, `UsuariosClientesB2B`, `TecnicosProdutores`, `useMyPartner`, `usePortalCliente`; filhos alcançam pedidos, documentos, fazendas, OS, entregas, notificações, estoque e financeiro. Histórico SQL não equivale a inventário de funções/RLS live; promoção de **troca** exige nova enumeração hospedada por definição/caminho, não só substring.

### Produtor, mesmo tipo

Reusar revogação existente de user_clientes em transação: comparar CAS completo; lock todos vínculos antigos + clientes antigos/novos em ordem; revalidar elegibilidade/tenant/ator inclusive no replay; revogar removidos preenchendo revoked_at/revoked_by/is_active; manter registro/histórico e campos de acesso; definir principal somente em vínculo vigente elegível. Decidir tratamento de reativação e restrições UNIQUE antes de SQL; não apagar registros. Revisar cada leitor de membership que ignore revogação/vigência antes de habilitar.

### B2B, mesmo tipo

**Preferência concreta:** atualizar transacionalmente `partner_id` na associação única existente, mantendo seu id/created_at e papel, com ledger imutável de associação antiga/nova, ator, tenant, motivo, CAS e receipt. Não adicionar flag de revogação que leitores/RLS ignorariam. Lock singleton/perfil/roles/associação + parceiros antigo/novo ordenados; elegíveis ativos/não excluídos e comercialmente da mesma empresa; deny TécnicoB2B/mistos/conversões.

**Consequência importante:** trocar partner_id retira do titular acesso baseado no vínculo ao parceiro antigo e concede acesso ao novo. Ledger preserva rastreabilidade, **não preserva direito de consulta ao histórico antigo**. Não retarget pedidos, itens, pagamentos, recebíveis, mensagens, documentos, snapshots ou authored_by. Pedidos já existentes continuam pertencendo ao parceiro original; atribuição ao autor continua histórica, jamais serve sozinha para autorização. Antes de implementar, testar quem pode ler cada filho/histórico após troca e decidir explicitamente se existe mandato residual legítimo (padrão: não). Se necessário acesso residual, usar desenho separado autorizado, não ampliar RLS por user_id criador nem reintroduzir vínculos múltiplos.

Alternativa revogação completa em partner_users exigiria alterar TODOS leitores/RLS/RPC, cardinalidade/índices e provisionador. É maior risco, incompatível com a premissa de vínculo físico atual e não recomendada neste recorte. Nenhuma alternativa foi aplicada.

## Sessão/cache do titular

`usePortalCliente` reconsulta vínculo em carga/foco; seleção local só preferência. `useMyPartner` resolve contexto B2B server-side sob escopo identidade/tenant e `useStorageAccessScope`. `useAuth` invalida profile/contextos em roles_updated; broadcast originado no Admin não atinge outro dispositivo e **não é suficiente**.

Dados comuns não alteram ACL/membership neste recorte, mas nome/contato do titular podem permanecer visualmente antigos até reload; não prometer sincronização imediata. Antes de promover troca: revalidar contexto de titular ao foco e antes de ações sensíveis; vincular cache/respostas/arquivos pendentes a versão de associação server-side, limpar parceiro/cliente selecionado e caches de pedidos/financeiro/documentos/portal ao detectar mudança; resposta antiga não pode repopular cache. Realtime/evento serve como aviso, nunca autoridade. RLS/RPC devem negar contexto antigo imediatamente mesmo offline/sem aviso. Testar duas sessões/dispositivos, resposta atrasada, foco, troca/replay e acesso aos filhos antigos/novos. Isso está **pendente**, não entregue por simples invalidation do Admin.

## UI candidata e revisão recebida

Diff fechado propõe motivo, snapshot CAS/chave por ator/tenant/alvo, dados comuns sem seletor de roles/links, chamada v1 com receiver preservado, sem retry automático; erro/confirmação estritos e reload em estado ambíguo. Invalidations incluem admin-user-links. Dry-run do diff PASS; diff não foi compilado nem exercitado em sessão real porque não está instalado. Necessita testes de diálogo/duplo clique/identidade/timeout antes da promoção.

Revisão auxiliar `sub_acwmfqa1`: erro estruturado RPC era mascarado — corrigido preservando objeto para mapper seguro existente; autorização redundante removida (locks já protegem estado). Seletor usa authorize(auth.uid()) deliberadamente para exigir ator Admin/tenant ativo sem aceitar tenant externo; isso não autoriza editar o ator/elegível. Contagem seis chaves mantida por contrato fechado. Replay rigoroso mantido para evitar resultado obsoleto. Essas decisões não equivalem a aprovação técnica independente do titular.

## QA executado e limites

- PostgreSQL descartável **35 checks PASS**: gate, dados comuns/vínculos intactos, CAS de links/estados/expiração por tempo, replay/hash/ator/readiness, TécnicoB2B/tenant negados, paginação 0/1/offset e limite 100, ACL fechada, auditoria UPDATE/DELETE/TRUNCATE negada, branch interna, contenção NOWAIT e segundo CAS conflitante.
- Vitest **102/102 PASS**, cinco arquivos: externalUserEditCandidate (13), userLinks (25), userLinksQuery (5), edicaoUsuarioRpc (51), externalUserDraft (8).
- ESLint dos dois arquivos TS novos: exit 0; não atribuir lint global limpo.
- Scanner fiscal: nenhum valor secreto real encontrado; git diff --check PASS. Build automático disponível **OK 19:49:26 UTC**.
- Typecheck dedicado final **UNVERIFIED**: ambiente executa pelo harness e proíbe execução manual, sem sinal separado fornecido. Evidência independente F1/1613abbf do titular (36 testes/typecheck0/build0/lintnovos0/18legados/scanner4187/0) não é typecheck deste diff.
- Auth/RLS hospedado, interação Admin/titular e corrida real entre writers **UNVERIFIED**. Harness usa PostgreSQL real mas Auth/schema reduzidos; não é prova de políticas live. Executar: `python3 scripts/user-links-phase2/test-local.py` e `bun run test -- src/test/config/{externalUserEditCandidate,userLinks,userLinksQuery,edicaoUsuarioRpc,externalUserDraft}.test.ts`.

## Rollback e gates de promoção

Antes de aplicar: recapturar definição completa de RPC/leitor/ACL/triggers; comparar baseline/preflight no ref canônico; aplicar candidato + seletor numa única transação revisada com gate false. SQL deliberadamente fail-closed na reaplicação. Não abrir UI ou SQL até evidência independente de contrato/locks/ACL/CAS/ledger, typecheck do diff e testes reais isolados de Admin/titular com cleanup exato.

Rollback: fechar gate e retornar constante UI false; restaurar RPC da baseline e leitor F1/ACL exatos capturados. Revogar helpers novos executáveis; manter ledger/gate para investigação, não dropar tabelas nem desfazer contatos legítimos em lote. Associação nunca foi alterada por este recorte. Reversão futura de troca deve ser nova operação auditada/CAS, não apagar ledger/restaurar acesso cego. `rollback.sql.review` é roteiro, não rollback integral executado/testado hospedado.

Fora do delta: `DocumentosPanel.tsx` e `financeiro/relatorios/ReportShell.tsx` extraem rpc e chamam solto; `useMyCommercialOrders` usa `.call(supabase)` corretamente. Achados registrados, não corrigidos.
