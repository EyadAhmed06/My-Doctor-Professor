"use client";

import { useEffect, useState } from "react";
import "@/components/notebook-completion.css";
import "@/components/notebook-editor-completion.css";

export default function NotebookLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="product-auth-loading">Loading notebook workspace…</div>;
  return children;
}