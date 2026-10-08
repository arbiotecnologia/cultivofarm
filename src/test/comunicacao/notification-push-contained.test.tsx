import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const m = vi.hoisted(() => ({ auth: { user: { id: 'A' }, profile: { user_id: 'A', organization_id: 'OA', ativo: true }, loading: false } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => m.auth }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { toast } from 'sonner';
beforeEach(() => { vi.clearAllMocks(); m.auth = { user: { id: 'A' }, profile: { user_id: 'A', organization_id: 'OA', ativo: true }, loading: false }; });
describe('contained push hook', () => {
 it('never requests permission/registers/subscribes and never reports activation success', async () => {
  const register = vi.fn(); const requestPermission = vi.fn(); const subscribe = vi.fn();
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register, getRegistration: vi.fn().mockResolvedValue(undefined) } });
  vi.stubGlobal('PushManager', function() {}); vi.stubGlobal('Notification', { requestPermission });
  const h = renderHook(() => usePushSubscription());
  await act(async () => h.result.current.subscribe());
  expect(h.result.current.deliveryAvailable).toBe(false); expect(register).not.toHaveBeenCalled(); expect(requestPermission).not.toHaveBeenCalled(); expect(subscribe).not.toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled(); h.unmount();
 });
 it('local unsubscribe does not touch database or unregister worker and hides state on identity change', async () => {
  const unsubscribe = vi.fn().mockResolvedValue(true); const unregister = vi.fn();
  const getSubscription = vi.fn().mockResolvedValue({ unsubscribe });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: vi.fn().mockResolvedValue({ active: { scriptURL: `${location.origin}/push-sw.js` }, pushManager: { getSubscription }, unregister }) } });
  vi.stubGlobal('PushManager', function() {});
  const h = renderHook(() => usePushSubscription());
  await waitFor(() => expect(h.result.current.canUnsubscribe).toBe(true));
  await act(async () => h.result.current.unsubscribe()); expect(unsubscribe).toHaveBeenCalledOnce(); expect(unregister).not.toHaveBeenCalled();
  m.auth.loading = true; h.rerender(); expect(h.result.current.subscription).toBeNull(); h.unmount();
 });
 it('does not inspect subscriptions belonging to non-push worker', async () => {
  const getSubscription = vi.fn();
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: vi.fn().mockResolvedValue({ active: { scriptURL: `${location.origin}/sw.js` }, pushManager: { getSubscription } }) } });
  vi.stubGlobal('PushManager', function() {});
  const h = renderHook(() => usePushSubscription()); await act(async () => {}); expect(getSubscription).not.toHaveBeenCalled(); expect(h.result.current.canUnsubscribe).toBe(false); h.unmount();
 });
});
describe('worker actual JavaScript execution', () => {
 const source = readFileSync('public/push-sw.js', 'utf8');
 function worker() {
  const listeners: Record<string, (event: unknown) => void> = {};
  const showNotification = vi.fn(); const openWindow = vi.fn();
  const context = { URL, self: { location: { origin: 'https://app.cultivofarm.com.br' }, addEventListener: (name: string, fn: (event: unknown) => void) => { listeners[name] = fn; }, registration: { showNotification }, clients: { openWindow } } };
  runInNewContext(source, context); return { context, listeners, showNotification, openWindow };
 }
 it('suppresses JSON and text without parsing or showing private payload', () => {
  const w = worker(); const json = vi.fn(); const text = vi.fn();
  w.listeners.push({ data: { json, text }, waitUntil: vi.fn() });
  w.listeners.push({ data: 'private text' }); expect(json).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled(); expect(w.showNotification).not.toHaveBeenCalled();
 });
 for (const path of ['https://evil.test', '//evil.test', '/app/../secrets', '/app/%2e%2e/secrets', '/app\\evil', '/app/%5cevil', '/unlisted']) it(`rejects unsafe click ${path}`, () => {
  const w = worker(); expect(runInNewContext(`safeNotificationUrl(${JSON.stringify(path)})`, w.context)).toBeNull();
  const close = vi.fn(); w.listeners.notificationclick({ notification: { close, data: { url: path } }, waitUntil: vi.fn() }); expect(close).toHaveBeenCalled(); expect(w.openWindow).not.toHaveBeenCalled();
 });
 it('validates internal same-origin path but still refuses navigation when blocked', () => {
  const w = worker(); expect(runInNewContext('safeNotificationUrl("/app/notificacoes")', w.context)).toBe('https://app.cultivofarm.com.br/app/notificacoes');
  w.listeners.notificationclick({ notification: { close: vi.fn(), data: { url: '/app/notificacoes' } }, waitUntil: vi.fn() }); expect(w.openWindow).not.toHaveBeenCalled();
 });
});
