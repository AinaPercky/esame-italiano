/** Remove editor-only emphasis markers before sending lesson text to speech synthesis. */
export function cleanLessonSpeechText(text: string): string {
  return text
    .replace(/==([^=]+)==/g, '$1')
    .replace(/\+\+([^+]+)\+\+/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
