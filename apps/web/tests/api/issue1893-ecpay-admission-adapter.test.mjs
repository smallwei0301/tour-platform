import {test, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {__setSupabaseClientForTest} from '../../src/lib/supabase-env.mjs';
import {upsertEcpayPaymentAttemptDb} from '../../src/lib/payment/db-payment-attempt.mjs';
const original={SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY};
afterEach(()=>{__setSupabaseClientForTest(null);for(const [k,v] of Object.entries(original)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
const orderId='22222222-2222-4222-8222-222222222222';
const input={orderId,merchantTradeNo:'ATTEMPT123',amountTwd:1200};
const admitted=(patch={})=>({outcome:'reuse',id:'11111111-1111-4111-8111-111111111111',orderId,provider:'ecpay',merchantTradeNo:'WINNER123',status:'pending',amountTwd:1200,reused:true,...patch});
function inject(reply){process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only-placeholder';const calls=[];__setSupabaseClientForTest({from(){throw new Error('direct payment SELECT/INSERT is forbidden');},async rpc(name,args){calls.push({name,args});return typeof reply==='function'?reply(args):reply;}});return calls;}
test('both existing HTTP entries share the exact admission adapter without route edits',()=>{for(const name of ['../../app/api/v2/payments/ecpay/create/route.ts','../../app/api/payments/ecpay/create/route.ts']){const s=readFileSync(new URL(name,import.meta.url),'utf8');assert.match(s,/import \{ upsertEcpayPaymentAttemptDb \} from .*payment\/db-payment-attempt\.mjs/);assert.match(s,/await upsertEcpayPaymentAttemptDb\(/);assert.match(s,/paymentAttempt\.merchantTradeNo/);}});
test('same order concurrent callers receive only the RPC winner identity',async()=>{const calls=inject({data:admitted(),error:null});const results=await Promise.all([upsertEcpayPaymentAttemptDb(input),upsertEcpayPaymentAttemptDb({...input,merchantTradeNo:'SECOND123'})]);assert.equal(results[0].merchantTradeNo,'WINNER123');assert.equal(results[1].merchantTradeNo,results[0].merchantTradeNo);assert.equal(calls.length,2);assert.deepEqual(calls[0],{name:'fn_admit_initial_payment_attempt',args:{p_order_id:orderId,p_provider:'ecpay',p_merchant_trade_no:'ATTEMPT123'}});});
for(const code of ['PAYMENT_RECONCILIATION_REQUIRED','PAYMENT_PROVIDER_CONFLICT','ORDER_NOT_MATERIALIZED','ORDER_PAYMENT_EXPIRED'])test(`RPC hold ${code} never supplies provider launch params`,async()=>{inject({data:{outcome:'hold',code},error:null});await assert.rejects(upsertEcpayPaymentAttemptDb(input),e=>e.code===code);});
test('RPC errors never fall back to direct insert even for unique-conflict errors',async()=>{const calls=inject({data:null,error:{code:'23505',message:'synthetic conflict'}});await assert.rejects(upsertEcpayPaymentAttemptDb(input),e=>e.code==='23505');assert.equal(calls.length,1);});
test('amount changed since HTTP pre-read remains fail closed',async()=>{inject({data:admitted({amountTwd:1300}),error:null});await assert.rejects(upsertEcpayPaymentAttemptDb(input),e=>e.code==='PAYMENT_AMOUNT_CHANGED');});
test('malformed RPC success remains fail closed',async()=>{inject({data:admitted({merchantTradeNo:null}),error:null});await assert.rejects(upsertEcpayPaymentAttemptDb(input),/invalid initial payment admission RPC response/);});
