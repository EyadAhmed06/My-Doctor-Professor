import { ResourceUploadPage } from "@/components/resource-upload-page";
import { ProtectedRoute } from "@/components/protected-route";

export default function Page(){return <ProtectedRoute roles={["INSTRUCTOR"]} label="Verifying instructor access"><ResourceUploadPage/></ProtectedRoute>;}
