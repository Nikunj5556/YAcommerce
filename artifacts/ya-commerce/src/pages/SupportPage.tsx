import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Headphones, Plus, Send, Paperclip, ChevronRight, MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { uploadToS3 } from "@/lib/api";
import { formatDateTime, humanizeStatus, getStatusColor } from "@/lib/format";
import EmptyState from "@/components/shared/EmptyState";
import { useToast } from "@/hooks/use-toast";

export default function SupportPage() {
  const { customer } = useAuth();
  const { toast } = useToast();

  const [tickets, setTickets] = useState<Array<Record<string, unknown>>>([]);
  const [selectedTicket, setSelectedTicket] = useState<Record<string, unknown> | null>(null);
  const [messages, setMessages] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);

  const [newSubject, setNewSubject] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState("other");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function fetchTickets() {
      if (!customer?.id) { setLoading(false); return; }
      const { data } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false });
      if (data) setTickets(data);
      setLoading(false);
    }
    fetchTickets();
  }, [customer?.id]);

  const loadMessages = async (ticketId: string) => {
    const { data } = await supabase
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("sent_at");
    if (data) setMessages(data);
  };

  const handleSelectTicket = async (ticket: Record<string, unknown>) => {
    setSelectedTicket(ticket);
    await loadMessages(ticket.id as string);
  };

  const handleCreate = async () => {
    if (!customer?.id || !newSubject) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .insert({
          customer_id: customer.id,
          subject: newSubject,
          description: newDescription,
          category: newCategory,
          status: "open",
          priority: "medium",
        })
        .select("*")
        .single();
      if (data) {
        setTickets((prev) => [data, ...prev]);
        if (newDescription) {
          await supabase.from("ticket_messages").insert({
            ticket_id: data.id,
            sender_type: "customer",
            sender_id: customer.id,
            message_body: newDescription,
          });
        }
        setShowCreate(false);
        setNewSubject("");
        setNewDescription("");
        handleSelectTicket(data);
        toast({ title: "Ticket created", description: `Ticket ${data.ticket_number} has been created.` });
      }
      if (error) throw error;
    } catch {
      toast({ title: "Failed", description: "Could not create ticket.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedTicket || !messageBody.trim()) return;
    setSending(true);
    try {
      await supabase.from("ticket_messages").insert({
        ticket_id: selectedTicket.id,
        sender_type: "customer",
        sender_id: customer?.id,
        message_body: messageBody,
      });
      setMessageBody("");
      await loadMessages(selectedTicket.id as string);
    } catch {
      toast({ title: "Failed", description: "Could not send message.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTicket) return;
    try {
      const url = await uploadToS3(file, "ya-commerce/support");
      await supabase.from("ticket_messages").insert({
        ticket_id: selectedTicket.id,
        sender_type: "customer",
        sender_id: customer?.id,
        message_body: `[Attachment: ${file.name}]`,
        attachments: [url],
      });
      await supabase.from("support_attachments").insert({
        ticket_id: selectedTicket.id,
        file_name: file.name,
        file_type: file.type,
        file_url: url,
        uploaded_by: customer?.id,
      });
      await loadMessages(selectedTicket.id as string);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    }
  };

  if (!customer) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <EmptyState icon={Headphones} title="Sign in for support" description="Please sign in to create or view support tickets." actionLabel="Sign In" actionHref="/auth" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Help & Support</h1>
        <button
          data-testid="button-new-ticket"
          onClick={() => { setShowCreate(true); setSelectedTicket(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 transition-colors text-sm"
        >
          <Plus size={16} /> New Ticket
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Create Support Ticket</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm">
                <option value="billing">Billing</option>
                <option value="delivery">Delivery</option>
                <option value="refund">Refund</option>
                <option value="return">Return</option>
                <option value="damaged_item">Damaged Item</option>
                <option value="missing_item">Missing Item</option>
                <option value="wrong_item">Wrong Item</option>
                <option value="cancellation">Cancellation</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Brief summary of your issue" className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Describe your issue in detail" rows={4} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
            </div>
            <div className="flex gap-3">
              <button onClick={handleCreate} disabled={creating || !newSubject} className="px-5 py-2.5 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm">
                {creating ? "Creating..." : "Create Ticket"}
              </button>
              <button onClick={() => setShowCreate(false)} className="px-5 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="space-y-2">
          {loading ? (
            <div className="animate-pulse space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 bg-gray-200 rounded-xl" />)}
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <MessageCircle size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No support tickets. Need help? Create a new ticket.</p>
            </div>
          ) : (
            tickets.map((ticket) => (
              <button
                key={ticket.id as string}
                onClick={() => handleSelectTicket(ticket)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  selectedTicket?.id === ticket.id ? "border-amber-500 bg-amber-50" : "border-gray-100 bg-white hover:border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">{ticket.ticket_number as string}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(ticket.status as string)}`}>
                    {humanizeStatus(ticket.status as string)}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-900 line-clamp-1">{ticket.subject as string}</p>
              </button>
            ))
          )}
        </div>

        <div className="md:col-span-2">
          {selectedTicket ? (
            <div className="bg-white rounded-xl border border-gray-200 flex flex-col h-[500px]">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900 text-sm">{selectedTicket.subject as string}</h3>
                <p className="text-xs text-gray-500">
                  {selectedTicket.ticket_number as string} - {humanizeStatus(selectedTicket.category as string || "other")}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg) => {
                  const isCustomer = msg.sender_type === "customer";
                  return (
                    <div key={msg.id as string} className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] p-3 rounded-xl text-sm ${
                        isCustomer ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-900"
                      }`}>
                        <p>{msg.message_body as string}</p>
                        {(msg.attachments as string[])?.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {(msg.attachments as string[]).map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block text-xs underline">
                                Attachment {i + 1}
                              </a>
                            ))}
                          </div>
                        )}
                        <p className={`text-[10px] mt-1 ${isCustomer ? "text-amber-200" : "text-gray-400"}`}>
                          {formatDateTime(msg.sent_at as string)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="p-4 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <label className="p-2 text-gray-400 hover:text-gray-600 cursor-pointer">
                    <Paperclip size={18} />
                    <input type="file" className="hidden" onChange={handleFileUpload} />
                  </label>
                  <input
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                  <button onClick={handleSendMessage} disabled={sending || !messageBody.trim()} className="p-2 bg-amber-500 text-white rounded-full hover:bg-amber-600 disabled:opacity-50">
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <MessageCircle size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">Select a ticket to view the conversation</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
