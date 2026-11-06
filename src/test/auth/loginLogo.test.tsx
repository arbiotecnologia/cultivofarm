// DOM integrado da tela de login: marca local imediata, config tardia e fallback de URL customizada.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
const st = vi.hoisted(() => ({ cfg: { config: null as null | { logo_url: string | null; nome_empresa: string }, defaults: { nome_empresa: 'Cultivo Farm' }, isLoading: true, failureCount: 0 } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {}, from: () => ({}) } }));
vi.mock('@/hooks/useSystemConfig', () => ({ useSystemConfig: () => st.cfg }));
import Auth from '@/pages/Auth';
import logo from '@/assets/logo-cultivofarm.png.asset.json';

const ui = () => <MemoryRouter><Auth /></MemoryRouter>;
const img = () => screen.getByRole('img') as HTMLImageElement;
const set = (c: Partial<typeof st.cfg>) => { st.cfg = { ...st.cfg, ...c }; };
afterEach(() => { cleanup(); st.cfg = { config: null, defaults: { nome_empresa: 'Cultivo Farm' }, isLoading: true, failureCount: 0 }; });

describe('logo do login', () => {
  it('consulta pendente (rede travada): marca local renderizada imediatamente, sem skeleton', () => {
    render(ui());
    expect(img().getAttribute('src')).toBe(logo.url);
    expect(img().alt).toBe('Cultivo Farm');
  });
  it('falha da consulta: mantém marca local', () => {
    set({ isLoading: false, failureCount: 3 }); render(ui());
    expect(img().getAttribute('src')).toBe(logo.url);
  });
  it('config tardia válida substitui a marca local (branding preservado)', () => {
    const r = render(ui());
    expect(img().getAttribute('src')).toBe(logo.url);
    set({ isLoading: false, config: { logo_url: 'https://cdn.example/x.png', nome_empresa: 'ARBio' } });
    r.rerender(ui());
    expect(img().getAttribute('src')).toBe('https://cdn.example/x.png');
    expect(img().alt).toBe('ARBio');
  });
  it('URL customizada falha: cai para local uma vez, sem loop; erro da local não reentra', () => {
    set({ isLoading: false, config: { logo_url: 'https://cdn.example/broken.png', nome_empresa: 'ARBio' } });
    const r = render(ui());
    act(() => { fireEvent.error(img()); });
    expect(img().getAttribute('src')).toBe(logo.url);
    act(() => { fireEvent.error(img()); fireEvent.error(img()); });
    expect(img().getAttribute('src')).toBe(logo.url);
    // nova URL configurada é tentada novamente
    set({ config: { logo_url: 'https://cdn.example/new.png', nome_empresa: 'ARBio' } }); r.rerender(ui());
    expect(img().getAttribute('src')).toBe('https://cdn.example/new.png');
  });
});
