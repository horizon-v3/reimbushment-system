"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import useSWR from "swr";
import { Send, User as UserIcon, Shield, Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ChatMessage {
  id: number;
  message: string;
  createdAt: string;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
}

interface ChatPageProps {
  currentUserEmail: string | null;
  currentUserId: string | null;
  currentUserName: string | null;
  currentUserRole: string | null;
}

export default function ChatPage({
  currentUserEmail,
  currentUserId,
  currentUserName,
  currentUserRole
}: ChatPageProps) {
  const { data, mutate, isLoading } = useSWR<{ messages: ChatMessage[] }>(
    "/api/chat",
    fetcher,
    { refreshInterval: 3000 } // Poll every 3 seconds for new messages
  );
  const messages = useMemo(() => data?.messages ?? [], [data]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setSending(true);
    const optimisticMessage = {
      id: Date.now(),
      message: newMessage.trim(),
      createdAt: new Date().toISOString(),
      userId: currentUserId === "admin" ? 1 : Number(currentUserId),
      userName: currentUserName || "You",
      userEmail: currentUserEmail || "",
      userRole: currentUserRole || "user",
    };

    mutate({ messages: [...messages, optimisticMessage] }, false);
    setNewMessage("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: optimisticMessage.message }),
      });
      if (res.ok) {
        mutate();
      } else {
        const d = await res.json();
        toast.error(d.error || "Failed to send message");
        mutate(); // Revert optimistic UI
      }
    } catch {
      toast.error("Network error");
      mutate();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-[1000px] mx-auto animate-fade-in p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] mb-1 flex items-center gap-2">
          <MessageSquare size={24} className="text-[var(--color-accent)]" /> Team Chat
        </h1>
        <p className="text-[0.85rem] font-medium text-[var(--color-text-secondary)]">
          Enterprise real-time communication
        </p>
      </div>

      <div className="flex-1 flex flex-col bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-sm overflow-hidden">
        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 custom-scrollbar">
          {isLoading && messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--color-text-tertiary)] gap-2">
              <Loader2 className="animate-spin" size={20} /> Loading messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--color-text-tertiary)]">
              No messages yet. Start the conversation!
            </div>
          ) : (
            messages.map((msg, index) => {
              const isMe = msg.userEmail === currentUserEmail || msg.userId === (currentUserId === "admin" ? 1 : Number(currentUserId));
              const isSystemAdmin = msg.userRole === "admin";
              const showAvatar = index === 0 || messages[index - 1].userId !== msg.userId;

              return (
                <div key={msg.id} className={`flex gap-3 ${isMe ? "flex-row-reverse" : "flex-row"} items-end`}>
                  {showAvatar ? (
                    <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-[0.7rem] font-bold shadow-sm ${isSystemAdmin ? "bg-gradient-to-br from-[#ff3b30] to-[#ff6b00]" : "bg-gradient-to-br from-[#0071e3] to-[#5856d6]"}`}>
                      {msg.userName?.[0]?.toUpperCase() || msg.userEmail?.[0]?.toUpperCase() || <UserIcon size={14} />}
                    </div>
                  ) : (
                    <div className="w-8 shrink-0" />
                  )}

                  <div className={`flex flex-col ${isMe ? "items-end" : "items-start"} max-w-[75%]`}>
                    {showAvatar && (
                      <span className="text-[0.7rem] font-medium text-[var(--color-text-tertiary)] mb-1 flex items-center gap-1 mx-1">
                        {isSystemAdmin && <Shield size={10} className="text-[var(--color-danger)]" />}
                        {msg.userName || msg.userEmail} 
                        <span className="opacity-50 mx-1">•</span> 
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    <div className={`px-4 py-2.5 rounded-2xl text-[0.9rem] leading-relaxed break-words ${isMe ? "bg-[var(--color-accent)] text-white rounded-br-sm shadow-md" : "bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-bl-sm"}`}>
                      {msg.message}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-bg-primary)]">
          <form onSubmit={handleSend} className="flex gap-2 relative">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 input bg-[var(--color-surface)] py-3 pl-4 pr-12 rounded-xl focus:ring-2 focus:ring-[var(--color-accent-light)] border-[var(--color-border)] shadow-sm"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={!newMessage.trim() || sending}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
