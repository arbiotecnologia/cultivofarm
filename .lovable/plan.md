# Natureza da operação com seleção e opções personalizadas

## Objetivo
Substituir a digitação totalmente livre por uma seleção pesquisável, sem limitar operações legítimas e sem criar um fluxo fiscal paralelo.

## Como ficará
- Trocar **Natureza padrão da operação** por um campo pesquisável no mesmo estilo visual dos demais campos da página.
- Exibir primeiro as naturezas disponíveis nas políticas fiscais publicadas e uma lista curta de opções operacionais usuais já suportadas.
- Incluir a ação **Adicionar natureza personalizada** dentro do seletor.
- Ao adicionar, abrir uma janela simples para informar o texto, validar, salvar e selecionar imediatamente.
- Permitir localizar opções pelo texto, mostrar a natureza completa sem corte e indicar visualmente as opções personalizadas.
- Permitir editar ou excluir uma opção personalizada, desde que isso não apague nem altere documentos já preparados.
- Manter a opção atualmente gravada mesmo que ela não esteja mais na lista, exibindo um aviso para revisão.

## Regras de segurança fiscal
- A natureza configurada será apenas um **padrão de preenchimento**, nunca autoridade para definir CFOP ou tributação.
- Políticas fiscais publicadas e cenários legais com texto obrigatório continuam prevalecendo no servidor.
- Não associar automaticamente uma natureza personalizada a CFOP, CST, imposto ou tipo de operação.
- Normalizar espaços, impedir valores vazios ou duplicados e manter o limite atual de 200 caracteres.
- Preservar o texto materializado nos documentos existentes; alterações na lista só afetam novas seleções.

## Aplicação no fluxo
- Usar o mesmo seletor em **Configuração Fiscal > NF-e** e na etapa **Documento** da preparação da nota.
- Na preparação, iniciar com a natureza padrão configurada, permitindo escolher outra opção cadastrada.
- Quando o servidor resolver uma natureza obrigatória pela política fiscal, apresentar o valor resolvido sem permitir substituição incoerente.

## Persistência
- Reutilizar a configuração fiscal existente para guardar as opções personalizadas da empresa, evitando uma nova tabela apenas para esse campo.
- Manter compatibilidade com o valor textual já salvo em `default_nature` e com rascunhos existentes.
- Nenhuma mudança no motor fiscal, nas rotas ou nas permissões.

## Validação
- Testar pesquisa, seleção, inclusão, duplicidade, edição, exclusão e preservação de valor legado.
- Testar preenchimento padrão no rascunho e precedência das naturezas obrigatórias resolvidas pelas políticas fiscais.
- Conferir harmonia visual e texto integral em computador e celular.
- Executar os testes fiscais e de configurações, verificação de tipos e compilação.
- Não publicar nem alterar o banco nesta etapa.
