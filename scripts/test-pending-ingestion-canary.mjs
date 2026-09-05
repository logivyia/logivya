import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import ts from 'typescript';
const source=readFileSync('src/worker/baileys-provider.ts','utf8');
const ast=ts.createSourceFile('provider.ts',source,ts.ScriptTarget.Latest,true);
const statements=[];
function visit(node){
 if(ts.isMethodDeclaration(node)&&node.name.getText(ast)==='startSession')statements.push(...node.body.statements);
 ts.forEachChild(node,visit);
}
visit(ast);
const start=statements.findIndex(s=>s.getText(ast).startsWith('const pendingIngestionCanarySources ='));
assert(start>=0,'CANARY_MISSING');
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const policy=compile(statements.slice(start,start+2).map(s=>s.getText(ast)).join('\n'));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const mainAccount='cmrt9rhjx001904jinguoxbwq';
async function run({accountId=mainAccount,control=null,group={externalGroupId:'owned@g.us'},fail=false}={}){
 const queries=[],warnings=[];
 const prisma={whatsAppIngestionControl:{findUnique:async q=>{queries.push(['control',q]);if(fail)throw Error('PRIVATE');return control}},whatsAppGroup:{findFirst:async q=>{queries.push(['group',q]);return group}}};
 const result=await new AsyncFunction('accountId','prisma','logger',policy+'\nreturn pendingIngestionCanarySources;')(accountId,prisma,{warn:(...x)=>warnings.push(x)});
 return {result,queries,warnings};
}
test('other accounts never query or enable pending reception',async()=>{const h=await run({accountId:'other'});assert.deepEqual(h.result,[]);assert.deepEqual(h.queries,[])});
for(const control of [{globallyPaused:true},{emergencyKillSwitch:true}])test(`global stop prevents canary ${JSON.stringify(control)}`,async()=>{const h=await run({control});assert.deepEqual(h.result,[]);assert.equal(h.queries.length,1)});
test('missing approved group disables reception',async()=>assert.deepEqual((await run({group:null})).result,[]));
test('DB failure fails closed without leaking exception data',async()=>{const h=await run({fail:true});assert.deepEqual(h.result,[]);assert.equal(h.warnings.length,1);assert(!JSON.stringify(h.warnings).includes('PRIVATE'))});
test('policy binds group and account owner/company and explicit approval',async()=>{
 const h=await run();assert.deepEqual(h.result,['owned@g.us']);const q=h.queries[1][1];
 assert.deepEqual(q.where,{id:'cmtcj23rr000y07qsyjli661f',accountId:mainAccount,userId:'cmq9us8zh000104jo09eg2aek',companyId:'cmq9us8zl000204jo6dh0jwwj',isArchived:false,ingestionEnabled:true,ingestionApprovedAt:{not:null},ingestionPausedAt:null,account:{archivedAt:null,userId:'cmq9us8zh000104jo09eg2aek',companyId:'cmq9us8zl000204jo6dh0jwwj'}});
 assert.deepEqual(q.select,{externalGroupId:true});
 assert(source.includes('...(pendingIngestionCanarySources.length ? { logivyaReceivePendingMessages: true } : {})'));
 assert(source.includes('shouldSyncHistoryMessage: () => false'));
});
const observation=statements.find(s=>ts.isIfStatement(s)&&s.expression.getText(ast)==='pendingIngestionCanarySources.length');
assert(observation,'OBSERVATION_MISSING');
test('diagnostics cannot log other groups, private content or unbounded traffic',()=>{
 const socket={ws:new EventEmitter(),ev:new EventEmitter()},logs=[];
 new Function('pendingIngestionCanarySources','socket','accountId','generation','isCurrentSession','logger',compile(observation.getText(ast)))(['owned@g.us'],socket,mainAccount,1,()=>true,{info:(...args)=>logs.push(args)});
 socket.ws.emit('CB:message',{attrs:{from:'other@g.us'},content:'PRIVATE'});assert.equal(logs.length,0);
 for(let n=0;n<50;n++)socket.ws.emit('CB:message',{attrs:{from:'owned@g.us',id:'PRIVATE'},content:'PRIVATE'});
 assert.equal(logs.length,20);assert(!JSON.stringify(logs).includes('PRIVATE'));assert(!JSON.stringify(logs).includes('@g.us'));
});
