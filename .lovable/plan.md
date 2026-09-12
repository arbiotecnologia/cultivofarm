# Pacote único — Simulador e Condições e Preços

## Escopo e proteção
- Alterar somente código e novos artefatos de migration deste projeto; preservar cliente, tipos, configurações, permissões e histórico.
- Não publicar, criar dados de teste nem alterar registros HML/FaseE.
- O conector informado nesta sessão não corresponde ao destino autorizado. Não realizar consultas nem aplicar migrations por esse conector; entregar a migration pendente de aplicação no destino canônico validado.

## 1. Simulador
- Substituir o hook legado pelo `useSimulateB2BPaymentPlan`, sem desconto livre ou custo/margem fictícios.
- Selecionar parceiro ativo, plano selecionável e atribuição publicada aplicável, produto ou microrganismo, unidade, volume, quantidade e primeiro vencimento conforme o plano.
- Reutilizar contratos existentes de catálogo e condições; a elegibilidade e resolução final de preços continuam autoritativas no servidor. Falhas de ficha/regra não serão tratadas como preço zero nem sucesso; cotação será explícita.
- Exibir linhas resolvidas, origem/modo, valores, juros, parcelas, avisos e cotação. Bloquear entradas incompletas, quantidades não finitas ou não positivas.
- Invalidar resultado em qualquer edição, inclusive impedindo que respostas atrasadas restaurem resultados antigos. Incluir carregamento, vazio, erro, retry e labels acessíveis.

## 2. Condições e Preços
- Centralizar validação pura alinhada a `_cpp_validate_payload`: nome/código, enums, desconto e juros 0–100, parcelas inteiras 1–60, meses 0–60, dias inteiros 0–1095, mínimo não negativo e vigência válida.
- Validar os campos efetivamente editáveis em cada modo, mostrar erros inline e bloquear Salvar; manter validação do servidor.
- Associar labels aos campos.
- Compartilhar confirmação de publicação em Atribuições e oferecer arquivamento permitido também no celular.
- Dar à Matriz configurável seleção e ações equivalentes nos dois tamanhos de tela, com confirmação para exclusão/publicação e preservação das restrições por estado/perfil.

## 3. Hardening legado
- Inventariar chamadores no frontend, funções, scripts e testes antes de retirar o hook legado.
- Criar migration nova forward-only para a assinatura `public.rpc_commercial_simulator(uuid,uuid,numeric,numeric)`, sem DROP nem alteração de dados.
- Revogar PUBLIC, anon e authenticated somente após eliminar dependências operacionais identificadas; não manter service_role sem necessidade comprovada. Fixar search_path da função tocada e incluir verificações de contrato e destino fail-closed.
- Caso alguma dependência permaneça ambígua, registrar o bloqueio em vez de revogar acesso às cegas.

## 4. Verificação e entrega
- Testes focados de validação, RPC canônica/erro, invalidação após edição, ausência de custo fictício, formulários, confirmação e paridade móvel.
- Contrato estático da migration e inventário de chamadas legadas.
- Executar testes focados e conferir resultados automáticos de typecheck/build; não executar esses dois comandos manualmente, conforme restrição do ambiente.
- Conferir apresentação sem acessar um backend não autorizado. Checks autenticados dependem de acesso confirmado ao destino canônico.
- Entregar lista de arquivos, nome/status da migration e contagens exatas, distinguindo verificações realizadas e bloqueadas; não declarar aplicação no banco ou homologação autenticada sem evidência.

## Detalhes técnicos
- Manter o singleton existente e o motor `simulate_b2b_payment_plan_secure`; nenhum cliente paralelo.
- Reutilizar `PaymentSimulationSummary` e contratos de condições publicados; não calcular preços operacionais no frontend.
- Compartilhar handlers de ações desktop/mobile para evitar divergências de confirmação e autorização visual.
- Preservar todas as migrations históricas e referências documentais de auditoria.