import { auth } from "@/auth";
import AnalyticsPage from "@/components/dashboard/AnalyticsPage";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Analytics — DelegateConnect",
  description: "Sector-wise Breakup and DB & Vujis analytics dashboard",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function Page() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
  if (role === "user" || role === "supervisor") {
    redirect("/travel");
  }
  return <AnalyticsPage />;
}
