"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import useSWR from "swr";
import { Send, User as UserIcon, Shield, Loader2, MessageSquare, Paperclip, MoreVertical, Edit2, Trash2, X, File as FileIcon } from "lucide-react";
import { toast } from "sonner";
import { uploadFileToDrive } from "@/lib/gas-client";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ChatMessage {
  id: number;
  message: string;
  createdAt: string;
  userId: number;
  recipientId: number | null;
  fileUrl: string | null;
  fileName: string | null;
  isEdited: boolean;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
}

interface User {
  id: number;
  name: string | null;
  email: string;
  role: string;
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
  const [recipientId, setRecipientId] = useState<number | null>(null);
  
  const { data: usersData } = useSWR<{ users: User[] }>("/api/chat/users", fetcher);
  const usersList = useMemo(() => usersData?.users || [], [usersData]);

  const { data, mutate, isLoading } = useSWR<{ messages: ChatMessage[] }>(
    `/api/chat${recipientId ? `?recipientId=${recipientId}` : ''}`,
    fetcher,
    { refreshInterval: 3000 }
  );
  
  const messages = useMemo(() => data?.messages ?? [], [data]);
  const [newMessage, setNewMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const isAdmin = currentUserRole === "admin" || currentUserId === "admin";
  const myUserId = currentUserId === "admin" ? 1 : Number(currentUserId);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() && !file) return;

    setSending(true);

    let uploadedUrl = null;
    let uploadedName = null;

    if (file) {
      try {
        const res = await uploadFileToDrive(file, {
          subFolderName: "Chat Attachments",
          docType: "chat_attachment"
        });
        if (res.ok) {
          uploadedUrl = res.webViewLink;
          uploadedName = file.name;
        } else {
          toast.error("Failed to upload attachment");
          setSending(false);
          return;
        }
      } catch (err) {
        toast.error("Network error during upload");
        setSending(false);
        return;
      }
    }

    const optimisticMessage: ChatMessage = {
      id: Date.now(),
      message: newMessage.trim(),
      createdAt: new Date().toISOString(),
      userId: myUserId,
      recipientId: recipientId,
      fileUrl: uploadedUrl,
      fileName: uploadedName,
      isEdited: false,
      userName: currentUserName || "You",
      userEmail: currentUserEmail || "",
      userRole: currentUserRole || "user",
    };

