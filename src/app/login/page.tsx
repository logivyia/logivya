import { AuthForm } from "@/components/auth-form";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSessionContext } from "@/server/auth/session";
import { logger } from "@/server/observability/logger";

export default async function LoginPage() {
  await connection();
  const context = await getSessionContext().catch((error) => {
    logger.error("auth.login.session_lookup_failed", error);
    return null;
  });
  if (context) redirect("/dashboard");
  return <AuthForm mode="login" />;
}
