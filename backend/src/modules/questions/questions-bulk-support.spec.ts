import { QuestionsService } from './questions.service';
import { UserRole } from '../users/entities/user.entity';

const actor = { userId: 'owner', role: UserRole.INSTRUCTOR } as any;
const options = Array.from({ length: 4 }, (_, index) => ({ id: `option-${index}`, option_text: `Choice ${index}`, is_correct: index === 0 }));
const dto = { question_text: 'Stem', explanation: 'General rationale.', options: options.map(option => ({ ...option, explanation: 'Choice rationale.' })) };
function service(query: jest.Mock) {
  return new QuestionsService({ findOne: jest.fn().mockResolvedValue({ createdBy: 'owner' }) } as any, {} as any, {} as any, {} as any, {} as any, {} as any, { transaction: async (callback: any) => callback({ query }) } as any);
}
describe('Bulk explanation persistence', () => {
  it('saves the complete set without changing active state or answers', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ question_text: 'Stem', question_type: 'MCQ', created_by: 'owner' }]).mockResolvedValueOnce(options).mockResolvedValue([]);
    await service(query).saveMcqExplanations('question', dto, actor);
    expect(query).toHaveBeenCalledTimes(7);
    expect(query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE')).every(([sql]) => !sql.includes('is_active') && !sql.includes('is_correct'))).toBe(true);
  });
  it.each(['stem', 'answer', 'duplicate'])('rejects a %s mismatch before writing', async mismatch => {
    const changed = mismatch === 'stem' ? { ...dto, question_text: 'Changed stem' } : mismatch === 'duplicate' ? { ...dto, options: [dto.options[0], dto.options[0], ...dto.options.slice(2)] } : { ...dto, options: dto.options.map((option, index) => index === 0 ? { ...option, is_correct: false } : option) };
    const query = jest.fn().mockResolvedValueOnce([{ question_text: 'Stem', question_type: 'MCQ', created_by: 'owner' }]).mockResolvedValueOnce(options);
    await expect(service(query).saveMcqExplanations('question', changed, actor)).rejects.toThrow('changed during generation');
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('rejects another instructor before opening the transaction', async () => {
    const query = jest.fn();
    await expect(service(query).saveMcqExplanations('question', dto, { ...actor, userId: 'other' })).rejects.toThrow('only their own');
    expect(query).not.toHaveBeenCalled();
  });
});
