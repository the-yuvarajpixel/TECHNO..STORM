import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Sentinel UI ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed && typeof parsed.error === 'string') {
          friendly = `Database access error (${parsed.operationType ?? 'op'}): ${parsed.error}`;
        }
      } catch {
        // Keep raw message if not JSON
      }

      return (
        <div className="min-h-screen bg-[var(--sentinel-bg)] text-[var(--sentinel-ink)] flex items-center justify-center p-6">
          <div className="window-suede rounded-lg max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-[var(--sentinel-crit)]">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h1 className="text-base font-bold">Sentinel encountered an error</h1>
            </div>
            <p className="text-xs text-[var(--sentinel-ink-secondary)] leading-relaxed break-words">
              {friendly}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--sentinel-accent)] rounded-md hover:bg-[var(--sentinel-accent-hover)] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
