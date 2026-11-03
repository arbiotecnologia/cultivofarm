# Cópia isolada CultivoFarm-Homolog — preparação, NÃO homologação operacional

## Resultado e limites

Somente código/configuração/testes locais desta cópia `aec6d152-e409-44bf-9cb3-10da72365572`. Nenhuma alteração no original `a79bb3db-f665-466d-bf41-ee8c6cb91fab`, publicação, SQL/Edge implantado, escrita/leitura hospedada de auditoria, email, convite, cobrança, emissão fiscal ou automação executada. O navegador de teste interceptou toda saída externa; não iniciou sessão real.

**Proveniência NÃO COMPROVADA:** HEAD inicial observado `050e8bbe2756ef9cd66adf6a2a9fccac3b4350d7`, mensagem `Initial commit from remix`. O objeto fonte esperado `a2b305487287c7600dde8c5b0866155477901370` não existe no repositório local (`git cat-file` recusou). Não é possível afirmar equivalência de árvores/commit; precisa do manifesto/árvore da fonte pelo proprietário. Nenhum checkout, push ou alteração Git executado.

## Arquivos locais

| Arquivo | Alteração |
|---|---|
| `src/integrations/supabase/bindingGuard.ts` | Ref exclusivo `vrlcdwmlytukrjezrrnf`; URL literal exata HTTPS, sem porta/credenciais/caminho/query/hash ou fallback ambiental |
| `src/integrations/supabase/client.ts` | Único cliente com URL homolog e chave pública fornecida; fetch deny-default; Realtime fechado; storage próprio; `detectSessionInUrl:false` |
| `src/integrations/supabase/homologPreparation.ts` | Barreira antes de importar App, auth/leitura mínima allowlisted, redirects de fetch proibidos, bloqueio global fetch/XHR/WebSocket/EventSource/Workers/beacon/navegação externa; limpeza de registros SW e bloqueio se página já controlada |
| `src/integrations/supabase/previewAuthStorage.ts` | Export compatível sem broker/postMessage; nunca importa sessão do editor/original |
| `src/main.tsx` | Contenção assíncrona antes de App/login; não inicia gestão de versão/push produtiva; banner permanente |
| `src/index.css` | Remove fonte externa; estilos semânticos do banner |
| `vite.config.ts` | CSP inserida antes dos recursos HTML: recursos externos/frames/workers fechados; conexão homolog e dev local apenas |
| `src/config/fiscalBinding.ts` | Ref fiscal homolog; emissão continua false |
| `src/config/featureFlags.ts` | Comunicação/broadcast false mesmo se ambiente herdado tentar ativar; pagamento/emissão continuam false |
| `supabase/config.toml` | Ref local homolog e aviso de não implantação; verify_jwt e configurações endurecidas preservadas |
| `AGENTS.md`, `roadmap.md` | Regras/limites e pendências da cópia |
| `src/test/config/homolog-{preparation,sdk}.test.ts` | Binding, storage, broker ausente, writes/Edges/upload impedidos inclusive SDK real com transporte simulado |
| `src/test/config/{connection-binding.static,binding-gate.integration}.test.ts` | Expectativa da cópia homolog; runner histórico produção preservado e comprovadamente recusa a cópia |

Não removidos/relaxados scripts NO_GO, comparações PRE/POST, policies, triggers, ACLs ou contratos. As guardas históricas de anexos que comparam URL de produção permanecem fechadas em homolog: não foram convertidas em abertura. A anotação `SUPABASE_URL:string` evita erro de comparação entre literais distintos sem mudar essa negação runtime.

## O que pode sair pela rede

Após validação exata do binding: somente `/auth/v1/token` POST grant `password`/`refresh_token`, `/auth/v1/user` GET e `/auth/v1/logout` POST; GET/HEAD de `profiles`, `user_roles`, `configuracoes_sistema`; RPCs de contexto `get_my_available_portal_contexts` e `get_my_authz_fingerprint`. **Qualquer outra tabela/RPC, mesmo GET, é negada** até revisão do catálogo homolog. Estes probes não substituem autorização/RLS; ausência/incompatibilidade mantém a interface indisponível. Recuperação/signup/OTP/updateUser proibidos para impedir email/convite/alteração de conta. Auth é exceção expressa à contenção de negócio, não foi executada nesta preparação.

Storage de sessão: `cultivofarm-homolog-vrlcdwmlytukrjezrrnf-preparation-v1-auth`, escopo da origem desta cópia, sem leitura/migração/exclusão de chaves de produção. Sessão em URL não é detectada. Não restaurar as variáveis de sessão gerenciada de preview nem executar mint de sessão. Storage local não concede autoridade.

