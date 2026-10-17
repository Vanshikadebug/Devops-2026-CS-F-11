const textMatch = require('../src/utils/textMatch')

// MongoDB runs `contains` as a regex, so user input must be escaped.
const matches = (term, text) => new RegExp(textMatch(term).contains, 'i').test(text)

describe('textMatch', () => {
  it('is case-insensitive', () => {
    expect(textMatch('Lamp').mode).toBe('insensitive')
  })

  it('treats regex metacharacters literally', () => {
    expect(matches('(100%', 'works (100% ok)')).toBe(true)
    expect(matches('a.c', 'abc')).toBe(false)
    expect(matches('C++', 'learn c++ fast')).toBe(true)
  })
})
