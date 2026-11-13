import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ResourceAnnotationsService } from './resource-annotations.service';

describe('PDF resource annotation ownership and validation', () => {
  const actor = { userId: 'student-a' } as never;
  const resourceId = '11111111-1111-4111-8111-111111111111';
  function make() {
    const access = { assertResourceReadable: jest.fn().mockResolvedValue(undefined) };
    const db = { query: jest.fn().mockResolvedValue([]) };
    return { service: new ResourceAnnotationsService(db as never, access as never), db, access };
  }

  it('scopes reads to both resource and current user', async () => {
    const { service, db } = make();
    await service.list(resourceId, actor);
    expect(db.query.mock.calls[0][1]).toEqual([resourceId, 'student-a']);
  });

  it('rejects empty highlights without writing', async () => {
    const { service, db } = make();
    await expect(service.create(resourceId, actor, {kind:'HIGHLIGHT',page_number:1,body:'  '}))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('does not permit deleting another user’s annotation', async () => {
    const { service, db } = make();
    await expect(service.remove(resourceId, '22222222-2222-4222-8222-222222222222', actor))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(db.query.mock.calls[0][1]).toEqual(['22222222-2222-4222-8222-222222222222', resourceId, 'student-a']);
  });
});
