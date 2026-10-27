# Plano de correção do fluxo de pedido B2B — por etapas

Cada etapa é um pacote revisável e inativo: nada é aplicado no banco de produção nem publicado pelo agente. O auditor revisa, implanta e homologa com sessões reais A/B antes da etapa seguinte. Contabilidade real e SU-518022 continuam adiadas.

## Etapa 1 — Testes da tela da empresa parceira (concluída)
- Simulação de teste atualizada para o formato atual; 7/7 passando.

## Etapa 2 — Cobrança na entrega (leitura e diagnóstico)
- Ler o conteúdo de `fn_generate_receivable_from_entrega` e `fn_mark_entrega_not_billable`.
- Conferir: categoria RECEITA global ativa obrigatória, método ativo sem fallback/pix, empresa A/B derivada no servidor, ator revalidado, idempotência e títulos/parcelas reaproveitados.
- Entregar relatório; se houver falha, pacote PT409/CAS candidato com pré/pós e testes PostgreSQL descartáveis.

## Etapa 3 — Itens de nota fiscal sem isolamento por empresa
- `fiscal_invoice_items` tem política de escrita ampla sem restrição de empresa.
- Preparar política RESTRICTIVE de empresa (via nota-pai) e testes A/B negativos; confirmar que os escritores fiscais atuais continuam funcionando.

## Etapa 4 — Lotes: fechar escrita direta
- Sem escritor direto na interface. Confirmar funções de lote/CQ/envase (owner postgres) e a interface OnFarm.
- Pacote com políticas RESTRICTIVE de escrita, preservando leitura por empresa e funções existentes.

## Etapa 5 — Decisão do proprietário: OS e entregas
- Hoje as telas de OS e Entregas gravam direto, e as funções canônicas equivalentes estão fechadas.
- Proposta: revisar e reabrir as funções canônicas existentes (`rpc_entrega_confirmar_v1`, `rpc_entrega_cancelar_v1`, criação de OS) com gate, CAS, idempotência e PT409; sem criar fluxo novo.
- Precisa da sua autorização explícita antes de iniciar.

## Etapa 6 — Migrar as telas de OS e Entregas
- Trocar as gravações diretas pelas funções revisadas, com rascunho preservado em conflito, sem retry automático e com proteção contra resposta tardia em outra sessão/empresa.
- Testes com QueryClient real.

## Etapa 7 — Fechar escrita direta em OS, entregas e notas fiscais
- Só depois da Etapa 6 publicada: políticas RESTRICTIVE de escrita, mantendo leitura e o job service_role.
- Migrar antes os escritores de notas fiscais (`useFiscalDocuments`, `useFiscalReconciliation`, `NotasFiscais`) para as funções fiscais existentes.

## Etapa 8 — Higiene de acesso anônimo
- Provar que nenhuma página pública lê as 8 tabelas e preparar retirada da leitura anônima.

## Etapa 9 — Homologação final do fluxo
- Roteiro real A/B por perfil: parceiro gestor, comercial, financeiro, produção, CQ, entrega, fiscal (homologação), incluindo revogação durante espera.

## Detalhes técnicos
- Todos os pacotes em `scripts/<tema>-20261027/` com `*.sql.review`, preflight de hashes/ACL/policies, postflight, contenção deny-only e testes PostgreSQL descartáveis (marcados como sintéticos).
- Ordem obrigatória: gate `cf_user_guards_v1` → idempotência → lock da linha → revalidação → CAS.
