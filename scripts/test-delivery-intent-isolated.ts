import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { prisma } from "../src/server/db";
import { hasUnconfirmedDelivery, pendingDeliveryState, sendWithDeliveryIntent, UnknownDeliveryOutcomeError } from "../src/server/messages/delivery-intent";

function guard(){if(process.env.LOGIVYA_ISOLATED_TEST!=="1" || new URL(process.env.DATABASE_URL!).hostname!=="astra-expiration-db")throw Error("ISOLATED_DATABASE_REQUIRED");}
export async function testDurableDeliveryCrash() {
 guard();
 await prisma.$executeRawUnsafe('CREATE TABLE "SyntheticDeliveryProof" (id integer PRIMARY KEY, state jsonb, accepted integer NOT NULL DEFAULT 0)');
 await prisma.$executeRaw`INSERT INTO "SyntheticDeliveryProof" (id) VALUES (1)`;
 const child=spawnSync(process.execPath,["--conditions=react-server","--import","tsx","scripts/test-delivery-intent-isolated.ts","--crash-after-transport"],{cwd:"/app",env:process.env,timeout:10000,encoding:"utf8"});
 assert.equal(child.signal,"SIGKILL",child.stderr);
 const [row]=await prisma.$queryRaw<Array<{state:unknown;accepted:number}>>`SELECT state, accepted FROM "SyntheticDeliveryProof" WHERE id=1`;
 assert.equal(row.accepted,1);assert.equal(hasUnconfirmedDelivery(row.state),true);
 await assert.rejects(async()=>{if(hasUnconfirmedDelivery(row.state))throw new UnknownDeliveryOutcomeError();await prisma.$executeRaw`UPDATE "SyntheticDeliveryProof" SET accepted=accepted+1 WHERE id=1`;},/WHATSAPP_DELIVERY_OUTCOME_UNKNOWN/);
 const [after]=await prisma.$queryRaw<Array<{accepted:number}>>`SELECT accepted FROM "SyntheticDeliveryProof" WHERE id=1`;
 assert.equal(after.accepted,1);
 console.log(JSON.stringify({test:"durable-delivery-process-crash",ok:true,syntheticProviderAcceptances:after.accepted,realMessagesSent:0}));
}
if(process.argv.includes("--crash-after-transport")){
 guard();
 void sendWithDeliveryIntent({
  persistIntent:async()=>{await prisma.$executeRaw`UPDATE "SyntheticDeliveryProof" SET state=${JSON.stringify(pendingDeliveryState([],0))}::jsonb WHERE id=1`;},
  send:async before=>{await before();await prisma.$executeRaw`UPDATE "SyntheticDeliveryProof" SET accepted=accepted+1 WHERE id=1`;process.kill(process.pid,"SIGKILL");return "unreachable";},
  persistResult:async()=>{throw Error("UNREACHABLE");},
 }).finally(()=>prisma.$disconnect());
}
