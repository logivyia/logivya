import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
export async function GET(){try{await requireApiSession();const plans=await prisma.plan.findMany({where:{isActive:true}});const order=["trial","starter","professional","enterprise"];plans.sort((a,b)=>order.indexOf(a.slug)-order.indexOf(b.slug));return NextResponse.json({plans})}catch{return NextResponse.json({error:"UNAUTHORIZED"},{status:401})}}
