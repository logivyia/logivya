import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){try{const{user}=await requirePlatformAdmin();const{id}=await params;const subscription=await prisma.subscription.update({where:{id},data:{status:"CANCELED",cancelledAt:new Date(),cancelAtPeriodEnd:false}});await prisma.subscriptionEvent.create({data:{companyId:subscription.companyId,subscriptionId:id,actorUserId:user.id,type:"SUBSCRIPTION_CANCELED",message:"Abonelik platform yöneticisi tarafından iptal edildi."}});return NextResponse.json({ok:true})}catch{return NextResponse.json({error:"FORBIDDEN"},{status:403})}}
