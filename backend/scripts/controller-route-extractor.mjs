export function extractRoutesFromSource(source, module) {
  const controllerPattern = /@Controller\((?:'([^']*)'|"([^"]*)")?\)/g;
  const controllers = [...source.matchAll(controllerPattern)];
  const routes = [];

  for (let index = 0; index < controllers.length; index += 1) {
    const controller = controllers[index];
    const boundary = controllers[index + 1]?.index ?? source.length;
    const prefix = controller[1] ?? controller[2] ?? '';
    const segment = source.slice(controller.index, boundary);
    const classMatch = segment.match(/export\s+class\s+([A-Za-z0-9_]+)/);
    if (!classMatch || classMatch.index === undefined) {
      throw new Error(`Controller at index ${controller.index} has no exported class`);
    }

    const classBodyStart = segment.indexOf('{', classMatch.index + classMatch[0].length);
    if (classBodyStart < 0) {
      throw new Error(`Controller ${classMatch[1]} has no class body`);
    }

    const body = segment.slice(classBodyStart + 1);
    const routePattern = /@(Get|Post|Put|Patch|Delete)\((?:'([^']*)'|"([^"]*)")?\)/g;

    for (const match of body.matchAll(routePattern)) {
      const method = match[1].toUpperCase();
      const child = match[2] ?? match[3] ?? '';
      const route = [prefix, child].filter(Boolean).join('/');
      const after = body.slice(match.index + match[0].length);
      const methodName =
        after.match(/(?:@[A-Za-z][^\n]*\n?\s*)*(?:async\s+)?([A-Za-z0-9_]+)\s*\(/)?.[1] ??
        `${method} ${route}`;

      routes.push({
        module,
        method,
        route,
        methodName,
        sourceIndex: controller.index + classBodyStart + 1 + match.index,
        controllerName: classMatch[1],
      });
    }
  }

  return routes;
}
