import mammoth from 'mammoth'
import type { ParsedResumeFile } from './resumeParserTypes'

export async function parseDocxResume(file: File): Promise<ParsedResumeFile> {
  const arrayBuffer = await file.arrayBuffer()
  // The browser build reads arrayBuffer; Mammoth's Node entry (used by Vitest)
  // reads buffer. Supplying both keeps the parser logic identical in both runtimes.
  const result = await mammoth.extractRawText({ arrayBuffer, buffer: new Uint8Array(arrayBuffer) } as never)
  return {
    text: result.value,
    fileName: file.name,
    fileType: 'docx',
    parserMessages: result.messages.map((message) => message.message),
  }
}
