import { readFileSync } from 'fs';
import { join } from 'path';
import { IS_PUBLIC_KEY, Public } from '../decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('Global authentication boundary', () => {
  it('registers JwtAuthGuard as an application-wide guard', () => {
    const source = readFileSync(join(__dirname, '../../../app.module.ts'), 'utf8');
    expect(source).toContain('APP_GUARD');
    expect(source).toContain('useClass: JwtAuthGuard');
  });

  it('bypasses Passport only for explicitly public handlers', () => {
    class Example {
      open(this: void) { return true; }
    }
    const descriptor = Object.getOwnPropertyDescriptor(Example.prototype, 'open')!;
    Public()(Example.prototype, 'open', descriptor);

    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    };
    const guard = new JwtAuthGuard(reflector as never);
    const context = {
      getHandler: () => Example.prototype.open,
      getClass: () => Example,
    };

    expect(guard.canActivate(context as never)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, Example.prototype.open)).toBe(true);
  });

  it('does not mark protected authentication endpoints public by class', async () => {
    const source = readFileSync(join(__dirname, '../auth.controller.ts'), 'utf8');
    expect(source).not.toMatch(/@Public\(\)[\s\r\n]+@Get\('me'\)/);
    expect(source).not.toMatch(/@Public\(\)[\s\r\n]+@Get\('security'\)/);
    expect(source).not.toMatch(/@Public\(\)[\s\r\n]+@Post\('sessions\/revoke-others'\)/);
    expect(source).not.toMatch(/@Public\(\)[\s\r\n]+@Post\('logout'\)/);
  });
});
