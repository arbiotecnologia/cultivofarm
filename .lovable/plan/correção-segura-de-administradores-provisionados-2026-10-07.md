# Correção segura de administradores provisionados

## Resultado
Corrigir a aba existente, sem módulos paralelos: confirmação real do novo e-mail, reenvio conforme estado e gestão de senha provisória ou link para senha própria. Senhas definitivas nunca ficam disponíveis ao operador.

## Auditoria concluída
- A mudança atual usa `email_confirm: true`, efetivando a troca sem confirmação do destinatário.
- A senha provisória tem barreira na tela, mas os helpers de autorização empresarial não verificam essa pendência; falta expiração explícita.
- Convites já têm intenção, lease, fencing, cooldown e SMTP compartilhado. Reutilizar esses contratos.
- O provedor está configurado em modo teste com porta 465. Isso não comprova entrega real nem autoriza alterar flags/SMTP.
- Auth e banco são sistemas separados; confirmação, revogação e reconciliação precisam de evidência funcional.

## Implementação
1. Estender operações e auditoria existentes com estados de confirmação/envio, prazo, tentativas, cancelamento e reconciliação idempotente.
2. Substituir a troca imediata por links Auth de confirmação enviados pelo provedor canônico. Manter e-mail antigo até confirmação verificada. Não permitir confirmação manual. Implementar cancelamento somente se os links antigos puderem ser neutralizados com segurança; caso contrário, bloquear e registrar essa limitação.
3. Integrar senha provisória ao guard canônico, com prazo de 24 horas, geração criptográfica no servidor, exibição única e revogação. Liberar somente após senha própria atualizada pelo usuário e confirmação server-side.
4. Adicionar “Gerenciar acesso”, confirmação do novo e-mail, estado real de acesso, último envio/cooldown, reenvio e copiar/ocultar senha provisória na aba atual.
5. Executar testes focados e suíte, lint focal, scanners, diagnóstico automático de build/typecheck e advisors; verificar UI autenticada quando disponível.
6. Atualizar roadmap e relatório com evidências PASS/FAIL/BLOCKED e GO/NO-GO. Não avançar B2B.

## Detalhes técnicos e limites
- Apenas Supabase canônico `swzpzcwiasxmjutrmvkm`; migrations forward-only e Edge Functions autorizadas. Não publicar frontend.
- Não escrever diretamente nas tabelas gerenciadas Auth, nem alterar planos, preço, B2B, fiscal ou cobrança.
- Reutilizar `platform_org_admin_email_changes`, convites, auditoria, `platform-complete-first-access` e autorização H15; evitar policies redundantes.
- APIs de revogação/cancelamento devem ser verificadas antes de implementar; não prometer revogação de JWT já emitido sem barreira server-side comprovada.
- Sem credencial Auth Admin ou sessão real no ambiente, testes autenticados e entrega ficam BLOCKED, não PASS.