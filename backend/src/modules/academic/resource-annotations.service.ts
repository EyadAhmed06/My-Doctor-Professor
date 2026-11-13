import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AcademicAccessService } from './academic-access.service';

export type ResourceAnnotationKind = 'NOTE' | 'HIGHLIGHT';

@Injectable()
export class ResourceAnnotationsService {
  constructor(private readonly db: DataSource, private readonly access: AcademicAccessService) {}

  async list(resourceId: string, actor: AuthenticatedUser) {
    await this.access.assertResourceReadable(resourceId, actor);
    return this.db.query(
      `SELECT id, kind, page_number AS "pageNumber", body, created_at AS "createdAt"
       FROM resource_annotations WHERE resource_id = $1 AND user_id = $2
       ORDER BY page_number, created_at`,
      [resourceId, actor.userId],
    );
  }

  async create(resourceId: string, actor: AuthenticatedUser, input: {
    kind?: string; page_number?: number; body?: string;
  }) {
    await this.access.assertResourceReadable(resourceId, actor);
    const kind = input?.kind;
    const page = input?.page_number;
    const body = typeof input?.body === 'string' ? input.body.trim() : undefined;
    if ((kind !== 'NOTE' && kind !== 'HIGHLIGHT')
      || !Number.isSafeInteger(page) || page! < 1 || page! > 10000
      || typeof body !== 'string' || !body.length || body.length > 4000) {
      throw new BadRequestException('Choose Note or Highlight, a valid page, and 1–4000 characters of text');
    }
    const resource = (await this.db.query<Array<{ mime_type: string | null }>>(
      'SELECT mime_type FROM resources WHERE id = $1', [resourceId],
    ))[0];
    if (!resource) throw new NotFoundException('Resource not found');
    if (resource.mime_type !== 'application/pdf') {
      throw new BadRequestException('Annotations are only supported on PDF resources');
    }
    const rows = await this.db.query(
      `INSERT INTO resource_annotations (id, resource_id, user_id, kind, page_number, body)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, kind, page_number AS "pageNumber", body, created_at AS "createdAt"`,
      [randomUUID(), resourceId, actor.userId, kind, page, body],
    );
    return rows[0];
  }

  async remove(resourceId: string, annotationId: string, actor: AuthenticatedUser) {
    await this.access.assertResourceReadable(resourceId, actor);
    const rows = await this.db.query(
      'DELETE FROM resource_annotations WHERE id = $1 AND resource_id = $2 AND user_id = $3 RETURNING id',
      [annotationId, resourceId, actor.userId],
    );
    if (!rows.length) throw new NotFoundException('Annotation not found');
    return { deleted: true };
  }
}
