import { prisma } from "@/server/db";
import { createExpiringToken } from "@/server/security/authentication";

export async function ensureInitialPlatformAdminInvite(){
  const email=process.env.INITIAL_PLATFORM_ADMIN_EMAIL?.trim().toLowerCase(),name=process.env.INITIAL_PLATFORM_ADMIN_NAME?.trim();
  if(!email||!name)return null;
  const existingUser=await prisma.user.findUnique({where:{email},include:{platformAdmin:true}});
  if(existingUser?.platformAdmin)return null;
  const existingInvite=await prisma.platformAdminInvite.findUnique({where:{email}});
  if(existingInvite&&existingInvite.expiresAt>new Date())return null;
  const token=createExpiringToken(60*24);
  await prisma.platformAdminInvite.upsert({where:{email},create:{email,name,role:"SUPER_ADMIN",tokenHash:token.tokenHash,expiresAt:token.expiresAt},update:{name,tokenHash:token.tokenHash,expiresAt:token.expiresAt,acceptedAt:null}});
  return{email,token:token.token};
}
