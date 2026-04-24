import React from "react";

import { C } from "../../caredrop/theme";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error(`Error boundary caught an error in ${this.props.label || "section"}:`, error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          borderRadius: 18,
          border: `1px solid ${C.red}`,
          background: C.redLight,
          padding: 18,
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: C.red, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Recovery Mode
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>
          {this.props.label || "This section"} hit an error.
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.7, color: C.text }}>
          CareDrop kept the rest of the app running. You can reload this section and continue without losing the whole session.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: `1px solid ${C.red}`,
              background: C.surface,
              color: C.red,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Reload Section
          </button>
          {this.props.onBack ? (
            <button
              type="button"
              onClick={this.props.onBack}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: C.surface,
                color: C.text,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Back to Dashboard
            </button>
          ) : null}
        </div>
      </div>
    );
  }
}