    mutate({ messages: [...messages, optimisticMessage] }, false);
    setNewMessage("");
    setFile(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: optimisticMessage.message,
          recipientId: optimisticMessage.recipientId,
          fileUrl: optimisticMessage.fileUrl,
          fileName: optimisticMessage.fileName
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || "Failed to send message");
      }
      mutate();
    } catch {
      toast.error("Network error");
      mutate();
    } finally {
      setSending(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !editingText.trim()) return;

    const id = editingId;
    setEditingId(null);
    setEditingText("");
    
    // Optimistic UI
    mutate({
      messages: messages.map(m => m.id === id ? { ...m, message: editingText.trim(), isEdited: true } : m)
    }, false);

    try {
      await fetch(`/api/chat/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: editingText.trim() }),
      });
      mutate();
    } catch {
      toast.error("Failed to edit message");
      mutate();
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this message?")) return;
    setOpenMenuId(null);
    
    // Optimistic
    mutate({ messages: messages.filter(m => m.id !== id) }, false);
    
    try {
      await fetch(`/api/chat/${id}`, { method: "DELETE" });
      mutate();
    } catch {
      toast.error("Failed to delete message");
      mutate();
    }
  };

  const currentChatName = recipientId 
    ? usersList.find(u => u.id === recipientId)?.name || usersList.find(u => u.id === recipientId)?.email 
    : "Team Chat";

  return (
    <div className="flex h-[calc(100vh-80px)] max-w-[1200px] mx-auto animate-fade-in p-4 md:p-6 gap-6">
      
      {/* Sidebar for DMs */}
      <div className="w-[300px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-sm flex flex-col overflow-hidden hidden md:flex shrink-0">
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]">
          <h2 className="font-bold text-[var(--color-text-primary)]">Chats</h2>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          <div 
            onClick={() => setRecipientId(null)} 
            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${!recipientId ? 'bg-[var(--color-accent)] text-white shadow-sm' : 'hover:bg-black/5 dark:hover:bg-white/5 text-[var(--color-text-primary)]'}`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${!recipientId ? 'bg-white/20' : 'bg-[#e2e8f0] dark:bg-[#334155] text-[var(--color-accent)]'}`}>
              <MessageSquare size={20} />
            </div>
            <div className="font-semibold text-sm">Team Chat</div>
          </div>
          
          <div className="px-3 pt-4 pb-2 text-[0.7rem] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider">
            Direct Messages
          </div>
          
          {usersList.filter(u => u.id !== myUserId).map(u => (
            <div 
              key={u.id}
              onClick={() => setRecipientId(u.id)} 
              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${recipientId === u.id ? 'bg-[var(--color-accent)] text-white shadow-sm' : 'hover:bg-black/5 dark:hover:bg-white/5 text-[var(--color-text-primary)]'}`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${recipientId === u.id ? 'bg-white/20' : 'bg-[#e2e8f0] dark:bg-[#334155] text-gray-500'}`}>
                <UserIcon size={20} />
              </div>
              <div className="font-medium text-sm truncate">{u.name || u.email}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-2xl shadow-sm overflow-hidden relative">
        
        {/* Chat Header */}
        <div className="px-6 py-4 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex items-center gap-3 shadow-sm z-10">
           <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0071e3] to-[#5856d6] flex items-center justify-center text-white shadow-sm shrink-0">
             {recipientId ? <UserIcon size={20}/> : <MessageSquare size={20}/>}
           </div>
           <div>
             <h2 className="font-bold text-[var(--color-text-primary)] leading-tight">{currentChatName}</h2>
             <p className="text-[0.75rem] text-[var(--color-text-tertiary)] font-medium">
               {recipientId ? "Professional direct message" : "Enterprise real-time communication"}
             </p>
           </div>
        </div>

        {/* Messages Container (WhatsApp style background) */}
        <div 
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 custom-scrollbar bg-[#efeae2] dark:bg-[#0b141a]" 
          style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")', backgroundBlendMode: 'overlay', opacity: 0.95 }}
          onClick={() => setOpenMenuId(null)}
        >
          {isLoading && messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500 gap-2 bg-white/80 dark:bg-black/50 p-3 rounded-full w-fit mx-auto shadow-sm text-sm">
              <Loader2 className="animate-spin" size={16} /> Loading messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="bg-[#ffeecd] dark:bg-[#182229] text-[#54656f] dark:text-[#8696a0] px-4 py-2 rounded-lg text-sm shadow-sm font-medium">
                No messages yet. Start the conversation!
              </div>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isMe = msg.userId === myUserId;
              const isSystemAdmin = msg.userRole === "admin";
              const showAvatar = !recipientId && (index === 0 || messages[index - 1].userId !== msg.userId);

              return (
                <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"} items-end`}>
                  {showAvatar ? (
                    <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-white text-[0.6rem] font-bold shadow-sm ${isSystemAdmin ? "bg-gradient-to-br from-[#ff3b30] to-[#ff6b00]" : "bg-gradient-to-br from-[#0071e3] to-[#5856d6]"}`}>
                      {msg.userName?.[0]?.toUpperCase() || msg.userEmail?.[0]?.toUpperCase() || <UserIcon size={12} />}
                    </div>
                  ) : (
                    !recipientId && <div className="w-7 shrink-0" />
                  )}

                  <div className={`flex flex-col ${isMe ? "items-end" : "items-start"} max-w-[80%] relative group`}>
                    {!recipientId && showAvatar && !isMe && (
                      <span className="text-[0.7rem] font-bold text-[#53bdeb] mb-0.5 ml-1 flex items-center gap-1">
                        {isSystemAdmin && <Shield size={10} className="text-[#ff3b30]" />}
                        {msg.userName || msg.userEmail} 
                      </span>
                    )}
                    
                    <div className={`relative px-3 pt-2 pb-1.5 text-[0.95rem] rounded-xl shadow-sm flex flex-col ${
                      isMe 
                        ? "bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-tr-none" 
                        : "bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-tl-none border border-black/5 dark:border-white/5"
                    }`}>
                      
                      {/* Attachment */}
                      {msg.fileUrl && (
                        <a href={msg.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-2.5 bg-black/5 dark:bg-white/5 rounded-lg mb-1.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                          <div className="bg-[var(--color-accent)] text-white p-2 rounded-full"><FileIcon size={16} /></div>
                          <span className="text-sm truncate font-medium max-w-[150px] md:max-w-[250px]">{msg.fileName || "Attachment"}</span>
                        </a>
                      )}

                      {/* Message body or Edit Input */}
                      {editingId === msg.id ? (
                        <form onSubmit={handleEditSubmit} className="flex flex-col gap-2 min-w-[200px]">
                          <textarea 
                            autoFocus
                            value={editingText}
                            onChange={e => setEditingText(e.target.value)}
                            className="text-sm p-2 rounded border border-black/20 bg-white/50 dark:bg-black/20 text-black dark:text-white resize-none"
                            rows={3}
                          />
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setEditingId(null)} className="text-xs font-semibold px-2 py-1 rounded bg-black/10 hover:bg-black/20">Cancel</button>
                            <button type="submit" className="text-xs font-semibold px-2 py-1 rounded bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]">Save</button>
                          </div>
                        </form>
                      ) : (
                        <div className="break-words leading-relaxed whitespace-pre-wrap">{msg.message}</div>
                      )}

                      <div className="text-[0.65rem] opacity-60 text-right mt-0.5 flex justify-end gap-1.5 items-center float-right ml-4">
                        {msg.isEdited && <span>edited</span>}
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    {/* Three-dot menu for edit/delete */}
                    {(isAdmin || isMe) && editingId !== msg.id && (
                      <div className="absolute top-1 -right-8 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === msg.id ? null : msg.id); }}
                          className="p-1 rounded-full bg-white/80 dark:bg-black/50 shadow-sm text-gray-600 hover:text-black"
                        >
                          <MoreVertical size={14} />
                        </button>
                        {openMenuId === msg.id && (
                          <div className="absolute top-6 right-0 bg-white dark:bg-[#202c33] border border-black/10 rounded-lg shadow-xl z-20 flex flex-col py-1 min-w-[100px] text-sm overflow-hidden animate-fade-in">
                            <button onClick={() => { setEditingId(msg.id); setEditingText(msg.message); setOpenMenuId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 text-left text-[var(--color-text-primary)]">
                              <Edit2 size={14} /> Edit
                            </button>
                            <button onClick={() => handleDelete(msg.id)} className="flex items-center gap-2 px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 text-left text-red-500">
                              <Trash2 size={14} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-3 bg-[#f0f2f5] dark:bg-[#202c33] border-t border-black/10">
          {file && (
             <div className="mb-3 p-3 bg-white dark:bg-[#111b21] rounded-xl flex items-center justify-between border border-black/10 shadow-sm">
               <div className="flex items-center gap-3 overflow-hidden">
                 <div className="bg-[var(--color-accent)]/10 text-[var(--color-accent)] p-2 rounded-lg">
                   <FileIcon size={20} />
                 </div>
                 <span className="text-sm font-medium truncate text-[var(--color-text-primary)]">{file.name}</span>
               </div>
               <button onClick={() => setFile(null)} className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-red-50 transition-colors">
                 <X size={16} />
               </button>
             </div>
          )}
          <form onSubmit={handleSend} className="flex gap-2 items-end relative">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={e => e.target.files?.[0] && setFile(e.target.files[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 text-[#54656f] dark:text-[#8696a0] hover:text-[#111b21] dark:hover:text-[#e9edef] transition-colors"
              title="Attach File"
            >
              <Paperclip size={24} />
            </button>
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e as unknown as React.FormEvent);
                }
              }}
              placeholder="Type a message"
              className="flex-1 bg-white dark:bg-[#2a3942] text-[#111b21] dark:text-[#e9edef] px-4 py-3 rounded-xl focus:outline-none focus:ring-0 border-none shadow-sm min-h-[44px] max-h-[120px] resize-none custom-scrollbar"
              rows={1}
              disabled={sending}
            />
            <button
              type="submit"
              disabled={(!newMessage.trim() && !file) || sending}
              className="p-3 bg-[var(--color-accent)] text-white rounded-xl hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm ml-1"
            >
              {sending ? <Loader2 size={24} className="animate-spin" /> : <Send size={24} />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
