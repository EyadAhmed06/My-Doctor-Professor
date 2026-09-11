import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';
import { extractRoutesFromSource } from './controller-route-extractor.mjs';

const sample = `
@Controller('public') export class PublicController {
  @Get() list() {}
}
@Controller('private')
export class PrivateController {
  @Get('mine') mine() {}
  @Post(':id') create() {}
}
`;

assert.deepEqual(
  extractRoutesFromSource(sample, 'sample').map(({ method, route }) => ({ method, route })),
  [
    { method: 'GET', route: 'public' },
    { method: 'GET', route: 'private/mine' },
    { method: 'POST', route: 'private/:id' },
  ],
);

const bundleController = fs.readFileSync(
  path.join(process.cwd(), 'src/modules/bundles/bundles.controller.ts'),
  'utf8',
);
const bundleRoutes = extractRoutesFromSource(bundleController, 'bundles').map(
  ({ method, route }) => `${method} ${route}`,
);

assert(bundleRoutes.includes('GET catalog/bundles'));
assert(bundleRoutes.includes('GET bundles/mine'));
assert(bundleRoutes.includes('GET bundles/managed'));
assert(bundleRoutes.includes('GET bundles/:bundleId/content'));
assert(!bundleRoutes.includes('GET catalog/bundles/mine'));
assert(!bundleRoutes.includes('GET catalog/bundles/:bundleId/content'));
assert.equal(new Set(bundleRoutes).size, bundleRoutes.length);

console.log(`Controller route extractor verified ${bundleRoutes.length} bundle routes.`);
