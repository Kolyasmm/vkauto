// Чистим тексты от спецсимволов, которые VK модерация ловит:
// - zero-width пробелы → удалить
// - non-breaking / unicode пробелы → обычный пробел
// - line/paragraph separators → \n
// - схлопывание подряд идущих пробелов и пустых строк

const ZERO_WIDTH_CODES = [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff];
const UNICODE_SPACE_CODES = [
  0x00a0, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x202f, 0x205f, 0x3000,
];
const LINE_SEPARATOR_CODES = [0x2028, 0x2029];

function makeClass(codes: number[]): RegExp {
  return new RegExp('[' + codes.map((c) => '\\u' + c.toString(16).padStart(4, '0')).join('') + ']', 'g');
}

const ZERO_WIDTH = makeClass(ZERO_WIDTH_CODES);
const UNICODE_SPACE = makeClass(UNICODE_SPACE_CODES);
const LINE_SEPARATOR = makeClass(LINE_SEPARATOR_CODES);

export function sanitizeText(input: string | null | undefined): string {
  if (!input) return '';
  return String(input)
    .replace(ZERO_WIDTH, '')
    .replace(UNICODE_SPACE, ' ')
    .replace(LINE_SEPARATOR, '\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
