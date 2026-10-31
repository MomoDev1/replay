/**
 * iOS "smart punctuation" rewrites ' " -- ... into ’ ” — … even with autoCorrect off (React Native has no
 * smartQuotesType prop), and a shell rejects them. Applied to everything typed that ends up in a command or a path.
 */
export const asciiPunct = (text: string) =>
  text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u2014/g, '--')
    .replace(/\u2026/g, '...');
