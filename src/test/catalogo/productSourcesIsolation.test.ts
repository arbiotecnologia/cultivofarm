import {expect,it} from 'vitest';
import {runPgBattery,pgBatteryTestTimeout} from '../helpers/pgBatterySlot';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
it('fontes produto negam tenant B, anon e DML direto preservando outros tipos e fresh pós-espera',async()=>{
 const result=await runPgBattery('python3',['scripts/product-sources-isolation-20261118/test_pg.py'],{timeout:120000});
 expect(JSON.parse(result.stdout)).toMatchObject({exit_code:0,checks:39});
},pgBatteryTestTimeout(120000));
it('assembly exige binding e autoridade VOLATILE sem pins falsos',async()=>{
 const result=await promisify(execFile)('python3',['scripts/product-sources-isolation-20261118/test_assembly.py']);
 expect(result.stderr).toContain('Ran 4 tests');expect(result.stderr).toContain('OK');
});