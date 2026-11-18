import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
export default defineConfig({plugins:[react()],resolve:{alias:{'@':path.resolve(__dirname,'src')}},test:{environment:'jsdom',globals:true,maxWorkers:2,minWorkers:1,include:['src/test/catalogTenantAuthoring.test.tsx'],setupFiles:['src/test/catalogTenantSetup.ts']}});
