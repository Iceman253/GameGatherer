// Minimal VDF (Valve Data Format) parser — handles Steam's .vdf and .acf files.
// No external dependencies needed.

type VdfValue = string | VdfObject
interface VdfObject { [key: string]: VdfValue }

export function parseVdf(input: string): VdfObject {
  const tokens = tokenize(input)
  let pos = 0

  function parseObject(): VdfObject {
    const obj: VdfObject = {}
    while (pos < tokens.length && tokens[pos] !== '}') {
      const key = tokens[pos++]
      if (pos >= tokens.length) break
      if (tokens[pos] === '{') {
        pos++ // skip '{'
        obj[key] = parseObject()
        if (tokens[pos] === '}') pos++ // skip '}'
      } else {
        obj[key] = tokens[pos++]
      }
    }
    return obj
  }

  // Handle optional outer key wrapping the root object
  if (tokens.length >= 2 && tokens[0] !== '{' && tokens[1] === '{') {
    const rootKey = tokens[0]
    pos = 2
    const inner = parseObject()
    return { [rootKey]: inner }
  }

  if (tokens[0] === '{') {
    pos = 1
    return parseObject()
  }

  return parseObject()
}

function tokenize(input: string): string[] {
  const tokens: string[] = []
  let i = 0

  while (i < input.length) {
    // Skip whitespace
    while (i < input.length && /[\s\r\n]/.test(input[i])) i++
    if (i >= input.length) break

    // Skip single-line comments
    if (input[i] === '/' && input[i + 1] === '/') {
      while (i < input.length && input[i] !== '\n') i++
      continue
    }

    if (input[i] === '{' || input[i] === '}') {
      tokens.push(input[i++])
      continue
    }

    if (input[i] === '"') {
      i++ // skip opening quote
      let str = ''
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < input.length) {
          i++
          const escMap: Record<string, string> = {
            n: '\n', t: '\t', '"': '"', '\\': '\\'
          }
          str += escMap[input[i]] ?? input[i]
        } else {
          str += input[i]
        }
        i++
      }
      i++ // skip closing quote
      tokens.push(str)
      continue
    }

    // Unquoted token (rare in VDF but possible)
    let word = ''
    while (i < input.length && !/[\s\r\n{}"\\]/.test(input[i])) {
      word += input[i++]
    }
    if (word) tokens.push(word)
  }

  return tokens
}
