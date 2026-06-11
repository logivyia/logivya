import { requireApiSession } from "@/server/auth/session";

export async function requirePlatformAdmin(){
  const context=await requireApiSession();
  const allowed=(process.env.PLATFORM_ADMIN_EMAILS??"").split(",").map(value=>value.trim().toLowerCase()).filter(Boolean);
  if(!allowed.includes(context.user.email.toLowerCase()))throw new Error("FORBIDDEN");
  return context;
}
