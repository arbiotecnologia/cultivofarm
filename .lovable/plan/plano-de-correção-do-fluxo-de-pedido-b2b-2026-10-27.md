# Plano de correção do fluxo de pedido B2B

Base: auditoria de 27/10/2026, feita só em leitura. Cada etapa gera um pacote que fica parado até alguém revisar. Não vou rodar nada no banco de produção nem publicar sozinho. O auditor aplica e homologa com sessões reais A/B. Contabilidade real e SU-518022 continuam pendentes.

## Etapa 1 — Testes (sem risco, só no código de teste)
1. **myPartner.session (4 falhas):** comparar com a versão anterior para saber se o problema é novo ou já existia. Se for problema do teste, corrigir o teste. Se for defeito da tela, corrigir a tela com o menor ajuste possível e incluir um teste mostrando que a empresa parceira aparece e que os dados de outra empresa não aparecem.
2. **c2-internal-order-entry-postgres:** trocar o texto esperado "30 PASS" pelo resultado real de 54 verificações.
3. **partnerCatalogMonitor (10 falhas que já existiam):** só registrar que já existiam. Não vou mexer nelas nesta etapa.

## Etapa 2 — Levantamento de quem grava cada tabela (só leitura)
Para cada tabela abaixo, listar todos os pontos que gravam dados: telas, funções do servidor, rotinas automáticas e gatilhos.
- Ordens de serviço e seu histórico de status
- Entregas
- Lotes
- Contas a receber e parcelas
- Notas fiscais e itens da nota

Para cada tabela, o resultado mostra se ainda há alguma tela gravando direto ou se tudo já passa pelo fluxo oficial. Também mostra quais rotinas de serviço precisam continuar com acesso.

## Etapa 3 — Fechar a gravação direta em ordens de serviço e entregas (pacote parado)
Seguir o mesmo padrão já usado nas visitas e nos alertas agronômicos:
- Bloquear inclusão, alteração e exclusão diretas por usuário logado, com regras específicas para cada ação.
- Manter a leitura e a separação entre empresas.
- Manter as funções oficiais do servidor e as rotinas de serviço funcionando.
- Se alguma tela gravar direto, primeiro trocar essa tela para a função oficial, sem criar fluxo paralelo.
- O pacote inclui:
  - conferência antes da instalação, com códigos de versão e permissões;
  - script de instalação;
  - conferência depois da instalação;
  - contenção de emergência que só bloqueia e nunca devolve a falha.
- Testes no banco descartável:
  - gravação direta negada para usuário logado e para anônimo;
  - funções oficiais funcionando;
  - acesso entre as empresas A e B negado;
  - saltos de status bloqueados.

## Etapa 4 — Mesmo tratamento para lotes, contas a receber, parcelas e fiscal
Fazer um pacote separado para cada grupo, na mesma ordem de risco: contas a receber/parcelas, depois lotes, depois fiscal. Nesses pacotes:
- Lançamentos financeiros e notas já gravados continuam sem poder ser alterados.
- Não mudo nenhuma regra de imposto ou de contabilidade.
- A emissão fiscal real continua proibida.

## Etapa 5 — Retirar a permissão de leitura do usuário anônimo
Listar as tabelas do fluxo que ainda dão leitura ao anônimo. Hoje o controle de acesso já bloqueia. Mesmo assim, preparar a retirada dessa permissão, com conferência de que nenhuma tela pública depende dela, como o login e a página de redefinir senha.

## Etapa 6 — Cobrança na entrega
Revisar só em leitura o caminho da cobrança gerada na entrega: a categoria de receita e o método de pagamento ativos, a separação entre empresas e o funcionamento quando a mesma ação é repetida. Registrar o que falta. Não vou ativar nada.

## Fora deste plano (continua fechado por decisão)
- Gravação de pedidos C2
- Contabilidade real
- Emissão real na Sefaz
- Envio de e-mail e WhatsApp

## Detalhes técnicos
- Os pacotes ficam em `scripts/<tema>-20261027/`: arquivos `*.sql.review`, `AGENTS.md` e `README.md`, além de testes PostgreSQL descartáveis com Auth sintética, identificados como sintéticos.
- O padrão das regras é `AS RESTRICTIVE FOR INSERT/UPDATE/DELETE TO authenticated USING(false)`, que preserva o SELECT e as RPCs SECURITY DEFINER do owner postgres.
- Conferências antes e depois da instalação: hash md5 de `prosrc` e `proconfig`, ACL, policies e fingerprint dos gatilhos.
- Validação local: vitest focado, typecheck e build.
