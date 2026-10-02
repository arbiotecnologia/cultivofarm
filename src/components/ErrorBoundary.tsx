import React, { Component, ErrorInfo, ReactNode } from "react";
import { ErrorRecovery } from "./ErrorRecovery";
import { isStaleBuildError, recoverFromStaleBuild } from "@/pwa/registerSW";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    if (isStaleBuildError(error)) {
      void recoverFromStaleBuild();
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <ErrorRecovery 
          title="Erro de Renderização"
          message={this.state.error?.message || "Ocorreu um erro inesperado ao exibir esta parte da aplicação. Tente recarregar a página."}
          onRetry={() => {
            this.setState({ hasError: false });
            window.location.reload();
          }}
        />
      );
    }

    return this.props.children;
  }
}
