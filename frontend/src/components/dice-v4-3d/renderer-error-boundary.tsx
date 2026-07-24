import * as React from "react";

type ThreeRendererErrorBoundaryPropsV4 = {
  children: React.ReactNode;
  onUnavailable: (error: Error) => void;
};

type ThreeRendererErrorBoundaryStateV4 = {
  failed: boolean;
};

export class ThreeRendererErrorBoundaryV4 extends React.Component<
  ThreeRendererErrorBoundaryPropsV4,
  ThreeRendererErrorBoundaryStateV4
> {
  state: ThreeRendererErrorBoundaryStateV4 = { failed: false };

  static getDerivedStateFromError(): ThreeRendererErrorBoundaryStateV4 {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    this.props.onUnavailable(error);
  }

  render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
