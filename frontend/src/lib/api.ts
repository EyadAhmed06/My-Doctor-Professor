import { clearAssessmentIdempotencyKey, getAssessmentIdempotencyKey } from "./assessment-idempotency";

export type ApiProblem = {
  statusCode?: number;
  message?: string | string[];
  error?: string;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: ApiProblem,
  ) {
    const message = Array.isArray(problem.message)
      ? problem.message.join(". ")
      : problem.message || problem.error || `Request failed with status ${status}`;
    super(message);
    this.name = "ApiError";
  }
}

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1").replace(/\/$/, "");
const REQUEST_START = "mdp:request-start";
const REQUEST_END = "mdp:request-end";
const ACHIEVEMENT_CHECK = "mdp:achievement-check";

export const apiBaseUrl = API_URL;

export type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  accessToken?: string | null;
  responseType?: "json" | "text" | "blob";
};

function signalRequest(name: typeof REQUEST_START | typeof REQUEST_END) {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(name));
}

function signalAchievementCheck(path: string, method: string) {
  if (typeof window === "undefined" || method === "GET" || method === "HEAD") return;
  const normalized = path.replace(/^\//, "");
  if (normalized === "progress/achievements/sync") return;
  const relevant = normalized.startsWith("progress/lectures/")
    || (/^tests\/attempts\//.test(normalized) && (/\/answers\//.test(normalized) || /\/submit$/.test(normalized)))
    || (/^flashcards\/cards\/.+\/review$/.test(normalized))
    || (/^essay-practice\/attempts\/.+\/answers\//.test(normalized))
    || normalized.startsWith("study-plan/");
  if (relevant) window.dispatchEvent(new Event(ACHIEVEMENT_CHECK));
}

function normalizeProblem(path: string, status: number, payload: unknown, statusText: string): ApiProblem {
  const problem = typeof payload === "object" && payload !== null
    ? payload as ApiProblem
    : { message: String(payload || statusText) };

  const rawMessage = Array.isArray(problem.message)
    ? problem.message.join(". ")
    : problem.message || problem.error || "";

  if (
    status === 404
    && path.replace(/^\//, "") === "questions/imports/inspect"
    && /cannot\s+post/i.test(rawMessage)
  ) {
    return {
      statusCode: 404,
      error: "Question import route unavailable",
      message: "The running backend does not have POST /api/v1/questions/imports/inspect registered. Pull agent/phase1-interactions and fully restart NestJS; the source route is present but the current backend process is stale or running another build.",
    };
  }

  return problem;
}

function practiceGenerationIntent(body: unknown): string {
  if (typeof body !== "object" || body === null) return JSON.stringify(body ?? null);
  const record = body as Record<string, unknown>;
  const lectureIds = Array.isArray(record.lecture_ids)
    ? [...record.lecture_ids].map(String).sort()
    : record.lecture_ids;
  return JSON.stringify({ ...record, lecture_ids: lectureIds });
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  signalRequest(REQUEST_START);
  try {
    const headers = new Headers(options.headers);
    const isForm = options.body instanceof FormData;
    if (options.body !== undefined && !isForm) headers.set("Content-Type", "application/json");
    if (options.accessToken) headers.set("Authorization", `Bearer ${options.accessToken}`);

    const normalizedPath = path.replace(/^\//, "");
    const method = String(options.method || "GET").toUpperCase();
    const practiceGeneration = method === "POST"
      && ["tests/practice/generate", "mcq-practice/generate"].includes(normalizedPath);
    let generatedIdempotencyKey: string | null = null;
    let generatedIdempotencyScope: string | null = null;
    if (practiceGeneration && !headers.has("Idempotency-Key")) {
      generatedIdempotencyScope = `practice:${normalizedPath}`;
      generatedIdempotencyKey = getAssessmentIdempotencyKey(
        generatedIdempotencyScope,
        practiceGenerationIntent(options.body),
      );
      headers.set("Idempotency-Key", generatedIdempotencyKey);
    }

    const requestBody: BodyInit | undefined = options.body === undefined
      ? undefined
      : isForm
        ? options.body as FormData
        : JSON.stringify(options.body);
    const { body: _body, accessToken: _accessToken, responseType = "json", ...requestInit } = options;
    void _body;
    void _accessToken;

    let response: Response;
    try {
      response = await fetch(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`, {
        ...requestInit,
        credentials: requestInit.credentials ?? "include",
        headers,
        body: requestBody,
      });
    } catch (cause) {
      throw new Error(
        `Cannot reach the backend at ${API_URL}. Start NestJS on port 3000 and the frontend on port 3001.`,
        { cause },
      );
    }

    if (!response.ok) {
      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json")
        ? await response.json() as unknown
        : await response.text();
      throw new ApiError(response.status, normalizeProblem(path, response.status, payload, response.statusText));
    }

    if (generatedIdempotencyKey && generatedIdempotencyScope) {
      clearAssessmentIdempotencyKey(generatedIdempotencyScope, generatedIdempotencyKey);
    }
    signalAchievementCheck(path, method);
    if (response.status === 204) return undefined as T;
    if (responseType === "blob") return await response.blob() as unknown as T;
    if (responseType === "text") return await response.text() as unknown as T;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return await response.text() as unknown as T;
    return await response.json() as T;
  } finally {
    signalRequest(REQUEST_END);
  }
}