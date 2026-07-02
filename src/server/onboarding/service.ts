import { prisma } from "@/server/db";

export async function syncOnboarding(companyId:string){
  const [company,accounts,groups,categories,messages]=await Promise.all([
    prisma.company.findUnique({where:{id:companyId},include:{billingProfile:true}}),
    prisma.whatsAppAccount.count({where:{companyId,status:{in:["CONNECTED","CONNECTING","DISCONNECTED","RECONNECT_REQUIRED"]},archivedAt:null,NOT:{lastError:{in:["WHATSAPP_LOGGED_OUT","WHATSAPP_CREDENTIALS_MISSING"]}}}}),
    prisma.whatsAppGroup.count({where:{companyId,isArchived:false}}),
    prisma.category.count({where:{companyId,archivedAt:null}}),
    prisma.messageRecipient.count({where:{campaign:{companyId},status:"SENT"}}),
  ]);
  const data={companyProfileCompleted:Boolean(company?.name&&company?.email&&company.billingProfile),whatsappConnected:accounts>0,groupsSynced:groups>0,categoryCreated:categories>0,firstMessageSent:messages>0};
  const complete=Object.values(data).every(Boolean);
  return prisma.onboardingChecklist.upsert({where:{companyId},create:{companyId,...data,completedAt:complete?new Date():null},update:{...data,completedAt:complete?new Date():null}});
}
