import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

const schema=z.object({phoneNumber:z.string().regex(/^\+?[0-9]{7,15}$/)});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const {id}=await params,{company,membership}=await requireApiSession();
    requirePermission(membership.role,"connect_accounts");
    const parsed=schema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"validation.phone"},{status:400});
    const account=await prisma.whatsAppAccount.findFirst({where:{id,companyId:company.id},select:{provider:true}});
    if(!account)return NextResponse.json({error:"NOT_FOUND"},{status:404});
    return NextResponse.json({error:"accounts.pairingUnsupported",supported:false},{status:501});
  } catch(error){return NextResponse.json({error:error instanceof Error?error.message:"errors.generic"},{status:403})}
}
