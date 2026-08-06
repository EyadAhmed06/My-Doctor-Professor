import type React from "react";
import "./product-shell";

declare module "./product-shell" {
  export function Panel(props: {
    title?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    id?: string;
    onClick?: React.MouseEventHandler<HTMLElement>;
    role?: React.AriaRole;
    tabIndex?: number;
    "aria-label"?: string;
  }): React.ReactElement;
}