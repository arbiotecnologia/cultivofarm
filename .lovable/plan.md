# Gate de prontidão fiscal — correção local auditável

## Escopo e segurança
- Trabalhar exclusivamente no repositório; não consultar ou escrever no Supabase remoto, publicar funções, emitir documentos ou criar certificados, séries ou fixtures persistentes.
- Preservar o destino `swzpzcwiasxmjutrmvkm`, JWT, CORS, permissões e bloqueios de produção/preflight.

## Correções identificadas
1. **Certificado A1:** adicionar o guard canônico nas funções existentes de upload e revogação, antes de criar clientes; validar acesso à empresa com a identidade autenticada antes de usar privilégios de serviço ou gravar ciphertext.
2. **Revogação:** falhar de forma explícita se a leitura do material falhar; preservar o caminho do objeto para nova tentativa quando sua remoção falhar, evitando limpeza falsamente concluída.
3. **Interface do certificado:** interpretar apenas códigos permitidos nas respostas de erro, sem ecoar mensagens internas; bloquear envios simultâneos, limpar material temporário e atualizar prontidão após upload/revogação. Corrigir textos que dizem que a senha é cifrada/persistida: ela serve apenas para abrir o A1 em memória.
4. **Série NF-e:** corrigir a desconexão comprovada entre `nfe_series` textual na tela e `nfe_series_number`/`nfe_environment_code` usados pelo gate. Integrar a edição à configuração existente, com série inteira 1–999 e ambiente 2. O contador canônico fica em `fiscal_document_series`, com faixa 0–999999999; não criar escrita direta desprotegida nem reservar numeração como atalho de cadastro. Preparar o contrato local seguro necessário se não existir caminho administrativo autorizado.
5. **Estados da tela:** corrigir somente problemas comprovados de erro, carregamento, repetição e disposição em telas pequenas; manter os fluxos atuais.

## Provisionamento do bucket
O bucket ausente é um bloqueio remoto confirmado pelo operador. As ferramentas desta plataforma exigem criação/configuração de buckets pela **Storage API**, não SQL em `storage.buckets`; migrations locais também são gerenciadas pela ferramenta de migrations, cuja execução remota está proibida nesta rodada.

Preparar um artefato versionado de provisionamento **não executado**, com nome `fiscal-certificates`, privado, limite 10485760 bytes e MIME `application/octet-stream`, instruções idempotentes e reversão segura que preserve objetos existentes. Não apresentar esse artefato como migration SQL aplicada ou criar uma migration vazia que sugira provisionamento concluído. Registrar expressamente essa diferença em relação à entrega solicitada.

## Validação e entrega
- Testes de contrato e regressão fiscais/configuração: autorização por organização, erro saneado, limpeza/retry, duplicação, faixas numéricas e gates.
- Conferir sinais automáticos de build/typecheck; não afirmar validação não executada. Testes visuais locais somente sem acesso a dados remotos; sem mocks no produto.
- Relatório com arquivos, achados, correções, evidências, limitações e identificador de commit disponível (commits são gerenciados pela plataforma).
- Homologação com A1/senha/série reais, provisionamento e deploy permanecem bloqueados até execução autorizada pelo operador.

## Detalhes técnicos
- Reutilizar o helper canônico compartilhado e os helpers/RLS H15; não relaxar ACL nem alterar migrations H13–H16.
- Separar autorização autenticada das operações elevadas de Storage; manter respostas sem senha, PFX, ciphertext, IV, caminhos, stack ou segredos.
- Concluir a revisão independente de certificado antes das alterações; documentar quaisquer lacunas adicionais confirmadas, sem ampliar regras fiscais.