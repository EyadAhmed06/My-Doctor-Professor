import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

function controllerFiles(root: string): string[] {
  const output: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...controllerFiles(path));
    else if (entry.name.endsWith('.controller.ts')) output.push(path);
  }
  return output;
}

describe('Explicit public route inventory', () => {
  it('contains no unreviewed @Public controller or handler', () => {
    const sourceRoot = join(__dirname, '../..');
    const expected = new Map<string, number>([
      ['app.controller.ts', 1],
      ['modules/auth/auth.controller.ts', 11],
      ['modules/health/health.controller.ts', 1],
      ['modules/bundles/bundles.controller.ts', 1],
      ['modules/subscriptions/paymob-webhook.controller.ts', 1],
      ['modules/admin/admin-bootstrap.controller.ts', 1],
    ]);

    const actual = new Map<string, number>();
    for (const file of controllerFiles(sourceRoot)) {
      const source = readFileSync(file, 'utf8');
      const count = source.match(/@Public\(\)/g)?.length ?? 0;
      if (count) actual.set(relative(sourceRoot, file).replace(/\\/g, '/'), count);
    }

    expect([...actual.entries()].sort()).toEqual([...expected.entries()].sort());
  });
});
