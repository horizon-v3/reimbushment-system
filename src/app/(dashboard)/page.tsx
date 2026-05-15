import { auth } from "@/auth";
import DashboardPage from "@/components/dashboard/DashboardPage";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Dashboard — DelegateConnect",
  description: "CRM Home: KPIs, pivot tables, group messages, and registered delegates",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function Page() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
  if (role === "user") {
    redirect("/chat");
  }
  const isAdmin = role === "admin";
  return <DashboardPage isAdmin={isAdmin} />;
}
