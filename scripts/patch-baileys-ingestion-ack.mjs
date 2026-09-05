import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export const marker='LOGIVYA_APPROVED_INGESTION_ACK_V1';
export const original=`        catch (error) {
            logger.error({ error, node }, 'error in handling message');
        }
    };
    const fetchMessageHistory`;
export const replacement=`        catch (error) {
            logger.error({ error, node }, 'error in handling message');
        }
        finally {
            // ${marker}: protocol ACK only after processing settles.
            // Never acknowledge an unfinished decrypt, and never duplicate an explicit NACK.
            if (config.logivyaReceivePendingMessages === true && ws.isOpen &&
                msg?.messageStubParameters?.[0] !== MISSING_KEYS_ERROR_TEXT) {
                await sendMessageAck(node).catch(() => logger.warn('approved ingestion message ACK failed'));
            }
        }
    };
    const fetchMessageHistory`;
export function patchIngestionAck(input){
 const eol=input.includes('\r\n')?'\r\n':'\n';const source=input.replaceAll('\r\n','\n');
 if(source.includes(marker)){if(!source.includes(replacement))throw Error('Incomplete ingestion ACK patch');return input}
 if(source.split(original).length!==2)throw Error('Unexpected incoming handler; ACK patch refused');
 const result=source.replace(original,replacement);return eol==='\r\n'?result.replaceAll('\n',eol):result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const target=path.resolve(process.argv[2]||'node_modules/@whiskeysockets/baileys/lib/Socket/messages-recv.js');
 const before=await readFile(target,'utf8'),after=patchIngestionAck(before);
 if(before!==after)await writeFile(target,after,'utf8');
 console.log(before===after?'Ingestion ACK patch already applied.':'Ingestion ACK patch applied.');
}
