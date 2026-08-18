import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { processMessage, closeInactiveConversations } from '@/lib/orchestrator';
import type { Conversation, Message, OrchestratorLog, OrchestratorStage, ConversationStatus } from '@/lib/types';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [logs, setLogs] = useState<OrchestratorLog[]>([]);
  const [stages, setStages] = useState<OrchestratorStage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('conversations')
      .select('*')
      .order('last_activity_at', { ascending: false });
    if (err) {
      setError(err.message);
      return;
    }
    setConversations(data ?? []);
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data, error: err } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at');
    if (err) {
      setError(err.message);
      return;
    }
    setMessages(data ?? []);
  }, []);

  const loadLogs = useCallback(async (conversationId: string) => {
    const { data, error: err } = await supabase
      .from('orchestrator_logs')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at');
    if (err) return;
    setLogs(data ?? []);
  }, []);

  useEffect(() => {
    loadConversations();
    closeInactiveConversations().catch(() => {});
  }, [loadConversations]);

  useEffect(() => {
    if (activeConversation) {
      loadMessages(activeConversation.id);
      loadLogs(activeConversation.id);
    } else {
      setMessages([]);
      setLogs([]);
      setStages([]);
    }
  }, [activeConversation, loadMessages, loadLogs]);

  const createConversation = useCallback(async (metadata?: Record<string, unknown>) => {
    const { data, error: err } = await supabase
      .from('conversations')
      .insert({ metadata: metadata ?? {} })
      .select()
      .maybeSingle();
    if (err || !data) {
      setError(err?.message ?? 'Failed to create conversation');
      return null;
    }
    setActiveConversation(data);
    setMessages([]);
    setLogs([]);
    setStages([]);
    await loadConversations();
    return data as Conversation;
  }, [loadConversations]);

  const selectConversation = useCallback(async (conversation: Conversation) => {
    setActiveConversation(conversation);
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!activeConversation || isProcessing) return;
    setIsProcessing(true);
    setError(null);

    try {
      const { data: userMsg, error: msgErr } = await supabase
        .from('messages')
        .insert({ conversation_id: activeConversation.id, sender: 'user', content })
        .select()
        .maybeSingle();
      if (msgErr || !userMsg) throw new Error(msgErr?.message ?? 'Failed to save message');

      setMessages((prev) => [...prev, userMsg]);

      await supabase
        .from('conversations')
        .update({ last_activity_at: new Date().toISOString(), status: 'active' })
        .eq('id', activeConversation.id);

      const currentMessages = [...messages, userMsg];
      const result = await processMessage(
        activeConversation.id,
        content,
        currentMessages,
        (updatedStages) => setStages(updatedStages),
      );

      const { data: assistantMsg, error: asstErr } = await supabase
        .from('messages')
        .insert({
          conversation_id: activeConversation.id,
          sender: 'assistant',
          content: result.response,
        })
        .select()
        .maybeSingle();
      if (asstErr || !assistantMsg) throw new Error(asstErr?.message ?? 'Failed to save response');

      setMessages((prev) => [...prev, assistantMsg]);

      const logEntry = { ...result.log, message_id: assistantMsg.id };
      await supabase.from('orchestrator_logs').insert(logEntry);

      let newStatus: ConversationStatus = 'active';
      if (result.log.resolution_status === 'escalated') newStatus = 'escalated';
      else if (result.log.resolution_status === 'pending_clarification') newStatus = 'pending_clarification';

      await supabase
        .from('conversations')
        .update({ status: newStatus, last_activity_at: new Date().toISOString() })
        .eq('id', activeConversation.id);

      setActiveConversation((prev) => prev ? { ...prev, status: newStatus } : null);
      await loadLogs(activeConversation.id);
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsProcessing(false);
    }
  }, [activeConversation, isProcessing, messages, loadLogs, loadConversations]);

  const updateStatus = useCallback(async (status: ConversationStatus) => {
    if (!activeConversation) return;
    const updates: Partial<Conversation> = {
      status,
      last_activity_at: new Date().toISOString(),
    };
    if (status === 'resolved' || status === 'closed') {
      updates.resolved_at = new Date().toISOString();
    }
    await supabase.from('conversations').update(updates).eq('id', activeConversation.id);
    setActiveConversation((prev) => prev ? { ...prev, ...updates } : null);
    await loadConversations();
  }, [activeConversation, loadConversations]);

  const submitFeedback = useCallback(async (messageId: string, rating: 'positive' | 'negative', comment?: string) => {
    if (!activeConversation) return;
    await supabase.from('conversation_feedback').insert({
      conversation_id: activeConversation.id,
      message_id: messageId,
      rating,
      comment: comment ?? null,
    });
  }, [activeConversation]);

  return {
    conversations,
    activeConversation,
    messages,
    logs,
    stages,
    isProcessing,
    error,
    createConversation,
    selectConversation,
    sendMessage,
    updateStatus,
    submitFeedback,
    setError,
  };
}
