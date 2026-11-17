import { Component, type ReactNode } from 'react';

interface Props { message: string; action: string; children: ReactNode }

/** A page failure says what happened and what to do, and leaves navigation and saved data intact. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="notice notice-stop" role="alert">
        <p className="strong">{this.props.message}</p>
        <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => window.location.reload()}>{this.props.action}</button>
      </div>
    );
  }
}
