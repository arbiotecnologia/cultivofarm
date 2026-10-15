# Fase atual — candidato de habilitação focal OS (16:37 UTC)

## Resultado e entrega
**CANDIDATO PARA REVISÃO. Não aplicado ao app/banco, não publicado.**
Diff: `scripts/rbac-audit/proposed-enable-visit-os-ui.patch`.
Preflight somente leitura: `scripts/rbac-audit/preflight-enable-visit-os-readonly.sql`.
Cópias executáveis para testes: `scripts/rbac-audit/os-enable-candidate/` (não importadas pelo app).

Aprovação de VT-2026-0003 pela fila técnica e visita aprovada no domínio publicado: **evidência externa relatada por Renato**, não nova prova própria. Preservada a visita f19c8343-6205-487a-a237-df4d8ee06471, sem sequer chamar o conversor remoto.
Migrations 20261015161648 e 20261015162631 já aplicadas: **NÃO REAPLICAR**; arquivo exato e manifesto aplicado preservados. Ownership01–13 permanece OFF.

## Dependências e recorte
- Achado integrado ao mesmo candidato: `FluxoTecnico` consultava `ordens_servico_onfarm.origem`, coluna inexistente no schema canônico, e por isso os KPIs de OS caíam para `—`. A consulta candidata remove `origem` e deriva o rótulo exclusivamente de `registro_consultor_id`: vínculo presente = visita técnica; ausente = sem vínculo de visita. Não cria coluna nem inventa origem.
- `OrdensServico` não possui a incompatibilidade: consulta separadamente `ordens_servico` e `ordens_servico_onfarm` e atribui o discriminante local pela tabela de origem do resultado. Seu rótulo on-farm candidato foi estreitado para usar `registro_consultor_id`. `MobileOrdens` consulta somente `ordens_servico` e não lê `origem`; nenhuma mudança necessária.
- A flag antiga alegava inexistência de conversor idempotente. Corpo arquivado aplicado tem guard de domínio + `can_view_technical_visit` antes de lookup/replay, rechecagem após lock, lock de visita, índice singular e replay pela mesma visita. Hash `66e8072f7aefbe18c1417240121147a5`.
- Workspace fornece `permissions.can_convert_os`; UI não substitui backend/RLS. Candidato exige permissão literal true + ator ativo/tenant/sessão pronta + papel de domínio + status aprovado + ausência de OS. Consultor/técnico **não ganham acesso**: workspace histórico é admin/gestor; se servidor negar, botão não aparece. SA sem papel de domínio/tenant também negado.
- Flag global tem somente dois consumidores: banner existente e aviso da fila. Alteração não cria ação de conversão na fila nem reabre rota/entitlements.
- Confirmação explícita, cancelamento sem escrita, lock síncrono por instância; controles indisponíveis durante leitura/erro. Hook reconsulta workspace antes da RPC, aceita convertido_os exclusivamente para replay manual; nunca auto-retry de escrita. Backend continua responsável por concorrência entre abas.
- Erros técnicos e mensagem arbitrária remota não são exibidos; códigos conhecidos recebem mensagem focal. Falha deixa diálogo aberto e reconsulta workspace. Resposta incompleta/alheia não certifica sucesso. Epoch de identidade impede resposta tardia inclusive AR→FSF→AR; sem navegação automática pós-escrita.
- Sucesso invalida workspace/timeline/status/listas técnicas/OS/cockpit/PCP, sem limpar cache global. UI lê novo workspace e retira botão após convertido_os. Status é **encaminhamento**, não execução física/conclusão de comerciais. Texto antigo de OS Multi-Produto/reserva-expedição substituído apenas no banner.
- Nenhuma mudança no diagnóstico/PDF candidato anterior; precisa revisão separada. Nenhum outro RPC/gate operacional, decisão do produtor, ACL, guard, índice ou histórico alterado.

