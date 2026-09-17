# Espaçamento uniforme em todo o módulo fiscal

## Ajuste proposto
- Usar **6 px entre o nome do campo e o controle** em todas as páginas do módulo fiscal, incluindo CNAE principal e secundários.
- Manter os campos alinhados pelo topo, sem aumentar a distância entre rótulo e controle quando o campo vizinho possui texto de ajuda.
- Preservar as duas colunas no computador, a disposição no celular, cores, tipografia, bordas e botões existentes.
- Não alterar dados, validações, consultas, permissões nem regras fiscais.

## Abrangência
- Configuração Fiscal: Empresa, Produtos, Serviços e Clientes, incluindo todas as abas e formulários associados.
- Documentos Fiscais, Prontidão e Reconciliação: padronizar campos de formulários e filtros, incluindo janelas e etapas de preparação vinculadas a essas páginas.
- Antes de implementar, mapear os componentes usados nessas páginas para incluir campos internos e evitar mudanças involuntárias em outros módulos.
- Aplicar o mesmo padrão visual em todo o conjunto, sem redesenhar páginas, alterar a organização dos campos ou compactar tabelas e textos que não sejam rótulos de controles.

## Detalhes técnicos
- O `FieldRow` utiliza grid com `gap-1.5`; o bloco de CNAEs utiliza `space-y-1.5` e `space-y-2`. Uniformizar esses agrupamentos com espaçamento de 6 px e distribuição vertical pelo início, evitando expansão das linhas internas do grid.
- Manter o espaçamento entre grupos de campos separado do espaçamento rótulo–controle; textos de ajuda e erros devem continuar abaixo de seus respectivos campos.
- Inspecionar os agrupamentos das demais páginas antes de ajustá-los: usar o mesmo espaçamento e alinhamento inicial, respeitando controles especiais como caixas de seleção e interruptores com rótulo ao lado.
- Limitar a alteração aos componentes fiscais; se um componente for compartilhado com outros módulos, usar uma opção localizada em vez de mudar seu padrão global.

## Verificação
- Conferir todas as páginas fiscais abrangidas em computador e celular, incluindo abas, filtros e janelas com campos; na Empresa, verificar especialmente CNPJ/Razão social, Fantasia/IE, Regime/CRT e CNAEs.
- Verificar que textos de ajuda não desalinhem os controles e que descrições longas continuem legíveis.
- Executar os testes fiscais e de configurações pertinentes e verificar os resultados automáticos de compilação e tipos disponíveis. A conferência autenticada depende da validação prévia da conexão canônica; interromper se houver divergência.
- Sem publicação ou alterações no banco.
