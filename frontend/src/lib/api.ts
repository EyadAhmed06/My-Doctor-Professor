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

export const apiBaseUrl = API_URL;

export type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  accessToken?: string | null;
};

function signalRequest(name: typeof REQUEST_START | typeof REQUEST_END) {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(name));
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  signalRequest(REQUEST_START);
  try {
    const headers = new Headers(options.headers);
    const isForm = options.body instanceof FormData;
    if (options.body !== undefined && !isForm) headers.set("Content-Type", "application/json");
    if (options.accessToken) headers.set("Authorization", `Bearer ${options.accessToken}`);

    const requestBody: BodyInit | undefined = options.body === undefined
      ? undefined
      : isForm
        ? options.body as FormData
        : JSON.stringify(options.body);
    const { body: _body, accessToken: _accessToken, ...requestInit } = options;
    void _body;
    void _accessToken;

    let response: Response;
    try {
      response = await fetch(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`, {
        ...requestInit,
        headers,
        body: requestBody,
      });
    } catch (cause) {
      throw new Error(
        `Cannot reach the backend at ${API_URL}. Start NestJS on port 3000 and the frontend on port 3001.`,
        { cause },
      );
    }

    if (response.status === 204) return undefined as T;
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json() as unknown
      : await response.text();

    if (!response.ok) {
      const problem = typeof payload === "object" && payload !== null
        ? payload as ApiProblem
        : { message: String(payload || response.statusText) };
      throw new ApiError(response.status, problem);
    }
    return payload as T;
  } finally {
    signalRequest(REQUEST_END);
  }
}
