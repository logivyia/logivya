import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

export async function DELETE(request:Request,{params}:{params:Promise<{id:string;groupId:string}>}){try{const{id,groupId}=await params;const{company,membership,user}=await requireApiSession();requirePermission(membership.role,"manage_categories");const category=await prisma.category.findFirst({where:{id,companyId:company.id}});if(!category)return NextResponse.json({error:"NOT_FOUND"},{status:404});await prisma.categoryGroup.deleteMany({where:{categoryId:id,groupId,group:{companyId:company.id}}});await writeAuditLog(request,{companyId:company.id,userId:user.id,action:"category.group.removed",entityType:"Category",entityId:id,after:{groupId}});return NextResponse.json({ok:true})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"errors.generic"},{status:403})}}
