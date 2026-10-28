export type Issue = {
  code: string;
  severity: "INFO" | "WARNING" | "ERROR";
  message: string;
};

export type Candidate = {
  candidate_id: string;
  section: string;
  block_type?: "CASE" | "LECTURE";
  case_number: number;
  case_label: string;
  case_stem: string;
  question_number: number;
  question_text: string;
  model_answer: string | null;
  answer_origin?: "SOURCE" | "MISSING" | "MANUAL";
  source_page: number | null;
  answer_page: number | null;
  extraction_confidence: number;
  status: "VALID" | "NEEDS_REVIEW" | "INVALID";
  issues: Issue[];
};

export type ReviewCandidate = Candidate & {
  approved: boolean;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  marks: number;
};

export type Inspection = {
  original_filename: string;
  file_sha256: string;
  page_count: number;
  file_size: number;
  status: string;
  summary: { cases:number; lectures?:number; extracted:number; valid:number; needs_review:number; invalid:number };
  issues: Issue[];
  candidates: Candidate[];
};
