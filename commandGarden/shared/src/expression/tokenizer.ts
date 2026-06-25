export type TokenType =
  | 'IDENT' | 'DOT' | 'STRING' | 'NUMBER'
  | 'PIPE' | 'PLUS' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) { i++; continue; }

    if (ch === '.') { tokens.push({ type: 'DOT', value: '.' }); i++; continue; }
    if (ch === '|') { tokens.push({ type: 'PIPE', value: '|' }); i++; continue; }
    if (ch === '+') { tokens.push({ type: 'PLUS', value: '+' }); i++; continue; }
    if (ch === '(') { tokens.push({ type: 'LPAREN', value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'RPAREN', value: ')' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'COMMA', value: ',' }); i++; continue; }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let str = '';
      i++;
      while (i < input.length && input[i] !== quote) {
        str += input[i];
        i++;
      }
      if (i < input.length) i++;
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    if (/\d/.test(ch)) {
      let num = '';
      while (i < input.length && /[\d.]/.test(input[i])) {
        num += input[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        ident += input[i];
        i++;
      }
      tokens.push({ type: 'IDENT', value: ident });
      continue;
    }

    throw new Error(`Unexpected character: ${ch}`);
  }

  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}
