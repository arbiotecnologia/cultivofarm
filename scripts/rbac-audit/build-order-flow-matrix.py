"""Coverage planning only: no network, credentials, browser or business writes."""
import csv, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'docs/auditorias'
profiles = ['superadmin','administrador_empresa','gestor','gestor_comercial','financeiro','producao_operador','CQ_tarefa_papel_validado','logistica_tecnico_tarefa_papel_validado','parceiro_b2b_gestor','parceiro_b2b_tecnico_sem_compra','cliente_produtor','cumulativo','inativo','transferido','revogado','multi_vinculo','anon']
steps = [
 ('catalogo','/portal-parceiro/catalogo','get_partner_catalog_secure; catalog_tenant_visibility; produtos','src/test/catalogo/c1bCatalog.test.tsx',False),
 ('carrinho_snapshot','/portal-parceiro/novo','useCreatePartnerOrder; create_partner_order_secure; partner_order_items','src/test/catalogo/safePartnerOrderDraft.test.ts',False),
 ('pedido','/portal-parceiro/pedidos','create_partner_order_secure; partner_orders; partner_order_idempotency','src/test/pedidos/novoPedidoAmbiguousRetry.test.tsx',False),
 ('analise_comercial','/comercial/pedidos-b2b','approve_partner_order; partner_order_items; partner_order_audit_logs','src/test/pedidos/partnerOrdersAdminScope.test.tsx',False),
 ('credito_aprovacao','/comercial/pedidos-b2b','approve_b2b_credit; generate_b2b_receivable_secure; accounts_receivable_installments','src/test/saas/b2b-fase1-credit-scope.test.ts',False),
 ('OS_manual','/ordens-servico','INSERT ordens_servico; check_os_item_ref; fn_create_programacao_on_os_classica_insert','src/test/entregas/creationContracts.offline.test.ts',True),
 ('OS_B2B_programacao','/operacao/planejamento','rpc_planejamento_publicar_v1; publish_planning_to_lab; generate_production_orders_from_partner; production_planning','src/test/planejamento-producao/publicacao-contrato-current.test.tsx',True),
 ('lote','/lotes','rpc_cockpit_gerar_lote_v1; lotes; guard_manual_lot_write_v1; guard_manual_program_binding_v1','src/test/lotes/gerar-lote-fences.test.tsx',True),
 ('CQ_aprovado_reprovado','/controle-qualidade','rpc_avancar_esteira_laboratorio; controle_qualidade; cq_parametros_referencia; guard_manual_cq_parent_v1','src/test/cq/hardening.test.tsx',True),
 ('envase','/envase','rpc_cockpit_registrar_envase_v1; fn_validate_envase_cq; fn_validate_envase_volume; fn_envase_avanca_os; envase','scripts/stock-envase-recovery-20261027/test-local.py',True),
 ('estoque_reserva_parcial','/estoque','rpc_estoque_reservar_v1; reservar_estoque_item; stock_motor_refs; estoque_produto; estoque_movimentacoes','scripts/stock-envase-recovery-20261027/test-local.py',True),
 ('expedicao_item_N','/entregas','rpc_estoque_operar_v1; rpc_cockpit_criar_entrega_v1; entregas; laboratorio_esteira_eventos','scripts/delivery-stock-release-20261027/test-local.py',True),
 ('comprovante_arquivo','/entregas/:id/formulario','entrega_comprovantes; storage.objects; entrega-documentos; authenticatedDownload','src/test/entregas/comprovanteDownloadAutenticado.test.tsx',True),
 ('cancelamento_retorno','/entregas','rpc_entrega_cancelar_v1; rpc_estoque_operar_v1 estorno_expedicao/devolucao; entregas','scripts/delivery-stock-release-20261027/test-local.py',True),
 ('recebivel_entrega','/financeiro/entregas-nao-faturadas','fn_generate_receivable_from_entrega; fn_mark_entrega_not_billable; accounts_receivable; installments','scripts/delivery-finance-a2-20261028/test-local.py',True),
 ('fiscal_homologacao','/fiscal/documentos','fiscal_invoices; fiscal_invoice_items; fiscal_events; fiscal-xml-engine; Storage XML','src/test/fiscal/transportPersistenceSafety.test.ts',True),
 ('BI','/bi-operacional','rpc_bi_esteira_resumo; vw_esteira_laboratorio; estoque_movimentacoes','src/test/dashboard-producao',False),
 ('notificacoes_OFF','/notificacoes','notificacoes_operacionais; portal_notificacoes; comunicacao_outbox; flags server','src/test/comunicacao/notification-push-contained.test.tsx',True),
]
axes = {
 'status_valido_invalido':'Campos obrigatórios/enum; transição válida só com autoridade; inválida sem efeitos.',
 'IDOR_query_payload_UUID_arquivo':'A→B/B→A/C sem vínculo/anon negados sem revelar ID, valor ou bytes; UUID inválido negado antes do envio.',
 'atomicidade_item_N_audit':'Falha item N reverte todos efeitos e recibos da transação; grupo multichamada não presume atomicidade.',
 'locks_wait_revogacao':'Gate→advisory→linha conforme contrato; reautorizar após cada wait; revogação primeiro nega, mutação primeiro registra commit; sem deadlock.',
 'replay_double_ACK_timeout':'Uma tentativa/mesma intenção; ACK perdido exige reconciliação; PT409/403/55P03 sem retry/rebase automático.',
 'offline_reconexao':'Sem novo envio automático/novo snapshot; tentativas incertas preservadas e reconciliadas.',
 'plano_feature_portal_JWT':'Plano/feature/vínculo/tenant e JWT vigente no servidor; portal não concede papel; cumulativo não amplia dados do fornecedor.',
 'snapshot_saldo_notificacao_BI':'Preço/condição históricos imutáveis, saldos finitos não negativos, audit trail coerente, externo OFF e BI conciliado.',
 'UX_desktop_mobile_A11y':'Desktop1280/mobile390; foco/teclado/leitor, sem sobreposição; 403/404/PT409/55P03, contexto alterado e draft preservado.',
 'security_SQL_Storage_secrets':'RLS/ACL coluna/DEFINER/search_path/auth.uid/tenant, parâmetros sem SQL concatenado, URLs antigas/CDN/bytes e nenhum secret exposto.',
}
rows=[]
for step,route,contract,test,blocked in steps:
 for profile in profiles:
  for tenant in ['A_proprio','B_alheio','C_sem_vinculo']:
   for axis,expect in axes.items():
    rows.append(dict(id=f'FLOW-{len(rows)+1:05d}',passo=step,rota=route,perfil=profile,tenant=tenant,cenario=axis,precondicao='Futura fixture própria auditável; instalação e autoridade atestadas; nenhum dado criado nesta rodada',expectativa=expect+' Papel nominal não autoriza: exigir matriz servidor vigente.',contrato=contract,teste_automatizado=test if (ROOT/test).exists() else 'NOT RUN — localizar teste específico',evidencia='Roteiro de cobertura; suíte relacionada não prova esta combinação JWT/RLS',status='BLOCKED' if blocked else 'NOT RUN',nivel='JWT_RLS_BROWSER_REAL',severidade='P2' if axis.startswith('UX') else 'P0' if axis.startswith(('IDOR','security','atomicidade','locks')) else 'P1'))
