import { createTenantAIHandler } from '../tenant-catalog-ai.ts';
import { productionClient } from '../production-client.ts';
export const handle=createTenantAIHandler('targets',{client:productionClient});
if(import.meta.main)Deno.serve(handle);


