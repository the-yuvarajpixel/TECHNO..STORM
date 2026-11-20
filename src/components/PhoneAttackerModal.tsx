import { useState } from 'react';
import { Check, Copy, ExternalLink, Smartphone, X } from 'lucide-react';

interface PhoneAttackerModalProps {
  open: boolean;
  onClose: () => void;
  connectedAttackers: number;
  onSwitchHere: () => void;
}

export function PhoneAttackerModal({
  open,
  onClose,
  connectedAttackers,
  onSwitchHere,
}: PhoneAttackerModalProps) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const baseUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : '';
  const attackerUrl = `${baseUrl}?portal=attacker`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(attackerUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Connect Another Phone as Demo Attacker"
    >
      <div className="window-suede rounded-lg max-w-lg w-full p-5 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-[var(--sentinel-crit)] shrink-0" />
            <div>
              <h2 className="text-base font-bold text-[var(--sentinel-ink)]">
                Connect Another Phone as Demo Attacker
              </h2>
              <p className="text-xs text-[var(--sentinel-ink-secondary)]">
                Open this URL on a second phone to manually browse Harbor &amp; Finch files, alter an API key, or inject an anomaly live.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-[var(--sentinel-ink-muted)] hover:text-[var(--sentinel-ink)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="surface-inset rounded-md p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[var(--sentinel-ink)]">Direct Phone Attacker Link</span>
            <span
              className={`font-mono font-semibold ${
                connectedAttackers > 0
                  ? 'text-[var(--sentinel-crit)]'
                  : 'text-[var(--sentinel-ink-muted)]'
              }`}
            >
              {connectedAttackers} attacker device(s) connected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={attackerUrl}
              aria-label="Demo Attacker Portal URL"
              className="flex-1 px-2.5 py-2 text-xs font-mono surface-input rounded-md"
            />
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[var(--sentinel-teal)] rounded-md hover:bg-[var(--sentinel-teal-hover)] whitespace-nowrap cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy Link'}
            </button>
          </div>
        </div>

        <ol className="text-xs text-[var(--sentinel-ink-secondary)] space-y-1.5 list-decimal pl-4 leading-relaxed">
          <li>Send the link above to another phone (or open it in a second browser window).</li>
          <li>On the phone, inspect Harbor &amp; Finch files, tamper with <span className="font-mono font-semibold">ak_payroll_prod</span>, or fire a custom anomaly.</li>
          <li>Watch the alert pop immediately here in Admin — click <strong>Exact Spot in Logs</strong> to inspect the matched log line, then <strong>Resolve</strong>.</li>
        </ol>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[var(--sentinel-divider)]">
          <button
            type="button"
            onClick={() => {
              onClose();
              onSwitchHere();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#DC2626] rounded-md hover:bg-[#B91C1C] whitespace-nowrap cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Switch This Device to Attacker Mode
          </button>
        </div>
      </div>
    </div>
  );
}
