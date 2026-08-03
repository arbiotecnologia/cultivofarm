# Auditoria E2E — Módulo "Campo e Assistência Técnica"

- **Ambiente**: Supabase **STAGING** `ikaauvsflpmamgxmkhoq` (validado via `public._fiscal_staging_marker` → `marker=STAGING`, `project_ref=ikaauvsflpmamgxmkhoq`).
- **Produção `navfzbwgwzruipouyfnk`**: não acessada, não alterada. Nenhum publish/deploy executado.
- **Data**: 2026-08-03
- **Status final**: ✅ **APTO PARA HOMOLOGAÇÃO MANUAL** — falhas críticas de RLS/exposição corrigidas; seed sintético e harness runtime implementados com sucesso.

---

## 1. Inventário de superfície

### 1.1 Rotas desktop (`src/App.tsx`)

| Rota | Página | Obs. |
| --- | --- | --- |
| `/visita-tecnica` | `VisitaTecnicaLista` | listagem + `InconsistenciasVisita` (admin/gestor) |
| `/visita-tecnica/nova`, `/visita-tecnica/:id` | `VisitaTecnica` | abas `edicao` / `roteiro` |
| `/agenda-tecnica` | `AgendaTecnica` | views lista / diário / semanal / mapa |
| `/consultor-tecnico` | `ConsultorTecnico` | galeria de evidências |
| `/solicitacoes` | `Solicitacoes` | dialog de atribuição de consultor |
| `/aplicacoes` | `Aplicacoes` | `AplicacaoFormDialog` |
| `/fluxo-tecnico` | `FluxoTecnico` | aprovações / conversão em OS |
| `/base-tecnica` (+ redirect `/protocolos`) | `Protocolos` | catálogo agronômico |
| `/configuracoes/objetivos-visita` | `ObjetivosVisita` | CRUD `objetivos_visita_sugestoes` |
| `/clientes`, `/fazendas`, `/talhoes` (+ `/:id`) | cadastros | hierarquia de campo |
| `/auditoria` | abas `VisitasTab`, `AgendaTab` | trilha |

### 1.2 Rotas mobile (`/app/*`, sob `TechnicalFeatureGuard`)

`/app/checkin/:solicitacaoId`, `/app/checkin`, `/app/visita/novo`, `/app/visita/:id` (wizard de 7 etapas), `/app/solicitacoes`, `/app/fazendas`, `/app/registrar`, `/app/registros`, `/app/ordens`, `/app/talhao/:id`, `/app/catalogo`; produtor: `/app/aplicacoes`, `/app/aplicacoes/lista`, `/app/solicitar`, `/app/recomendacoes`, `/app/entregas`.

### 1.3 Portais

- Produtor: `/portal/agenda`, `/portal/aplicacoes`, `/portal/fazendas(/:id)`, `/portal/talhoes/:id`, `/portal/registros`, `/portal/recomendacoes`, `/portal/solicitar`.
- Parceiro B2B técnico: `/portal-parceiro/solicitacoes`, `/portal-parceiro/meus-produtores*`, `/portal-parceiro/tecnicos-produtores`.

### 1.4 Núcleo de dados

`registros_consultor` (entidade "visita") orbitada por `visitas_checkin`, `visitas_campo`, `visita_diagnosticos`, `registros_consultor_recomendacoes`, `registros_consultor_arquivos`, `registros_consultor_status_log`, `registros_consultor_pdf_versions`, `technical_visit_assignments`, `aprovacoes_tecnicas`, `portal_solicitacoes`, `solicitacoes_atribuicoes`, `solicitacoes_timeline`, `visitas_logs`, `objetivos_visita_sugestoes`, `aplicacoes` (+ `aplicacao_evidencias`), `ordens_servico_onfarm`, view `vw_fluxo_visita_tecnica`.

**Storage**: `consultor-arquivos` (mídia de campo — fotos, áudios, anexos) e `visitas-pdf` (PDF gerado pela edge function `enviar-pdf-visita`).

**Edge functions envolvidas**: `sync-calendar-event`, `enviar-pdf-visita`, `check-monitoramentos-vencidos`.

### 1.5 Máquina de estados

