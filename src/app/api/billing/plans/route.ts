import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
export async function GET(){try{await requireApiSession();return NextResponse.json({plans:await prisma.plan.findMany({where:{isActive:true},orderBy:{monthlyPrice:"asc"}})})}catch{return NextResponse.json({error:"UNAUTHORIZED"},{status:401})}}
