import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){try{const{user}=await requirePlatformAdmin();const{id}=await params;const subscription=await prisma.subscription.update({where:{id},data:{status:"ACTIVE",cancelledAt:null,expiredAt:null,cancelAtPeriodEnd:false}});await prisma.subscriptionEvent.create({data:{companyId:subscription.companyId,subscriptionId:id,actorUserId:user.id,type:"SUBSCRIPTION_REACTIVATED",message:"Abonelik platform yöneticisi tarafından yeniden etkinleştirildi."}});return NextResponse.json({ok:true})}catch{return NextResponse.json({error:"FORBIDDEN"},{status:403})}}
