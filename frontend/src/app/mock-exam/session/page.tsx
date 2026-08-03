import { ConnectedAssessmentSession } from "@/components/connected-assessment-session";

export default async function Page({searchParams}:{searchParams:Promise<{attempt?:string;test?:string}>}){
 const params=await searchParams;
 return <ConnectedAssessmentSession attemptId={params.attempt||""} testId={params.test||""}/>;
}
