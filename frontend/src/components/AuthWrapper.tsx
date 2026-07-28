import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthProvider";
import { SparkleLoadingIndicator } from "./SparkleLoadingIndicator";

type AuthWrapperProps = {
  children: ReactNode;
};

export const AuthWrapper = ({ children }: AuthWrapperProps) => {
  const { isLoading, isSignedIn } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SparkleLoadingIndicator
          label="Summoning a natural 20"
          className="min-h-screen"
        />
      </div>
    );
  }

  if (!isSignedIn) {
    const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/?returnTo=${returnTo}`} replace />;
  }

  return <>{children}</>;
};
