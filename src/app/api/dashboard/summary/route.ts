import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function GET(){
  try{
    const{company,user}=await requireApiSession();
    const monthStart=new Date();monthStart.setUTCDate(1);monthStart.setUTCHours(0,0,0,0);
    const [totalAccounts,connectedAccounts,groups,contacts,sentThisMonth,failedMessages,recentCampaigns,subscription]=await Promise.all([
      prisma.whatsAppAccount.count({where:{companyId:company.id,archivedAt:null}}),
      prisma.whatsAppAccount.count({where:{companyId:company.id,archivedAt:null,status:"CONNECTED"}}),
      prisma.whatsAppGroup.count({where:{companyId:company.id,isArchived:false}}),
      prisma.contact.count({where:{companyId:company.id}}),
      prisma.messageRecipient.count({where:{campaign:{companyId:company.id,deletedAt:null},status:"SENT",sentAt:{gte:monthStart}}}),
      prisma.messageRecipient.count({where:{campaign:{companyId:company.id,deletedAt:null},status:"FAILED"}}),
      prisma.messageCampaign.findMany({where:{companyId:company.id,deletedAt:null},include:{createdBy:{select:{name:true}}},orderBy:{createdAt:"desc"},take:10}),
      prisma.subscription.findFirst({where:{companyId:company.id},include:{plan:true},orderBy:{createdAt:"desc"}}),
    ]);
    return NextResponse.json({user:{name:user.name},accounts:{connected:connectedAccounts,total:totalAccounts},groups,contacts,sentThisMonth,failedMessages,recentCampaigns,subscription});
  }catch{return NextResponse.json({error:"UNAUTHORIZED"},{status:401})}
}
