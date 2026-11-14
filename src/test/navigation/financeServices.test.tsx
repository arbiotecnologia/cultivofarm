import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { navigation } from '@/config/navigation';
import { searchNavItems } from '@/lib/navigation/search';
import { canAccess, canWrite } from '@/lib/permissions';
import { canWriteServiceCatalog } from '@/lib/services/serviceBilling';

const state = vi.hoisted(() => ({ roles: ['financeiro'], feature: true, fetch: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ roles: state.roles, role: state.roles[0], user: { id: 'synthetic-actor' }, profile: { user_id: 'synthetic-actor', organization_id: 'synthetic-org', ativo: true }, loading: false }) }));
vi.mock('@/hooks/useEntitlements', () => ({ useEntitlements: () => ({ status: 'ready', features: new Set(state.feature ? ['catalogo_precos'] : []) }) }));
vi.mock('@/hooks/useSystemConfig', () => ({ useSystemConfig: () => ({ defaults: { nome_empresa: 'Empresa sintética' } }) }));
vi.mock('@/components/LogoDisplay', () => ({ LogoDisplay: () => null }));
vi.mock('@/components/nav/PortalSidebar', () => ({ PortalSidebar: ({ groups }: { groups: { items: { id: string; label: string; route: string; children?: { id: string; label: string; route: string }[] }[] }[] }) => <nav aria-label="Navegação">{groups.flatMap(g => g.items).flatMap(item => [item, ...(item.children ?? [])]).map(item => <a key={item.id} href={item.route}>{item.label}</a>)}</nav> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: state.fetch, rpc: state.fetch } }));
vi.mock('@/components/protocolos/ProdutosTab', () => ({ ProdutosTab: () => <output>Consulta de produtos</output> }));
vi.mock('@/components/catalogo/servicos/ServicosTab', () => ({ ServicosTab: () => <output>Cadastro de serviços</output> }));
import { AppSidebar } from '@/components/AppSidebar';
import Protocolos from '@/pages/Protocolos';

beforeEach(() => { state.roles = ['financeiro']; state.feature = true; state.fetch.mockReset(); });
afterEach(cleanup);

it('sidebar Financeiro mostra exatamente Produtos e Serviços no catálogo; clique segue o deep link', () => {
  render(<MemoryRouter><AppSidebar /></MemoryRouter>);
  const catalogueLinks = screen.getAllByRole('link').filter(link => link.getAttribute('href')?.startsWith('/base-tecnica?'));
  expect(catalogueLinks.map(link => link.getAttribute('href'))).toEqual(['/base-tecnica?tab=produtos', '/base-tecnica?tab=servicos']);
  expect(screen.getByRole('link', { name: /^Serviços$/ })).toHaveAttribute('href', '/base-tecnica?tab=servicos');
  expect(state.fetch).not.toHaveBeenCalled();
});
it('sem catalogo_precos a sidebar não oferece Produtos nem Serviços', () => {
  state.feature = false; render(<MemoryRouter><AppSidebar /></MemoryRouter>);
  expect(screen.queryByRole('link', { name: /^Serviços$/ })).toBeNull();
  expect(screen.queryByRole('link', { name: /^Produtos$/ })).toBeNull();
});
it.each(['financeiro', 'administrador', 'gestor'])('%s possui autorização própria de catálogo de serviços', role => {
  expect(canAccess(role, '/base-tecnica?tab=servicos')).toBe(true);
  expect(canWrite(role, '/base-tecnica?tab=servicos')).toBe(true);
  expect(canWriteServiceCatalog([role])).toBe(true);
});
it.each(['gestor_comercial', 'administrativo'])('%s lê Serviços mas não recebe escrita de catálogo', role => {
  expect(canAccess(role, '/base-tecnica?tab=servicos')).toBe(true);
  expect(canWrite(role, '/base-tecnica?tab=servicos')).toBe(false);
  expect(canWriteServiceCatalog([role])).toBe(false);
});
it.each(['consultor_tecnico', 'parceiro_b2b', 'parceiro_b2b_tecnico', 'cliente_produtor', 'superadmin', 'vendedor'])('%s não vê Serviços nem monta a aba pela URL', async role => {
  state.roles = [role];
  const catalogue = navigation.filter(item => item.id === 'protocolos');
  expect(searchNavItems(catalogue, '', role).filter(item => item.id === 'protocolos-servicos')).toEqual([]);
  expect(canAccess(role, '/base-tecnica?tab=servicos')).toBe(false);
  render(<MemoryRouter initialEntries={['/base-tecnica?tab=servicos']}><Routes><Route path="/base-tecnica" element={<Protocolos />} /><Route path="/sem-permissao" element={<output>Acesso bloqueado</output>} /></Routes></MemoryRouter>);
  expect(await screen.findByText('Acesso bloqueado')).toBeInTheDocument();
  expect(screen.queryByText('Cadastro de serviços')).toBeNull(); expect(state.fetch).not.toHaveBeenCalled();
});
it('Financeiro navega Produtos → Serviços pela aba canônica sem montar irmãos técnicos', async () => {
  render(<MemoryRouter initialEntries={['/base-tecnica?tab=produtos']}><Protocolos /></MemoryRouter>);
  expect(screen.getByText('Consulta de produtos')).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^Serviços$/ }), { button: 0, ctrlKey: false });
  expect(await screen.findByText('Cadastro de serviços')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /^Serviços$/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByText('Consulta de produtos')).toBeNull();
  expect(screen.queryByRole('tab', { name: /^Culturas$/ })).toBeNull();
  expect(screen.queryByRole('tab', { name: /^Microrganismos$/ })).toBeNull();
  expect(state.fetch).not.toHaveBeenCalled();
});
it.each(['servicos&tab=produtos', 'servicos&tab=servicos', 'inexistente'])('Financeiro recusa tab ambígua/inválida %s antes de leitores', async query => {
  render(<MemoryRouter initialEntries={[`/base-tecnica?tab=${query}`]}><Routes><Route path="/base-tecnica" element={<Protocolos />} /><Route path="/sem-permissao" element={<output>Acesso bloqueado</output>} /></Routes></MemoryRouter>);
  expect(await screen.findByText('Acesso bloqueado')).toBeInTheDocument(); expect(state.fetch).not.toHaveBeenCalled();
});