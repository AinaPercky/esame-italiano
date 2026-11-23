export interface AntiCheatSettings {
  screenshotProtectionEnabled: boolean;
  tabSwitchProtectionEnabled: boolean;
  updatedAt?: string;
}

export const DEFAULT_ANTI_CHEAT_SETTINGS: AntiCheatSettings = {
  screenshotProtectionEnabled: true,
  tabSwitchProtectionEnabled: true
};

export const ANTI_CHEAT_SETTINGS_MIGRATION_WARNING =
  'La migration SQL « Paramètres Anti-Triche » n’est pas encore installée dans Supabase (table app_settings ou fonction RPC save_anti_cheat_settings absente). Les protections restent actives par défaut ; copiez et exécutez cette migration dans Paramètres > Guide de configuration Supabase pour sauvegarder vos réglages en base de données.';

function parseBooleanSetting(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

export function normalizeAntiCheatSettings(raw?: unknown): AntiCheatSettings {
  const source = Array.isArray(raw) ? raw[0] : raw;
  if (!source || typeof source !== 'object') {
    return { ...DEFAULT_ANTI_CHEAT_SETTINGS };
  }
  const row = source as Record<string, unknown>;
  const screenshotRaw =
    row.anti_cheat_screenshot_enabled !== undefined
      ? row.anti_cheat_screenshot_enabled
      : row.screenshotProtectionEnabled;
  const tabSwitchRaw =
    row.anti_cheat_tab_switch_enabled !== undefined
      ? row.anti_cheat_tab_switch_enabled
      : row.tabSwitchProtectionEnabled;
  const updatedAtRaw =
    row.updated_at !== undefined ? row.updated_at : row.updatedAt;

  return {
    screenshotProtectionEnabled: parseBooleanSetting(
      screenshotRaw,
      DEFAULT_ANTI_CHEAT_SETTINGS.screenshotProtectionEnabled
    ),
    tabSwitchProtectionEnabled: parseBooleanSetting(
      tabSwitchRaw,
      DEFAULT_ANTI_CHEAT_SETTINGS.tabSwitchProtectionEnabled
    ),
    ...(typeof updatedAtRaw === 'string' && updatedAtRaw.trim()
      ? { updatedAt: updatedAtRaw }
      : {})
  };
}

export function shouldMonitorTabSwitch(
  settings?: AntiCheatSettings | null,
  perExamEnabled: boolean = true
): boolean {
  return (settings?.tabSwitchProtectionEnabled ?? DEFAULT_ANTI_CHEAT_SETTINGS.tabSwitchProtectionEnabled) && perExamEnabled;
}

export function shouldMonitorScreenshot(
  settings?: AntiCheatSettings | null
): boolean {
  return settings?.screenshotProtectionEnabled ?? DEFAULT_ANTI_CHEAT_SETTINGS.screenshotProtectionEnabled;
}

export interface KeyboardShortcutLike {
  key?: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export function detectScreenshotShortcut(event: KeyboardShortcutLike): string | null {
  const key = (event.key || '').trim();
  const lowerKey = key.toLowerCase();
  const code = (event.code || '').trim();
  const meta = Boolean(event.metaKey);
  const ctrl = Boolean(event.ctrlKey);
  const shift = Boolean(event.shiftKey);
  const alt = Boolean(event.altKey);

  if (key === 'PrintScreen' || code === 'PrintScreen') {
    return 'PrintScreen';
  }

  // macOS screenshots (Cmd+Shift+3/4/5/6) or macOS Shift+Cmd+S
  if (
    meta &&
    shift &&
    (['3', '4', '5', '6', 's'].includes(lowerKey) ||
      ['Digit3', 'Digit4', 'Digit5', 'Digit6', 'KeyS'].includes(code))
  ) {
    return 'Cmd+Shift+Capture';
  }

  // Windows Snipping Tool / browser capture (Win/Ctrl+Shift+S)
  if ((ctrl || meta) && shift && (lowerKey === 's' || code === 'KeyS')) {
    return 'Shortcut+Shift+S';
  }

  // Print dialog shortcut (Ctrl+P / Cmd+P)
  if ((ctrl || meta) && !shift && !alt && (lowerKey === 'p' || code === 'KeyP')) {
    return 'Print';
  }

  return null;
}

export function getAssessmentIntegrityBanner(params: {
  mode: 'official_quiz' | 'practice_quiz' | 'written_exam';
  settings?: AntiCheatSettings | null;
  perExamTabSwitchEnabled?: boolean;
}): { bannerLabel: string; bannerMobileLabel: string } {
  if (params.mode === 'practice_quiz') {
    return {
      bannerLabel: 'MODE ENTRAÎNEMENT • Résultat non enregistré',
      bannerMobileLabel: 'MODE ENTRAÎNEMENT'
    };
  }

  const tabSwitchActive = shouldMonitorTabSwitch(
    params.settings,
    params.perExamTabSwitchEnabled ?? true
  );
  const screenshotActive = shouldMonitorScreenshot(params.settings);

  if (params.mode === 'written_exam') {
    if (tabSwitchActive && screenshotActive) {
      return {
        bannerLabel: 'EXAMEN OFFICIEL • Anti-triche actif (changement d’onglet & capture surveillés)',
        bannerMobileLabel: 'EXAMEN OFFICIEL • ANTI-TRICHE'
      };
    }
    if (tabSwitchActive) {
      return {
        bannerLabel: 'EXAMEN OFFICIEL • Surveillance active — Ne quittez pas cette fenêtre',
        bannerMobileLabel: 'EXAMEN OFFICIEL'
      };
    }
    if (screenshotActive) {
      return {
        bannerLabel: 'EXAMEN OFFICIEL • Capture d’écran et impression bloquées',
        bannerMobileLabel: 'EXAMEN OFFICIEL'
      };
    }
    return {
      bannerLabel: 'EXAMEN OFFICIEL • Session écrite contrôlée',
      bannerMobileLabel: 'EXAMEN OFFICIEL'
    };
  }

  // official_quiz
  if (tabSwitchActive && screenshotActive) {
    return {
      bannerLabel: 'MODE SÉCURISÉ ANTI-TRICHE • Changement d’onglet et capture interdits',
      bannerMobileLabel: 'MODE SÉCURISÉ ANTI-TRICHE'
    };
  }
  if (screenshotActive) {
    return {
      bannerLabel: 'MODE SÉCURISÉ • Capture d’écran strictement interdite',
      bannerMobileLabel: 'CAPTURE INTERDITE'
    };
  }
  if (tabSwitchActive) {
    return {
      bannerLabel: 'MODE SÉCURISÉ • Ne quittez pas l’onglet pendant le quiz',
      bannerMobileLabel: 'ONGLET SURVEILLÉ'
    };
  }
  return {
    bannerLabel: 'ÉVALUATION EN DIRECT • Session officielle',
    bannerMobileLabel: 'ÉVALUATION EN DIRECT'
  };
}
