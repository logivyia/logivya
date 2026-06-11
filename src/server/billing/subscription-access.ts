import { prisma } from "@/server/db";

export const INACTIVE_SUBSCRIPTION_MESSAGE="Aboneliğiniz aktif değil. Mesaj göndermek veya yeni WhatsApp hesabı bağlamak için paketinizi yenileyin.";

export class SubscriptionAccessService {
  async getCurrent(companyId:string){
    const subscription=await prisma.subscription.findFirst({where:{companyId},include:{plan:true},orderBy:{createdAt:"desc"}});
    if(!subscription)return null;
    const now=new Date();
    const valid=["ACTIVE","TRIALING"].includes(subscription.status)&&(!subscription.currentPeriodEndsAt||subscription.currentPeriodEndsAt>now)&&(!subscription.trialEndsAt||subscription.trialEndsAt>now);
    return{subscription,plan:subscription.plan,valid};
  }
  async requireActive(companyId:string){const current=await this.getCurrent(companyId);if(!current?.valid)throw new Error("subscription.inactive");return current}
  async canConnectWhatsAppAccount(companyId:string){const current=await this.getCurrent(companyId);if(!current?.valid)return{allowed:false,reason:"subscription.inactive",limit:0};const count=await prisma.whatsAppAccount.count({where:{companyId,archivedAt:null}});return{allowed:count<current.plan.maxWhatsappAccounts,reason:count>=current.plan.maxWhatsappAccounts?"accounts.planLimit":undefined,limit:current.plan.maxWhatsappAccounts}}
  async canSendMessage(companyId:string){const current=await this.getCurrent(companyId);return{allowed:Boolean(current?.valid),reason:current?.valid?undefined:"subscription.inactive"}}
  async canUseScheduledMessages(companyId:string){const current=await this.getCurrent(companyId);return Boolean(current?.valid&&current.plan.hasScheduledMessages)}
  async canUseRecurringMessages(companyId:string){const current=await this.getCurrent(companyId);return Boolean(current?.valid&&current.plan.hasRecurringMessages)}
  async canInviteUser(companyId:string){const current=await this.getCurrent(companyId);if(!current?.valid)return{allowed:false,limit:0};const count=await prisma.companyUser.count({where:{companyId,status:{not:"SUSPENDED"}}});return{allowed:count<current.plan.maxTeamUsers,limit:current.plan.maxTeamUsers}}
  async canUseAdvancedReports(companyId:string){const current=await this.getCurrent(companyId);return Boolean(current?.valid&&current.plan.advancedReportingEnabled)}
  async getAccountLimit(companyId:string){return(await this.getCurrent(companyId))?.plan.maxWhatsappAccounts??0}
  async getTeamUserLimit(companyId:string){return(await this.getCurrent(companyId))?.plan.maxTeamUsers??0}
  async getCurrentPlan(companyId:string){return(await this.getCurrent(companyId))?.plan??null}
  async getSubscriptionStatus(companyId:string){return(await this.getCurrent(companyId))?.subscription.status??"EXPIRED"}
}
export const subscriptionAccess=new SubscriptionAccessService();
