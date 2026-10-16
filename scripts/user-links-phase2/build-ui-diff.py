"""Generate review-only diff; never modifies runtime files."""
from pathlib import Path
import difflib
ROOT=Path(__file__).resolve().parents[2]
patch=[]
def add(path,old,new):
 patch.extend(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/'+path,tofile='b/'+path))
p='src/lib/configuracoes/userLinks.ts';s=(ROOT/p).read_text();n=s.replace('  user_id: string;\n  clientes:', '  user_id: string;\n  expected_version?: string;\n  clientes:')
n=n.replace('    out.set(user_id, { user_id, clientes, parceiro, parceiros_total, fora_do_alcance: contagem(it.fora_do_alcance) });', '''    if (it.expected_version !== undefined && (typeof it.expected_version !== "string" || !/^[a-f0-9]{64}$/.test(it.expected_version))) throw new Error(INVALIDA);
    out.set(user_id, { user_id, expected_version: it.expected_version as string | undefined, clientes, parceiro, parceiros_total, fora_do_alcance: contagem(it.fora_do_alcance) });''');add(p,s,n)
p='src/pages/Configuracoes.tsx';s=(ROOT/p).read_text();n=s.replace('import { carregarVinculosUsuarios }', '''import { EXTERNAL_USER_EDIT_PHASE2_REVIEWED, submitCommonExternalEditCandidate } from "@/lib/configuracoes/externalUserEditCandidate";
import { carregarVinculosUsuarios }''')
n=n.replace('  const editSomenteLeitura = edicaoBloqueadaPorTipo(editTipo);', '''  const [externalEditSnapshot, setExternalEditSnapshot] = useState<{ userId: string; actorId: string; orgId: string; version: string; key: string } | null>(null);
  const [externalEditReason, setExternalEditReason] = useState("");
  const externalCommonCandidate = EXTERNAL_USER_EDIT_PHASE2_REVIEWED && ["producer", "b2b"].includes(editTipo);
  const editSomenteLeitura = edicaoBloqueadaPorTipo(editTipo) && !externalCommonCandidate;
  useEffect(() => {
    if (!editOpen) { setExternalEditSnapshot(null); setExternalEditReason(""); return; }
    if (externalEditSnapshot && (externalEditSnapshot.userId !== editUser?.user_id || externalEditSnapshot.actorId !== user?.id || externalEditSnapshot.orgId !== profile?.organization_id)) { setExternalEditSnapshot(null); setExternalEditReason(""); return; }
    if (!externalCommonCandidate || externalEditSnapshot || !editUser?.user_id || !user?.id || !profile?.organization_id || vinculos.isError || vinculos.isFetching) return;
    const version = vinculos.data?.get(editUser.user_id)?.expected_version;
    if (version) setExternalEditSnapshot({ userId: editUser.user_id, actorId: user.id, orgId: profile.organization_id, version, key: crypto.randomUUID() });
  }, [editOpen, editUser?.user_id, user?.id, profile?.organization_id, externalCommonCandidate, externalEditSnapshot, vinculos.data, vinculos.isError, vinculos.isFetching]);''')
n=n.replace('      if (editSomenteLeitura) throw erroLocalEdicao(MSG_EDICAO_EXTERNA_INDISPONIVEL);', '''      if (editSomenteLeitura) throw erroLocalEdicao(MSG_EDICAO_EXTERNA_INDISPONIVEL);
      if (externalCommonCandidate) {
        if (!externalEditSnapshot || externalEditSnapshot.userId !== editUser.user_id || externalEditSnapshot.actorId !== user?.id || externalEditSnapshot.orgId !== profile?.organization_id || vinculos.isError || vinculos.isFetching) throw erroAmbiguoEdicao();
        const candidateClient = supabase as unknown as Parameters<typeof submitCommonExternalEditCandidate>[0];
        await executarComDeadlineEdicao(async signal => {
          if (!signal) throw erroAmbiguoEdicao();
          return submitCommonExternalEditCandidate(candidateClient, {
            userId: editUser.user_id, expectedUpdatedAt: editUser.updated_at,
            expectedVersion: externalEditSnapshot.version, idempotencyKey: externalEditSnapshot.key,
            reason: externalEditReason, roles: editOrig?.roles ?? [],
            profile: { nome: editUser.nome, telefone: unmask(editUser.telefone ?? ""), cargo: editUser.cargo,
              cpf_cnpj: unmaskCpfCnpj(editUser.cpf_cnpj), crea: editUser.crea, especialidade: editUser.especialidade },
          }, signal);
        });
        return { rolesChanged: false, userId: editUser.user_id };
      }''')
n=n.replace('                    {!editSomenteLeitura && <div>', '                    {editTipo === "internal" && <div>')
n=n.replace('                    <fieldset disabled={editSomenteLeitura}', '                    {externalCommonCandidate && <div><Label>Motivo</Label><Input value={externalEditReason} onChange={e => setExternalEditReason(e.target.value)} maxLength={500} /></div>}\n                    <fieldset disabled={editSomenteLeitura || (externalCommonCandidate && !externalEditSnapshot)}')
n=n.replace('      queryClient.invalidateQueries({ queryKey: ["admin-users"] });\n      queryClient.invalidateQueries({ queryKey: ["partner-users-links"] });', '      queryClient.invalidateQueries({ queryKey: ["admin-users"] });\n      queryClient.invalidateQueries({ queryKey: ["admin-user-links"] });\n      queryClient.invalidateQueries({ queryKey: ["partner-users-links"] });')
add(p,s,n)
(ROOT/'scripts/user-links-phase2/ui-closed.patch.review').write_text(''.join(patch))
