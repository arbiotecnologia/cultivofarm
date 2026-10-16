# Vínculos externos — Fase 2 candidata

Data: 16/10/2026. Estado: **SQL INSTALADA FECHADA / UI INTEGRADA COM GATE FALSE**. Implementação autorizada pelo titular; promoção depende de auditoria técnica independente, não de uma aprovação humana genérica. F1 real publicada PASS conforme confirmação do titular; isso não abre os gates da F2.

## Entrega e recorte

Primeiro recorte: editar **somente dados comuns** de `cliente_produtor` e `parceiro_b2b`, preservando integralmente perfil de acesso e vínculos. **Não é gestão completa**. Técnico B2B, perfis mistos, conversão interno/externo, troca/desassociação, Auth, e-mail de acesso, senha, SMTP e estados permanecem bloqueados. SQL common-only instalada pelo auditor em20261016221926; nenhuma reaplicação/escrita/deploy/publicação pelo agente nesta rodada. Testes transacionais do auditor sem alteração persistente em usuários.

Artefatos em `scripts/user-links-phase2/` (fora de `supabase/migrations`):
- `candidate.sql.review`: extensão da RPC v1, gate false, CAS/ledger privados e token no leitor F1.
- `baseline-admin-edit.sql.review`: contrato anterior completo para comparar/restaurar branch interna.
- `eligible.sql.review`: seleção server-side paginada preparatória; não autoriza troca, não montada na UI.
- `preflight-readonly.sql`: definições/ACL/colunas/policies/triggers a recapturar antes de promoção; executor deve comprovar ref canônico.
- `rollback.sql.review`: fechamento e roteiro de restauração sem apagar histórico.
- `ui-closed.patch.review` e `build-ui-diff.py`: diff **não aplicado** à tela, reproduzível; constante false.
- `test-local.py`: PostgreSQL descartável via socket `/tmp`, schema/Auth reduzidos; nunca usar conexão remota.

A tela agora possui callsite para o formulário isolado `ExternalCommonUserEditForm`, exclusivamente atrás de `externalUserEditGate=false`; externos continuam somente leitura. A edição interna e a seção administrativa de senha permanecem intactas.

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

Formulário integrado atrás do gate false, com nome/telefone/motivo validados antes da RPC, label associado e botão inválido desabilitado. Seis campos comuns preservados; CREA/especialidade não exibidos mantêm o valor original. Sem seletor de roles/links/status. Snapshot congela alvo/updated_at/hash; divergência/refetch requer reabrir. Motivo obrigatório 2–500; nome 2–150; telefone opcional 10/11 dígitos. Trava ref síncrona antes do await; chave estável em retry manual igual, chave nova para payload modificado. Timeout/resultado inválido/CAS requerem reload, sem retry automático.

Formulário keyed por escopo/generation, cleanup invalida respostas em andamento; pai também cerca efeitos por ator/tenant/readiness/roles/alvo/generation antes do fechamento e toasts. Invalidations somente ['admin-users',org,actor] e ['admin-user-links',org,actor]. Fechar e reabrir outro/mesmo alvo não deixa o finally anterior desbloquear a tentativa nova. Seção de senha não foi alterada e permanece fluxo separado; seus callbacks legados não recebem esta certificação.

Revisão auxiliar `sub_acwmfqa1`: erro estruturado RPC era mascarado — corrigido preservando objeto para mapper seguro existente; autorização redundante removida (locks já protegem estado). Seletor usa authorize(auth.uid()) deliberadamente para exigir ator Admin/tenant ativo sem aceitar tenant externo; isso não autoriza editar o ator/elegível. Contagem seis chaves mantida por contrato fechado. Replay rigoroso mantido para evitar resultado obsoleto. Essas decisões não equivalem a aprovação técnica independente do titular.

## QA executado e limites

- PostgreSQL descartável **35 checks PASS**: gate, dados comuns/vínculos intactos, CAS de links/estados/expiração por tempo, replay/hash/ator/readiness, TécnicoB2B/tenant negados, paginação 0/1/offset e limite 100, ACL fechada, auditoria UPDATE/DELETE/TRUNCATE negada, branch interna, contenção NOWAIT e segundo CAS conflitante.
- Vitest **102/102 PASS**, cinco arquivos: externalUserEditCandidate (13), userLinks (25), userLinksQuery (5), edicaoUsuarioRpc (51), externalUserDraft (8).
- ESLint dos dois arquivos TS novos: exit 0; não atribuir lint global limpo.
- Scanner fiscal: nenhum valor secreto real encontrado; git diff --check PASS. Build automático disponível **OK 19:49:26 UTC**.
- Typecheck dedicado final **UNVERIFIED**: ambiente executa pelo harness e proíbe execução manual, sem sinal separado fornecido. Evidência independente F1/1613abbf do titular (36 testes/typecheck0/build0/lintnovos0/18legados/scanner4187/0) não é typecheck deste diff.
- Auth/RLS hospedado, interação Admin/titular e corrida real entre writers **UNVERIFIED**. Harness usa PostgreSQL real mas Auth/schema reduzidos; não é prova de políticas live. Executar: `python3 scripts/user-links-phase2/test-local.py` e `bun run test -- src/test/config/{externalUserEditCandidate,userLinks,userLinksQuery,edicaoUsuarioRpc,externalUserDraft}.test.ts`.

