import type {ProductDossier} from '@/hooks/useProductRegulatoryDossiers';

export const dossierSubjects = ['Dados técnicos', 'MAPA', 'Documentos', 'Perfil fiscal', 'Outras verificações'] as const;
export type DossierSubject = typeof dossierSubjects[number];
export function dossierSubject(field: string, items: string[] = []): DossierSubject {
  const keys = `${field} ${items.join(' ')}`.toUpperCase();
  if (/DOCUMENT|ROTULO_DOCUMENT|LAUDO/.test(keys)) return 'Documentos';
  if (/MAPA|TITULAR|FABRICANTE/.test(keys)) return 'MAPA';
  if (/NCM|CEST|TIPI|GTIN|UNIDADE|CONVERSAO|ORIGEM|CFOP|TRIBUTACAO|FISCAL/.test(keys)) return 'Perfil fiscal';
  if (/CEPA|STRAIN|FORMUL|GARANTIA|GUARANTEE|FINALIDADE|CATEGORY/.test(keys)) return 'Dados técnicos';
  return 'Outras verificações';
}
/** Only identical semantic blockers collapse; different codes, fields, layers or items remain visible. */
export function groupedDossierPendencies(pendencies: ProductDossier['gate']['pendencies']) {
  const seen = new Set<string>();
  const groups = new Map<DossierSubject, typeof pendencies>();
  for (const p of pendencies) {
    const key = JSON.stringify([p.code, p.field, p.layer, p.message.trim().replace(/\s+/g, ' '), [...(p.items ?? [])].sort()]);
    if (seen.has(key)) continue;
    seen.add(key);
    const subject = dossierSubject(p.field, p.items);
    groups.set(subject, [...(groups.get(subject) ?? []), p]);
  }
  return dossierSubjects.flatMap(subject => groups.has(subject) ? [{subject, pendencies: groups.get(subject) ?? []}] : []);
}