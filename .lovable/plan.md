# Plano — P0.3 Atualização manual autenticada

## Objetivo
Refinar o atualizador para avisar somente quando existir uma versão futura, manter qualquer navegação dependente de clique explícito e disponibilizar a verificação manual nos cabeçalhos autenticados.

## Fases
1. **Estado global e detecção**
   - Consolidar os estados `hidden | prompt | applying | error` e as origens `automatic | login | manual`.
   - Preservar `cultivo-build-id`, fallback pelo arquivo principal, recuperação de versão obsoleta e cadência única de 10 minutos.
   - Garantir que foco, retorno da conexão e pós-login apenas detectem versões, sem recarregar ou navegar.

2. **Adiar e atualizar**
   - Ao adiar, fechar o aviso e persistir somente o token da versão.
   - Ocultar a mesma versão nos checks automáticos da sessão; reapresentá-la em novo login ou check manual.
   - Proteger “Atualizar agora” contra clique duplo/loop e limpar deferência quando a versão carregada já for a publicada.

3. **Controle nos cabeçalhos**
   - Manter um único `PwaManualCheckButton`, autenticado e ligado ao estado global.
   - Posicioná-lo junto de “Sair” na Gestão da plataforma, administração, produtor, parceiro e equivalentes mobile.
   - Exibir texto no desktop e ícone com tooltip/aria-label no mobile.

4. **Validação A–P**
   - Cobrir prompt, adiamento, novo login, check manual, navegação única, limpeza pós-update, nova versão, autenticação, mensagens persuasive, duplo clique, ausência de overlay/reload e reutilização entre layouts.
   - Executar testes PWA focados, typecheck, build, suíte global e scanner.
   - Fazer inspeção estática para ausência de badge flutuante e atualização automática.

5. **Publicação e evidência**
   - Atualizar auditoria, matriz e roadmap apenas com resultados comprovados.
   - Publicar o frontend uma única vez após os gates verdes.
   - Fazer smoke passivo no domínio oficial, sem clicar em atualização.

## Restrições
- Nenhuma alteração em Supabase, banco, SMTP, E02, REFIL, AR BIO ou SMTP2GO.
- Nenhum envio, retry, probe ou mudança operacional.
- Se um gate falhar, corrigir somente o escopo P0.3 e registrar objetivamente o resultado.

## Premissa
A implementação P0.3 já existente será preservada onde cumprir o contrato; serão feitas apenas correções comprovadamente necessárias antes da nova publicação solicitada.
