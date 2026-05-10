import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("App error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center",
          justifyContent: "center", background: "#1a1814", color: "#e8e4de",
          fontFamily: "system-ui, sans-serif", padding: 32, textAlign: "center"
        }}>
          <div>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              Wystąpił błąd aplikacji
            </div>
            <div style={{ fontSize: 13, color: "#9e9891", marginBottom: 24, maxWidth: 480 }}>
              {this.state.error.message}
            </div>
            <button
              onClick={() => this.setState({ error: null })}
              style={{
                padding: "10px 24px", borderRadius: 8, border: "none",
                background: "#a07428", color: "#fff", fontWeight: 600,
                fontSize: 14, cursor: "pointer"
              }}
            >
              Spróbuj ponownie
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
