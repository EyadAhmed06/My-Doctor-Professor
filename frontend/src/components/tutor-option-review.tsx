"use client";

import "./tutor-option-review.css";

export type TutorOptionFeedback = {
  id: string;
  explanation?: string | null;
};

export type StructuredTutorFeedback = {
  is_correct: boolean | null;
  question_explanation?: string | null;
  selected_option?: TutorOptionFeedback | null;
  correct_option?: TutorOptionFeedback | null;
  options?: TutorOptionFeedback[];
};

type DisplayOption = {
  id: string;
  optionText: string;
  displayOrder: number;
};

export function TutorOptionReview({
  feedback,
  options,
}: {
  feedback: StructuredTutorFeedback;
  options: DisplayOption[];
}) {
  const feedbackById = new Map((feedback.options || []).map((option) => [option.id, option]));
  const selectedId = feedback.selected_option?.id ?? null;
  const correctId = feedback.correct_option?.id ?? null;

  if (!feedback.options?.length) return null;

  return (
    <details className="tutor-option-review">
      <summary>Review all 5 options</summary>
      {feedback.question_explanation && (
        <div className="tutor-option-takeaway">
          <b>Question takeaway</b>
          <p>{feedback.question_explanation}</p>
        </div>
      )}
      <div className="tutor-option-review-list">
        {options
          .slice()
          .sort((left, right) => left.displayOrder - right.displayOrder)
          .map((option, index) => {
            const optionFeedback = feedbackById.get(option.id);
            const isSelected = option.id === selectedId;
            const isCorrect = option.id === correctId;
            return (
              <article
                className={`tutor-option-review-row ${isCorrect ? "is-correct" : ""} ${isSelected ? "is-selected" : ""}`.trim()}
                key={option.id}
              >
                <header>
                  <span className="tutor-option-letter">{String.fromCharCode(65 + index)}</span>
                  <b>{option.optionText}</b>
                  <span className="tutor-option-badges">
                    {isSelected && <em>Your choice</em>}
                    {isCorrect && <em>Correct answer</em>}
                  </span>
                </header>
                <p>{optionFeedback?.explanation || "No explanation has been published for this option."}</p>
              </article>
            );
          })}
      </div>
    </details>
  );
}
