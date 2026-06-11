import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
export async function GET(){try{const{company}=await requireApiSession();const subscription=await prisma.subscription.findFirst({where:{companyId:company.id},include:{plan:true,events:{orderBy:{createdAt:"desc"},take:50}},orderBy:{createdAt:"desc"}});return NextResponse.json({subscription})}catch{return NextResponse.json({error:"UNAUTHORIZED"},{status:401})}}
