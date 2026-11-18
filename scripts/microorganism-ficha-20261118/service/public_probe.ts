// Public documentary research only; no tenant/user/production data and no database requests.
import { researchProduct } from './inference.ts';
try {
 const result=await researchProduct({name:'Bacillus subtilis',scientificName:'Bacillus subtilis',manufacturer:'',registration:'',entity:'microrganismo',purpose:'Contexto agronômico geral',researchScope:'species'},['resumo_curto'],new AbortController().signal);
 console.log(JSON.stringify({status:'PUBLIC_INFERENCE_EXECUTED',result,limits:'Public species research, NOT authenticated Edge or hosted tenant integration'}));
} catch(e) {console.log(JSON.stringify({status:'BLOCKED_PROVIDER',name:e instanceof Error?e.name:'unknown',message:e instanceof Error?e.message:'unknown'}));Deno.exit(1);}
