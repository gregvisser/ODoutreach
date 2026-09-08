/** Encode a Subject value for RFC 2047 readers, including Gmail's raw MIME API. */
export function encodeMimeSubject(subject: string): string {
  if (/[\r\n\x00]/.test(subject)) throw new Error("Email subject must be a single line without null characters.");
  if (/^[\x20-\x7e]*$/.test(subject) && subject.length <= 67 && !subject.includes("=?")) return subject;

  // 39 UTF-8 bytes => 64 ASCII characters including the encoded-word wrapper.
  // Even the first line with "Subject: " stays below RFC 2047's 76-character limit.
  const words: string[] = [];
  let chunk = "";
  let bytes = 0;
  const flush = () => { words.push(`=?UTF-8?B?${Buffer.from(chunk, "utf8").toString("base64")}?=`); };
  for (const character of subject) {
    const size = Buffer.byteLength(character, "utf8");
    if (bytes + size > 39) { flush(); chunk = ""; bytes = 0; }
    chunk += character;
    bytes += size;
  }
  if (chunk) flush();
  return words.join("\r\n ");
}
