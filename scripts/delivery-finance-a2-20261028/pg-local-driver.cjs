// Offline-only driver: refuse TCP and use the disposable Unix socket.
const {Client}=require('pg'); const readline=require('node:readline');
const [socket,port,mode]=process.argv.slice(2);
if(!socket?.startsWith('/tmp/billing-') || port!=='55538') throw Error('offline socket required');
const client=new Client({host:socket,port:Number(port),user:'postgres',database:'postgres'});
function output(result){for(const r of (Array.isArray(result)?result:[result])){for(const row of r.rows||[])console.log(Object.values(row).map(v=>v===true?'t':v===false?'f':v===null?'':typeof v==='object'?JSON.stringify(v):v).join('|'));}}
async function run(q){q=q.replace(/^\\set .*\n/gm,'');if(!q.trim())return;try{output(await client.query(q));}catch(e){console.error(e.code+' '+e.message);process.exitCode=1;}}
(async()=>{await client.connect();if(mode==='session'){for await(const line of readline.createInterface({input:process.stdin}))await run(line);}else{let s='';for await(const chunk of process.stdin)s+=chunk;await run(s);}await client.end();})().catch(e=>{console.error(e.code+' '+e.message);process.exitCode=1;});
