import { QuestionExplanationLifecycleService } from './question-explanation-lifecycle.service';

describe('QuestionExplanationLifecycleService', () => {
  it('clears question and option explanations when source content changes', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const manager = { query };
    const dataSource = {
      transaction: jest.fn().mockImplementation(async (callback) => callback(manager)),
    };
    const service = new QuestionExplanationLifecycleService(dataSource as never);

    await service.invalidateQuestion('question-1');

    expect(query).toHaveBeenNthCalledWith(
      1,
      'UPDATE questions SET explanation = NULL WHERE id = $1',
      ['question-1'],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      'UPDATE mcq_options SET explanation = NULL WHERE question_id = $1',
      ['question-1'],
    );
  });

  it('preserves an explicitly replaced question explanation while clearing option explanations', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const manager = { query };
    const dataSource = {
      transaction: jest.fn().mockImplementation(async (callback) => callback(manager)),
    };
    const service = new QuestionExplanationLifecycleService(dataSource as never);

    await service.invalidateQuestion('question-1', true);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      'UPDATE mcq_options SET explanation = NULL WHERE question_id = $1',
      ['question-1'],
    );
  });
});
