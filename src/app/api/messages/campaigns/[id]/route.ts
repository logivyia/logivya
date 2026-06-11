import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const{id}=await params,{company}=await requireApiSession();const campaign=await prisma.messageCampaign.findFirst({where:{id,companyId:company.id},include:{createdBy:{select:{name:true,email:true}},_count:{select:{recipients:true}}}});if(!campaign)return NextResponse.json({error:"NOT_FOUND"},{status:404});return NextResponse.json({campaign})}catch{return NextResponse.json({error:"UNAUTHORIZED"},{status:401})}}
