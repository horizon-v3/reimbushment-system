import { auth } from "@/auth";
import DelegatesPage from "@/components/dashboard/DelegatesPage";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Registered Delegates — DelegateConnect",
  description: "View all registered delegates",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const session = await auth();
  if (!session) redirect("/login");
  const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
  // All authenticated users can view — only staff without any role is blocked
  return <DelegatesPage role={role} />;
}
