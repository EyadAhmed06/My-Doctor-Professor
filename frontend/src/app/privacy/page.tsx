import { PublicLegalPage } from "@/components/public-legal-page";

export default function Page() {
  return <PublicLegalPage
    title="Privacy Policy"
    intro="This page explains the privacy principles used by My Doctor & The Professor. Production deployment should keep this text aligned with the data actually collected, stored, and shared by the service."
    sections={[
      { title: "Information used by the platform", paragraphs: ["The service may process account information, academic profile details, course access, assessment activity, notes, flashcard activity, study-plan activity, and technical session information when those features are used.", "Only information required for the active product workflow should be requested from the user."] },
      { title: "How information is used", paragraphs: ["Information is used to authenticate accounts, provide learning content, save progress, support assessments, personalize study workflows, protect account security, and operate the service.", "Assessment and study activity may also be used to generate progress views that are visible to the authorized user and, where the product permits it, authorized teaching or administrative roles."] },
      { title: "Account security", paragraphs: ["Authentication credentials and session controls are handled through the platform's security mechanisms. Users should protect their account credentials and sign out of devices they no longer control."] },
      { title: "Medical and academic content", paragraphs: ["The platform is an educational product. Notes, questions, explanations, and study resources should not be treated as a substitute for professional medical care or institution-specific academic rules."] },
      { title: "Changes", paragraphs: ["If the service's data practices change, this policy should be updated before those changes are relied on in production."] },
    ]}
  />;
}
