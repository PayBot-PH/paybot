import { useEffect, useState, useRef, useCallback } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { MessageSquare, Send, ChevronRight, ChevronLeft, Search, RefreshCw } from 'lucide-react';

interface Conversation {
  chat_id: string;
  username: string | null;
  message_count: number;
  last_message: string | null;
  last_seen: string | null;
}

interface BotMessage {
  id: number;
  log_type: string;
  message: string;
  telegram_chat_id: string | null;
  telegram_username: string | null;
  created_at: string | null;
}

const fmt_time = (s: string | null) => {
  if (!s) return '';
  return new Date(s).toLocaleString();
};

export default function BotMessagesPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [selectedChat, setSelectedChat] = useState<Conversation | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sendError, setSendError] = useState('');
  const [sendSuccess, setSendSuccess] = useState(false);
  const [mobilePane, setMobilePane] = useState<'list' | 'thread'>('list');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/bot-messages/conversations', { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setConversations(d.items || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  const fetchMessages = useCallback(async (chatId: string) => {
    try {
      const res = await fetch(`/api/v1/bot-messages?chat_id=${chatId}&limit=100`, { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setMessages(d.items || []);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchConversations();
    const id = setInterval(fetchConversations, 15000);
    return () => clearInterval(id);
  }, [fetchConversations]);

  useEffect(() => {
    if (!selectedChat) return;
    fetchMessages(selectedChat.chat_id);
    const id = setInterval(() => fetchMessages(selectedChat.chat_id), 15000);
    return () => clearInterval(id);
  }, [selectedChat, fetchMessages]);

  const selectConversation = (c: Conversation) => {
    setSelectedChat(c);
    setReply('');
    setSendError('');
    setSendSuccess(false);
    setMobilePane('thread');
    fetchMessages(c.chat_id);
  };

  const sendReply = async () => {
    if (!selectedChat || !reply.trim()) return;
    setSending(true); setSendError(''); setSendSuccess(false);
    try {
      const res = await fetch('/api/v1/bot-messages/reply', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: selectedChat.chat_id, message: reply.trim() }),
      });
      if (res.ok) {
        setSendSuccess(true);
        setReply('');
        fetchMessages(selectedChat.chat_id);
        setTimeout(() => setSendSuccess(false), 3000);
      } else {
        const d = await res.json();
        setSendError(d.detail || 'Failed to send');
      }
    } catch (e: any) { setSendError(e.message); }
    setSending(false);
  };

  const filtered = conversations.filter(c =>
    !search || (c.username || c.chat_id).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Bot Messages</h1>
            <p className="text-muted-foreground text-sm mt-0.5">View and reply to all bot conversations</p>
          </div>
          <button onClick={fetchConversations}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm border border-border px-3 py-1.5 rounded-lg transition-colors">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        <div className="flex gap-4 h-[calc(100svh-180px)] min-h-[400px]">
          {/* Conversation list */}
          <div className={`${mobilePane === 'list' ? 'flex' : 'hidden'} md:flex w-full md:w-72 bg-background border border-border/40 rounded-2xl flex-col overflow-hidden md:shrink-0`}>
            <div className="p-3 border-b border-border/40">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search users..."
                  className="w-full bg-muted/60 border border-border/40 rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/50"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded-xl animate-pulse">
                      <div className="h-9 w-9 rounded-full bg-muted/50 shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-24 bg-muted/50 rounded" />
                        <div className="h-2.5 w-32 bg-muted/30 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No conversations yet</div>
              ) : (
                filtered.map(c => (
                  <button key={c.chat_id} onClick={() => selectConversation(c)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-border/20 hover:bg-muted/50 ${
                      selectedChat?.chat_id === c.chat_id ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : ''
                    }`}>
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                      <span className="text-white text-xs font-bold">
                        {(c.username || c.chat_id).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {c.username ? `@${c.username}` : c.chat_id}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{c.last_message || 'No messages'}</p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className="text-[10px] text-muted-foreground">{c.message_count}</span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Message thread */}
          <div className={`${mobilePane === 'thread' ? 'flex' : 'hidden'} md:flex flex-1 bg-background border border-border/40 rounded-2xl flex-col overflow-hidden`}>
            {!selectedChat ? (
              <div className="flex-1 flex items-center justify-center flex-col gap-4 text-center px-8">
                <div className="h-14 w-14 bg-muted rounded-2xl flex items-center justify-center">
                  <MessageSquare className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground font-medium">Select a conversation</p>
                <p className="text-muted-foreground text-sm">Choose a user from the left to view their messages</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="px-4 py-3 border-b border-border/40 flex items-center gap-3">
                  <button
                    className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                    onClick={() => setMobilePane('list')}
                    aria-label="Back to conversations"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                    <span className="text-white text-xs font-bold">
                      {(selectedChat.username || selectedChat.chat_id).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-foreground font-semibold text-sm">
                      {selectedChat.username ? `@${selectedChat.username}` : selectedChat.chat_id}
                    </p>
                    <p className="text-muted-foreground text-xs">Chat ID: {selectedChat.chat_id} · {selectedChat.message_count} messages</p>
                  </div>
                  <button onClick={() => fetchMessages(selectedChat.chat_id)}
                    className="ml-auto text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {messages.map(m => {
                    const isAdmin = m.log_type === 'admin_reply';
                    return (
                      <div key={m.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                          isAdmin
                            ? 'bg-blue-600 text-white rounded-br-sm'
                            : 'bg-muted text-slate-200 rounded-bl-sm'
                        }`}>
                          <p className="text-sm whitespace-pre-wrap break-words">{m.message}</p>
                          <p className={`text-[10px] mt-1 ${isAdmin ? 'text-blue-200' : 'text-muted-foreground'}`}>
                            {fmt_time(m.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply box */}
                <div className="p-3 border-t border-border/40">
                  {sendError && <p className="text-red-400 text-xs mb-2">{sendError}</p>}
                  {sendSuccess && <p className="text-emerald-400 text-xs mb-2">✅ Message sent!</p>}
                  <div className="flex gap-2">
                    <textarea
                      value={reply} onChange={e => setReply(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                      placeholder="Type a reply... (Enter to send, Shift+Enter for newline)"
                      rows={2}
                      className="flex-1 bg-muted/60 border border-border/40 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/50 resize-none"
                    />
                    <button onClick={sendReply} disabled={sending || !reply.trim()}
                      className="px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex items-center gap-1.5 shrink-0">
                      {sending ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