## Volume NULL — dependência operacional
Conversor aplicado não grava volume_total_ml/dose. Trigger gera programação aguardando com volume_necessario NULL; isto é demanda, **não fabricação**. Teste executável confirma ambos NULL.
`OrdensServico.tsx` calcula volume para **nova OS manual**, não edição autorizada de volume na OS convertida. `useEsteiraLaboratorio.programarProducao` aceita apenas OS/origem/data; não define volume. `GerarLoteDialog` informa **volume produzido**, não volume solicitado prévio. Não serve como solução substituta; não inventar unidade/dose ou preencher com catálogo.
`CockpitLaboratorio.abrirGerarLote` já rejeita volume solicitado NULL/<=0. Programar/lote/publish devem conservar ACL fechada: candidato não concede nenhuma permissão. Contudo corpo de lote aplicado valida volume produzido positivo, não prova bloqueio universal por volume solicitado NULL se ACL for reaberta; **NÃO reabrir**. Demais canais/esteira não são certificados nesta fase.
Não identificado fluxo existente auditado para definir volume solicitado antes de fabricar. **NO-GO fabricação** até revisão focal do caminho existente de definição explícita, autorização/CAS/idempotência e unidade canônica. Não criado fluxo paralelo.

## Evidência própria
- Schema canônico read-only: ref confirmado; `origem_columns=0`; `authenticated` possui leitura; consulta mínima `id,numero_os,status,created_at,registro_consultor_id,cliente_id,fazenda_id LIMIT 0` compilou; FKs explícitas e únicas para `clientes` e `fazendas`. Nenhuma linha/dado foi lido ou alterado.
- Frontend candidato: teste garante que o SELECT não contém `origem`, mantém `registro_consultor_id` e, em falha, mostra erro/tentativa novamente com KPIs `—`, sem converter falha em zero/estado vazio.
- Evidência externa relatada por Renato em ROLLBACK: conversão autenticada com `iat/exp` gerou Bombarbio, replayou a mesma OS e uma programação aguardando; ambos os volumes permaneceram NULL. Rollback preservou visita aprovada/zero OS; sequências 001/002 consumidas são histórico normal e não serão renumeradas. Isto não substitui prova pelo navegador.
- Vitest candidato: **32/32 PASS** (4 papéis condicionados à permissão, 6 perfis negados, 6 status negados, loading/inativo/sem tenant, FSF/inexistente simulado, confirmação/cancelamento, lock, replay, códigos de erro, resposta inválida, troca de sessão/epoch). QueryClient real, Supabase/Auth **mockados**.
- Regressão conjunto: **72/72 PASS** (32 candidato +35 decisões existentes +5 PDF/claims candidato anterior).
- PGlite corpo aplicado exato: **31/31 PASS**, hash converter confirmado, bio/micro/referências/famílias/NULL/misto/sem flag/múltiplos/replay/FSF/inexistente/falhas rollback. Auth/RBAC/tenant/schema/helpers simulados; preflights remotos não executados.
- Concorrência: lock frontend comprovado; fila PGlite comprovada **não é duas sessões PostgreSQL**. Concorrência hospedada entre abas/atores continua UNVERIFIED; evidência anterior não reclassificada como prova desta rodada.
- Build automático da prévia observado OK; typecheck/build específicos do diff ainda dependem de aplicar candidato em checkout de revisão (não rodados manualmente nesta rodada).
- Sessão gerenciada: external_unmanaged, sem sessão injetada. Não restaurada sessão nem testado browser autenticado publicado. Sessão disponível no navegador do revisor não equivale à sessão do agente. Sem solicitar credenciais.

## Gates e roteiro de revisão
1. Validar destino canônico antes de qualquer operação de banco. Executar preflight read-only; qualquer drift/ACL operacional aberta mantém NO-GO, sem regrant corretivo automático. Preflight pronto, **não executado remoto** nesta rodada.
2. Aplicar **somente diff UI** em checkout de revisão autorizado; não SQL12/07/ownership/diagnóstico. Fazer verificações automáticas e testes indicados. Reverter a disponibilidade UI se dependência não confirmada; nunca restaurar conversor vulnerável.
3. No domínio publicado após publicação expressamente autorizada pelo proprietário: Admin AR visita aprovada, Gerar OS → abrir/cancelar sem mudança → confirmar uma vez → verificar status convertido_os e mesma OS/uma programação aguardando/volume não informado. Sessão real atual publicada continua com gate OFF até decisão do revisor.
4. Reconsultar visita/OS pela UI; retry/reentrada não duplicam. FSF/sem papel/SA sem tenant não veem ação; loading/erro não habilitam botão. **Não executar conversão por SQL direto para contornar gate**.
5. Não programar, gerar lote, publicar planejamento, decidir pelo produtor, fabricar, cobrar ou emitir fiscal. Comerciais preservados.

**GO candidato local para revisão; NO-GO habilitação/publicação nesta rodada; UNVERIFIED conversão JWT/browser próprio; NO-GO fabricação/volume.**
