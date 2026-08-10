import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const roots = ['src/app', 'src/components'];
const failures = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && full.endsWith('.tsx') ? [full] : [];
  });
}

function tagName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return node.getText();
}

function attributesOf(node) {
  const attributes = new Map();
  for (const property of node.attributes.properties) {
    if (!ts.isJsxAttribute(property)) continue;
    attributes.set(property.name.text, property.initializer ?? true);
  }
  return attributes;
}

function stringAttribute(attributes, name) {
  const initializer = attributes.get(name);
  if (!initializer || initializer === true) return null;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (ts.isJsxExpression(initializer) && initializer.expression && ts.isStringLiteralLike(initializer.expression)) return initializer.expression.text;
  return null;
}

function hasAncestorForm(node) {
  let current = node.parent;
  while (current) {
    if (ts.isJsxElement(current) && tagName(current.openingElement.tagName) === 'form') return true;
    current = current.parent;
  }
  return false;
}

function expressionFor(attributes, name) {
  const initializer = attributes.get(name);
  if (!initializer || initializer === true || !ts.isJsxExpression(initializer)) return null;
  return initializer.expression ?? null;
}

function isEmptyHandler(expression) {
  if (!expression) return false;
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    if (ts.isBlock(expression.body)) return expression.body.statements.length === 0;
    return expression.body.kind === ts.SyntaxKind.UndefinedKeyword || expression.body.getText() === 'undefined';
  }
  return false;
}

function location(sourceFile, node) {
  const point = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${sourceFile.fileName}:${point.line + 1}:${point.character + 1}`;
}

function excerpt(node) {
  return node.getText().replace(/\s+/g, ' ').slice(0, 180);
}

for (const file of roots.flatMap(walk)) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  function inspect(node) {
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
    if (opening) {
      const name = tagName(opening.tagName);
      const attributes = attributesOf(opening);

      if (name === 'button') {
        const type = stringAttribute(attributes, 'type');
        const handlerNames = ['onClick', 'onPointerDown', 'onPointerUp', 'onMouseDown', 'onMouseUp', 'formAction'];
        const hasHandler = handlerNames.some((handler) => attributes.has(handler));
        const formAction = attributes.has('formAction');
        const intentionallyDisabled = attributes.has('disabled');
        const implicitSubmit = !type && hasAncestorForm(opening);
        const semanticAction = type === 'submit' || type === 'reset' || implicitSubmit || formAction || intentionallyDisabled;
        if (!hasHandler && !semanticAction) {
          failures.push(`${location(sourceFile, opening)} dead <button>: ${excerpt(opening)}`);
        }
        for (const handler of handlerNames) {
          const expression = expressionFor(attributes, handler);
          if (isEmptyHandler(expression)) failures.push(`${location(sourceFile, opening)} empty ${handler} handler: ${excerpt(opening)}`);
        }
      }

      if (name === 'a' || name === 'Link') {
        const href = stringAttribute(attributes, 'href');
        if (href === '#' || href === '') failures.push(`${location(sourceFile, opening)} inert ${name} href=${JSON.stringify(href)}: ${excerpt(opening)}`);
      }
    }
    ts.forEachChild(node, inspect);
  }

  inspect(sourceFile);
}

if (failures.length) {
  console.error(`UI action audit found ${failures.length} obvious inert control${failures.length === 1 ? '' : 's'}:\n`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  console.error('\nEvery enabled user-visible button must invoke an action or have explicit submit/reset semantics. Placeholder links are not allowed.');
  process.exit(1);
}

console.log('UI action audit passed: no obvious inert enabled buttons or placeholder links were found.');
