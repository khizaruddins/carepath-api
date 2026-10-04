import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserStatusGuard } from './user-status.guard';
import { UserStatus } from '@prisma/client';

describe('UserStatusGuard', () => {
  let guard: UserStatusGuard;

  beforeEach(() => {
    guard = new UserStatusGuard();
  });

  const createMockContext = (user: any): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  };

  it('allows ACTIVE user to access protected resources', () => {
    const context = createMockContext({ id: 'u1', status: UserStatus.ACTIVE });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('Requirement 3: Suspended user cannot access protected resources', () => {
    const context = createMockContext({ id: 'u2', status: UserStatus.SUSPENDED });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(
      'Your account has been suspended. Please contact support.',
    );
  });

  it('Deactivated user cannot access protected resources', () => {
    const context = createMockContext({ id: 'u3', status: UserStatus.DEACTIVATED });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('Your account is deactivated.');
  });
});
