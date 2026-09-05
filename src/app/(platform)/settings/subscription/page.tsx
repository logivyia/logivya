import { redirect } from "next/navigation";
export default async function LegacySubscriptionPage({searchParams}: {searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams;
  const query=new URLSearchParams(Object.entries(params).flatMap(([key,value]) => typeof value === "string" ? [[key,value]] : []));
  redirect(`/settings/subscriptions${query.size ? `?${query}` : ""}`);
}
