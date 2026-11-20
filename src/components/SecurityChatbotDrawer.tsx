import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  X,
  Zap,
} from 'lucide-react';
import type { SystemSnapshot } from '../core/types';
import { sentinelApi } from '../lib/api';
import {
  clearOperatorChatMessages,
  saveOperatorChatMessage,
  subscribeOperatorChatMessages,
  type PersistedChatMessage,
} from '../lib/firebase';

interface SecurityChatbotDrawerProps {
  open: boolean;
  onClose: () => void;
  userUid: string | null;
  operatorName: string;
  snapshot: SystemSnapshot | null;
}

interface ChatMessageItem {
  id: string;
  role: 'user' | 'model';
  content: string;
  model: string;
  createdAtMs: number;
}

const STARTER_PROMPTS = [
  'Summarize critical open alerts and recommended reversible actions',
  'Audit active honey traps and any quarantined attacker IPs',
  'Verify Vault hash-chain integrity and highlight recent anomalies',
  'Draft a concise 72-hour UK/EU regulatory breach notice for open incidents',
];

function formatClockTime(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function renderFormattedLine(line: string, key: string) {
  // Split inline `code` and **bold** spans safely without dangerouslySetInnerHTML
  const tokens = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <span key={key}>
      {tokens.map((tok, i) => {
        if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
          return (
            <strong key={i} className="font-semibold text-[var(--sentinel-ink)]">
              {tok.slice(2, -2)}
            </strong>
          );
        }
        if (tok.startsWith('`') && tok.endsWith('`') && tok.length > 2) {
          return (
            <code
              key={i}
              className="px-1 py-0.5 rounded bg-[var(--sentinel-segment)]/70 font-mono text-[11px] text-[var(--sentinel-ink)]"
            >
              {tok.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{tok}</span>;
      })}
    </span>
  );
}

function MessageContent({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5 text-xs leading-relaxed">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) {
          return <div key={idx} className="h-1" />;
        }
        if (line.startsWith('### ') || line.startsWith('## ') || line.startsWith('# ')) {
          const text = line.replace(/^#{1,3}\s+/, '');
          return (
            <p key={idx} className="font-title text-sm font-semibold text-[var(--sentinel-ink)] pt-1">
              {text}
            </p>
          );
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-[var(--sentinel-accent)] shrink-0" />
              <p className="flex-1">{renderFormattedLine(line.slice(2), `b-${idx}`)}</p>
            </div>
          );
        }
        const numberedMatch = /^(\d+)\.\s+(.*)$/.exec(line);
        if (numberedMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="font-mono text-[11px] font-semibold text-[var(--sentinel-accent)] shrink-0">
                {numberedMatch[1]}.
              </span>
              <p className="flex-1">{renderFormattedLine(numberedMatch[2], `n-${idx}`)}</p>
            </div>
          );
        }
        return <p key={idx}>{renderFormattedLine(line, `p-${idx}`)}</p>;
      })}
    </div>
  );
}

