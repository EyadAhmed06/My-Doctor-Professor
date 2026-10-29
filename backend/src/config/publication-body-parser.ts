import type { INestApplication } from '@nestjs/common';
import { json } from 'express';

export function configurePublicationBodyParser(app: INestApplication): void {
  const publishParser = json({ limit: '32mb' });
  // Nest detects a middleware named jsonParser and skips its default JSON
  // parser globally. Wrap this route-only parser so normal routes still parse.
  for (const path of [
    '/api/v1/questions/imports/publish',
    '/api/v1/questions/imports/essay/publish',
  ]) {
    app.use(path, (request, response, next) => {
      publishParser(request, response, next);
    });
  }
}
