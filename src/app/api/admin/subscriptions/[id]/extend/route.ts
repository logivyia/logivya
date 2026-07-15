import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

const schema=z.object({endsAt:z.coerce.date(),note:z.string().max(500).optional()});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const{user}=await requirePlatformAdmin("admin.subscriptions.approve", request),{id}=await params,parsed=schema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"validation.invalid"},{status:400});
    const before=await prisma.subscription.findUnique({where:{id}});if(!before)return NextResponse.json({error:"NOT_FOUND"},{status:404});
    const subscription=await prisma.$transaction(async(tx)=>{const changed=await tx.subscription.update({where:{id},data:{endsAt:parsed.data.endsAt,currentPeriodEndsAt:parsed.data.endsAt,status:"ACTIVE",expiredAt:null}});await tx.subscriptionEvent.create({data:{companyId:changed.companyId,subscriptionId:id,actorUserId:user.id,type:"SUBSCRIPTION_ACTIVATED",message:"Abonelik süresi uzatıldı.",metadata:{note:parsed.data.note??"",endsAt:parsed.data.endsAt}}});await tx.subscriptionAuditLog.create({data:{companyId:changed.companyId,subscriptionId:id,actorUserId:user.id,eventType:"ADMIN_EXTEND",previousState:{status:before.status,endsAt:before.endsAt?.toISOString()??null},newState:{status:changed.status,endsAt:changed.endsAt?.toISOString()??null,note:parsed.data.note??""}}});return changed});
    await writeAuditLog(request,{companyId:subscription.companyId,userId:user.id,action:"subscription.extended",entityType:"Subscription",entityId:id,before:{endsAt:before.endsAt},after:{endsAt:subscription.endsAt,note:parsed.data.note}});
    return NextResponse.json({subscription});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"errors.generic"},{status:403})}
}
