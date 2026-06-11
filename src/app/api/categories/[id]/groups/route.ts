import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

const schema=z.object({groupIds:z.array(z.string()).max(5000)});
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const{id}=await params;const{company}=await requireApiSession();const category=await prisma.category.findFirst({where:{id,companyId:company.id,archivedAt:null},include:{groups:{include:{group:true}}}});if(!category)return NextResponse.json({error:"NOT_FOUND"},{status:404});return NextResponse.json({category,groups:category.groups.map(item=>item.group)})}catch{return NextResponse.json({error:"UNAUTHORIZED"},{status:401})}}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{const{id}=await params;const{company,membership,user}=await requireApiSession();requirePermission(membership.role,"manage_categories");const parsed=schema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"validation.invalid"},{status:400});const category=await prisma.category.findFirst({where:{id,companyId:company.id,archivedAt:null}});if(!category)return NextResponse.json({error:"NOT_FOUND"},{status:404});const groups=await prisma.whatsAppGroup.findMany({where:{companyId:company.id,id:{in:parsed.data.groupIds}},select:{id:true}});await prisma.categoryGroup.createMany({data:groups.map(group=>({categoryId:id,groupId:group.id})),skipDuplicates:true});await writeAuditLog(request,{companyId:company.id,userId:user.id,action:"category.groups.added",entityType:"Category",entityId:id,after:{groupIds:groups.map(group=>group.id)}});return NextResponse.json({ok:true,count:groups.length})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"errors.generic"},{status:403})}}
