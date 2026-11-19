const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const states={AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins'};
const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
class Failure extends Error {constructor(status,message){super(message);this.status=status;}}
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
async function remoteJson(fetcher,url,options={}) {
 let response; try {response=await fetcher(url,{...options,signal:AbortSignal.timeout(15000),redirect:'error'});} catch {throw new Failure(502,'Não foi possível consultar o serviço. Tente novamente.');}
 if(!response.ok) throw new Failure(502,'Serviço de localização ou clima indisponível. Os dados existentes foram preservados.');
 const body=await response.text(); if(body.length>500000) throw new Failure(502,'Resposta do serviço inválida.');
 try{return JSON.parse(body);}catch{throw new Failure(502,'Resposta do serviço inválida.');}
}
export async function resolveLocation(ctx,fetcher){
 if(ctx.latitude!==null && ctx.latitude!==undefined && ctx.longitude!==null && ctx.longitude!==undefined && !(Number(ctx.latitude)===0 && Number(ctx.longitude)===0)){
  const lat=Number(ctx.latitude),lon=Number(ctx.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180) throw new Failure(422,'Corrija as coordenadas cadastradas na fazenda.');
  return {latitude:lat,longitude:lon,origem:'fazenda',descricao:'Coordenadas da fazenda'};
 }
 const city=String(ctx.municipio??'').trim(), state=String(ctx.estado??'').trim();
 const stateName=states[state.toUpperCase()]??Object.values(states).find(s=>norm(s)===norm(state));
 if(!city||!stateName) throw new Failure(422,'Cadastre as coordenadas da fazenda ou a cidade e o estado para sincronizar o clima.');
 const url=new URL('https://geocoding-api.open-meteo.com/v1/search');
 url.search=new URLSearchParams({name:`${city}, ${stateName}`,countryCode:'BR',count:'100',language:'pt',format:'json'}).toString();
 const body=await remoteJson(fetcher,url);
 const matches=(body.results??[]).filter(r=>r.country_code==='BR'&&norm(r.name)===norm(city)&&norm(r.admin1)===norm(stateName)&&norm(r.admin2)===norm(city)&&/^PPL/.test(r.feature_code??'')&&Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)&&Math.abs(r.latitude)<=90&&Math.abs(r.longitude)<=180);
 const distinct=[...new Map(matches.map(r=>[r.id,r])).values()];
 if(distinct.length!==1) throw new Failure(422,'Não foi possível identificar a cidade de forma única. Confira cidade/estado ou cadastre as coordenadas da fazenda.');
 return {latitude:distinct[0].latitude,longitude:distinct[0].longitude,origem:'cidade',descricao:`${city} / ${state} (referência municipal)`};
}
export function weatherRecords(body,ctx){
 const daily=body?.daily;const names=['temperature_2m_mean','relative_humidity_2m_mean','precipitation_sum','wind_speed_10m_max','shortwave_radiation_sum'];
 const days=Array.from({length:8},(_,i)=>new Date(Date.parse(ctx.start_date+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));
 if(!daily||JSON.stringify(daily.time)!==JSON.stringify(days)||days[7]!==ctx.end_date||names.some(n=>!Array.isArray(daily[n])||daily[n].length!==8)) throw new Failure(502,'O provedor retornou um período incompleto. Os dados existentes foram preservados.');
 const limits=[[-100,70],[0,100],[0,3000],[0,500],[0,100]];
 return days.map((data,i)=>{
  const values=names.map((n,j)=>{const v=daily[n][i];if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<limits[j][0]||v>limits[j][1])) throw new Failure(502,'O provedor retornou medições inválidas.');return v;});
  if(values.every(v=>v===null)) throw new Failure(502,'O provedor retornou um dia sem medições.');
  return {data,temperatura:values[0],umidade:values[1],chuva_mm:values[2],vento_kmh:values[3],radiacao_solar:values[4]};
 });
}
export function createHandler({supabaseUrl,publicKey,fetcher=fetch}){
 return async req=>{
  if(req.method==='OPTIONS') return new Response(null,{headers});
  if(req.method!=='POST') return reply(405,{error:'Método não permitido.'});
  try{
   const authorization=req.headers.get('authorization')??'';
   if(!/^Bearer\s+\S+$/i.test(authorization)) return reply(401,{error:'Autenticação necessária.'});
   const clientHeaders={apikey:publicKey,Authorization:authorization,'Content-Type':'application/json'};
   const auth=await fetcher(supabaseUrl+'/auth/v1/user',{headers:clientHeaders,signal:AbortSignal.timeout(10000)});
   if(!auth.ok) return reply(401,{error:'Sessão inválida ou expirada.'});
   const user=await auth.json();if(!user.id) return reply(401,{error:'Sessão inválida.'});
   const raw=await req.text();if(raw.length>1024) return reply(400,{error:'Solicitação inválida.'});
   let input;try{input=JSON.parse(raw);}catch{return reply(400,{error:'Solicitação inválida.'});}
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>k!=='fazenda_id')||!uuid.test(input.fazenda_id??'')) return reply(400,{error:'Informe uma fazenda válida.'});
   async function rpc(name,body){
    const response=await fetcher(supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:clientHeaders,body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    const value=await response.json();
    if(!response.ok){if(value.code==='42501'||response.status===401||response.status===403) throw new Failure(403,'Você não tem permissão para sincronizar esta fazenda.');if(value.code==='PT409'||value.code==='55P03') throw new Failure(409,'O cadastro ou acesso mudou durante a sincronização. Atualize e tente novamente.');throw new Failure(502,'Não foi possível salvar o clima. Os dados anteriores foram preservados.');}
    return value;
   }
   const ctx=await rpc('weather_sync_context_v1',{p_fazenda_id:input.fazenda_id});
   const location=await resolveLocation(ctx,fetcher);
   const url=new URL('https://api.open-meteo.com/v1/forecast');
   url.search=new URLSearchParams({latitude:String(location.latitude),longitude:String(location.longitude),daily:'temperature_2m_mean,relative_humidity_2m_mean,precipitation_sum,wind_speed_10m_max,shortwave_radiation_sum',start_date:ctx.start_date,end_date:ctx.end_date,timezone:'America/Sao_Paulo'}).toString();
   const records=weatherRecords(await remoteJson(fetcher,url),ctx);
   const ack=await rpc('weather_sync_apply_v1',{p_fazenda_id:input.fazenda_id,p_context:ctx,p_records:records});
   if(ack?.success!==true||ack.registros!==8) throw new Failure(502,'Não foi possível confirmar a sincronização. Atualize os dados antes de tentar novamente.');
   return reply(200,{...ack,localizacao:location});
  }catch(e){return reply(e instanceof Failure?e.status:502,{error:e instanceof Failure?e.message:'Falha ao sincronizar o clima. Atualize os dados antes de tentar novamente.'});}
 };
}
