import { PublicLegalPage } from "@/components/public-legal-page";

export default function Page() {
  return <PublicLegalPage
    title="Terms of Service"
    intro="These terms describe the intended use of My Doctor & The Professor. Production deployment should have the final text reviewed and kept consistent with the service actually offered."
    sections={[
      { title: "Educational purpose", paragraphs: ["The platform provides educational tools, learning resources, assessments, notes, flashcards, and study workflows. It does not replace professional medical advice, clinical judgment, or the rules of a university or examination authority."] },
      { title: "Account use", paragraphs: ["Users are responsible for the activity performed through their account and should provide accurate information when the platform requires it. Access should not be shared in a way that bypasses role, enrollment, or content-access controls."] },
      { title: "Assessments and academic integrity", paragraphs: ["Question banks, practice sessions, mock exams, and explanations are provided for learning. Users remain responsible for following the academic-integrity rules that apply to their institution and examinations."] },
      { title: "Content and availability", paragraphs: ["Courses, questions, explanations, files, and other learning content may be added, corrected, unpublished, or reorganized by authorized instructors or administrators. The service may also require maintenance or configuration changes."] },
      { title: "Acceptable use", paragraphs: ["Users should not attempt to bypass authorization, interfere with the platform, access another person's account, misuse protected educational content, or use the service in a way that harms other users or the system."] },
      { title: "Changes", paragraphs: ["These terms should be updated when the product, access model, or legal requirements materially change."] },
    ]}
  />;
}
