import { ProtectedRoute } from "@/components/protected-route";

export default function InstructorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ProtectedRoute roles={["INSTRUCTOR"]} label="Verifying instructor access">{children}</ProtectedRoute>;
}