Um SW já controlador causa bloqueio de bootstrap após desregistro; é necessária navegação nova manual. CSP é inserida via Vite, inclusive artefato de produção, não apenas um patch no fetch. Conexões dev `localhost:8080` são exclusivamente infraestrutura de prévia/HMR; o fetch de negócio nega essas URLs. Infraestrutura do editor fora da aplicação não é certificada por este código.

## Inventário de saídas fora do cliente central

Inventário estático reexecutável em `docs/homolog-preparation-20261031-endpoints.txt`, inclui todos os matches locais de URL/fetch/transporte, inclusive destinos derivados de registros. Não se afirma isolamento por simples troca de `client.ts`.

| Caminho | Destino/tipo | Contenção |
|---|---|---|
| `src/lib/api/brasilapi.ts`, `src/lib/fiscal/cnpjLookup.ts` | BrasilAPI CNPJ | fetch global nega origem, CSP nega conexão |
| `src/lib/api/viacep.ts` | ViaCEP | idem |
| `src/lib/fichaIaClient.ts`, `src/pages/configuracoes/ComunicacaoConfigTab.tsx` | fetch/stream Edge | funções inteiramente negadas, inclusive GET/stream |
| `src/lib/entregas/termoPdfDownload.ts` | Edge PDF direta | negada |
| `src/lib/authz/loadClientDocument.ts`, helpers técnicos/financeiros | downloads Edge/probes e guardas de produção | fechados; comparação histórica nunca autoriza homolog |
| `src/pages/ConsultorTecnico.tsx:171`, `src/lib/comprovanteEntregaPdf.ts:287`, `src/lib/pdf/arBioHeader.ts:15` | fetch de URL derivada de arquivo/logo/prova | deny-default, nenhuma exceção para URL dinâmica |
| CSS fontes | Google Fonts | import removido, font-src self |
| `src/lib/geo.ts`, links Maps/Waze e iframe mapa | navegação/embed externos | CSP frame-src none, click externo e window.open fechados |
| URLs de logo/imagem/arquivo armazenadas em dados | podem referenciar produção | img-src self/data/blob; storage homolog também sem exceção de negócio |
| `src/pwa/registerSW.ts` | versão/push/SW same-origin | scheduler inicial não iniciado; fetch de versão negado; registro SW/worker fechado |
| `src/integrations/supabase/previewAuthStorage.ts` | broker editor/original | implementação retirada, nenhum postMessage |
| canais em Entregas/Envase/Lotes/OS/portais | Supabase Realtime | transporte explícito fechado, WebSocket global fechado |
| Edges via SDK em Agenda/Configurações e demais telas | calendário, create-user, senha, fiscal/comunicação | fetch do SDK e global bloqueiam toda `/functions/v1/` |

Referências históricas a produção continuam em documentação, scripts de revisão e guardas deny-only; não são destinos permitidos de runtime. Não executar runners históricos `restoration/homologacao-h7/*`, auditorias RBAC ou comandos que consumam DSN/produção. Nenhum script foi retargetado para criar uma aparência de compatibilidade.

## Testes e evidência desta execução

- Vitest com `src/test/config/runtimeGate.vitest.config.ts` (fetch/XHR reais proibidos): **84/84, seis arquivos** binding/storage/request-policy/SDK/PWA/fiscal.
- Regressão entrega/envase/etiquetas, mesma configuração sem rede: **581/581, 37 arquivos**. **Total: 665 testes locais aprovados**, não homologação JWT/RLS/Storage.
- SDK real: insert/update/delete, RPC legado, Edge, upload, signup e recuperação retornam erro sem uma chamada ao transporte simulado.
- Chromium local desktop 1280×1800 e mobile 390×844: `/auth`, banner visível; cinco tentativas diretas negadas; WebSocket negado; produção storage ignorado; reload não restaura sessão produtiva; zero pageErrors. Três leituras homolog de branding tentadas foram interceptadas pelo teste, sem atingir hospedagem; placeholder da marca é esperado sem essa leitura.
- Build/typecheck **automáticos**, última entrada observada `build OK` em 31/10 22:07:07 UTC. Erros iniciais TS2367 em cinco guardas históricas de anexos foram resolvidos sem abri-las; nenhum build/typecheck manual executado.
- `git diff --check`: sem erros. Sem suíte total da aplicação, lint ou teste autenticado de negócio nesta rodada.
- Logs brutos locais versionados na pasta `docs/homolog-preparation-20261031-evidence/`. Capturas em `/tmp/browser/homolog/`; teste de navegador reexecutável copiado nessa pasta de evidência. Nenhum segredo/sessão real capturado.

