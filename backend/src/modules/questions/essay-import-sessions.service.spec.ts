import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EssayImportSessionsService } from './essay-import-sessions.service';

describe('EssayImportSessionsService access and pagination', () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const session = '22222222-2222-4222-8222-222222222222';
  const query = jest.fn();
  const service = new EssayImportSessionsService({ query } as unknown as DataSource);

  beforeEach(() => query.mockReset());

  it('refuses invalid pagination before any SQL query', async () => {
    await expect(service.candidates(owner, session, -1, 100)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.candidates(owner, session, 0, 501)).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('pages over owner-scoped candidate data without returning the full snapshot', async () => {
    query.mockResolvedValue([{total:501,candidates:[{candidate_id:'candidate-201'}]}]);
    const result = await service.candidates(owner, session, 200, 1);
    expect(result).toEqual({total:501,offset:200,limit:1,candidates:[{candidate_id:'candidate-201'}]});
    expect(query).toHaveBeenCalledWith(expect.stringContaining('owner_id = $2'),[session,owner,200,1]);
  });

  it('prevents expired or other-owner session lookup', async () => {
    query.mockResolvedValue([]);
    await expect(service.metadata(owner, session)).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('owner_id = $2'),[session,owner]);
  });

  it('rejects conflicting review edits rather than overwriting another revision', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{id:session}]);
    await expect(service.saveReview(owner,session,3,{candidates:[]})).rejects.toBeInstanceOf(ConflictException);
  });

  it('increments the optimistic revision when saving authorized review changes', async () => {
    query.mockResolvedValue([{revision:4,updated_at:new Date()}]);
    const value = await service.saveReview(owner,session,3,{published:['question-1']});
    expect(value.revision).toBe(4);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('revision = $3'),[session,owner,3,JSON.stringify({published:['question-1']})]);
  });
});
