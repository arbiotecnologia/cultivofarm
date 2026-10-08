# P1B — proposta inativa, não aplicada

`mandate-schema.proposed.sql` é uma proposta de migration, **não é uma migration
executada nem fonte de autorização operacional**. Nenhum vínculo real ou fixture
persistente foi criado. BF01–03 e leitores financeiros P1A permanecem fechados.

## Decisões ainda necessárias

- Contrato revisado por A e P por ação, cliente alvo e equipe própria. Não conceder
  administração cruzada por pertencer a um dos lados.
- Credor, devedor e emissor explicitamente escolhidos e comprovados por operação;
  credor/emissor podem ser distintos somente com fundamento contratual/contábil.
- NF-e modelo 55 versus NFS-e depende de mercadoria/serviço real e município,
  nunca do papel do usuário. Não escolher emissor pelo tenant do comprador.
- As referências de evidência não contêm credenciais, certificados ou PII.

## Revisão e ativação

A proposta armazena apenas DRAFTs imutáveis, RLS negativa e nenhuma RPC de
ativação. O grant técnico não ativa um mandato: trigger rejeita status/revisão
aprovados. Não executar até revisar idempotência da migration e testes PostgreSQL.
Uma futura revisão precisa de RPC com identidade ativa, tenant, RBAC, feature,
aceites independentes A/P e ticket privado, sem flags GUC autorizadoras.

O pedido deve referenciar a revisão exata e snapshot, jamais resolver a mais
recente. Atribuições usam escopo de cliente/recurso específico além do mandato.
Recebível e nota devem validar credor/devedor/emissor contra esse snapshot antes
de replay. A proposta não altera endpoints existentes ou seus grants.

## Provas e rollback

`contract-cases.readonly.sql` testa **predicado contratual simulado** com VALUES,
sem Auth/fixtures de negócio. Pode ser executado com SELECT canônico após conferir
o marcador. Não comprova RLS, RPC, JWT, transação mutável ou concorrência.

Para futura prova integrada: manifesto aleatório TEMPORARY_AUDIT, IDs exatos,
hashes antes/depois, BEGIN, ator existente com ROLE/claims simulados, inserts pelo
fluxo canônico sem regrant, positivo A/P e negações, replay e ROLLBACK obrigatório.
Não desativar triggers de organizations ou usar service_role como caller. Sem
executor transacional seguro, NÃO EXECUTAR fixtures. Nunca tocar contas/Auth.

Rollback atual é no-op: nada aplicado. Se futuramente aplicado, não apagar
mandatos/histórico; successor mantém policy false, bloqueia ativação e remove
somente integrações comprovadamente novas. Não restaurar ACL vulnerável.