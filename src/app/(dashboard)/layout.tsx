import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  return <AppShell session={session}>{children}</AppShell>;
}
