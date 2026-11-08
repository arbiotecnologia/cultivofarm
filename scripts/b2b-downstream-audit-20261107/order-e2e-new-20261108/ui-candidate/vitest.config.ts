import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
export default defineConfig({ plugins: [react()], resolve: { alias: { '@': path.resolve('src') } }, test: { globals: true, environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], include: ['scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/ui-candidate/*.test.{ts,tsx}'] } });