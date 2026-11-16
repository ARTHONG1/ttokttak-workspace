import { MAX_NUMBER } from './policy'
import { numbers } from './verifier'

/**
 * A llama.cpp GBNF grammar for the v3 reply, made per request: the keys come in the trained
 * order and every quantity, price, amount and fee is a number written in this cart (or null).
 * Only the built-in model gets it; the model can still pick the wrong number, which the
 * computation and the verifier catch, but it cannot make one up.
 */

/** the numbers the model may write: those in the text (by the verifier's rule), at most 9 digits */
export function allowedNumbers(text: string): Set<number> {
  return new Set([...numbers(text)].filter((n) => n <= MAX_NUMBER))
}

export function extractGrammar(text: string): string {
  const allowed = [...allowedNumbers(text)].sort((a, b) => a - b)
  const value = allowed.length ? '"null" | num' : '"null"'
  const fees = allowed.length ? '( num ( "," num )* )?' : ''
  return [
    'root ::= "{" "\\"items\\":[" ( item ( "," item )* )? "]," "\\"fees\\":[" ' + fees + ' "]}"',
    'item ::= "{" "\\"name\\":" text "," "\\"spec\\":" opt "," "\\"unit\\":" unit "," "\\"qty\\":" val "," "\\"price\\":" val "," "\\"amount\\":" val "," "\\"state\\":" state "}"',
    'text ::= "\\"" edge (inner* edge)? "\\""',
    'opt ::= "\\"\\"" | text',
    'edge ::= [^"\\\\\\x00-\\x20] | "\\\\" ["\\\\/]',
    'inner ::= [^"\\\\\\x00-\\x1F] | "\\\\" ["\\\\/]',
    'unit ::= "null" | "\\"" uch uch? uch? uch? uch? uch? uch? uch? "\\""',
    'uch ::= [^"\\\\\\x00-\\x20,:{}\\[\\]]',
    'val ::= ' + value,
    ...(allowed.length ? ['num ::= ' + allowed.map((n) => '"' + n + '"').join(' | ')] : []),
    'state ::= "\\"담음\\"" | "\\"품절\\"" | "\\"미선택\\""',
  ].join('\n')
}
