import assert from "node:assert/strict";
import { hasUnconfirmedDelivery, pendingDeliveryState, sendWithDeliveryIntent, UNKNOWN_DELIVERY_OUTCOME, UnknownDeliveryOutcomeError } from "../src/server/messages/delivery-intent";
import { parseStoredMessageKeys, serializeStoredMessageKeys } from "../src/server/messages/delete-for-everyone";
async function main() {
 let state: unknown=null, sends=0;
 const key={id:"synthetic-provider-id",remoteJid:"synthetic@g.us",fromMe:true};
 const send=async (before:()=>Promise<void>)=>{await before();sends++;return key;};
 await assert.rejects(sendWithDeliveryIntent({persistIntent:async()=>{state=pendingDeliveryState([],0);},send,persistResult:async()=>{throw Error("DATABASE_WRITE_FAILED_AFTER_ACCEPT");}}),new RegExp(UNKNOWN_DELIVERY_OUTCOME));
 assert.equal(sends,1);assert.equal(hasUnconfirmedDelivery(state),true);
 await assert.rejects(async()=>{if(hasUnconfirmedDelivery(state))throw new UnknownDeliveryOutcomeError();await send(async()=>{});},new RegExp(UNKNOWN_DELIVERY_OUTCOME));
 assert.equal(sends,1,"replay must not re-enter provider after uncertain acceptance");
 state=null;
 await assert.rejects(sendWithDeliveryIntent({persistIntent:async()=>{throw Error("DATABASE_UNAVAILABLE");},send,persistResult:async()=>{}}),/DATABASE_UNAVAILABLE/);
 assert.equal(sends,1,"transport cannot start without durable intent");
 await assert.rejects(sendWithDeliveryIntent({persistIntent:async()=>{state=pendingDeliveryState([],0);},send:async()=>{throw Error("WHATSAPP_RECONNECT_REQUIRED");},persistResult:async()=>{}}),/WHATSAPP_RECONNECT_REQUIRED/);
 assert.equal(state,null,"preflight failures preserve normal connection retry");
 await sendWithDeliveryIntent({persistIntent:async()=>{state=pendingDeliveryState([],0);},send,persistResult:async result=>{state=serializeStoredMessageKeys([result]);}});
 assert.equal(hasUnconfirmedDelivery(state),false);assert.equal(sends,2);
 const pendingSecond=pendingDeliveryState([key],1);
 assert.deepEqual(parseStoredMessageKeys(pendingSecond),parseStoredMessageKeys(state as Parameters<typeof parseStoredMessageKeys>[0]),"partial accepted message keys remain available for history/deletion");
 console.log("Accepted-then-persist-failed replay blocked; preflight retry retained; intent failure prevents send; stored keys preserved.");
}
void main();
