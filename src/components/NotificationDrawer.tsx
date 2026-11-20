import { useState } from 'react';
import { BellRing, CheckCheck, X } from 'lucide-react';
import type { PushNotificationEvent } from '../core/types';
import { formatRelativeTime, severityLabel, severityTextClass } from '../lib/format';

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  notifications: PushNotificationEvent[];
  wsStatus: 'connecting' | 'connected' | 'reconnecting';
  browserPushPermission: NotificationPermission;
  onRequestBrowserPush: () => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onSelectAlert: (alertId: string) => void;
  onOpenWebhooks: () => void;
}

export function NotificationDrawer({
  open,
  onClose,
  notifications,
  wsStatus,
  browserPushPermission,
  onRequestBrowserPush,
  onMarkAllRead,
  onSelectAlert,
  onOpenWebhooks,
}: NotificationDrawerProps) {
  const [markingAll, setMarkingAll] = useState(false);

  if (!open) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || markingAll) return;
    setMarkingAll(true);
    try {
      await onMarkAllRead();
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Real-Time Push Notifications"
    >
      <div className="w-full max-w-md bg-[var(--sentinel-suede)] h-full border-l border-[var(--sentinel-border)] flex flex-col">
        <div className="p-4 border-b border-[var(--sentinel-divider)] bg-[var(--sentinel-nude)] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--sentinel-ink)] truncate">
              Real-Time Push Stream
            </h2>
            <p className="text-xs text-[var(--sentinel-ink-secondary)] truncate">
              Stream:{' '}
              <span
                className={
                  wsStatus === 'connected'
                    ? 'text-[var(--sentinel-teal)] font-semibold'
                    : 'text-[var(--sentinel-high)] font-semibold'
                }
              >
                {wsStatus === 'connected' ? 'Connected (live)' : wsStatus}
              </span>
              {' · '}
              <span className="font-mono tabular-nums">{unreadCount} unread</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={unreadCount === 0 || markingAll}
              onClick={() => void handleMarkAllRead()}
              data-testid="mark-all-read-btn"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-[var(--sentinel-ink)] bg-[var(--sentinel-suede)] border border-[var(--sentinel-border)] rounded-md hover:border-[var(--sentinel-teal)] hover:text-[var(--sentinel-teal)] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5 text-[var(--sentinel-teal)]" />
              <span>{markingAll ? 'Clearing...' : 'Mark All as Read'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications drawer"
              className="p-2 text-[var(--sentinel-ink-secondary)] hover:text-[var(--sentinel-ink)] rounded-md cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-3 border-b border-[var(--sentinel-divider)] flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => void onRequestBrowserPush()}
            disabled={browserPushPermission === 'granted'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[var(--sentinel-teal)] rounded-md hover:bg-[var(--sentinel-teal-hover)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
          >
            <BellRing className="w-3.5 h-3.5" />
            {browserPushPermission === 'granted' ? 'Browser Push Active' : 'Enable Browser Push'}
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenWebhooks();
              onClose();
            }}
            className="px-2.5 py-1.5 text-xs font-semibold text-[var(--sentinel-teal)] hover:underline whitespace-nowrap cursor-pointer"
          >
            Configure Webhooks →
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--sentinel-ink-secondary)]">
              No push alerts dispatched yet.
            </div>
          ) : (
            notifications.map((n) => {
              const isPopping = !n.read && (n.severity === 'critical' || n.severity === 'high');
              return (
                <div
                  key={n.id}
                  className={`p-3.5 rounded-md transition-colors ${
                    isPopping
                      ? n.severity === 'critical'
                        ? 'alert-pop-critical'
                        : 'alert-pop-high'
                      : n.read
                        ? 'surface-inset'
                        : 'bg-[var(--sentinel-nude)] border border-[var(--sentinel-border)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className={severityTextClass(n.severity)}>
                      {severityLabel(n.severity)} · {n.channel}
                    </span>
                    <span className="font-mono tabular-nums text-[var(--sentinel-ink-muted)]">
                      {formatRelativeTime(n.timestamp)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-[var(--sentinel-ink)]">{n.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--sentinel-ink-secondary)] leading-relaxed">
                    {n.message}
                  </p>
                  {n.alertId && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectAlert(n.alertId!);
                        onClose();
                      }}
                      className="mt-2 text-xs font-semibold text-[var(--sentinel-teal)] hover:underline cursor-pointer"
                    >
                      Inspect Alert &amp; Log Spot →
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
