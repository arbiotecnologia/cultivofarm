# B3 — painel de condição do vendedor, 07/11/2026

## Escopo e resultado
- Alteração local da UI e leitor já existente `get_partner_order_payment_condition_secure`; nenhuma alteração SQL, dados, publicação, aprovação, cobrança ou NF. Nomes UUID continuam adiados.
- Snapshot V1 com `estimated=true` e `due_basis=nf_issue`: primeiro vencimento rotulado estimado; aviso de recálculo na emissão da NF e taxa identificada como Price, sem multiplicação simples por meses. Valores dos termos persistidos continuam preservados; não recalcular economia no navegador.
- Condição legada preserva apresentação anterior. Ausência confirmada V1 ou ausência exata pré-instalação preserva legado; demais erros do leitor deixam decisões indisponíveis, sem fallback de tabela privada.
- Pai transmite `isAccountingPending(detail)` derivado do snapshot canônico. Aprovar/Reprovar/Solicitar ajuste e Observação/Garantia ficam indisponíveis; submit também verifica pendência, incluindo diálogo aberto antes de atualização.
- Prazo 1 dia do plano TESTE-B2B-PACK-20261106 é fixture do piloto informado, não alteração de plano comercial real.

## Evidências locais
- `scoped-tests.txt`, `scoped-results.json`, `scoped-exitcode.txt`: 4 arquivos, **57/57**, exit **0**; 26 testes do painel/leitor e os mesmos 31 anteriores (16 NovoPedido/meio, 7 fence, 8 administração).
- Testes montados com hooks e componente reais, Auth e transporte sintéticos sem rede hospedada: cada uma das três decisões pendentes tem zero dispatch; cada positivo autorizado mantém RPC e alvo; legado, ajuste já aberto, erro do leitor e validação de metadados V1.
- `automatic-build.txt`: evidência do harness, sem executar build manual; exit code numérico não fornecido. Typecheck separado **NOT_RUN**, não alegado. Suíte completa não repetida.
- TXT/JSON não correspondem aos padrões ignorados de logs; resultados brutos e hashes em `manifest.json`.

## Revisão dos guards do servidor — fontes versionadas, não estado LIVE
- RPCs chamadas: `approve_b2b_payment_terms_secure`, `reject_b2b_payment_terms_secure`, `request_b2b_payment_terms_adjustment_secure` em `src/hooks/usePaymentTermsApproval.ts`.
- Corpos-base em `supabase/migrations/20260707205529_b186202f-b5b3-4f57-830b-f3cee7ca6bbe.sql` (29–88, 95–157, 164–220): Auth/papéis e alterações dos termos/pedido; sem guard contábil explícito uniforme nos três corpos.
- Guard em `scripts/owner-orders-20261023/accounting-pending-request-20261024/src/new-functions.sql` (42–58) nega mudança de `financial_approval_status` enquanto snapshot contábil pendente, exceto inicialização específica com ticket privado.
- A leitura isolada da cláusula de mudança não certifica o caso legado ajuste `pending→pending`: triggers child/orderorigin também precisam ser considerados. Não há vulnerabilidade demonstrada; eventual caracterização desse caso fica separada deste delta UI e exige os guards reais em PG descartável.
- Leitor V1 em `scripts/b2b-payment-condition-v1-rebase-20261106/generate.py` (537–552) usa `PERFORM get_partner_order_payment_terms_secure` antes de ler snapshot privado: mesma porta servidor, sem novo grant.
- Complemento READONLY produção relatado por Renato às 15:14: approve/reject contêm `b2b_phase1_order_visible`; request_adjustment não no corpo, mas há triggers child/orderorigin. `zz_c2_accounting_pending`/`c2_accounting_pending_guard` bloqueia mudança de `financial_approval_status` sob `C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1`. Este é relato do auditor, não consulta executada pelo agente. Nenhuma aprovação hospedada ou alteração SQL foi realizada.
- A contenção da UI não substitui autorização servidor. Este delta não executa PG nem afirma cobertura dos triggers no caso legado; preserva a conclusão separada como não testada.

## Complemento 15:14 — contexto atual dos handlers
- Diálogos são fechados e texto descartado quando pendência, permissão, ator/tenant/época ou pedido mudam. Callbacks capturados revalidam flags atuais e o monitor de autorização antes do dispatch; aprovação revalida também status aprovado. Nenhum endpoint novo.
- Price continua identificado pela presença do snapshot validado **B2B_PAYMENT_CONDITION_V1**, cujo contrato usa o cronograma canônico Price; não depende de `monthly_rate > 0`. Legado não muda.
- Evidências deste complemento são separadas em `handlers-*.txt/json`; as evidências anteriores não são sobrescritas. Transporte/Auth locais sintéticos, sem prova JWT/RLS/browser autenticado.
- Resultado: **67/67** em quatro arquivos, incluindo as 31 regressões anteriores, exit **0**. Dez novos casos montados cobrem callbacks antigos após mudanças de contexto/flags e lease vencida sem renderização. Build automático **OK** às 15:15:43 UTC; typecheck separado e fullsuite **NOT_RUN**. Reteste visual autenticado vendedor/FSF permanece com auditor.

## Prova real informada pelo auditor
Renato relatou leitura na prévia de PB001037: duas embalagens de 25 kg, tabela 20, desconto 2, líquido 18, juros 0,65, total 18,65 e 3x a 1,8%; aprovação de pedido desabilitada pela pendência fiscal. Não foi execução deste agente. Sessões vendedor/FSF continuam com o auditor; o ambiente do agente informa `external_unmanaged`, sem restauração de sessão autenticada disponível. Não foi pedido login nem realizada aprovação real. Reteste visual autenticado deste delta aguarda o auditor.