export function SecurityChatbotDrawer({
  open,
  onClose,
  userUid,
  operatorName,
  snapshot,
}: SecurityChatbotDrawerProps) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'standard' | 'fast'>('standard');
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync authenticated operator's multi-turn conversation from Firestore
  useEffect(() => {
    if (!userUid) {
      setMessages([]);
      return;
    }

    const unsubscribe = subscribeOperatorChatMessages(
      userUid,
      (persisted: PersistedChatMessage[]) => {
        setMessages(
          persisted.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            model: m.model,
            createdAtMs: m.createdAtMs,
          })),
        );
      },
      () => {
        // Non-fatal: keep local session thread interactive even if network stalls
      },
    );

    return () => unsubscribe();
  }, [userUid]);

  // Auto-scroll to latest turn when drawer opens or new messages arrive
  useEffect(() => {
    if (!open) return;
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [open, messages.length, sending]);

  // Focus composer & support Escape to close
  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 80);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const openAlertsCount = snapshot?.alerts.filter((a) => a.status !== 'resolved').length ?? 0;
  const criticalCount =
    snapshot?.alerts.filter((a) => a.status !== 'resolved' && a.severity === 'critical').length ?? 0;

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;

    setError(null);
    if (!overrideText) setInput('');
    setSending(true);

    const historySnapshot = messages.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const optimisticUserMsg: ChatMessageItem = {
      id: `local_user_${Date.now()}`,
      role: 'user',
      content: text,
      model: 'operator',
      createdAtMs: Date.now(),
    };

    // Optimistically show user turn immediately
    setMessages((prev) => [...prev, optimisticUserMsg]);

    // Persist user turn in Firestore in background (never blocks chat response)
    if (userUid) {
      void saveOperatorChatMessage({
        uid: userUid,
        role: 'user',
        content: text,
        model: 'operator',
      }).catch(() => {});
    }

    try {
      const res = await sentinelApi.sendChatMessage({
        message: text,
        history: historySnapshot,
        mode,
      });

      const assistantMsg: ChatMessageItem = {
        id: `local_model_${Date.now()}`,
        role: 'model',
        content: res.reply,
        model: res.model,
        createdAtMs: Date.now(),
      };

      setMessages((prev) => {
        const exists = prev.some(
          (m) => m.role === 'model' && m.content === assistantMsg.content && Math.abs(m.createdAtMs - assistantMsg.createdAtMs) < 3000,
        );
        return exists ? prev : [...prev, assistantMsg];
      });

      if (userUid) {
        void saveOperatorChatMessage({
          uid: userUid,
          role: 'model',
          content: res.reply,
          model: res.model,
        }).catch(() => {});
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to reach Sentinel Security Analyst. Please retry.',
      );
    } finally {
      setSending(false);
    }
  };

  const handleClearThread = async () => {
    if (clearing || sending) return;
    setClearing(true);
    setError(null);
    try {
      setMessages([]);
      if (userUid) {
        await clearOperatorChatMessages(userUid);
      }
    } catch {
      // Local thread is already cleared
    } finally {
      setClearing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/45"
      role="dialog"
      aria-modal="true"
      aria-label="Sentinel Security Analyst Chat"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="w-full max-w-lg h-full bg-[var(--sentinel-suede)] border-l border-[var(--sentinel-border)] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-[var(--sentinel-nude)] border-b border-[var(--sentinel-border)] flex items-start justify-between gap-3 shrink-0">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-[var(--sentinel-accent)] text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <h2 className="font-title text-lg font-semibold text-[var(--sentinel-ink)] truncate">
                Sentinel Security Analyst
              </h2>
            </div>
            <p className="text-[11px] text-[var(--sentinel-ink-secondary)]">
              Grounded in live edge-redacted telemetry · {openAlertsCount} open alerts
              {criticalCount > 0 ? ` (${criticalCount} critical)` : ''}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {messages.length > 0 && (
              <button
                type="button"
                disabled={clearing || sending}
                onClick={() => void handleClearThread()}
                title="Clear conversation history"
                data-testid="chat-clear-btn"
                className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink-secondary)] hover:text-[var(--sentinel-crit)] hover:border-[var(--sentinel-crit)] disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Security Analyst"
              className="p-1.5 rounded-md text-[var(--sentinel-ink-secondary)] hover:text-[var(--sentinel-ink)] hover:bg-[var(--sentinel-hover)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mode Selector Strip */}
        <div className="px-5 py-2.5 bg-[var(--sentinel-inset)] border-b border-[var(--sentinel-border-soft)] flex items-center justify-between gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--sentinel-ink-secondary)]">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--sentinel-accent)] shrink-0" />
            <span>Zero raw secrets sent</span>
          </span>
          <div
            className="inline-flex items-center gap-1 p-0.5 rounded-md bg-[var(--sentinel-nude)] border border-[var(--sentinel-border-soft)]"
            role="group"
            aria-label="Analyst response mode"
          >
            <button
              type="button"
              onClick={() => setMode('standard')}
              className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer ${
                mode === 'standard'
                  ? 'bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] shadow-xs'
                  : 'text-[var(--sentinel-ink-muted)] hover:text-[var(--sentinel-ink)]'
              }`}
            >
              Deep Analysis
            </button>
            <button
              type="button"
              onClick={() => setMode('fast')}
              className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer ${
                mode === 'fast'
                  ? 'bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] shadow-xs'
                  : 'text-[var(--sentinel-ink-muted)] hover:text-[var(--sentinel-ink)]'
              }`}
            >
              <Zap className="w-3 h-3 text-[var(--sentinel-accent)]" />
              <span>Fast Triage</span>
            </button>
          </div>
        </div>

        {/* Scrollable Multi-Turn Thread */}
        <div
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
          data-testid="security-chat-thread"
        >
          {messages.length === 0 ? (
            <div className="space-y-4 py-2">
              <div className="surface-inset rounded-lg p-4 space-y-2">
                <p className="font-title text-base font-semibold text-[var(--sentinel-ink)]">
                  Ask anything about your live Sentinel posture
                </p>
                <p className="text-xs text-[var(--sentinel-ink-secondary)] leading-relaxed">
                  I have real-time visibility into Harbor &amp; Finch&apos;s redacted alerts, Vault hash chain, stealth honey traps, blocked sessions, and pending payment holds.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sentinel-ink-muted)]">
                  Suggested Investigations
                </p>
                <div className="space-y-2">
                  {STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={sending}
                      onClick={() => void handleSend(prompt)}
                      className="w-full text-left px-3.5 py-2.5 rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-inset)] hover:border-[var(--sentinel-accent)] hover:bg-[var(--sentinel-nude)]/60 text-xs font-medium text-[var(--sentinel-ink)] transition-colors cursor-pointer"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-7 h-7 rounded-md bg-[var(--sentinel-accent-soft)] text-[var(--sentinel-accent-soft-ink)] border border-[var(--sentinel-accent)]/30 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-lg px-3.5 py-2.5 space-y-1.5 ${
                      isUser
                        ? 'bg-[var(--sentinel-accent)] text-white'
                        : 'surface-inset text-[var(--sentinel-ink)]'
                    }`}
                  >
                    <div
                      className={`flex items-center justify-between gap-3 text-[10px] font-mono ${
                        isUser ? 'text-white/80' : 'text-[var(--sentinel-ink-muted)]'
                      }`}
                    >
                      <span className="font-semibold">
                        {isUser ? operatorName : 'Sentinel Analyst'}
                      </span>
                      <span className="tabular-nums">{formatClockTime(msg.createdAtMs)}</span>
                    </div>

                    {isUser ? (
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <MessageContent content={msg.content} />
                    )}
                  </div>

                  {isUser && (
                    <div className="w-7 h-7 rounded-md bg-[var(--sentinel-nude)] text-[var(--sentinel-ink-secondary)] border border-[var(--sentinel-border)] flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })
          )}

          {sending && (
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-md bg-[var(--sentinel-accent-soft)] text-[var(--sentinel-accent-soft-ink)] border border-[var(--sentinel-accent)]/30 flex items-center justify-center shrink-0">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              <div className="surface-inset rounded-lg px-3.5 py-2.5 text-xs text-[var(--sentinel-ink-secondary)]">
                Analyzing live Sentinel telemetry...
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="p-3 rounded-md alert-pop-critical flex items-start gap-2 text-xs text-[var(--sentinel-crit-ink)]"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1 min-w-0">
                <p className="font-semibold">Analyst response unavailable</p>
                <p className="text-[11px] leading-relaxed">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-[11px] font-bold underline shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          <div ref={scrollEndRef} />
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="p-4 bg-[var(--sentinel-nude)] border-t border-[var(--sentinel-border)] space-y-2 shrink-0"
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              maxLength={4000}
              placeholder="Ask about an alert, Vault sequence, source IP, or compliance brief..."
              data-testid="security-chat-input"
              className="flex-1 surface-input rounded-md px-3 py-2 text-xs resize-none focus:outline-none focus:border-[var(--sentinel-accent)]"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              data-testid="security-chat-send-btn"
              aria-label="Send message"
              className="h-[54px] px-3.5 rounded-md bg-[var(--sentinel-accent)] hover:bg-[var(--sentinel-accent-hover)] disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
          <p className="text-[10px] text-[var(--sentinel-ink-muted)]">
            Press Enter to send · Shift+Enter for new line · Multi-turn thread synced to your operator account
          </p>
        </form>
      </aside>
    </div>
  );
}
