import { DataSource, Repository } from 'typeorm';
import { DrugReference } from '../../common/entities/drug-reference.entity';
import { NotebookAttachment } from '../../common/entities/notebook-attachment.entity';
import { NotebookCollection } from '../../common/entities/notebook-collection.entity';
import { NotebookNote } from '../../common/entities/notebook-note.entity';
import { NotebookTag } from '../../common/entities/notebook-tag.entity';
import { StudentStudyPlan } from '../../common/entities/student-study-plan.entity';
import { StudyPlanItem } from '../../common/entities/study-plan-item.entity';
import { FlashcardsService } from '../flashcards/flashcards.service';
import { WorkspaceService } from './workspace.service';

describe('WorkspaceService Pearl queries', () => {
  it('scopes Pearls to the current user and returns the most recently updated one first', async () => {
    const pearl = {
      id: 'pearl-1',
      userId: 'student-1',
      noteType: 'PEARL',
      title: 'Aortic stenosis clue',
      content: 'A delayed carotid upstroke is a classic bedside clue.',
    } as NotebookNote;

    const builder = {
      leftJoinAndSelect: jest.fn(),
      where: jest.fn(),
      orderBy: jest.fn(),
      skip: jest.fn(),
      take: jest.fn(),
      andWhere: jest.fn(),
      getManyAndCount: jest.fn().mockResolvedValue([[pearl], 1]),
    };
    for (const method of ['leftJoinAndSelect', 'where', 'orderBy', 'skip', 'take', 'andWhere'] as const) {
      builder[method].mockReturnValue(builder);
    }

    const notes = {
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    } as unknown as Repository<NotebookNote>;

    const service = new WorkspaceService(
      notes,
      {} as Repository<NotebookCollection>,
      {} as Repository<NotebookTag>,
      {} as Repository<NotebookAttachment>,
      {} as Repository<StudentStudyPlan>,
      {} as Repository<StudyPlanItem>,
      {} as Repository<DrugReference>,
      {} as DataSource,
      {} as FlashcardsService,
    );

    const result = await service.listNotes('student-1', { note_type: 'PEARL', limit: 1 });

    expect(builder.where).toHaveBeenCalledWith('note.user_id=:userId', { userId: 'student-1' });
    expect(builder.andWhere).toHaveBeenCalledWith('note.note_type=:type', { type: 'PEARL' });
    expect(builder.orderBy).toHaveBeenCalledWith('note.updated_at', 'DESC');
    expect(builder.take).toHaveBeenCalledWith(1);
    expect(result.data).toEqual([pearl]);
    expect(result.total).toBe(1);
  });
});
