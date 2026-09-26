import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly windows = new Map<string, {
    minute: string; method: string; route: string; status_class: number;
    requests: number; duration_sum_ms: number; duration_max_ms: number; buckets: number[];
  }>();

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      const timer = setInterval(() => this.flush(), 10_000);
      timer.unref();
    }
  }

  private flush(): void {
    for (const [key, window] of this.windows) {
      console.log(JSON.stringify({ event: 'http_request_aggregate', ...window }));
      this.windows.delete(key);
    }
  }

  use(request: Request, response: Response, next: NextFunction): void {
    const supplied = request.header("x-request-id");
    const requestId = supplied && /^[A-Za-z0-9._-]{8,128}$/.test(supplied) ? supplied : randomUUID();
    response.setHeader("X-Request-Id", requestId);
    const started = Date.now();
    response.on("finish", () => {
      const event = {
        event: "http_request",
        request_id: requestId,
        method: request.method,
        // Never emit IDs or query strings as metric dimensions.
        route: typeof request.route?.path === "string" ? request.route.path : "__unmatched__",
        status: response.statusCode,
        duration_ms: Date.now() - started,
      };
      if (process.env.NODE_ENV === 'production') {
        const minute = new Date().toISOString().slice(0, 16) + 'Z';
        const status_class = Math.floor(response.statusCode / 100);
        const key = JSON.stringify([minute, event.method, event.route, status_class]);
        let window = this.windows.get(key);
        if (!window) {
          window = { minute, method: event.method, route: event.route, status_class,
            requests: 0, duration_sum_ms: 0, duration_max_ms: 0, buckets: Array(8).fill(0) };
          this.windows.set(key, window);
        }
        window.requests++;
        window.duration_sum_ms += event.duration_ms;
        window.duration_max_ms = Math.max(window.duration_max_ms, event.duration_ms);
        const bucket = [50, 100, 250, 500, 1000, 2000, 5000]
          .findIndex((limit) => event.duration_ms <= limit);
        window.buckets[bucket < 0 ? 7 : bucket]++;
      }
      const line = JSON.stringify(event);
      if (response.statusCode >= 500) console.error(line);
      else if (response.statusCode >= 400) console.warn(line);
      else if (process.env.LOG_LEVEL === "debug") console.log(line);
    });
    next();
  }
}
