# Gate D51 — reconciliação, hardening e certificação técnica

## Objetivo
Reconciliar o código atual com o Supabase canônico, corrigir apenas P0/P1 diretamente ligados ao D51 e emitir evidências sem publicar, enviar e-mails, criar usuários ou processar pedidos reais.

## Fases

1. **Inventário e reconciliação somente leitura**
   - Mapear o fluxo existente de empresa, onboarding, convite, provisionamento, retomada, reprocessamento, reenvio e primeiro acesso.
   - Comparar migrations locais com objetos efetivamente aplicados no projeto `swzpzcwiasxmjutrmvkm`.
   - Inventariar tabelas, colunas, constraints, índices, RLS, grants, triggers e funções relevantes.
   - Localizar o pedido legado em estado solicitado apenas por leitura e registrar o que precisará ser revalidado futuramente.

2. **Classificação do gate**
   - Classificar achados em P0/P1/P2, distinguindo falha comprovada, risco estrutural e item não verificável com segurança.
   - Verificar especialmente: orquestração real, estados terminais, idempotência, concorrência, lease/fencing, fronteira Auth↔Postgres, reenvio sem duplicação, URLs/tokens de autenticação e separação cadastro geral versus fiscal.
   - Rodar advisors de segurança e desempenho e filtrar apenas achados relacionados ao D51.

3. **Correções mínimas P0/P1**
   - Reutilizar estruturas e fluxos existentes; não criar módulos, rotas, tabelas ou caminhos paralelos sem necessidade comprovada.
   - Aplicar mudanças de banco por migration versionada, idempotente e sem operação destrutiva, com forward-fix documentado.
   - Preservar estado pendente em falhas, impedir adoção por e-mail sem prova de origem/vínculo e remover qualquer autorização baseada em metadados do usuário ou identificador de organização fornecido pelo cliente.
   - Garantir grants mínimos, `search_path` seguro e autorização interna para rotinas privilegiadas.

4. **Testes seguros**
   - Executar typecheck, suíte atual, testes D51 focados e build.
   - Cobrir autorização negativa, tenant cruzado, duplicidade, retomada, reenvio simultâneo, cadastro geral simultâneo e estados terminais.
   - Testar lease/fencing e hard-crash Auth↔DB apenas com harness transacional/mocks ou identidades de teste já existentes, sem criar conta, enviar convite ou alterar senha real.
   - Confirmar ausência de tokens, OTPs e senhas nos logs e proteção contra open redirect.

5. **Relatório e decisão**
   - Produzir relatório técnico versionado com estado encontrado, diferenças do D51 anterior, achados, correções, migrations, arquivos, controles revisados, comandos/exits, evidências, limitações, rollback/forward-fix e pendências.
   - Encerrar com decisão objetiva: apto ou não para homologação real de Auth/SMTP.
   - Não publicar, não avançar ao D52 e não executar envio ou pedido real.

## Critérios de parada
- Qualquer dúvida sobre identidade real, pedido real ou efeito irreversível será tratada em modo somente leitura.
- Sem sessão segura ou fixture já existente, o caminho autenticado será marcado como **não verificado**, nunca presumido.
- Qualquer P0/P1 aberto ao final bloqueia avanço para homologação real.

## Detalhes técnicos
- O vínculo deve permanecer no ref canônico `swzpzcwiasxmjutrmvkm`; qualquer divergência interrompe escritas.
- Alterações de esquema usarão exclusivamente migrations; nenhum dado de produção será apagado.
- O relatório separará evidência estática, consulta aplicada, teste automatizado e teste autenticado real.
