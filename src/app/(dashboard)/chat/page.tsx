import ChatPage from "@/components/chat/ChatPage";
import { auth } from "@/auth";

export const metadata = {
  title: "Team Chat — DelegateConnect",
  description: "Enterprise real-time team communication",
};

export default async function Page() {
  const session = await auth();
  return (
    <ChatPage 
      currentUserEmail={session?.user?.email ?? null}
      currentUserId={session?.user?.id ?? null}
      currentUserName={session?.user?.name ?? null}
      currentUserRole={(session?.user as { role?: string })?.role ?? null}
    />
  );
}
