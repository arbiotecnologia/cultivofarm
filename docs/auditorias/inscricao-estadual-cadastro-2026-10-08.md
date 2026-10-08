# Inscrição estadual — cadastro de clientes/parceiros

## Escopo focal
Imagem fornecida: `510.193.600/89` era bloqueada com mensagem de MG exigir 13 dígitos. O cadastro comercial não deve certificar inscrição fiscal nem aplicar máscara destrutiva baseada no endereço.

- Campo compartilhado sem máscara fixa nos formulários `ClienteFormTabs` e `ParceiroB2BFormDialog`.
- Schema sintático separado: opcional, até 20 caracteres (limite adotado dos campos cadastrais existentes), letras/números e separadores usuais; conteúdo de controle/markup e somente separadores rejeitados.
- UF/DV divergentes geram aviso, não erro que impede cadastro. Vazio vira null; ISENTO normalizado; separadores removidos na persistência, preservando zeros e prefixos alfabéticos sem depender da UF.
- `ProdutoresTab` e parceiro usam a normalização cadastral; validação estrita de emissão fiscal permanece intacta.

## Limites
Somente frontend, testes e documentação. Sem SQL, migrations, gravações reais, Auth, mudanças de papéis/vínculos, envios ou publicação. Não habilita cadastro de usuários B2B nem reabre checkpoints anteriores. Validação server-side/RLS existente não alterada; salvar via API e navegador autenticado não comprovado nesta rodada.

## Verificação
Resultados locais registrados após execução dos testes; compilação automática conferida. Rollback focal: restaurar os campos/handlers anteriores e remover schema/componente compartilhados e importações, sem operação de banco.