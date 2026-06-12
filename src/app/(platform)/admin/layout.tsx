import { AdminShell } from "@/components/admin-shell";import { requirePlatformAdmin } from "@/server/auth/platform-admin";
export default async function Layout({children}:{children:React.ReactNode}){const{platformAdmin}=await requirePlatformAdmin();return <AdminShell role={platformAdmin.role}>{children}</AdminShell>}
