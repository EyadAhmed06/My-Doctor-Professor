"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell } from "./product-shell";
import { TutorOptionReview } from "./tutor-option-review";
import "./assessment-session.css";

type ReviewOption = {
  id: string;
  optionText: string;
  displayOrder: number;
  isCorrect?: boolean;
  explanation?: string | null;
};

type ReviewQuestion = {
  id: string;
  questionText: string;
  questionType: "MCQ" | "ESSAY";
  explanation?: string | null;
  options: ReviewOption[];
};

type ReviewAssignment = {
  questionId: string;
  question: ReviewQuestion;
  answer: { selectedOptionId: string | null; isCorrect: boolean | null } | null;
};

type Review = {
  attempt: {
    id: string;
    status: string;
    testMode: "TUTOR" | "TIMED";
    test?: { title?: string | null };
  };
  questions: ReviewAssignment[];
};

export function AssessmentReview({ attemptId, source = "assessments" }: { attemptId: string; source?: string }) {
  const { user, request } = useAuth();
  const router = useRouter();
  const forensicCode = user?.forensic_code || user?.forensicCode;
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    void request<Review>(`/tests/attempts/${attemptId}/review`)
      .then((value) => { if (active) setReview(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load assessment review."); });
    return () => { active = false; };
  }, [attemptId, request]);

  const exitPath = source === "rounds" ? "/rounds" : source === "past-exams" ? "/past-exams" : "/assessments";

  if (error) {
    return <ProductShell><Panel title="Could not load review"><p>{error}</p><button className="pp-button" type="button" onClick={() => window.location.reload()}>Retry</button></Panel></ProductShell>;
  }
  if (!review) return <ProductShell><div className="product-auth-loading">Loading assessment review…</div></ProductShell>;

  return <ProductShell><main className="pp-page exam-session-page"><Panel title="Assessment submitted" className="exam-review-panel">
    <h2>{review.attempt.test?.title || "Assessment complete"}</h2>
    <p>Your submitted answers are saved. Detailed explanations are shown below.</p>
    {review.questions.map((item, index) => {
      const selectedOption = item.question.options.find((option) => option.id === item.answer?.selectedOptionId);
      const correctOption = item.question.options.find((option) => option.isCorrect);
      const resultLabel = item.answer?.isCorrect === true ? "Correct" : item.answer?.isCorrect === false ? "Incorrect" : "Not answered / pending grading";
      const optionFeedback = item.question.options.map((option) => ({ id: option.id, explanation: option.explanation }));
      const structuredFeedback = correctOption ? {
        is_correct: item.answer?.isCorrect ?? null,
        question_explanation: item.question.explanation,
        selected_option: selectedOption ? { id: selectedOption.id, explanation: selectedOption.explanation } : null,
        correct_option: { id: correctOption.id, explanation: correctOption.explanation },
        options: optionFeedback,
      } : null;

      return <article className={`review-answer ${item.answer?.isCorrect === true ? "correct" : item.answer?.isCorrect === false ? "incorrect" : ""}`} key={item.question.id}>
        <b>{index + 1}{forensicCode ? ` · ${forensicCode}` : ""}. {item.question.questionText}</b>
        <strong>{resultLabel}</strong>
        {selectedOption && <p><span>Your answer:</span> {selectedOption.optionText}</p>}
        {correctOption && item.answer?.isCorrect !== true && <p><span>Correct answer:</span> {correctOption.optionText}</p>}
        <div className="review-explanation"><b>Explanation</b><p>{item.question.explanation || "No explanation has been published for this question."}</p></div>
        {structuredFeedback && item.question.options.length === 5 && <TutorOptionReview feedback={structuredFeedback} options={item.question.options} />}
      </article>;
    })}
    <button className="pp-button" type="button" onClick={() => router.push(exitPath)}>Back</button>
  </Panel></main></ProductShell>;
}