## Dependências SQL ordenadas — NÃO aplicar

**Bloqueio zero:** baseline homolog foi relatada pelo proprietário, não consultada nesta execução: apenas `rpc_cockpit_criar_entrega_v1(p_os_id,p_origem,p_estoque_produto_id,p_quantidade,p_dados)` ANTIGO e `rpc_estoque_operar_v1`; novos writers/capabilities e helpers delivery/envase ausentes. Existência do motor antigo não prova autorizações/pins/receipts/permits/lineage atuais. Os instaladores abaixo são referências da composição descartável existente, **não uma sequência executável sobre essa homolog**.

0. Auditor autorizado deverá capturar catálogo homolog integral (corpos/assinaturas/ACL/owners/search_path/tabelas/colunas/constraints/policies/RLS/triggers/storage, dependências h15/RBAC/SaaS e motor/ledger). Comparar a00/fiscal/cron/comunicação, origem e identidades; parar se incompleto. Restaurar essa baseline num PostgreSQL descartável. Preservar snapshots históricos; não substituir hashes para “passar”.
1. Reconciliar dependências reais do motor estoque/batch/reserva/OS/lote/CQ, guards e singleton. Não reinstalar automaticamente versões de produção nem usar helpers stub. Reproduzir legado cinco args e efeitos transitivos completos antes do delta.
2. Rebase **revisado** da barreira atômica + prova, em uma transação: referência `scripts/delivery-proof-authz-20261030/release-combined.sql.review` (atomic hardening + proof). Permits exatos txid/ator/tenant/ação/linha, receipts, bloqueio efeitos financeiros/fiscais/outbox, adapters endurecidos. Não instalar atomic e proof separadamente.
3. Reconciliar `scripts/stock-envase-recovery-20261027/install-v2.sql.review` sobre POST anterior; preservar motor e grants independentes.
4. Fences tenant: `proof-select-tenant-20261030/install.sql.review` → `delivery-evidence-tenant-20261030/install.sql.review` → `produto-etiquetas-tenant-20261030/install.sql.review` → `delivery-checklist-occurrence-authz-20261030/install.sql.review`. Barreiras aditivas/deny-safe, isolamento por pai/lote, ACLs e writers não ampliados.
5. `delivery-waiver-closure-20261030/install.sql.review`; fechamento independente de cancelamento de etiquetas `label-cancel-closure-20261031/install.sql.review` exige pins próprios, não inserir na cadeia sem recomposição. Nada de dispensa/cancelamento de etiqueta liberado.
6. `delivery-group-capability-20261030/install.sql.review`, apenas sobre os POST exatos anteriores; grupo/criação observada e cancelamento CAS, capability nunca autoridade. Não inferir overload novo a partir do antigo.
7. Envase isolado: `stock-envase-recovery-20261027/isolated/install.sql.review` → `legacy-closure-install.sql.review`. Permit entrada/consumo, NOWAIT/gate e revalidação de raízes. `release.sql.review` é gate de revisão, não permissão de execução nesta fase.
8. `delivery-atomic-hardening-20261030/confirmation/install.sql.review`: confirmação manual, linhagem imutável expedição/prova/OS/lote/ledger, volume parcial; sincronização token/hash e recuperação estrita legado sob recibo/prova/permits. Release permanece NO_GO.
9. `delivery-atomic-hardening-20261030/confirmation/send/install.sql.review`: Enviar independente, separado→em_rota, CAS/key/receipt/locks herdados, OS pronto_entrega ou entregue parcial, terminal negado; sem segunda expedição. Release permanece NO_GO.
10. Regenerar PRE/POST determinísticos da **composição homolog descartável** somente após todos os corpos/dependências reais e deltas revisados, COLLATE C, hashes integrais/ACL/constraints/triggers/policies e testes rollback deny-only/rerun/drift. Nenhuma remoção/relaxamento dos guards atuais.
11. Revisão independente do conjunto exato e autorização futura de instalação; só depois proofs JWT/RLS/Storage/duas abas em contas homolog autorizadas e contratos de UI compatíveis. **Modo preparação desta cópia não deve ser desligado como atalho.**

### Matriz dos 14 cenários

