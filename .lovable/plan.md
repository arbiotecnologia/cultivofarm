# Plano Técnico: Correção do Fluxo de Reserva e Entrega AR Bio

O diagnóstico revelou que o ambiente atual do sandbox está desconectado do banco de dados Staging (`ikaauvsflpmamgxmkhoq`), resultando em um banco de dados vazio onde as funções canônicas de reserva (`reservar_estoque_item`) e os dados de teste (OS e Estoque) não existem.

## 1. Recuperação da Conexão e Ambiente
A falha "não aceitando reservar" é um sintoma da ausência da função `reservar_estoque_item` no banco atual.
- **Ação:** Restaurar o binding correto com o projeto `ikaauvsflpmamgxmkhoq` (Staging).
- **Verificação:** Validar a presença do marcador `public._fiscal_staging_marker` antes de qualquer operação.

## 2. Padronização do Motor de Reserva (Frontend)
O componente `RegistrarEntregaDialog.tsx` está operando com estados locais e lógica de pré-carregamento que pode falhar se a OS não possuir reserva prévia.
- **Melhoria:** Unificar o comportamento do botão "Reservar por lotes agora" para que ele realize a reserva transacional via RPC antes de prosseguir para o registro da entrega.
- **Garantia:** Impedir a seleção de lotes que já possuem reserva para outras OSs sem o "Override" explícito do operador.

## 3. Fluxo Correto Certificado
O fluxo determinado para a OS AR Bio deve seguir esta ordem determinística:
1. **Produção/Envase:** O lote deve estar envasado e com CQ aprovado.
2. **Estoque Disponível:** O sistema gera itens em `estoque_produto` com status `disponivel`.
3. **Reserva Transacional:** Chamada à `rpc_estoque_operar_v1(acao='reserva')` ou `reservar_estoque_item`. Isso muda o status para `reservado` e vincula ao `os_id`.
4. **Registrar Entrega:** O diálogo de entrega consome apenas itens `reservado` para a OS em questão.
5. **Confirmação:** A entrega é confirmada, disparando a baixa definitiva do estoque.

## 4. Próximos Passos (Execução)
- Aplicar a correção de binding para o Staging.
- Re-executar as migrations de hardening de reserva se necessário.
- Testar o E2E: Criar OS -> Produzir/Envasar -> Reservar -> Entregar.

---
**Status:** AGUARDANDO BINDING PARA FASE_3_1B_RESERVA