# Exact executed evidence is separate from the combinatorial plan, never promoted to real PASS.
for ident,scenario,test,count,level in [
 ('OFF-PUBLISH','duplo dispatch/ok:false/escopo/ausência/offline', 'src/test/planejamento-producao/publicacao-contrato-current.test.tsx',21,'QueryClient/Auth/transporte simulados'),
 ('OFF-BROAD','21 arquivos catálogo/pedido/crédito/CQ/estoque/fiscal/Storage/portais', 'docs/auditorias/evidencias-fluxo-b2b-20261028/broad-vitest.txt',288,'Vitest jsdom/mocks/estáticos'),
 ('OFF-STOCK','item N batch/envase/ledger/replay/concorrência', 'scripts/stock-envase-recovery-20261027/results.txt',64,'PostgreSQL descartável motor capturado; Auth/schema sintéticos; triggers omitidos'),
 ('OFF-DELIVERY','locks/ACK negativo/rollback/containment', 'scripts/delivery-stock-release-20261027/results.txt',48,'PostgreSQL descartável motor/billing/avanço stubs'),
 ('OFF-CONSUMER-DELIVERY','página Entregas/hook/diálogo reais: dupla ação, ACK negativo/parcial, escopo, timeout, cancelamento/item N', 'docs/auditorias/evidencias-consumidor-entrega-20261028/vitest.txt',332,'Vitest QueryClient real; Auth/transporte simulados; 32 regressões novas, não JWT'),
 ('OFF-A2','tenant/replay/categoria/método/parcelas/timeout', 'scripts/delivery-finance-a2-20261028/results.txt',76,'PostgreSQL descartável/Auth sintético; não JWT'),
]:
 rows.append(dict(id=ident,passo='evidencia_offline',rota='não executada hosted',perfil='simulado',tenant='simulado',cenario=scenario,precondicao='execução local sem credenciais hosted',expectativa='asserções do teste específico, sem liberar fluxo',contrato='ver relatório/artefatos',teste_automatizado=test,evidencia=f'{count} PASS no escopo específico',status='PASS',nivel=level,severidade='P1'))
