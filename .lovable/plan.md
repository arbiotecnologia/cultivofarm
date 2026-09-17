# Espaçamento uniforme no cadastro fiscal da empresa

## Ajuste proposto
- Usar **6 px entre o nome do campo e o controle** em toda a aba Empresa, incluindo CNAE principal e secundários.
- Manter os campos alinhados pelo topo, sem aumentar a distância entre rótulo e controle quando o campo vizinho possui texto de ajuda.
- Preservar as duas colunas no computador, a disposição no celular, cores, tipografia, bordas e botões existentes.
- Não alterar dados, validações, consultas, permissões nem regras fiscais.

## Detalhes técnicos
- O `FieldRow` utiliza grid com `gap-1.5`; o bloco de CNAEs utiliza `space-y-1.5` e `space-y-2`. Uniformizar esses agrupamentos com espaçamento de 6 px e distribuição vertical pelo início, evitando expansão das linhas internas do grid.
- Manter o espaçamento entre grupos de campos separado do espaçamento rótulo–controle; textos de ajuda e erros devem continuar abaixo de seus respectivos campos.

## Verificação
- Conferir a aba Empresa inteira em computador e celular, especialmente CNPJ/Razão social, Fantasia/IE, Regime/CRT e CNAEs.
- Verificar que textos de ajuda não desalinhem os controles e que descrições longas continuem legíveis.
- Executar testes focados e verificar os resultados automáticos de compilação e tipos disponíveis. A conferência autenticada depende da validação prévia da conexão canônica; interromper se houver divergência.
- Sem publicação ou alterações no banco.
