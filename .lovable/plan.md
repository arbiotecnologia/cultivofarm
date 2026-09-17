# Refinamento do bloco de CNAEs da empresa

## Objetivo
Reorganizar somente os campos de CNAE na aba **Empresa**, seguindo a direção visual escolhida: lista em largura total, tipografia atual e verde fiscal discreto.

## Alterações visuais
- Fazer o bloco de CNAEs ocupar toda a largura disponível, evitando que descrições longas sejam cortadas pela grade de duas colunas.
- Manter o **CNAE principal** separado e exibir seu código e sua descrição completos em uma área de leitura clara.
- Substituir os pequenos chips dos **CNAEs secundários** por linhas individuais, com:
  - código destacado;
  - descrição oficial completa, com quebra de linha quando necessário;
  - botão de remover sempre visível e com nome acessível.
- Criar o botão explícito **Adicionar CNAE secundário**, com ícone de adição e destaque verde moderado.
- Ao acionar o botão, abrir o seletor pesquisável já existente; a escolha adicionará o item à lista e fechará a busca.
- Manter um estado vazio simples quando não houver CNAEs secundários.
- Adaptar a organização para telas menores sem truncar código, descrição ou ações.

## Comportamento preservado
- Continuar consultando exclusivamente o catálogo fiscal vigente.
- Não aceitar CNAE secundário duplicado nem igual ao CNAE principal.
- Preservar valores antigos e todas as validações e regras de salvamento atuais.
- Não alterar banco, regras fiscais, rotas, permissões ou outras abas.

## Implementação técnica
- Ampliar o resolvedor já existente para obter, em uma única consulta, as descrições do CNAE principal e de todos os secundários exibidos.
- Ajustar o seletor reutilizável para permitir que um botão externo controle sua abertura, sem criar um segundo mecanismo de consulta.
- Usar apenas componentes e tokens visuais existentes; o verde será aplicado por papéis semânticos do tema, sem cores fixas no componente.
- Garantir estados seguros de carregamento, erro de resolução e código legado, sem ocultar o código salvo.

## Validação
- Testar abertura pelo botão, inclusão, prevenção de duplicidade, remoção e exibição da descrição completa.
- Conferir o bloco em desktop e celular.
- Executar os testes fiscais e de configuração, verificação de tipos e compilação.
- Confirmar que não houve publicação nem alteração de banco.
