import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("MonTerminal render failed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="grid min-h-dvh place-items-center bg-bg p-5 text-fg">
        <section className="w-full max-w-md rounded-2xl border border-line bg-raised p-6 text-center shadow-2xl">
          <img
            src="/monterminal-mark.svg"
            alt=""
            className="mx-auto size-10 object-contain"
          />
          <h1 className="mt-4 text-lg font-bold">A new MonTerminal version is ready</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            This tab was opened before the latest deployment. Refresh once to load the current app files.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="monad-gradient mt-5 h-10 rounded-lg px-5 text-sm font-bold text-white hover:brightness-110"
          >
            Refresh MonTerminal
          </button>
        </section>
      </main>
    );
  }
}
