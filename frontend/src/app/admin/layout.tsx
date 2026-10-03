import { ProtectedRoute } from "@/components/protected-route";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ProtectedRoute roles={["SYSTEM_ADMIN"]} label="Verifying administrator access">{children}</ProtectedRoute>;
}
