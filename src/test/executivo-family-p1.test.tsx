import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ blocked: vi.fn(), safe: vi.fn() }));
vi.mock('@/components/executivo/financeiro/ExecutivoFinanceiroResumo', () => ({ ExecutivoFinanceiroResumo: m.blocked }));
vi.mock('@/components/executivo/clientes/ExecutivoClientesResumo', () => ({ ExecutivoClientesResumo: m.blocked }));
vi.mock('@/components/executivo/alertas/ExecutivoAlertasResumo', () => ({ ExecutivoAlertasResumo: m.blocked }));
vi.mock('@/components/executivo/relatorios/ExecutivoRelatorios', () => ({ ExecutivoRelatorios: m.blocked }));
// Render all tab contents: blocked modules must stay unmounted even if every tab is active.
vi.mock('@/components/ui/tabs', () => {
 const passthrough = ({ children }: { children: import('react').ReactNode }) => <>{children}</>;
 return { Tabs: passthrough, TabsContent: passthrough, TabsList: passthrough, TabsTrigger: passthrough };
});
vi.mock('@/components/executivo/ExecutivoPermissionGate', () => ({ ExecutivoPermissionGate: ({ children }: { children: import('react').ReactNode }) => <>{children}</> }));
vi.mock('@/components/executivo/ExecutivoHeader', () => ({ ExecutivoHeader: () => null }));
vi.mock('@/components/executivo/ExecutivoFiltros', () => ({ ExecutivoFiltros: () => null }));
vi.mock('@/components/executivo/ExecutivoResumoCards', () => ({ ExecutivoResumoCards: () => { m.safe('summary'); return null; } }));
vi.mock('@/components/executivo/ExecutivoSaudeOperacional', () => ({ ExecutivoSaudeOperacional: () => null }));
vi.mock('@/components/executivo/ExecutivoTimeline', () => ({ ExecutivoTimeline: () => { m.safe('timeline'); return null; } }));
vi.mock('@/components/executivo/ExecutivoGargalos', () => ({ ExecutivoGargalos: () => { m.safe('bottlenecks'); return null; } }));
vi.mock('@/components/executivo/ExecutivoAtalhos', () => ({ ExecutivoAtalhos: () => null }));
vi.mock('@/hooks/useExecutivoResumo', () => ({ useExecutivoResumo: () => ({ data: undefined, refetch: vi.fn() }) }));
vi.mock('@/hooks/useExecutivoTimeline', () => ({ useExecutivoTimeline: () => ({ data: undefined, refetch: vi.fn() }) }));
vi.mock('@/hooks/useExecutivoGargalos', () => ({ useExecutivoGargalos: () => ({ data: undefined, refetch: vi.fn() }) }));
import PortalExecutivo from '@/pages/executivo/PortalExecutivo';
describe('Executive family containment, component/hooks mocked, NOT JWT', () => {
 it('does not mount financial/client/alert/report modules or their ID/export/write handlers', () => {
  m.blocked.mockClear(); m.safe.mockClear(); render(<PortalExecutivo />);
  expect(m.blocked).not.toHaveBeenCalled();
 });
 it('preserves the three previously contained module callpaths', () => {
  m.safe.mockClear(); render(<PortalExecutivo />);
  expect(m.safe).toHaveBeenCalledWith('summary');
  expect(m.safe).toHaveBeenCalledWith('timeline');
  expect(m.safe).toHaveBeenCalledWith('bottlenecks');
 });
});
