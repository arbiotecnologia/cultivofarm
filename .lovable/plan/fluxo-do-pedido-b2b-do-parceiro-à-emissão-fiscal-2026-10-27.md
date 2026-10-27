# Fluxo do pedido B2B — do parceiro à emissão fiscal

Documento explicativo (sem alterações no sistema). Baseado nas telas e status existentes no CultivoFarm.

```text
PARCEIRO B2B (portal /portal-parceiro)
  Catálogo canônico -> Simulador (não grava) -> Carrinho
  Preço/condição/mínimo/vigência resolvidos no servidor (motor canônico)
        |
        v
[1] PEDIDO         rascunho -> pendente/solicitado
        |          (snapshot imutável de preços + idempotência)
        v
[2] COMERCIAL      em_analise_comercial  (/comercial/pedidos-b2b)
        |          -> aguardando_ajuste_comercial | aguardando_itens
        |          -> reprovado | reprovado_sem_itens (automático sem itens)
        v
[3] CRÉDITO /      aguardando_aprovacao_credito  (/financeiro/b2b)
    FINANCEIRO     limite, risco, condição de pagamento, método ativo,
        |          categoria RECEITA global ativa (sem fallback)
        |          billing_trigger:
        |            na_aprovacao -> gera título/parcelas agora (atômico)
        |            na_entrega   -> título só após entrega
        v
[4] APROVADO       aprovado / confirmado
        v
[5] PRODUÇÃO       Ordem de Serviço (/ordens-servico)
        |          aberta -> aprovada -> programada -> em_producao
        |          planejamento: aguardando_planejamento -> planejado
        v
[6] LOTE           /lotes  em_producao -> aguardando_cq
        v
[7] CONTROLE       CQ (/configuracoes/parametros-cq)
    QUALIDADE      aprovado | reprovado (reprovado não segue)
        v
[8] ENVASE         /envase  frasco_1L | bombona_5L | bombona_20L
        |          OS: em_cq -> envase -> aguardando_reserva
        v
[9] ESTOQUE        /estoque  disponivel -> reservado -> expedido
        |          OS: pronto_entrega ; pedido: produzido/aguardando_entrega
        v
[10] ENTREGA       /entregas  separado -> em_rota -> entregue
        |          checklist, conferência de itens, comprovante, termo,
        |          ocorrências; pedido: em_separacao -> enviado -> entregue
        v
[11] FATURAMENTO   na_entrega: gera recebível/parcelas
        |          (/financeiro/receber, /financeiro/entregas-nao-faturadas)
        |          base: PENDENTE -> LIBERADO_FATURAMENTO -> FATURADO_*
        v
[12] FISCAL        /fiscal/prontidao -> /fiscal/documentos
                   perfis fiscais cliente/produto/serviço, regras tributárias,
                   série/numeração, XML/XSD, transmissão SEFAZ
                   pedido: faturado
```

## Papéis por etapa
- Parceiro B2B gestor: compra pela própria empresa; técnico isolado não compra.
- Gestor comercial: análise, ajustes, reprovação.
- Financeiro/Gestor/Admin: crédito, títulos, estorno/cancelamento.
- Produção/Operador: OS, lote, envase, estoque.
- Técnico de qualidade: CQ.
- Logística/Operador: entrega e comprovantes.
- Financeiro + Fiscal: faturamento e nota.

## Situação atual (limites conhecidos)
- Escrita de pedidos e contabilidade real: ainda contidas/pendentes de homologação.
- Faturamento `na_entrega` pós-entrega: não homologado.
- Emissão fiscal: apenas homologação/mock; emissão e cobrança reais proibidas.
- Comunicação externa (e-mail/WhatsApp): desligada.
- SU-518022: adiado.

## Próximo passo sugerido
Se aprovar, posso gerar este fluxo como diagrama em PDF/imagem para apresentação, sem alterar o sistema.
