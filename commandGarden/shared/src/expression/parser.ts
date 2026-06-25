import type { Token, TokenType } from './tokenizer.js';

export type Expr =
  | { type: 'variable'; path: string[] }
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'concat'; left: Expr; right: Expr }
  | { type: 'pipe'; expr: Expr; filter: string; args: Expr[] };

class ExprParser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: TokenType): Token {
    const t = this.advance();
    if (t.type !== type) {
      throw new Error(`Expected ${type}, got ${t.type} ("${t.value}")`);
    }
    return t;
  }

  parse(): Expr {
    const expr = this.parsePipe();
    this.expect('EOF');
    return expr;
  }

  private parsePipe(): Expr {
    let expr = this.parseConcat();
    while (this.peek().type === 'PIPE') {
      this.advance();
      const filterName = this.expect('IDENT').value;
      let filterArgs: Expr[] = [];
      if (this.peek().type === 'LPAREN') {
        this.advance();
        if (this.peek().type !== 'RPAREN') {
          filterArgs.push(this.parsePipe());
          while (this.peek().type === 'COMMA') {
            this.advance();
            filterArgs.push(this.parsePipe());
          }
        }
        this.expect('RPAREN');
      }
      expr = { type: 'pipe', expr, filter: filterName, args: filterArgs };
    }
    return expr;
  }

  private parseConcat(): Expr {
    let expr = this.parsePrimary();
    while (this.peek().type === 'PLUS') {
      this.advance();
      const right = this.parsePrimary();
      expr = { type: 'concat', left: expr, right };
    }
    return expr;
  }

  private parsePrimary(): Expr {
    const token = this.peek();

    if (token.type === 'STRING') {
      this.advance();
      return { type: 'string', value: token.value };
    }

    if (token.type === 'NUMBER') {
      this.advance();
      return { type: 'number', value: Number(token.value) };
    }

    if (token.type === 'IDENT') {
      const path = [this.advance().value];
      while (this.peek().type === 'DOT') {
        this.advance();
        path.push(this.expect('IDENT').value);
      }
      return { type: 'variable', path };
    }

    if (token.type === 'LPAREN') {
      this.advance();
      const expr = this.parsePipe();
      this.expect('RPAREN');
      return expr;
    }

    throw new Error(`Unexpected token: ${token.type} ("${token.value}")`);
  }
}

export function parse(tokens: Token[]): Expr {
  return new ExprParser(tokens).parse();
}
