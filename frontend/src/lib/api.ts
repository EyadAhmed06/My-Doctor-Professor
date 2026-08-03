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

export type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  accessToken?: string | null;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
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

  const response = await fetch(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    ...requestInit,
    headers,
    body: requestBody,
  });

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
}
