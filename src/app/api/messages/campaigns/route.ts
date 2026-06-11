export { POST } from "@/app/api/campaigns/route";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
export async function GET(request:Request){try{const{company}=await requireApiSession();const url=new URL(request.url),cursor=url.searchParams.get("cursor"),showDeleted=url.searchParams.get("showDeleted")==="true",status=url.searchParams.get("status");const campaigns=await prisma.messageCampaign.findMany({where:{companyId:company.id,...(!showDeleted?{deletedAt:null}:{}),...(status?{status:status as never}:{})},include:{createdBy:{select:{name:true}},_count:{select:{recipients:true}}},orderBy:{createdAt:"desc"},take:51,...(cursor?{cursor:{id:cursor},skip:1}:{})});const hasMore=campaigns.length>50;return NextResponse.json({campaigns:campaigns.slice(0,50),nextCursor:hasMore?campaigns[49]?.id:null})}catch{return NextResponse.json({error:"UNAUTHORIZED"},{status:401})}}
