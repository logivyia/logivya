import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

const schema=z.object({role:z.enum(["OWNER","ADMIN","OPERATOR","VIEWER"]).optional(),status:z.enum(["ACTIVE","INVITED","SUSPENDED"]).optional()});
async function authorize(companyId:string,actorId:string,actorRole:string,targetId:string){
  if(!["OWNER","ADMIN"].includes(actorRole))throw new Error("FORBIDDEN");
  const target=await prisma.companyUser.findFirst({where:{id:targetId,companyId},include:{user:true}});
  if(!target)throw new Error("NOT_FOUND");
  if(target.role==="OWNER"&&actorRole!=="OWNER")throw new Error("FORBIDDEN");
  if(target.userId===actorId&&target.role==="OWNER"){
    const owners=await prisma.companyUser.count({where:{companyId,role:"OWNER",status:"ACTIVE"}});
    if(owners<=1)throw new Error("users.lastOwner");
  }
  return target;
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{const{id}=await params,{company,membership,user}=await requireApiSession();const target=await authorize(company.id,user.id,membership.role,id);const parsed=schema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"validation.invalid"},{status:400});if(parsed.data.role==="OWNER"&&membership.role!=="OWNER")return NextResponse.json({error:"FORBIDDEN"},{status:403});await prisma.companyUser.update({where:{id},data:parsed.data});await writeAuditLog(request,{companyId:company.id,userId:user.id,action:"company.user.updated",entityType:"CompanyUser",entityId:id,before:{role:target.role,status:target.status},after:parsed.data});return NextResponse.json({ok:true})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"errors.generic"},{status:403})}}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){try{const{id}=await params,{company,membership,user}=await requireApiSession();const target=await authorize(company.id,user.id,membership.role,id);await prisma.companyUser.delete({where:{id}});await prisma.userSession.updateMany({where:{userId:target.userId,companyId:company.id,revokedAt:null},data:{revokedAt:new Date()}});await writeAuditLog(request,{companyId:company.id,userId:user.id,action:"company.user.removed",entityType:"CompanyUser",entityId:id,before:{email:target.user.email,role:target.role}});return NextResponse.json({ok:true})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"errors.generic"},{status:403})}}
