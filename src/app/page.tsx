import { HomePageClient } from "@/components/home-page-client";
import { getSessionContext } from "@/server/auth/session";

export default async function Home() {
  const session = await getSessionContext();
  if (session) return <meta httpEquiv="refresh" content="0;url=/dashboard" />;
  return <HomePageClient />;
}
