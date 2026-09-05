import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import {marker,original,replacement,patchIngestionAck} from './patch-baileys-ingestion-ack.mjs';
const installed=readFileSync('node_modules/@whiskeysockets/baileys/lib/Socket/messages-recv.js','utf8');
const base=installed.includes(marker)?installed.replaceAll('\r\n','\n').replace(replacement,original):installed;
function handler(source){
 const ast=ts.createSourceFile('recv.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),found=[];
 function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='handleMessage')found.push(node.initializer.getText(ast));ts.forEachChild(node,visit)}visit(ast);assert.equal(found.length,1);return found[0];
}
function harness({patched=true,enabled=true,stub,missing=false,ignore=false,msmsg=false,decryptFails=false,ackFails=false,closed=false,processing}={}){
 const ack=[],receipts=[],upserts=[],warnings=[];
 const msg={key:{remoteJid:'test@g.us',fromMe:false},message:{conversation:'test'},...(stub?{messageStubType:1,messageStubParameters:[missing?'MISSING_KEYS':'DECRYPT_FAILED']}: {})};
 const bindings={
  config:{logivyaReceivePendingMessages:enabled},ws:{isOpen:!closed},
  shouldIgnoreJid:()=>ignore,getBinaryNodeChild:(_,tag)=>tag==='enc'?{attrs:{type:msmsg?'msmsg':'skmsg'}}:null,
  sendMessageAck:async(n,reason)=>{ack.push(reason||'ACK');if(ackFails)throw Error('PRIVATE')},
  logger:{debug(){},error(){},warn:(...a)=>warnings.push(a)},placeholderResendCache:{get:()=>false},
  decryptMessageNode:()=>({fullMessage:msg,category:'group',author:'sender',decrypt:async()=>{if(decryptFails)throw Error('DECRYPT')}}),
  authState:{creds:{me:{id:'owner',lid:'lid'}}},signalRepository:{},
  proto:{Message:{ProtocolMessage:{Type:{SHARE_PHONE_NUMBER:99}}},WebMessageInfo:{StubType:{CIPHERTEXT:1}}},
  NO_MESSAGE_FOUND_ERROR_TEXT:'MISSING_MESSAGE',MISSING_KEYS_ERROR_TEXT:'MISSING_KEYS',NACK_REASONS:{ParsingError:487},
  processingMutex:{mutex:processing|| (async fn=>fn())},retryMutex:{mutex:async fn=>fn()},
  sendRetryRequest:async()=>{},retryRequestDelayMs:0,sendActiveReceipts:false,isJidUser:()=>false,
  sendReceipt:async(...x)=>receipts.push(x),getHistoryMsg:()=>null,cleanMessage:()=>{},upsertMessage:async(...x)=>upserts.push(x),
 };
 const run=new Function(...Object.keys(bindings),'return '+handler(patched?patchIngestionAck(base):base))(...Object.values(bindings));
 return {ack,receipts,upserts,warnings,run:()=>run({attrs:{from:'test@g.us',id:'test'}})};
}
test('unpatched success path reproduces missing protocol ACK',async()=>{const h=harness({patched:false});await h.run();assert.equal(h.receipts.length,1);assert.deepEqual(h.ack,[])});
test('approved successful message receives one ACK after processing',async()=>{const h=harness();await h.run();assert.equal(h.upserts.length,1);assert.deepEqual(h.ack,['ACK'])});
test('outbound-only policy remains unchanged',async()=>{const h=harness({enabled:false});await h.run();assert.deepEqual(h.ack,[])});
test('decryption stub is retried and ACKed without a duplicate message',async()=>{const h=harness({stub:true});await h.run();assert.deepEqual(h.ack,['ACK']);assert.equal(h.upserts.length,1)});
test('explicit missing-key NACK is not duplicated with success ACK',async()=>{const h=harness({stub:true,missing:true});await h.run();assert.deepEqual(h.ack,[487]);assert.equal(h.upserts.length,0)});
for(const option of ['ignore','msmsg'])test(`early ${option} ACK remains exactly once`,async()=>{const h=harness({[option]:true});await h.run();assert.deepEqual(h.ack,['ACK'])});
test('completed exception path ACK does not leave flow-control waiting',async()=>{const h=harness({decryptFails:true});await h.run();assert.deepEqual(h.ack,['ACK'])});
test('unfinished processing is never acknowledged early',async()=>{let release;const wait=new Promise(resolve=>release=resolve);const h=harness({processing:async fn=>{await wait;return fn()}});const work=h.run();await Promise.resolve();assert.deepEqual(h.ack,[]);release();await work;assert.deepEqual(h.ack,['ACK'])});
test('closed socket does not send ACK',async()=>{const h=harness({closed:true});await h.run();assert.deepEqual(h.ack,[])});
test('ACK failure is bounded and does not leak error payload',async()=>{const h=harness({ackFails:true});await h.run();assert.equal(h.ack.length,1);assert.equal(h.warnings.length,1);assert(!JSON.stringify(h.warnings).includes('PRIVATE'))});
test('patch is strict, idempotent and newline stable',()=>{const a=patchIngestionAck(base);assert.equal(patchIngestionAck(a),a);assert.equal(patchIngestionAck(base.replaceAll('\r\n','\n').replaceAll('\n','\r\n')),a.replaceAll('\r\n','\n').replaceAll('\n','\r\n'));assert.throws(()=>patchIngestionAck('bad'))});
