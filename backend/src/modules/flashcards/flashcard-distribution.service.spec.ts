import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FlashcardDeckBundleAccessMode } from '../../common/entities/flashcard-deck.entity';
import { UserRole } from '../users/entities/user.entity';
import { FlashcardDistributionService } from './flashcard-distribution.service';

describe('FlashcardDistributionService',()=>{
  const actor={
    userId:'11111111-1111-4111-8111-111111111111',
    sessionId:'22222222-2222-4222-8222-222222222222',
    email:'instructor@example.test',
    role:UserRole.INSTRUCTOR,
  };

  it('blocks live distribution changes',async()=>{
    const query=jest.fn().mockResolvedValueOnce([{
      id:'33333333-3333-4333-8333-333333333333',
      course_id:'44444444-4444-4444-8444-444444444444',
      created_by:actor.userId,
      is_published:true,
      bundle_access_mode:FlashcardDeckBundleAccessMode.INHERIT,
    }]);
    const service=new FlashcardDistributionService({query} as unknown as DataSource);
    await expect(service.update(
      '33333333-3333-4333-8333-333333333333',
      {bundle_access_mode:FlashcardDeckBundleAccessMode.RESTRICTED,bundle_ids:['55555555-5555-4555-8555-555555555555']},
      actor,
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires a bundle when restricted mode is selected',async()=>{
    const query=jest.fn().mockResolvedValueOnce([{
      id:'33333333-3333-4333-8333-333333333333',
      course_id:'44444444-4444-4444-8444-444444444444',
      created_by:actor.userId,
      is_published:false,
      bundle_access_mode:FlashcardDeckBundleAccessMode.INHERIT,
    }]);
    const service=new FlashcardDistributionService({query} as unknown as DataSource);
    await expect(service.update(
      '33333333-3333-4333-8333-333333333333',
      {bundle_access_mode:FlashcardDeckBundleAccessMode.RESTRICTED,bundle_ids:[]},
      actor,
    )).rejects.toThrow('Restricted availability requires at least one bundle');
  });
});
