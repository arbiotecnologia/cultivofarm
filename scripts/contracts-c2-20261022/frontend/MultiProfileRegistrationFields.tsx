import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EXTERNAL_CAPABILITIES, type Capability } from "./partnerLifecycle";
type Option = { id: string; label: string };
type Props = {
  organizationId: string; organizationName: string; partnerId: string; roles: Capability[];
  partners: Option[]; loading: boolean; unavailable: boolean;
  onPartner: (id: string) => void; onRoles: (roles: Capability[]) => void;
};
// Presentation for the EXISTING create-user form. Options must come from its
// actor-fenced same-owner query. This component never provisions identities.
export function MultiProfileRegistrationFields(props: Props) {
  const labels: Record<Capability, string> = { parceiro_b2b: "Gestor B2B", parceiro_b2b_tecnico: "Consultor técnico B2B", cliente_produtor: "Cliente/Produtor" };
  return <fieldset className="space-y-3" disabled={props.loading || props.unavailable}>
    <div><span>Empresa</span><p>{props.organizationName}</p></div>
    <label className="block">Parceiro<Select value={props.partnerId} onValueChange={props.onPartner}>
      <SelectTrigger><SelectValue placeholder="Selecione o parceiro" /></SelectTrigger>
      <SelectContent>{props.partners.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
    </Select></label>
    <div className="flex flex-wrap gap-4">{EXTERNAL_CAPABILITIES.map(r => <label key={r} className="flex items-center gap-2"><Checkbox checked={props.roles.includes(r)} onCheckedChange={value => props.onRoles(value === true ? [...props.roles, r] : props.roles.filter(x => x !== r))} />{labels[r]}</label>)}</div>
    <Button disabled>Confirmar cadastro</Button>
  </fieldset>;
}