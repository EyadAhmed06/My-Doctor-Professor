import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AcademicController } from '../../academic/academic.controller';
import { BundlesController } from '../../bundles/bundles.controller';
import { EssayCasesController } from '../../essay-cases/essay-cases.controller';
import { FlashcardsController } from '../../flashcards/flashcards.controller';
import { EssayQuestionImportController } from '../../questions/essay-question-import.controller';
import { QuestionsController } from '../../questions/questions.controller';
import { TestLaunchController } from '../../tests/test-launch.controller';
import { TestsController } from '../../tests/tests.controller';
import { UserRole } from '../../users/entities/user.entity';
import { DENIED_ROLES_KEY } from '../decorators/denied-roles.decorator';
import { RolesGuard } from './roles.guard';

function contextFor(role?: UserRole): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  function guardWith(deniedRoles: UserRole[] = [], requiredRoles?: UserRole[]) {
    const reflector = {
      getAllAndMerge: jest.fn().mockReturnValue(deniedRoles),
      getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  it('denies a role even when a method allowlist still contains it', () => {
    const guard = guardWith([UserRole.SYSTEM_ADMIN], [UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN]);

    expect(() => guard.canActivate(contextFor(UserRole.SYSTEM_ADMIN))).toThrow(
      new ForbiddenException('This role cannot access teaching content'),
    );
  });

  it('keeps allowed teaching roles working', () => {
    const guard = guardWith([UserRole.SYSTEM_ADMIN], [UserRole.INSTRUCTOR]);

    expect(guard.canActivate(contextFor(UserRole.INSTRUCTOR))).toBe(true);
  });

  it('continues to enforce positive role allowlists', () => {
    const guard = guardWith([], [UserRole.STUDENT]);

    expect(() => guard.canActivate(contextFor(UserRole.INSTRUCTOR))).toThrow(
      new ForbiddenException('Insufficient permissions'),
    );
  });

  it.each([
    AcademicController,
    QuestionsController,
    EssayQuestionImportController,
    TestsController,
    TestLaunchController,
    FlashcardsController,
    BundlesController,
    EssayCasesController,
  ])('marks %p as unavailable to system administrators', (controller) => {
    expect(Reflect.getMetadata(DENIED_ROLES_KEY, controller)).toContain(UserRole.SYSTEM_ADMIN);
  });
});
