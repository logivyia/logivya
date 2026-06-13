import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { isBillingProfileComplete } from "@/server/billing/subscription-guard";
import { writeAuditLog } from "@/server/security/audit";

const schema=z.object({paymentId:z.string(),note:z.string().max(500).optional()});
export async function POST(request:Request){
  try{
    const{user}=await requirePlatformAdmin("admin.payments.confirm",request),parsed=schema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"validation.invalid"},{status:400});
    const payment=await prisma.payment.findUnique({where:{id:parsed.data.paymentId},include:{invoice:true,subscription:true,company:{include:{billingProfile:true}}}});
    if(!payment)return NextResponse.json({error:"NOT_FOUND"},{status:404});if(payment.status==="PAID")return NextResponse.json({payment,idempotent:true});
    const profile=payment.company.billingProfile;if(!isBillingProfileComplete(profile))return NextResponse.json({error:"billing.profileIncomplete"},{status:400});
    const result=await prisma.$transaction(async tx=>{
      const paid=await tx.payment.update({where:{id:payment.id},data:{status:"PAID",paidAt:new Date(),failureReason:null,metadata:{note:parsed.data.note??""}}});
      let invoice=payment.invoice;
      if(!invoice)invoice=await tx.invoice.create({data:{companyId:payment.companyId,subscriptionId:payment.subscriptionId,invoiceType:profile!.invoiceType,status:"DRAFT",currency:payment.currency,subtotalAmount:payment.amount,taxAmount:0,totalAmount:payment.amount,billingName:profile!.billingType==="COMPANY"?profile!.legalName!:profile!.fullName!,billingTaxOffice:profile!.taxOffice,billingTaxNumber:profile!.taxNumber||profile!.nationalIdNumber,billingAddress:[profile!.addressLine1,profile!.addressLine2,profile!.district,profile!.city,profile!.country].filter(Boolean).join(", "),billingEmail:profile!.billingEmail,provider:"MANUAL",metadata:{paymentId:payment.id}}});
      await tx.payment.update({where:{id:payment.id},data:{invoiceId:invoice.id}});
      if(payment.subscriptionId)await tx.subscriptionEvent.createMany({data:[{companyId:payment.companyId,subscriptionId:payment.subscriptionId,actorUserId:user.id,type:"PAYMENT_RECEIVED",message:"Ödeme alındı olarak işaretlendi.",metadata:{paymentId:payment.id}},{companyId:payment.companyId,subscriptionId:payment.subscriptionId,actorUserId:user.id,type:"INVOICE_CREATED",message:"Taslak fatura oluşturuldu.",metadata:{invoiceId:invoice.id}}]});
      await tx.notification.create({data:{companyId:payment.companyId,userId:payment.company.ownerId,type:"PAYMENT_RECEIVED",title:"Ödemeniz alındı",message:`${payment.amount} ${payment.currency} ödemeniz kaydedildi.`}});
      return{payment:paid,invoice};
    });
    await writeAuditLog(request,{companyId:payment.companyId,userId:user.id,action:"payment.marked_paid",entityType:"Payment",entityId:payment.id,after:{invoiceId:result.invoice.id,note:parsed.data.note}});
    return NextResponse.json(result);
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"errors.generic"},{status:403})}
}
