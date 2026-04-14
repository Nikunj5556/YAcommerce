import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Headphones, Plus, Send, Paperclip, MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { uploadToS3 } from '../lib/api';
import { formatDateTime, humanizeStatus, getStatusColor } from '../lib/format';
import { useToast } from '../contexts/ToastContext';

export default function SupportPage() {
  const { customer } = useAuth();
  const { toast } = useToast();
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [messageBody, setMessageBody] = useState('');
  const [sending, setSending] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState('other');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function fetch() {
      if (!customer?.id) { setLoading(false); return; }
      const { data } = await supabase.from('support_tickets').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false });
      if (data) setTickets(data);
      setLoading(false);
    }
    fetch();
  }, [customer?.id]);

  const loadMessages = async (ticketId) => {
    const { data } = await supabase.from('ticket_messages').select('*').eq('ticket_id', ticketId).order('sent_at');
    if (data) setMessages(data);
  };

  const handleSelectTicket = async (ticket) => { setSelectedTicket(ticket); await loadMessages(ticket.id); };

  const handleCreate = async () => {
    if (!customer?.id || !newSubject) return;
    setCreating(true);
    try {
      const { data } = await supabase.from('support_tickets').insert({
        customer_id: customer.id, subject: newSubject, description: newDescription,
        category: newCategory, status: 'open', priority: 'medium',
      }).select('*').single();
      if (data) {
        if (newDescription) await supabase.from('ticket_messages').insert({ ticket_id: data.id, sender_type: 'customer', sender_id: customer.id, message_body: newDescription });
        setTickets(prev => [data, ...prev]); setShowCreate(false); setNewSubject(''); setNewDescription('');
        handleSelectTicket(data);
        toast({ title: 'Ticket created', description: `Ticket ${data.ticket_number} has been created.` });
      }
    } catch { toast({ title: 'Failed', variant: 'destructive' }); }
    finally { setCreating(false); }
  };

  const handleSendMessage = async () => {
    if (!selectedTicket || !messageBody.trim()) return;
    setSending(true);
    try {
      await supabase.from('ticket_messages').insert({ ticket_id: selectedTicket.id, sender_type: 'customer', sender_id: customer?.id, message_body: messageBody });
      setMessageBody('');
      await loadMessages(selectedTicket.id);
    } catch { toast({ title: 'Failed', variant: 'destructive' }); }
    finally { setSending(false); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTicket) return;
    try {
      const url = await uploadToS3(file, 'ya-commerce/support');
      await supabase.from('ticket_messages').insert({ ticket_id: selectedTicket.id, sender_type: 'customer', sender_id: customer?.id, message_body: `[Attachment: ${file.name}]`, attachments: [url] });
      await supabase.from('support_attachments').insert({ ticket_id: selectedTicket.id, file_name: file.name, file_type: file.type, file_url: url, uploaded_by: customer?.id });
      await loadMessages(selectedTicket.id);
      toast({ title: 'File uploaded' });
    } catch { toast({ title: 'Upload failed', variant: 'destructive' }); }
  };

  if (!customer) return <div className="max-w-7xl mx-auto px-4 py-24 text-center"><Headphones size={48} className="mx-auto mb-4 text-gray-300" /><h2 className="text-2xl font-bold mb-2">Sign in for support</h2><Link to="/auth" className="inline-flex px-6 py-3 bg-black text-white font-bold text-sm">Sign In</Link></div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900" data-testid="support-title">Help & Support</h1>
        <button onClick={() => { setShowCreate(true); setSelectedTicket(null); }} data-testid="new-ticket-btn"
          className="flex items-center gap-2 px-4 py-2.5 bg-black text-white font-bold text-sm hover:bg-gray-800"><Plus size={16} /> NEW TICKET</button>
      </div>

      {showCreate && (
        <div className="bg-white border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-bold mb-4">Create Support Ticket</h2>
          <div className="space-y-3">
            <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-sm text-sm">
              {['billing','delivery','refund','return','damaged_item','missing_item','wrong_item','cancellation','other'].map(c => <option key={c} value={c}>{humanizeStatus(c)}</option>)}
            </select>
            <input value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="Subject" data-testid="ticket-subject-input"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-sm text-sm focus:border-black focus:outline-none" />
            <textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Describe your issue" rows={4}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-sm text-sm resize-none focus:border-black focus:outline-none" />
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={creating || !newSubject} data-testid="create-ticket-btn"
                className="px-5 py-2.5 bg-black text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50">{creating ? 'Creating...' : 'Create Ticket'}</button>
              <button onClick={() => setShowCreate(false)} className="px-5 py-2.5 border border-gray-200 text-sm hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="space-y-2">
          {loading ? [...Array(3)].map((_, i) => <div key={i} className="skeleton h-16" />)
          : tickets.length === 0 ? (
            <div className="text-center py-8"><MessageCircle size={32} className="mx-auto mb-2 text-gray-300" /><p className="text-sm text-gray-500">No tickets yet.</p></div>
          ) : tickets.map(ticket => (
            <button key={ticket.id} onClick={() => handleSelectTicket(ticket)} data-testid={`ticket-${ticket.id}`}
              className={`w-full text-left p-4 border transition-colors ${selectedTicket?.id === ticket.id ? 'border-black bg-gray-50' : 'border-gray-200 bg-white hover:border-gray-400'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">{ticket.ticket_number}</span>
                <span className={`text-[10px] px-2 py-0.5 font-bold ${getStatusColor(ticket.status)}`}>{humanizeStatus(ticket.status)}</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 line-clamp-1">{ticket.subject}</p>
            </button>
          ))}
        </div>

        <div className="md:col-span-2">
          {selectedTicket ? (
            <div className="bg-white border border-gray-200 flex flex-col h-[500px]">
              <div className="p-4 border-b border-gray-200">
                <h3 className="font-bold text-gray-900 text-sm">{selectedTicket.subject}</h3>
                <p className="text-xs text-gray-500">{selectedTicket.ticket_number} - {humanizeStatus(selectedTicket.category || 'other')}</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender_type === 'customer' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] p-3 text-sm ${msg.sender_type === 'customer' ? 'bg-black text-white' : 'bg-gray-100 text-gray-900'}`}>
                      <p>{msg.message_body}</p>
                      {msg.attachments?.length > 0 && <div className="mt-2 space-y-1">{msg.attachments.map((url, i) => <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block text-xs underline">Attachment {i+1}</a>)}</div>}
                      <p className={`text-[10px] mt-1 ${msg.sender_type === 'customer' ? 'text-gray-400' : 'text-gray-400'}`}>{formatDateTime(msg.sent_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  <label className="p-2 text-gray-400 hover:text-gray-600 cursor-pointer"><Paperclip size={18} /><input type="file" className="hidden" onChange={handleFileUpload} /></label>
                  <input value={messageBody} onChange={e => setMessageBody(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} placeholder="Type a message..."
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-sm text-sm focus:border-black focus:outline-none" />
                  <button onClick={handleSendMessage} disabled={sending || !messageBody.trim()} className="p-2 bg-black text-white hover:bg-gray-800 disabled:opacity-50"><Send size={16} /></button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 p-12 text-center">
              <MessageCircle size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 font-light">Select a ticket to view conversation</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
