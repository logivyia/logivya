import { prisma } from "@/server/db";
import { emailProvider, type TemplateEmailInput } from "@/server/email/provider";

export async function sendTemplateEmailSafely(input:TemplateEmailInput&{companyId?:string;userId?:string}){
  const provider=process.env.EMAIL_PROVIDER||"PLACEHOLDER";
  const log=await prisma.emailDeliveryLog.create({data:{companyId:input.companyId,userId:input.userId,template:input.template,recipient:input.to,provider,status:"PENDING"}});
  try{
    const result=await emailProvider().sendTemplateEmail(input);
    await prisma.emailDeliveryLog.update({where:{id:log.id},data:{status:"SENT",providerId:result.providerId,sentAt:new Date()}});
  }catch(error){
    await prisma.emailDeliveryLog.update({where:{id:log.id},data:{status:"FAILED",errorCode:error instanceof Error?error.name:"UNKNOWN"}});
  }
}
