import Link from "next/link";
import { QuestionBankPage } from "@/components/content-workspaces";
import "@/components/question-import.css";

export default function Page() {
  return <>
    <QuestionBankPage admin />
    <Link href="/admin/questions/import" className="question-import-fab">Import PDF</Link>
  </>;
}
