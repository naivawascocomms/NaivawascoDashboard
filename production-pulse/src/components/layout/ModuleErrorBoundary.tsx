import { Component, ReactNode } from 'react';
import { ErrorState } from '@/components/layout/QueryState';

interface ModuleErrorBoundaryProps {
  children: ReactNode;
}

interface ModuleErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render errors inside a module so a crash in one dashboard shows a
 * recoverable error card instead of white-screening the whole app shell.
 * Mount it keyed by route path so navigating to another module resets it.
 */
export class ModuleErrorBoundary extends Component<
  ModuleErrorBoundaryProps,
  ModuleErrorBoundaryState
> {
  state: ModuleErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ModuleErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Module render error:', error);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="container py-6">
          <ErrorState
            title="This module failed to load."
            message={this.state.error.message}
            onRetry={this.handleRetry}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
