import locales from './telegram-management-locales.json';
export function telegramManagementCopy(locale: string) {
 const c=(locales as Record<string,typeof locales.en>)[locale] ?? locales.en;
 const format=(text:string,values:Record<string,string|number>)=>Object.entries(values).reduce((s,[key,value])=>s.replaceAll(`{${key}}`,String(value)),text);
 const metric=(key:'sentMetric'|'errorMetric'|'pendingMetric',count:number)=>format(c[key],{count});
 return { ...c,
  syncSummary:(synced:number,sendable:number)=>`${c.chats}: ${synced} · ${c.sendableMetric}: ${sendable}`,
  selectedChats:(count:number)=>`${c.chats}: ${count}`,
  selectedCategories:(count:number)=>`${c.categories}: ${count}`,
  sendToChats:(count:number)=>`${c.sendMessage} (${count})`,
  targetCount:(count:number)=>format(c.targetsMetric,{count}),
  runSummary:(sent:number,failed:number,waiting:number)=>[metric('sentMetric',sent),metric('errorMetric',failed),metric('pendingMetric',waiting)].join(' · '),
  scheduled:(date:string)=>format(c.scheduledAt,{date}),
  deleteDescription:(count:number)=>`${c.deleteDescription} (${count})`,
  deleteSucceeded:(count:number)=>`${c.deleteForEveryone}: ${count} · ${c.success}`,
  deletePartial:(deleted:number,failed:number)=>`${c.deleteForEveryone}: ${deleted} · ${metric('errorMetric',failed)}`,
  deleteSummary:(deleted:number,total:number,failed:number)=>format(c.deleteEveryoneProgress,{deleted,total,failed,pending:Math.max(0,total-deleted-failed)}),
  memberSummary:(type:string,count:number,canSend:boolean)=>`${type==='CHANNEL'?c.channel:type==='PRIVATE'?c.privateChat:c.chats} · ${count} ${c.members}${canSend?'':` · ${c.notSendable}`}`,
 };
}
