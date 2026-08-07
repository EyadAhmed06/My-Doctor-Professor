import { AssessmentSessionEntry } from "@/components/assessment-session-entry";

export default async function Page({searchParams}:{searchParams:Promise<{attempt?:string;test?:string;source?:string}>}){
 const params=await searchParams;
 return <AssessmentSessionEntry attemptId={params.attempt} testId={params.test} source={params.source||"assessments"}/>;
}
