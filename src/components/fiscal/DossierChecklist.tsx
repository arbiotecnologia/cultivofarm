import {useEffect, useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {CHECKLIST_LABELS, type ChecklistKey} from '@/hooks/useMicroorganismRegulatory';
import type {ProductDossier} from '@/hooks/useProductRegulatoryDossiers';
import {dossierSubject, dossierSubjects} from './dossierTaskGroups';

const stateLabels = {PENDING:'Pendente', CONFIRMED:'Confirmado', NOT_APPLICABLE:'Não aplicável'};
export function DossierChecklist({items, disabled, onDirty, onSave}: {
  items: ProductDossier['checklist']; disabled: boolean;
  onDirty: (key: string, dirty: boolean) => void;
  onSave: (key: string, state: string, reason: string) => Promise<boolean>;
}) {
  return <details className="border-t pt-3"><summary className="cursor-pointer font-medium">Checklist formal · {items.length} itens</summary>
    <p className="py-2 text-sm text-muted-foreground">Dados cadastrados e documentos anexados não confirmam a revisão formal.</p>
    {dossierSubjects.map(subject => {
      const rows = items.filter(item => dossierSubject(item.item_key) === subject);
      return rows.length ? <div key={subject} className="py-2"><h4 className="text-sm font-semibold">{subject}</h4>{rows.map(item => <ChecklistRow key={item.item_key} item={item} disabled={disabled} onDirty={onDirty} onSave={onSave}/>)}</div> : null;
    })}
  </details>;
}
function ChecklistRow({item, disabled, onDirty, onSave}: {
  item: ProductDossier['checklist'][number]; disabled:boolean;
  onDirty:(key:string,dirty:boolean)=>void;
  onSave:(key:string,state:string,reason:string)=>Promise<boolean>;
}) {
  const [state,setState]=useState(item.state);
  const [reason,setReason]=useState(item.justification??'');
  const dirty=state!==item.state||reason!==(item.justification??'');
  useEffect(()=>{onDirty(item.item_key,dirty);},[dirty,item.item_key,onDirty]);
  return <details className="border-b py-2"><summary className="cursor-pointer text-sm"><span>{CHECKLIST_LABELS[item.item_key as ChecklistKey]??item.item_key}</span><span className="ml-2 text-muted-foreground">{stateLabels[item.state]}{dirty?' · Alteração não salva':''}</span></summary>
    <div className="grid gap-3 py-3 sm:grid-cols-2"><div><Label>Situação formal</Label><Select value={state} disabled={disabled} onValueChange={v=>setState(v as typeof state)}><SelectTrigger aria-label={`Situação ${item.item_key}`}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="PENDING">Pendente</SelectItem><SelectItem value="CONFIRMED">Confirmado</SelectItem><SelectItem value="NOT_APPLICABLE">Não aplicável</SelectItem></SelectContent></Select></div>
    <div><Label htmlFor={`reason-${item.item_key}`}>Justificativa{state==='NOT_APPLICABLE'?' (obrigatória)':''}</Label><Input id={`reason-${item.item_key}`} aria-label={`Justificativa ${item.item_key}`} value={reason} onChange={e=>setReason(e.target.value)} disabled={disabled}/></div>
    <Button variant="outline" className="sm:col-span-2 sm:justify-self-start" disabled={disabled||!dirty||(state==='NOT_APPLICABLE'&&!reason.trim())} onClick={()=>void onSave(item.item_key,state,reason)}>Salvar item</Button></div>
  </details>;
}