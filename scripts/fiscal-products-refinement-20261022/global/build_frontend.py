"""Inactive coordinated copies only, no runtime promotion."""
from pathlib import Path
import difflib, hashlib, json
H=Path(__file__).resolve().parent; ROOT=H.parents[2]
changes={}
def edit(path,fn):
 old=(ROOT/path).read_text();new=fn(old);assert old!=new,path;changes[path]=(old,new)
changes['src/hooks/useProductFiscalAccess.ts']=('',(H/'access.ts').read_text())
# Reuse existing query wrapper, injecting only the product-global fence; defaults unchanged.
edit('src/hooks/useScopedPortalQuery.ts',lambda s:s.replace('queryFn: (signal: AbortSignal) => Promise<T> }) {','queryFn: (signal: AbortSignal) => Promise<T> }, access?: { request: ReturnType<typeof useStorageAccessScope>; actor: ReturnType<typeof useStorageAccessScope> }) {').replace('  const fence = useStorageAccessScope(', '  const defaultFence = useStorageAccessScope(',1).replace('  const actor = useStorageAccessScope("portal-query-actor");','  const defaultActor = useStorageAccessScope("portal-query-actor");\n  const fence = access?.request ?? defaultFence;\n  const actor = access?.actor ?? defaultActor;'))
# Keep hook and editor in their canonical module; separate active from history everywhere.
s=(ROOT/'src/hooks/useProductFiscalProfiles.ts').read_text()
s=s.replace('import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";', 'import { useProductFiscalAccess } from "@/hooks/useProductFiscalAccess";')
s=s.replace('useStorageAccessScope(', 'useProductFiscalAccess(')
s=s.replace('  const enabled =', '  const request = useProductFiscalAccess("product-fiscal-read");\n  const actor = useProductFiscalAccess("portal-query-actor");\n  const enabled =')
s=s.replace('  });\n  return { ...result', '  }, { request, actor });\n  return { ...result')
s=s.replace('.eq("product_fiscal_profiles.profile_status",', '.eq("product_fiscal_profiles.is_active", true)\n          .eq("product_fiscal_profiles.profile_status",')
s=s.replace('          .order("nome",', '          .eq("product_fiscal_profiles.is_active", true)\n          .order("nome",')
s=s.replace('.in("id", productIds as any);', '.eq("product_fiscal_profiles.is_active", true)\n        .in("id", productIds as any);')
s=s.replace('.eq("product_id", productId)\n', '.eq("product_id", productId)\n        .eq("is_active", true)\n')
s=s.replace('      check();\n      values =', '      check();\n      if (!fence.canWrite) throw new Error("permission_denied");\n      values =')
s=s.replace('!current.updated_at)', '!current.updated_at || current.is_active !== true)')
s=s.replace('.eq("id", current.id)', '.eq("is_active", true)\n        .eq("id", current.id)')
changes['src/hooks/useProductFiscalProfiles.ts']=((ROOT/'src/hooks/useProductFiscalProfiles.ts').read_text(),s)
edit('src/lib/permissions.ts',lambda s:s.replace('// Fase Fiscal 3.2 — Perfis Fiscais de Produtos. Admin e Financeiro\n  // editam; Gestor somente lê. Demais perfis: bloqueado por URL.', '// Rota unificada: nível canônico preservado para o editor de microrganismos\n  // (RLS microorganism_fiscal_profiles_write: admin OU financeiro; gestor lê).\n  // Perfis de PRODUTO são globais: na página o editor de produto é separado\n  // (canEditProduct) e só o Superadmin forte edita, dentro de /plataforma.'))
edit('src/pages/configuracoes/FiscalProdutos.tsx',lambda s:s.replace('import { useStorageAccessScope }', 'import { useProductFiscalAccess } from "@/hooks/useProductFiscalAccess";\nimport { useStorageAccessScope }',1).replace('export default function FiscalProdutos() {','export default function FiscalProdutos({ platformGlobal = false }: { platformGlobal?: boolean } = {}) {\n  const fiscalAccess = useProductFiscalAccess("product-fiscal-page");').replace('const access = getAccessLevel(role, "/configuracoes/fiscal/produtos");', 'const access = platformGlobal ? fiscalAccess.ready && fiscalAccess.canWrite ? "rw" : "none" : getAccessLevel(role, "/configuracoes/fiscal/produtos");').replace('const [kind, setKind] = useState<EntityKindFilter>(KIND_ALL);', 'const [kind, setKind] = useState<EntityKindFilter>(platformGlobal ? KIND_PRODUCT : KIND_ALL);').replace('const microorganismsEnabled = uiEnabled', 'const microorganismsEnabled = !platformGlobal && uiEnabled').replace('enabled: uiEnabled && access !== "none",','enabled: !platformGlobal && uiEnabled && access !== "none",').replace('kind !== KIND_MICRO', '(platformGlobal || kind !== KIND_MICRO)').replace('const fence = useStorageAccessScope(`fiscal-drawer:', 'const fence = useProductFiscalAccess(`fiscal-drawer:').replace('canEdit={canEdit && fence.ready} />', 'canEdit={canEdit && fence.canWrite && profileQuery.data?.is_active === true} />').replace('{editing?.entity === "microrganismo" ?', '{!platformGlobal && editing?.entity === "microrganismo" ?').replace('const canEdit = access === "rw";', 'const canEdit = access === "rw" && fiscalAccess.canWrite;'))
edit('src/pages/plataforma/PlataformaHome.tsx',lambda s:s.replace('import { useState }', 'import FiscalProdutos from "@/pages/configuracoes/FiscalProdutos";\nimport { useState }',1).replace('<TabsContent value="catalogo"><PlatformCatalogReadTab /></TabsContent>', '<TabsContent value="catalogo"><PlatformCatalogReadTab /></TabsContent>\n          <TabsContent value="fiscal-produtos"><FiscalProdutos platformGlobal /></TabsContent>').replace('          </TabsList>', '            <TabsTrigger value="fiscal-produtos">Perfis fiscais de produtos</TabsTrigger>\n          </TabsList>',1))
# Only product RTC adopts global scope. Other company/service flows stay unchanged.
edit('src/hooks/useFiscalRtc.ts',lambda s:s.replace('import { useCallback, useEffect, useState }', 'import { useProductFiscalAccess } from "@/hooks/useProductFiscalAccess";\nimport { useCallback, useEffect, useState }',1).replace('  const enabled = (options.enabled ?? true) && !!itemId;', '  const fence = useProductFiscalAccess(`product-rtc:${itemId}`);\n  const product = kind === "product";\n  const enabled = (options.enabled ?? true) && !!itemId && (!product || fence.ready);').replace('    if (!itemId) return;', '    if (!itemId || (product && !fence.ready)) return;\n    const valid = product ? fence.capture() : () => true;').replace('    const { data, error } = await rpc<unknown>(getFn, { [idKey]: itemId });', '    const { data, error } = await rpc<unknown>(getFn, { [idKey]: itemId });\n    if (!valid()) return;').replace('  }, [itemId, getFn, idKey]);','  }, [itemId, getFn, idKey, product, fence.scope]);').replace('    if (!itemId) return { ok: false as const };', '    if (!itemId || (product && (!fence.ready || !fence.canWrite))) return { ok: false as const };\n    const valid = product ? fence.capture() : () => true;').replace('      expected_revision: state.revision || null,\n    });\n    if (error)', '      expected_revision: state.revision || null,\n    });\n    if (!valid()) return { ok: false as const };\n    if (error)').replace('  }, [itemId, saveFn, idKey, state.revision]);', '  }, [itemId, saveFn, idKey, state.revision, product, fence.scope, fence.canWrite]);').replace('  return { ...state, reload: load, save };\n}', '  return { ...state, reload: load, save };\n}',1).replace('  return { ...state, reload: load, save };\n}\n\nexport', '  return { ...state, data: product && !fence.ready ? null : state.data, reload: load, save };\n}\n\nexport'))
# Fence RTC state itself, not just adoption: old actor/epoch may not render before effects run.
p='src/hooks/useFiscalRtc.ts'; old,new=changes[p]
new=new.replace('useCallback, useEffect, useState }', 'useCallback, useEffect, useState, useRef }')
new=new.replace('  const product = kind === "product";', '  const product = kind === "product";\n  const adoptedScope = useRef("");')
new=new.replace('    if (!valid()) return;\n    if (error)', '    if (!valid()) return;\n    adoptedScope.current = fence.scope;\n    if (error)')
new=new.replace('    if (!valid()) return { ok: false as const };\n    if (error)', '    if (!valid()) return { ok: false as const };\n    adoptedScope.current = fence.scope;\n    if (error)')
new=new.replace('product && !fence.ready ? null : state.data', 'product && (!fence.ready || adoptedScope.current !== fence.scope) ? null : state.data')
changes[p]=(old,new)
# UI handler also enforces supplied permission; no programmatic handler bypass.
edit('src/components/fiscal/IbsCbsItemCard.tsx',lambda s:s.replace('  async function onSave() {\n    setFlash', '  async function onSave() {\n    if (disabled) return;\n    setFlash'))
# 02:5x: split product (global Superadmin) from micro (existing canonical route) editing;
# platform tab mounts no micro/regulatory flows.
p='src/pages/configuracoes/FiscalProdutos.tsx'; old,new=changes[p]
for a,c in [
 ('const access = platformGlobal ? fiscalAccess.ready && fiscalAccess.canWrite ? "rw" : "none" : getAccessLevel(role, "/configuracoes/fiscal/produtos");\n  const canEdit = access === "rw" && fiscalAccess.canWrite;',
  'const routeAccess = getAccessLevel(role, "/configuracoes/fiscal/produtos");\n  const access = platformGlobal ? fiscalAccess.ready && fiscalAccess.canWrite ? "rw" : "none" : routeAccess;\n  // Produto global: somente Superadmin forte na plataforma. Microrganismo: permissão\n  // canônica existente da rota tenant (admin/financeiro rw, gestor r), nunca na plataforma.\n  const canEditProduct = platformGlobal && access === "rw" && fiscalAccess.ready && fiscalAccess.canWrite;\n  const canEditMicro = !platformGlobal && routeAccess === "rw";'),
 ('                      canEdit,\n                      readinessUnknown,','                      canEditProduct,\n                      canEditMicro,\n                      readinessUnknown,'),
 ('<ProductEditDrawer\n          productId={editing.productId}\n          displayName={editing.displayName}\n          displayCodigo={editing.displayCodigo}\n          canEdit={canEdit}','<ProductEditDrawer\n          productId={editing.productId}\n          displayName={editing.displayName}\n          displayCodigo={editing.displayCodigo}\n          canEdit={canEditProduct}'),
 ('<MicroorganismEditDrawer\n          microorganismId={editing.microorganismId}\n          displayName={editing.displayName}\n          displayCodigo={editing.displayCodigo}\n          canEdit={canEdit}','<MicroorganismEditDrawer\n          microorganismId={editing.microorganismId}\n          displayName={editing.displayName}\n          displayCodigo={editing.displayCodigo}\n          canEdit={canEditMicro}'),
 ('  canEdit: boolean,\n  readinessUnknown: boolean,','  canEditProduct: boolean,\n  canEditMicro: boolean,\n  readinessUnknown: boolean,'),
 ('aria-label={`${canEdit ? "Editar" : "Ver"} perfil fiscal de ${p.product_nome}`}','aria-label={`${canEditProduct ? "Editar" : "Ver"} perfil fiscal de ${p.product_nome}`}'),
 ('{canEdit ? (p.profile_id ?','{canEditProduct ? (p.profile_id ?'),
 ('        {canEdit ? (\n          <>\n            <Button\n              variant={own','        {canEditMicro ? (\n          <>\n            <Button\n              variant={own'),
 ('      <RegulatorioMicrorganismosSecao />','      {!platformGlobal && <RegulatorioMicrorganismosSecao />}'),
 ('              <Select\n                value={kind}','              {!platformGlobal && <Select\n                value={kind}'),
 ('                  <SelectItem value={KIND_MICRO}>Microrganismos</SelectItem>\n                </SelectContent>\n              </Select>','                  <SelectItem value={KIND_MICRO}>Microrganismos</SelectItem>\n                </SelectContent>\n              </Select>}'),
]:
 assert new.count(a)==1,a; new=new.replace(a,c)
changes[p]=(old,new)
manifest=[];patch=[]
for p,(old,new) in changes.items():
 out=H/'runtime-copies'/p;out.parent.mkdir(parents=True,exist_ok=True);out.write_text(new)
 manifest.append(dict(path=p,baseline_sha256=hashlib.sha256(old.encode()).hexdigest(),candidate_sha256=hashlib.sha256(new.encode()).hexdigest()))
 patch+=list(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/'+p,tofile='b/'+p))
(H/'frontend.patch').write_text(''.join(patch));(H/'frontend-drift.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Prepared inactive global fiscal copies; runtime unchanged')