## Rollback e gates de promoção

SQL já instalada pelo auditor: NÃO reaplicar preflight/candidate, nem eligible.sql. Manter SQL/UI false até revisão final e testes reais do diálogo. O preflight de ausência é histórico, não operacional.

Rollback: fechar gate e retornar constante UI false; restaurar RPC da baseline e leitor F1/ACL exatos capturados. Revogar helpers novos executáveis; manter ledger/gate para investigação, não dropar tabelas nem desfazer contatos legítimos em lote. Associação nunca foi alterada por este recorte. Reversão futura de troca deve ser nova operação auditada/CAS, não apagar ledger/restaurar acesso cego. `rollback.sql.review` é roteiro, não rollback integral executado/testado hospedado.

Fora do delta: `DocumentosPanel.tsx` e `financeiro/relatorios/ReportShell.tsx` extraem rpc e chamam solto; `useMyCommercialOrders` usa `.call(supabase)` corretamente. Achados registrados, não corrigidos.

## Complemento da varredura de leitores (revisão auxiliar final)

Inventário runtime direto adicional confirmado por fonte:
- `src/hooks/usePortalCliente.ts`: campos completos e filtro de revogação/vigência.
- `src/pages/ConsultorTecnico.tsx:309–313`: filtra somente is_active; **não filtra revoked_at/valid_from/valid_until** nessa leitura. Exige revisão antes de troca/revogação.
- `src/hooks/usePartnerUsers.ts`: listas/elegíveis e fence de propriedade; mutações de vínculo continuam bloqueadas.
- `src/pages/portal-parceiro/UsuariosClientesB2B.tsx:50–53` e `TecnicosProdutores.tsx:31–34`: associação física + enriquecimento de perfil.
- `src/lib/partnerUserProfiles.ts`: resolve partner_users.user_id por profiles.user_id, não profiles.id.
- `supabase/functions/list-portal-users/index.ts:90–94`: leitura privilegiada user_clientes após fronteira de cliente/tenant, **sem filtros de revogação/vigência**; pode listar vínculos históricos como atuais. Sem alteração neste delta.
- `supabase/functions/fase-e-runtime-harness/index.ts`: inserts/cleanup de fixtures, não leitor de negócio; não executado neste turno.

**Alerta descartado pelo auditor:** LIVE get_cliente_ids_for_user já filtra is_active/revoked_at/valid_from/valid_until e protege profiles.cliente_id com EXISTS vigente. O histórico local não representa a definição live; demais leitores seguem pendentes.

A revisão auxiliar tratou histórico como live e generalizou revalidação a cada render; essas conclusões **não foram adotadas**. Escopo/generation fence por identidade não prova invalidação por alteração de vínculo na mesma identidade. Nesta entrega a auditoria cobre caminhos conhecidos e inventário runtime direto; certificação de **todos** leitores/RLS live continua pendente, explicitamente bloqueando troca. Dados comuns preservam vínculos e não corrigem essas lacunas preexistentes.


## Atualização 22:28 UTC — instalação externa e registro exato

Leitura própria do ledger hosted no canônico confirmou versão20261016221926/nome user_external_common_edit_closed_reviewed, um statement,19280bytes,MD5 9ed7f2f0d33bb1fb0090703a4d8484a8, igual ao arquivo local. Arquivo byte-identical versionado em `scripts/user-links-phase2/installed/20261016221926_user_external_common_edit_closed_reviewed.sql.review` e `ledger-match.json`, sem execução. Registro em supabase/migrations não realizado: instrução do ambiente reserva gravações nessa pasta à ferramenta que aplicaria SQL; reaplicar foi expressamente proibido. É pendência de registro automático, não de SQL instalado.

Evidência externa ca6f5915:102Vitest/typecheck0/lintnovos0; auditor instalou SQL fechada e informou BEGIN/ROLLBACK PASS para comuns AdminAR Produtor/B2B, replayigual/hashdiferente/CASobsoleto, links/roles negados e AdminFSF/Consultor/Financeiro/B2B/Produtor/Superadmin/ARalvoFSF negados; digest/ledger não expostos. Não reproduzimos escritas nem testes hospedados nesta rodada.

QA da rodada: suíte real de diálogo RTL/Radix com transporte e gate simulados + helper/parser/regressões executada; comandos e totais finais abaixo. Isso não certifica a página completa autenticada nem o diálogo em produção. Gate verdadeiro existe somente no mock dos testes, nunca no runtime. Typecheck/build manuais não executados por restrição do harness; build automático é evidência separada. Troca e gestão completa permanecem NO-GO, demais leitores/sessão/cache do titular pendentes.
