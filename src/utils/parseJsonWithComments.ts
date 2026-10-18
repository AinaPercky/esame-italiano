/** Parse JSON/JSONC with line and block comments while preserving markers inside strings. */
export function removeJsonComments(source: string): string {
  let output = '';
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];

    if (inLineComment) {
      if (current === '\n' || current === '\r') {
        inLineComment = false;
        output += current;
      } else {
        output += ' ';
      }
      continue;
    }

    if (inBlockComment) {
      if (current === '*' && next === '/') {
        output += '  ';
        index += 1;
        inBlockComment = false;
      } else {
        output += current === '\n' || current === '\r' ? current : ' ';
      }
      continue;
    }

    if (inString) {
      output += current;
      if (escaped) {
        escaped = false;
      } else if (current === '\\') {
        escaped = true;
      } else if (current === '"') {
        inString = false;
      }
      continue;
    }

    if (current === '"') {
      inString = true;
      output += current;
    } else if (current === '/' && next === '/') {
      output += '  ';
      index += 1;
      inLineComment = true;
    } else if (current === '/' && next === '*') {
      output += '  ';
      index += 1;
      inBlockComment = true;
    } else {
      output += current;
    }
  }

  if (inBlockComment) {
    throw new SyntaxError('Commentaire JSONC non terminé.');
  }

  return output;
}

export function parseJsonWithComments<T = unknown>(source: string): T {
  return JSON.parse(removeJsonComments(source)) as T;
}