for ident,step,scenario,evidence in [
 ('GAP-01','recebivel_entrega','A2 não instalada; corpos LIVE com risco BOLA documentado','SELECT 01:45 UTC hashes generate/mark anteriores; não explorado JWT A/B'),
 ('GAP-02','expedicao_item_N','grupo UI continua multichamada; patch local recusa ACK negativo, sem atomicidade/reconciliação servidor','src/pages/Entregas.tsx; 32 regressões novas página/diálogo PASS sintético; atomicidade e JWT real BLOCKED'),
 ('GAP-03','envase','transição canônica completa não demonstrada','ENVASE_TRANSITION_REVIEW_PENDING; suites omitem triggers transição/financeiro'),
 ('GAP-04','OS_manual','cadastro manual sem RPC equivalente instalada; migração DML não concluída','src/pages/OrdensServico.tsx handleCreate; teste contrato offline'),
]:
 rows.append(dict(id=ident,passo=step,rota='ver inventário',perfil='não certificado',tenant='A/B/C pendentes',cenario=scenario,precondicao='estado atual auditado',expectativa='Critério P0 de liberação não atendido; não significa exploit JWT reproduzido',contrato='ver relatório',teste_automatizado='auditoria estática/SELECT; teste real BLOCKED',evidencia=evidence,status='FAIL',nivel='GATE_RELEASE_NAO_ATENDIDO',severidade='P0'))
path=OUT/'matriz-auditoria-fluxo-b2b-20261028.csv'
with path.open('w',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator="\n");writer.writeheader();writer.writerows(rows)
counts={s:sum(r['status']==s for r in rows) for s in ['PASS','FAIL','BLOCKED','NOT RUN']}
(OUT/'matriz-auditoria-fluxo-b2b-20261028-resumo.json').write_text(json.dumps({'rows':len(rows),'statuses':counts,'real_PASS':0,'profiles':profiles,'steps':len(steps),'axes':axes,'note':'Cobertura planejada não é execução. PASS somente seis grupos offline (execuções sobrepostas não somadas); combinações reais nunca inferidas.'},indent=2,ensure_ascii=False)+'\n')
print(len(rows),counts)