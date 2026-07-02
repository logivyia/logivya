import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
export async function GET(request: Request){try{await requirePlatformAdmin("admin.billing.read", request);const subscriptions=await prisma.subscription.findMany({include:{company:{select:{name:true,email:true}},plan:true,events:{orderBy:{createdAt:"desc"},take:10},payments:{orderBy:{createdAt:"desc"},take:10},invoices:{orderBy:{createdAt:"desc"},take:10}},orderBy:{createdAt:"desc"},take:200});return NextResponse.json({subscriptions})}catch{return NextResponse.json({error:"FORBIDDEN"},{status:403})}}