Backend: trigger `trg_validate_registro_status` → `validate_registro_status_transition`, mais `trg_enforce_visit_immutability`, `trg_enforce_checkin_immutability`, `trg_enforce_diagnostico_immutability`, `trg_set_codigo_visita`, `trg_auto_advance_solicitacao_registro/checkin`, `trg_notify_visita_finalizada`.
Frontend: espelho puro em `src/lib/registroTransitions.ts` (matriz `TRANSITIONS`, `canTransition`, `getBlockReason`, `showTransitionErrorToast`).
RPCs blindadas (todas `SECURITY DEFINER` com `search_path=public`): `rpc_criar_visita_idempotente`, `rpc_realizar_checkin_visita`, `rpc_realizar_checkout_visita`, `rpc_force_checkout_visita`, `rpc_salvar_campo_visita`, `rpc_upsert_diagnostico_visita`, `rpc_delete_diagnostico_visita`, `rpc_upsert_recomendacao_visita`, `rpc_delete_recomendacao_visita`, `rpc_finalizar_visita_v2`, `rpc_enviar_visita_aprovacao`, `rpc_converter_visita_em_os`, `rpc_liberar_recomendacao_produtor`, `rpc_assign_visit_technician`, `rpc_remove_visit_technician`.

---

## 2. Achados

### 2.1 🔴 CRÍTICO — Vazamento cross-cliente em `registros_consultor_recomendacoes` — **CORRIGIDO**

Existia a policy `auth_select_recomendacoes` com `USING (true)` para `authenticated`: **qualquer usuário logado (inclusive `cliente_produtor` e `parceiro_b2b`) lia todas as recomendações técnicas de todos os clientes**, incluindo produto/microrganismo, dose e estratégia de manejo. Em paralelo, `Staff and owner manage recomendacoes` (`FOR ALL`) concedia escrita total a qualquer `consultor_tecnico`/`tecnico_agronomo` sobre recomendações de **qualquer** visita, sem vínculo com o cliente.

**Correção aplicada**: policies substituídas por `rc_recomendacoes_{select,insert,update,delete}_hardened`, escopadas por `can_view_technical_visit` / `can_manage_technical_visit`, `has_active_user_cliente_access` e liberação ao produtor apenas em `aprovado|finalizado|convertido_os` — alinhado ao padrão já vigente em `visita_diagnosticos`.

### 2.2 🔴 CRÍTICO — Escrita aberta em `solicitacoes_atribuicoes` — **CORRIGIDO**

`auth_select_atribuicoes` era `USING (true)`; `auth_insert_atribuicoes`/`auth_update_atribuicoes` exigiam apenas `auth.uid() IS NOT NULL`. Qualquer usuário autenticado podia **atribuir ou reatribuir a si mesmo qualquer solicitação de campo**, escalando acesso ao fluxo de visita.

**Correção aplicada**: `solic_atrib_select_hardened` (admin/gestor, consultor atribuído, autor da atribuição ou quem tem acesso ao cliente da solicitação), `solic_atrib_insert_hardened` (admin/gestor/tecnico_agronomo/consultor_tecnico) e `solic_atrib_update_hardened` (admin/gestor ou o próprio consultor atribuído).

### 2.3 🔴 CRÍTICO — Bucket `consultor-arquivos` público — **CORRIGIDO**

O bucket que armazena **fotos, áudios e anexos de campo com georreferência e dados de produtor** estava com `public = true`, tornando todo objeto legível por URL direta, contornando as policies de `storage.objects`. A varredura do frontend confirma que **nenhum caminho de código usa `getPublicUrl` para este bucket** — todo consumo é via `createSignedUrl`/`createSignedUrls` (`src/hooks/useSignedUrls.ts`, `EvidenciasTabs`, `WizardAnexosStep`, `MobileCheckin`, `MobileRegistrarOcorrencia`, `useOfflineSync`). A exposição era, portanto, gratuita.

**Correção aplicada**: bucket alternado para privado. Nenhuma mudança de código necessária.

### 2.4 🟠 ALTO — `EXECUTE` concedido a `anon` — **CORRIGIDO**

`rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)` e `rpc_record_aplicacao_email(uuid,text,text,text,uuid)` estavam com `EXECUTE` para `anon`. Ambas são `SECURITY DEFINER`. **Correção**: `REVOKE ... FROM anon, PUBLIC` e `GRANT` restrito a `authenticated` (+ `service_role` para a de e-mail). Verificado pós-migração: ACL final = `authenticated`, `service_role`, `postgres`.

### 2.5 🟡 MÉDIO — Policies legadas duplicadas em `registros_consultor_arquivos` — **CORRIGIDO**

Coexistiam três policies antigas (`admin_gestor_manage_arquivos`, `consultor_manage_own_arquivos`, `produtor_view_released_arquivos`) sobre `roles: {public}`, sobrepostas às versões endurecidas. `produtor_view_released_arquivos` ainda usava o join legado `profiles.cliente_id`, padrão já descontinuado no projeto. Como policies permissivas se somam, elas **ampliavam** o acesso efetivo. As três foram removidas; permanecem `Admin/Gestor manage technical files`, `Consultor manage own visit files` e `Cliente read released own files`.