| # | Cenário | Pré-requisitos principais | Situação real |
|---|---|---|---|
| 1 | Criação | 1–3,6; grupo/item retornado motor, receipts/permits/ACK | writer novo ausente, antigo cinco args incompatível |
| 2 | Replay | 2,6,8,9; ator/tenant/lineage reautorizados após espera | receipts/helpers não comprovados |
| 3 | Cancelamento | 2,6; overload observado CAS e recomposição stock deny-only | não confundir antigo dois args com novo |
| 4 | Envio | 8–9; capability/permit status exato | writers/helpers ausentes |
| 5 | Recarga | 9 e cliente retenção durável, mesma key/CAS sem replay automático | testes locais, contrato servidor ausente |
| 6 | Duas abas | 2,6,9; dedup servidor + Web Locks/storage exato | testes locais não certificam servidor |
| 7 | FSF | h15/RLS/tenant e 4; identidade FSF válida | organização relatada; sessão ainda não testada |
| 8 | B2B | vínculo comprador autorizado e contrato externo próprio | legado teste4 admin FSF divergente; não abrir B2B por capability manual |
| 9 | CAS | 6,8,9; timestamp obrigatório e ACK atual | overloads/capabilities não instalados |
| 10 | Formulário–assinatura–upload | 2,4,8; object owner/path/Storage/RLS e hash canônico | Storage/contratos não homologados, uploads bloqueados |
| 11 | Confirmação parcial | 1,7,8; volume por programa/produto e ledger imutável | helpers ausentes; não finalizar por um item |
| 12 | Troca sessão | h15/roles/tenant após waits e fences/cache/storage | provas locais somente; usuários reais não utilizados |
| 13 | Motor legado | 1–2; capturar corpo/ACL/ACK reais sem GUC autoridade | motor informado não equivale composição segura |
| 14 | Estados inválidos | 2,6–9; terminais/CQ/OS/prova/lineage negativos | provas integradas homolog não disponíveis |

## Identidades e bloqueios não corrigidos por esta preparação

- AR Bio org `c809e74f-486b-44b2-b2f4-4088f53421bb`, user `c95f9261-a3bb-48f2-80e6-bb653e4b916f`; FSF org `dcf50a75-579a-4828-a0fc-1d8eadcb4b8a`, conforme relato. Não criadas ou reatribuídas identidades.
- `rh@refilinformatica.com.br` AUSENTE; `teste4@` legado admin FSF não é comprador B2B AR Bio. Pendente decisão/execução futura autorizada; não usar conta indevida para PASS.
- Fiscal pendente, cron zero, comunicação false e `a00_homolog_validation_no_receivable` preservados: nenhum SQL alterado. A existência/estado hosted desses gates é **relatada, não reconfirmada** por esta preparação sem banco.
- Master key fiscal não pode ser trocada cegamente: certificados existentes cifrados podem ficar ilegíveis; requer inventário/rotação/migração revisada, sem copiar certificado/chave produtiva.

## Solicitação adicional: cinco secrets

Nenhum secret foi lido, criado ou atualizado. Nesta preparação não há autorização para escrever em serviços hospedados; ferramentas disponíveis não atualizam nomes existentes e não comprovam binding CultivoFarm-Homolog para esse ato. Não usar o Cloud interno para armazenar/reativar o destino.

| Nome | Próxima ação segura fora desta execução |
|---|---|
| `FISCAL_CERTIFICATE_MASTER_KEY` | chave exclusiva homolog, gerida pelo proprietário; verificar ciphertext existente e plano de rotação antes de substituir |
| `FISCAL_CORS_ALLOWLIST` | allowlist somente da origem exata da cópia homolog, nunca domínio original/produção; origem de implantação futura deve ser comprovada |
| `INTERNAL_FUNCTION_SECRET` | credencial exclusiva homolog, não reutilizar produção; cron e chamadas internas continuam OFF |
| `STAGING_DSN` | conexão privada exclusiva homolog fornecida/configurada pelo proprietário; não solicitar em chat nem gravar no repo; não executar runners históricos com ela |
| `STAGING_REF` | valor público escolhido `vrlcdwmlytukrjezrrnf`, atualização manual em Settings → Secrets, se esse serviço for de fato o ambiente correto |

As atualizações precisam ocorrer em Settings → Secrets do ambiente correto, sem colar valores privados aqui. Não inventado DSN, não geradas chaves temporárias e não afirmado que os secrets herdados estejam seguros/atualizados.

**Conclusão:** preparação local de isolamento validada; origem fonte, dependências SQL atuais, identidades/sessões reais, secrets e homologação operacional permanecem impeditivos. Projeto não publicado.