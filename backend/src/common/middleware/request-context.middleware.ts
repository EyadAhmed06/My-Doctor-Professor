import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
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
        route: request.route?.path ?? request.path,
        status: response.statusCode,
        duration_ms: Date.now() - started,
      };
      const line = JSON.stringify(event);
      if (response.statusCode >= 500) console.error(line);
      else if (response.statusCode >= 400) console.warn(line);
      else if (process.env.LOG_LEVEL === "debug") console.log(line);
    });
    next();
  }
}
