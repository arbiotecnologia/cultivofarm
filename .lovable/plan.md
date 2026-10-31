# Confirmação física manual — preparação local

## Base preservada
O auditor informou aplicação do hardening, fechamento legado e release isolado de envase, publicação de `5557f9ba` e provas JWT reais. Não reinstalar esses pacotes nem acessar produção, sessões, segredos ou as fixtures reais preservadas.

## Entregas
1. Preparar confirmação física manual transacional sobre a composição aplicada: estoque exclusivamente pelo motor canônico, comprovante canônico vinculado e objeto válido, sem remover exigências existentes.
2. Validar ator/empresa/papéis/SaaS após esperas; exigir estado fresco, CAS, chave e replay exato. Preservar linhagem lote/OS/estoque/prova e testar disputa confirmação × cancelamento.
3. Gerar install fechado e release mínimo separados, PRE/POST exatos determinísticos e rollback deny-only. Financeiro/recebíveis/fiscal/comunicação/automações permanecem fechados; B2B/OnFarm não herdam esta liberação.
4. Integrar frontend com capability exata, fences de sessão/epoch, ACK específico e recuperação de resultado incerto. Retirar já da EnvasePage promessas de complemento e ofertas de geração de etiqueta/embalagens fechadas; manter consulta e impressão existentes.
5. Avaliar embalagens/etiquetas/dispensa como contratos independentes somente após provas completas de autoridade; registrar precisamente qualquer decisão comercial ausente.
6. Após concluir as matrizes pendentes da confirmação, preparar o contrato independente de envio manual `separado → em_rota`, preservando essa etapa antes da confirmação. O botão Enviar não ganha acesso por abertura genérica do legado; substituir somente seu consumidor por chamada canônica condicionada à capability exata.

## Contrato independente Enviar — detalhes técnicos
- Compor sobre os artefatos finais medidos da confirmação, em subpacote revisável separado. Capturar triggers/efeitos atuais da transição antes de alterar; não desabilitar triggers nem inventar regra comercial.
- Usar ator/empresa derivados no servidor e matriz de papéis/SaaS vigente, revalidando após cada espera e imediatamente antes do replay/escrita. Exigir CAS positivo observado, chave obrigatória, fingerprint e recibo privado isolado por ator/tenant/ação.
- Locks compatíveis com grupo/cancelamento/confirmação, vínculo lote/OS/cliente/produto/estoque imutável e permit privado de imagem exata, consumido uma vez no mesmo txid. Somente status e revisão previstos podem mudar; nenhum novo movimento de estoque/ledger, comprovante, avanço financeiro/fiscal ou comunicação/automações.
- Capability específica de envio e ACK estrito com IDs/revisão/estado esperados. UI conserva chave/payload em resultado incerto, fence capturado e atualização exata da lista; remover o UPDATE direto desse consumidor, sem liberar outros caminhos de operationalContainment.
- Install fechado, release separado inicialmente NO-GO, PRE/POST completos e hashes determinísticos; rollback deny-only sem restaurar writer vulnerável.
- Não há decisão comercial nova identificada: conservar a transição existente. Se os efeitos capturados conflitarem com o escopo autorizado, explicitar o conflito antes de mudar a semântica.

## Testes e evidências
PostgreSQL descartável com capturas/migrations reais, sentinelas financeiras/fiscais/outbox existentes comparadas integralmente, matrizes próprias/estrangeiras/inativas, revogação sob locks, concorrência, rollback e regressão de motor/group/cancel/envase/formulário/assinatura/anexo. Testes montados de frontend sem tráfego produtivo. Logs brutos, fontes, diff, manifest e hashes atualizados; build automático, sem certificar typecheck separado sem log.

Antes do contrato Enviar: concluir múltiplos lotes/produtos, cobertura cancelada/reserva estornada, corridas assinatura/anexo × confirmação e alterações de linhagem no replay. Para Enviar: próprios/estrangeiros/inativos, papéis/SaaS revogados durante lock, CAS ausente/stale, chave alterada/replay exato, cancelamento concorrente, envio concorrente e snapshots integrais sem efeitos extras. Integração montada com QueryClient real: Enviar atualiza para em_rota, torna Confirmar alcançável, ACK físico atualiza a linha; cache estrangeiro não invalida e financeiro não abre. Cada fase mantém evidências brutas versionadas, inclusive falhas históricas.

## Limites
Nenhuma operação hosted, grant produtivo, publicação ou implantação. Provas sintéticas não certificam JWT/RLS/Storage real; auditor fará revisão e PRE/POST/sessões reais posteriormente.