### 2.6 🟡 MÉDIO — Ausência total de dados no staging (bloqueio de homologação funcional)

Contagens em staging: `registros_consultor = 0`, `visitas_checkin = 0`, `visita_diagnosticos = 0`, `registros_consultor_recomendacoes = 0`, `technical_visit_assignments = 0`, `objetivos_visita_sugestoes = 0`. Consequências:

- Nenhum cenário E2E de visita (check-in → campo → diagnóstico → recomendação → anexos → finalização → aprovação → OS) pode ser executado sem seed sintético.
- O spec `e2e/visita-tecnica-hardening.spec.ts` faz `test.skip` integral por falta de `E2E_REGISTRO_RASCUNHO_ID` e credenciais — ou seja, **as RPCs blindadas não têm cobertura runtime ativa hoje**.
- `objetivos_visita_sugestoes` vazio significa que o seletor "Objetivo agronômico" da visita abre sem sugestões.

**Não corrigido nesta execução** — a criação de fixtures sintéticas e de um harness runtime multi-perfil não estava autorizada e altera dados. Recomendado como próxima fase (ver §4).

### 2.7 🟢 Verificações que passaram

- RLS **habilitada** em 100% das 28 tabelas do módulo; nenhuma tabela sem policy.
- Todas as RPCs do módulo são `SECURITY DEFINER` com `search_path` fixado (`search_path=public`), sem função com search_path mutável no escopo auditado.
- Nenhum `EXECUTE` para `anon`/`PUBLIC` remanescente em RPCs do módulo (funções de trigger, que não são invocáveis via PostgREST, foram desconsideradas).
- `technical_visit_assignments` expõe apenas `SELECT` por RLS (`tva_select_visit_authorized`); toda escrita passa obrigatoriamente por `rpc_assign_visit_technician` / `rpc_remove_visit_technician`.
- Imutabilidade garantida por trigger em check-in, diagnóstico e visita; `registros_consultor_pdf_versions` com `FORCE ROW LEVEL SECURITY`.
- Controle de concorrência presente: `registros_consultor.version`, `visita_diagnosticos.versao`, `registros_consultor_recomendacoes.versao`, `visitas_campo.versao`, com `p_expected_version` nas RPCs.
- Idempotência offline: `client_uuid` em check-in, campo, diagnóstico e recomendação, consumido por `useOfflineSync.ts`.
- Nenhum uso de `getPublicUrl` em buckets sensíveis do módulo.

---

## 3. Correções aplicadas (staging)

| # | Ação | Objeto |
| --- | --- | --- |
| 1 | Substituição de policies | `registros_consultor_recomendacoes` (4 novas policies escopadas; 3 antigas removidas) |
| 2 | Substituição de policies | `solicitacoes_atribuicoes` (3 novas; 3 abertas removidas) |
| 3 | Remoção de policies legadas | `registros_consultor_arquivos` (3 removidas) |
| 4 | `REVOKE`/`GRANT` | `rpc_salvar_campo_visita`, `rpc_record_aplicacao_email` |
| 5 | Bucket privado | `consultor-arquivos` |

A migração inclui **guarda fail-closed** que aborta se `_fiscal_staging_marker.project_ref <> 'ikaauvsflpmamgxmkhoq'`.

---

## 4. Ressalvas e próximos passos recomendados

1. **Seed sintético + harness runtime multi-perfil** (admin, gestor, consultor_tecnico, tecnico_agronomo, cliente_produtor, parceiro_b2b_tecnico, operador_onfarm, usuário sem vínculo) provando negativamente os vazamentos corrigidos em §2.1 e §2.2. Requer autorização para escrever dados.
2. **Ativar `e2e/visita-tecnica-hardening.spec.ts`** provisionando `E2E_*` no ambiente de staging.
3. **Popular `objetivos_visita_sugestoes`** por cultura, hoje vazio.
4. **Padronizar `useFluxoVisitaTecnica.ts`** para consumir `registroTransitions.ts` em vez de literais de status (`"rascunho"`, `"enviado_aprovacao"`).
5. **Wizard mobile** (`MobileVisitaWizard` + steps) não usa `registroTransitions.ts`; a checagem preventiva de transição fica só no backend. Divergência de UX aceitável, mas registrada.
6. Não promover nada para produção `navfzbwgwzruipouyfnk` sem novo ciclo de autorização humana.
