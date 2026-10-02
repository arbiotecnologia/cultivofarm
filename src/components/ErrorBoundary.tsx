import React, { Component, ErrorInfo, ReactNode } from "react";
import { ErrorRecovery } from "./ErrorRecovery";
import {
  applyPendingUpdate,
  isStaleBuildError,
  recoverFromStaleBuild,
  retryCurrentBuild,
} from "@/pwa/registerSW";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  staleBuild: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    staleBuild: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, staleBuild: isStaleBuildError(error) };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    if (isStaleBuildError(error)) {
      void recoverFromStaleBuild();
    }
  }

  public render() {
    if (this.state.hasError) {
      if (this.state.staleBuild) {
        return (
          <ErrorRecovery
            title="Há uma atualização necessária para continuar."
            message="Atualize quando estiver pronto. Se não funcionar, tente novamente ou use ?sw=off para recuperação."
            primaryActionLabel="Atualizar agora"
            onPrimaryAction={() => void applyPendingUpdate()}
            onRetry={() => retryCurrentBuild()}
          />
        );
      }
      return (
        <ErrorRecovery 
          title="Erro de Renderização"
          message={this.state.error?.message || "Ocorreu um erro inesperado ao exibir esta parte da aplicação. Tente recarregar a página."}
          onRetry={() => {
            this.setState({ hasError: false, staleBuild: false });
          }}
        />
      );
    }

    return this.props.children;
  }
}
