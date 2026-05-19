import { auth } from "@/auth";
import OperationLogPage from "@/components/dashboard/OperationLogPage";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Operation Log — DelegateConnect",
  description: "Admin audit trail and operation monitoring",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const session = await auth();
  if (!session) redirect("/login");
  const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
  if (role !== "admin") redirect("/delegates");
  return <OperationLogPage />;
}
