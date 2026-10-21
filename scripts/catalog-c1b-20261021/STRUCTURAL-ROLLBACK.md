# Reversão estrutural — somente documentação, não executar

A baseline histórica permanece em `live-snapshot.json` para auditoria, não como recuperação executável.
Restaurar seus corpos removeria o filtro de visibilidade e não é rollback seguro.

Recuperação segura: reverter exclusivamente o frontend usando `frontend-safe-reversal.patch`,
mantendo os corpos antigos **já restringidos** pelo C1B, helper privado e overloads no servidor.
A baseline C1 chama as assinaturas antigas, que continuam com filtro fornecedor/empresa parceira.
Nenhum rollback SQL automático é fornecido. Falha de RPC não autoriza fallback sem filtro.

Uma eventual remoção estrutural exige outro patch revisado que mantenha filtragem equivalente
nas assinaturas antigas, provas REST A/B e revisão de dependências/ACL; não restaurar snapshot histórico.