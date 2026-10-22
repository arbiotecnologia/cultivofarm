"""Generate an INACTIVE coordinated patch from current runtime, preserving filter fix."""
from pathlib import Path
import difflib,hashlib,json
p=Path(__file__).resolve().parent;root=p.parent.parent
changes={};drift={}
def edit(path,old,new):
 source=changes.get(path,(root/path).read_text())
 assert source.count(old)==1,(path,old)
 changes[path]=source.replace(old,new)
edit('src/hooks/useMyPartner.ts','import { readCatalogCapabilities }', 'import { readOwnFinanceCapability } from "@/lib/comercial/financeAccess";\nimport { readCatalogCapabilities }')
edit('src/hooks/useMyPartner.ts','ativo: true, capabilities: readCatalogCapabilities(partner.capabilities),','ativo: true, financeRead: readOwnFinanceCapability(partner.finance_capabilities), capabilities: readCatalogCapabilities(partner.capabilities),')
layout='src/pages/portal-parceiro/PortalParceiroLayout.tsx'
edit(layout,'import { OwnerCatalog }', 'import { ownFinanceRoute } from "@/lib/comercial/financeAccess";\nimport { OwnerFinance } from "@/components/comercial/OwnerFinance";\nimport { OwnerCatalog }')
edit(layout,'  const canReadOwnerRoute =', '  const canReadOwnFinance = partnerReady && !partnerError && entitlements.status === "ready" && ownFinanceRoute(location.pathname, ownPartner?.financeRead === true, entitlements.features);\n  const canReadOwnerRoute =')
edit(layout,'ownerCatalogRoute(item.route, ownPartner?.capabilities)', '(ownerCatalogRoute(item.route, ownPartner?.capabilities) || (entitlements.status === "ready" && ownFinanceRoute(item.route, ownPartner?.financeRead === true, entitlements.features)))')
edit(layout,'{commercialOwner && canReadOwnerRoute ? (','{commercialOwner && canReadOwnFinance ? <OwnerFinance key={ownPartner.id} partnerId={ownPartner.id} /> : commercialOwner && canReadOwnerRoute ? (')
edit('src/lib/saas/featureRouteMap.ts','  ["/portal-parceiro/pedidos", "pedidos_b2b"],','  ["/portal-parceiro/financeiro", "contas_receber"],\n  ["/portal-parceiro/pedidos", "pedidos_b2b"],')
changes['src/lib/comercial/financeAccess.ts']=(p/'financeAccess.ts').read_text()
changes['src/lib/comercial/financeContract.ts']=(p/'financeContract.ts').read_text()
changes['src/hooks/useOwnFinance.ts']=(p/'useOwnFinance.ts').read_text().replace('from "./financeContract"','from "@/lib/comercial/financeContract"')
page=(p/'Financeiro.tsx').read_text().split('export default function Financeiro()')[0]
page=page.replace('import { useOutletContext } from "react-router-dom";\n','').replace('from "./useOwnFinance"','from "@/hooks/useOwnFinance"').replace('function OwnFinancePage(', 'export function OwnerFinance(')
changes['src/components/comercial/OwnerFinance.tsx']=page
patch=[]
for path,new in changes.items():
 f=root/path;old=f.read_text() if f.exists() else ''
 drift[path]=hashlib.sha256(old.encode()).hexdigest() if f.exists() else None
 patch.extend(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/'+path if f.exists() else '/dev/null',tofile='b/'+path))
(p/'frontend.patch').write_text(''.join(patch));(p/'frontend-drift.json').write_text(json.dumps(drift,indent=2)+'\n')