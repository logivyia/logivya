import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const {id}=await params,{company,membership,user}=await requireApiSession();
    requirePermission(membership.role,"archive_accounts");
    const account=await prisma.whatsAppAccount.findFirst({where:{id,companyId:company.id},include:{_count:{select:{recipients:true}}}});
    if(!account)return NextResponse.json({error:"NOT_FOUND"},{status:404});
    if(account._count.recipients>0){
      await prisma.whatsAppAccount.update({where:{id},data:{archivedAt:new Date(),status:"ARCHIVED"}});
      await writeAuditLog(request,{companyId:company.id,userId:user.id,action:"whatsapp.account.archived_instead_of_delete",entityType:"WhatsAppAccount",entityId:id,before:{recipientCount:account._count.recipients}});
      return NextResponse.json({ok:true,archived:true});
    }
    await prisma.whatsAppAccount.delete({where:{id}});
    await writeAuditLog(request,{companyId:company.id,userId:user.id,action:"whatsapp.account.deleted",entityType:"WhatsAppAccount",entityId:id,before:{label:account.label}});
    return NextResponse.json({ok:true,deleted:true});
  } catch(error){return NextResponse.json({error:error instanceof Error?error.message:"errors.generic"},{status:403})}
}
