import SettingsPage from "@/components/settings/SettingsPage";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Settings — DelegateConnect",
  description: "Configure Google Apps Script, Drive folder, and Sheets integration",
};

export default async function Page() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
  if (role !== "admin") {
    redirect("/");
  }
  return <SettingsPage />;
}
