import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function GET(){try{const{company,user}=await requireApiSession();const notifications=await prisma.notification.findMany({where:{companyId:company.id,userId:user.id},orderBy:{createdAt:"desc"},take:30});return NextResponse.json({notifications,unread:notifications.filter(item=>!item.isRead).length})}catch{return NextResponse.json({error:"UNAUTHORIZED"},{status:401})}}
export async function POST(){try{const{company,user}=await requireApiSession();await prisma.notification.updateMany({where:{companyId:company.id,userId:user.id,isRead:false},data:{isRead:true}});return NextResponse.json({ok:true})}catch{return NextResponse.json({error:"UNAUTHORIZED"},{status:401})}}
