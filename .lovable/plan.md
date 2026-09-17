# Refinamento do bloco de CNAEs da empresa

## Objetivo
Melhorar a leitura e inclusão dos CNAEs mantendo a harmonia de toda a aba **Empresa**. A página existente será a referência visual: mesma tipografia, cores, rótulos, bordas, botões e espaçamentos. A direção escolhida orienta a organização em lista, não um estilo exclusivo para CNAEs.

## Alterações visuais
- Avaliar o conjunto da aba Empresa e integrar os CNAEs à sequência dos demais campos, mantendo alinhamentos e ritmo vertical; não criar um cartão decorativo, cabeçalho ou paleta próprios para esse bloco.
- Fazer o bloco de CNAEs ocupar toda a largura disponível, evitando que descrições longas sejam cortadas pela grade de duas colunas.
- Manter o **CNAE principal** separado e exibir seu código e sua descrição completos em uma área de leitura clara.
- Substituir os pequenos chips dos **CNAEs secundários** por linhas individuais, com:
  - código destacado;
  - descrição oficial completa, com quebra de linha quando necessário;
  - botão de remover sempre visível e com nome acessível.
- Criar o botão explícito **Adicionar CNAE secundário**, com ícone de adição e o mesmo padrão dos botões equivalentes da página, sem destaque verde exclusivo.
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
- Usar apenas componentes e tokens visuais existentes, sem mudar a paleta global nem introduzir estilos exclusivos para os CNAEs. Preservar o verde somente onde já fizer parte do padrão da página.
- Garantir estados seguros de carregamento, erro de resolução e código legado, sem ocultar o código salvo.

## Validação
- Testar abertura pelo botão, inclusão, prevenção de duplicidade, remoção e exibição da descrição completa.
- Conferir a aba Empresa inteira em desktop e celular, incluindo a transição entre os CNAEs e os campos vizinhos, para validar harmonia, alinhamento e ausência de cortes ou sobreposições.
- Executar os testes fiscais e de configuração, verificação de tipos e compilação.
- Confirmar que não houve publicação nem alteração de banco.
