import { Quiz } from '../../types';

export interface PublicQuizConfig {
  allowBackNavigation: boolean;
  showCorrectionAtEnd: boolean;
}

const DEFAULT_PUBLIC_QUIZ_CONFIG: PublicQuizConfig = {
  allowBackNavigation: true,
  showCorrectionAtEnd: false
};

const CONFIG_MARKER = '[[PUBLIC_QUIZ_CONFIG:';
const CONFIG_REGEX = /\[\[PUBLIC_QUIZ_CONFIG:(.+?)\]\]/s;

export function getDefaultPublicQuizConfig(): PublicQuizConfig {
  return { ...DEFAULT_PUBLIC_QUIZ_CONFIG };
}

export function parsePublicQuizConfig(rawDescription?: string): {
  description: string;
  config: PublicQuizConfig;
} {
  const source = rawDescription || '';
  const match = source.match(CONFIG_REGEX);
  if (!match?.[1]) {
    return {
      description: source.trim(),
      config: getDefaultPublicQuizConfig()
    };
  }

  try {
    const parsed = JSON.parse(match[1]);
    return {
      description: source.replace(CONFIG_REGEX, '').trim(),
      config: {
        allowBackNavigation: parsed?.allowBackNavigation !== false,
        showCorrectionAtEnd: Boolean(parsed?.showCorrectionAtEnd)
      }
    };
  } catch {
    return {
      description: source.replace(CONFIG_REGEX, '').trim(),
      config: getDefaultPublicQuizConfig()
    };
  }
}

export function buildPublicQuizDescription(
  visibleDescription: string,
  config: Partial<PublicQuizConfig> = {}
): string {
  const cleanDescription = parsePublicQuizConfig(visibleDescription).description;
  const normalizedConfig: PublicQuizConfig = {
    ...DEFAULT_PUBLIC_QUIZ_CONFIG,
    ...config
  };
  const marker = `${CONFIG_MARKER}${JSON.stringify(normalizedConfig)}]]`;
  return cleanDescription ? `${cleanDescription}\n\n${marker}` : marker;
}

export function getPublicQuizConfig(quiz: Pick<Quiz, 'description'>): PublicQuizConfig {
  return parsePublicQuizConfig(quiz.description).config;
}

export function getPublicQuizDescription(quiz: Pick<Quiz, 'description'>): string {
  return parsePublicQuizConfig(quiz.description).description;
}
