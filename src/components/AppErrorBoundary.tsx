import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface AppErrorBoundaryProps {
  children: ReactNode;
  sectionLabel?: string;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected rendering error occurred.',
    };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Sentinel UI boundary caught error:', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="window-suede rounded-lg p-6 max-w-lg mx-auto my-8 space-y-3 text-center"
        >
          <div className="w-10 h-10 rounded-md bg-[var(--sentinel-crit-bg)] border border-[var(--sentinel-crit-border)] text-[var(--sentinel-crit)] flex items-center justify-center mx-auto">
            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
          </div>
          <h2 className="font-title text-base font-semibold text-[var(--sentinel-ink)]">
            {this.props.sectionLabel
              ? `${this.props.sectionLabel} encountered an error`
              : 'View temporarily unavailable'}
          </h2>
          <p className="text-xs text-[var(--sentinel-ink-secondary)] leading-relaxed">
            {this.state.errorMessage}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md bg-[var(--sentinel-accent)] hover:bg-[var(--sentinel-accent-hover)] text-white cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reload View</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
