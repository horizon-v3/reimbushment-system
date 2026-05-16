import { auth } from "@/auth";
import TravelDeskPage from "@/components/travel/TravelDeskPage";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Travel Desk — DelegateConnect",
  description: "Manage delegate travel records: flights, hotels, visas, invoices",
};

export default async function Page() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
  const isAdmin = role === "admin";
  const isSupervisor = role === "supervisor";
  return <TravelDeskPage isAdmin={isAdmin} isSupervisor={isSupervisor} />;
}
