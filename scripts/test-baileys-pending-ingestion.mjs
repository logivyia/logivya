import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { original, replacement, patchPendingIngestion } from './patch-baileys-pending-ingestion.mjs';

function harness(enabled, body = replacement, failure = false) {
  const ws = new EventEmitter(); ws.isOpen = true;
  const ev = new EventEmitter(), sent = [], logs = [];
  const logger = {info: (...args)=>logs.push(args), warn: (...args)=>logs.push(args)};
  new Function('ws','ev','config','logger','sendNode',body)(ws,ev,{logivyaReceivePendingMessages:enabled},logger,async node=>{
    sent.push(node); if (failure) throw new Error('DO_NOT_LOG_PRIVATE_DATA');
  });
  const preview = ()=>ws.emit('CB:ib,,offline_preview',{attrs:{privateSecret:'must-not-log'}});
  return {ws,ev,sent,logs,preview};
}
test('existing outbound-only handler demonstrates no pending request even for ingestion',()=>{
 const h=harness(true,original);h.preview();assert.equal(h.sent.length,0);
});
for (const enabled of [undefined,false,'true',1]) test(`no exact approved-source opt-in: ${enabled}`,()=>{
 const h=harness(enabled);h.preview();assert.equal(h.sent.length,0);
});
test('approved ingestion requests bounded pending delivery, not full history',()=>{
 const h=harness(true);h.preview();assert.deepEqual(h.sent,[{tag:'ib',attrs:{},content:[{tag:'offline_batch',attrs:{count:'100'}}]}]);
});
test('repeated previews cannot create an unbounded retry loop',()=>{
 const h=harness(true);for(let i=0;i<100;i++)h.preview();assert.equal(h.sent.length,3);
});
test('closed socket cannot request a batch',()=>{const h=harness(true);h.ws.isOpen=false;h.preview();assert.equal(h.sent.length,0)});
test('offline completion stops further pending requests',()=>{
 const h=harness(true);h.ev.emit('connection.update',{receivedPendingNotifications:true});h.preview();assert.equal(h.sent.length,0);
});
test('send failure is observed without retrying or logging private metadata',async()=>{
 const h=harness(true,replacement,true);h.preview();await Promise.resolve();await Promise.resolve();
 assert.equal(h.sent.length,1);assert(!JSON.stringify(h.logs).includes('PRIVATE'));assert(!JSON.stringify(h.logs).includes('must-not-log'));
 assert(h.logs.some(args=>args.includes('approved ingestion pending batch request failed')));
});
test('patch is strict, idempotent and preserves CRLF',()=>{
 const source='// LOGIVYA_OFFLINE_BATCH_DISABLED\n'+original;
 const patched=patchPendingIngestion(source);assert.equal(patchPendingIngestion(patched),patched);
 assert.equal(patchPendingIngestion(source.replaceAll('\n','\r\n')),patched.replaceAll('\n','\r\n'));
 assert.throws(()=>patchPendingIngestion('unexpected'));assert.throws(()=>patchPendingIngestion(source+'\n'+original));
});
