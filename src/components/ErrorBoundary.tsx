import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected rendering error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[320px] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-[#E2E8F0] rounded-lg p-6 text-center space-y-4">
            <AlertTriangle className="w-8 h-8 text-[#DC2626] mx-auto" />
            <div className="space-y-1">
              <h2 className="font-display text-base font-bold text-[#0B1830]">Workspace View Error</h2>
              <p className="text-xs text-[#64748B]">{this.state.message}</p>
            </div>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1830] hover:bg-[#13264A] rounded-md cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload View
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
