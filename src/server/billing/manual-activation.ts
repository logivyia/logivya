import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { isBillingProfileComplete } from "@/server/billing/subscription-guard";

export type ManualActivationInput={companyId:string;planSlug:string;billingPeriod:"MONTHLY"|"YEARLY";startsAt:Date;endsAt:Date;currency:string;paymentMethod:"MANUAL_BANK_TRANSFER"|"MANUAL"|"FREE_PROMO"|"OTHER";adminUserId:string;note?:string;idempotencyKey:string;customAmount?:number};
export async function activateSubscriptionManually(input:ManualActivationInput){
  const [company,plan,profile]=await Promise.all([prisma.company.findUnique({where:{id:input.companyId},include:{owner:true}}),prisma.plan.findUnique({where:{slug:input.planSlug}}),prisma.companyBillingProfile.findUnique({where:{companyId:input.companyId}})]);
  if(!company||!plan)throw new Error("NOT_FOUND");
  if(plan.slug!=="trial"&&!isBillingProfileComplete(profile))throw new Error("billing.profileIncomplete");
  const providerPaymentId=`manual:${input.idempotencyKey}`;
  const existing=await prisma.payment.findUnique({where:{provider_providerPaymentId:{provider:"MANUAL",providerPaymentId}},include:{subscription:true,invoice:true}});
  if(existing)return{subscription:existing.subscription,payment:existing,invoice:existing.invoice,idempotent:true};
  const amount=plan.slug==="enterprise"&&input.customAmount!==undefined?new Prisma.Decimal(input.customAmount):input.paymentMethod==="FREE_PROMO"?new Prisma.Decimal(0):input.billingPeriod==="YEARLY"?plan.yearlyPrice:plan.monthlyPrice;
  return prisma.$transaction(async tx=>{
    await tx.subscription.updateMany({where:{companyId:company.id,status:{in:["ACTIVE","TRIALING","PAST_DUE","MANUAL_PENDING","PAYMENT_PENDING"]}},data:{status:"CANCELED",cancelledAt:new Date()}});
    const subscription=await tx.subscription.create({data:{companyId:company.id,planId:plan.id,status:"ACTIVE",billingPeriod:input.billingPeriod,startsAt:input.startsAt,endsAt:input.endsAt,currentPeriodStartsAt:input.startsAt,currentPeriodEndsAt:input.endsAt,source:"MANUAL_ADMIN",provider:"MANUAL",manuallyActivatedByUserId:input.adminUserId}});
    const payment=await tx.payment.create({data:{companyId:company.id,subscriptionId:subscription.id,planId:plan.id,provider:"MANUAL",providerPaymentId,status:"MANUALLY_CONFIRMED",paymentMethod:input.paymentMethod,amount,currency:input.currency,paidAt:new Date(),metadata:{note:input.note??""}}});
    const invoice=await tx.invoice.create({data:{companyId:company.id,subscriptionId:subscription.id,invoiceType:profile!.invoiceType,status:"DRAFT",currency:input.currency,subtotalAmount:amount,taxAmount:0,totalAmount:amount,billingName:profile!.billingType==="COMPANY"?profile!.legalName!:profile!.fullName!,billingTaxOffice:profile!.taxOffice,billingTaxNumber:profile!.taxNumber||profile!.nationalIdNumber,billingAddress:[profile!.addressLine1,profile!.addressLine2,profile!.district,profile!.city,profile!.country].filter(Boolean).join(", "),billingEmail:profile!.billingEmail,provider:"MANUAL",metadata:{paymentId:payment.id}}});
    await tx.payment.update({where:{id:payment.id},data:{invoiceId:invoice.id}});
    await tx.subscriptionEvent.createMany({data:[{companyId:company.id,subscriptionId:subscription.id,actorUserId:input.adminUserId,type:"SUBSCRIPTION_MANUALLY_ACTIVATED",message:`${plan.name} paketi manuel etkinleştirildi.`,metadata:{note:input.note??""}},{companyId:company.id,subscriptionId:subscription.id,actorUserId:input.adminUserId,type:"PAYMENT_RECEIVED",message:"Manuel ödeme alındı.",metadata:{paymentId:payment.id}},{companyId:company.id,subscriptionId:subscription.id,actorUserId:input.adminUserId,type:"INVOICE_CREATED",message:"Taslak fatura oluşturuldu.",metadata:{invoiceId:invoice.id}}]});
    await tx.notification.create({data:{companyId:company.id,userId:company.ownerId,type:"SUBSCRIPTION_ACTIVATED",title:"Aboneliğiniz etkinleştirildi",message:`${plan.name} paketiniz ${input.endsAt.toLocaleDateString("tr-TR")} tarihine kadar aktif.`}});
    await tx.auditLog.create({data:{companyId:company.id,userId:input.adminUserId,action:"subscription.manual_activated",entityType:"Subscription",entityId:subscription.id,metadata:{paymentId:payment.id,invoiceId:invoice.id,note:input.note??""}}});
    return{subscription,payment,invoice};
  });
}
