import { NextResponse } from "next/server";
import { getRequestLocale } from "@/i18n/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { localizeNotificationRecord } from "@/server/notifications/service";

export async function GET(request: Request){try{const{company,user}=await requireApiSession();const rows=await prisma.notification.findMany({where:{companyId:company.id,userId:user.id},orderBy:{createdAt:"desc"},take:30});const locale=await getRequestLocale(request.headers.get("x-logivya-locale"));const notifications=await Promise.all(rows.map((item)=>localizeNotificationRecord(item,locale)));return NextResponse.json({notifications,unread:notifications.filter(item=>!item.isRead).length})}catch{return NextResponse.json({error:"UNAUTHORIZED"},{status:401})}}
export async function POST(){try{const{company,user}=await requireApiSession();await prisma.notification.updateMany({where:{companyId:company.id,userId:user.id,isRead:false},data:{isRead:true}});return NextResponse.json({ok:true})}catch{return NextResponse.json({error:"UNAUTHORIZED"},{status:401})}}
