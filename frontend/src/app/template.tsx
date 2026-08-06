import { ConnectivityStatus } from "@/components/connectivity-status";

export default function Template({ children }: { children: React.ReactNode }) {
  return <><ConnectivityStatus />{children}</>;
}