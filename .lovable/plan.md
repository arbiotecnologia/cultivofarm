# Confirmação física manual — preparação local

## Base preservada
O auditor informou aplicação do hardening, fechamento legado e release isolado de envase, publicação de `5557f9ba` e provas JWT reais. Não reinstalar esses pacotes nem acessar produção, sessões, segredos ou as fixtures reais preservadas.

## Entregas
1. Preparar confirmação física manual transacional sobre a composição aplicada: estoque exclusivamente pelo motor canônico, comprovante canônico vinculado e objeto válido, sem remover exigências existentes.
2. Validar ator/empresa/papéis/SaaS após esperas; exigir estado fresco, CAS, chave e replay exato. Preservar linhagem lote/OS/estoque/prova e testar disputa confirmação × cancelamento.
3. Gerar install fechado e release mínimo separados, PRE/POST exatos determinísticos e rollback deny-only. Financeiro/recebíveis/fiscal/comunicação/automações permanecem fechados; B2B/OnFarm não herdam esta liberação.
4. Integrar frontend com capability exata, fences de sessão/epoch, ACK específico e recuperação de resultado incerto. Retirar já da EnvasePage promessas de complemento e ofertas de geração de etiqueta/embalagens fechadas; manter consulta e impressão existentes.
5. Avaliar embalagens/etiquetas/dispensa como contratos independentes somente após provas completas de autoridade; registrar precisamente qualquer decisão comercial ausente.

## Testes e evidências
PostgreSQL descartável com capturas/migrations reais, sentinelas financeiras/fiscais/outbox existentes comparadas integralmente, matrizes próprias/estrangeiras/inativas, revogação sob locks, concorrência, rollback e regressão de motor/group/cancel/envase/formulário/assinatura/anexo. Testes montados de frontend sem tráfego produtivo. Logs brutos, fontes, diff, manifest e hashes atualizados; build automático, sem certificar typecheck separado sem log.

## Limites
Nenhuma operação hosted, grant produtivo, publicação ou implantação. Provas sintéticas não certificam JWT/RLS/Storage real; auditor fará revisão e PRE/POST/sessões reais posteriormente.
