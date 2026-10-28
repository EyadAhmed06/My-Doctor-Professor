import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';

type InspectionSnapshot = {
  original_filename: string;
  file_sha256: string;
  candidates: Array<{ candidate_id: string }>;
  summary: unknown;
  [key: string]: unknown;
};
type SessionRow = {
  id: string;
  original_filename: string;
  file_sha256: string;
  revision: number;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
  inspection?: InspectionSnapshot;
  review?: Record<string, unknown>;
};

@Injectable()
export class EssayImportSessionsService {
  constructor(private readonly db: DataSource) {}

  async create(ownerId: string, inspection: InspectionSnapshot) {
    if (!inspection?.candidates || !Array.isArray(inspection.candidates)) {
      throw new BadRequestException('Inspection result is missing its candidate list');
    }
    const id = randomUUID();
    // This bounds retained documents per instructor without touching other owners.
    await this.db.query(`
      DELETE FROM essay_import_sessions
      WHERE owner_id = $1 AND (expires_at <= now() OR id IN (
        SELECT id FROM essay_import_sessions WHERE owner_id = $1
        ORDER BY created_at DESC OFFSET 9
      ))
    `, [ownerId]);
    await this.db.query(`
      INSERT INTO essay_import_sessions (id, owner_id, original_filename, file_sha256, inspection)
      VALUES ($1,$2,$3,$4,$5::jsonb)
    `, [id, ownerId, inspection.original_filename, inspection.file_sha256, JSON.stringify(inspection)]);
    return {
      session_id: id,
      original_filename: inspection.original_filename,
      file_sha256: inspection.file_sha256,
      total: inspection.candidates.length,
      summary: inspection.summary,
      page_size: 100,
    };
  }

  async list(ownerId: string) {
    return this.db.query(`
      SELECT id AS session_id, original_filename, file_sha256, revision, created_at, updated_at,
        expires_at, jsonb_array_length(inspection->'candidates')::int AS total,
        inspection->'summary' AS summary
      FROM essay_import_sessions WHERE owner_id = $1 AND expires_at > now()
      ORDER BY updated_at DESC LIMIT 10
    `, [ownerId]);
  }

  private async requireSession(ownerId: string, id: string): Promise<SessionRow> {
    const rows = await this.db.query<SessionRow[]>(`
      SELECT id,original_filename,file_sha256,revision,created_at,updated_at,expires_at,
        inspection,review
      FROM essay_import_sessions WHERE id = $1 AND owner_id = $2 AND expires_at > now()
      LIMIT 1
    `, [id, ownerId]);
    if (!rows[0]) throw new NotFoundException('Import session not found or expired');
    return rows[0];
  }

  async metadata(ownerId: string, id: string) {
    const session = await this.requireSession(ownerId, id);
    const { candidates, ...summary } = session.inspection!;
    return {
      ...summary, session_id: session.id, total: candidates.length,
      page_size: 100, review: session.review || {}, revision: session.revision,
      created_at: session.created_at, expires_at: session.expires_at,
    };
  }

  async candidates(ownerId: string, id: string, offset: number, limit: number) {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestException('Candidate offset must be nonnegative and page limit must be between 1 and 200');
    }
    const rows = await this.db.query<Array<{ total: number; candidates: unknown[] }>>(`
      SELECT jsonb_array_length(inspection->'candidates')::int AS total,
        COALESCE((
          SELECT jsonb_agg(value ORDER BY ordinality)
          FROM jsonb_array_elements(inspection->'candidates') WITH ORDINALITY item(value, ordinality)
          WHERE ordinality > $3 AND ordinality <= $3 + $4
        ), '[]'::jsonb) AS candidates
      FROM essay_import_sessions
      WHERE id = $1 AND owner_id = $2 AND expires_at > now()
    `, [id, ownerId, offset, limit]);
    if (!rows[0]) throw new NotFoundException('Import session not found or expired');
    return { total: rows[0].total, offset, limit, candidates: rows[0].candidates };
  }

  async saveReview(ownerId: string, id: string, revision: number, review: unknown) {
    if (!Number.isSafeInteger(revision) || revision < 0 || !review || typeof review !== 'object' || Array.isArray(review)) {
      throw new BadRequestException('A valid review object and revision are required');
    }
    const payload = JSON.stringify(review);
    if (payload.length > 2 * 1024 * 1024) throw new BadRequestException('Review data is too large');
    const updated = await this.db.query<Array<{ revision: number; updated_at: Date }>>(`
      UPDATE essay_import_sessions
      SET review = $4::jsonb, revision = revision + 1, updated_at = now()
      WHERE id = $1 AND owner_id = $2 AND revision = $3 AND expires_at > now()
      RETURNING revision, updated_at
    `, [id, ownerId, revision, payload]);
    if (updated[0]) return updated[0];
    await this.requireSession(ownerId, id);
    throw new ConflictException('Review was updated elsewhere. Reload before saving again.');
  }

  async delete(ownerId: string, id: string) {
    await this.db.query('DELETE FROM essay_import_sessions WHERE id = $1 AND owner_id = $2', [id, ownerId]);
    return { deleted: true };
  }
}
