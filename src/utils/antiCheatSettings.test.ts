import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_ANTI_CHEAT_SETTINGS,
  detectScreenshotShortcut,
  getAssessmentIntegrityBanner,
  normalizeAntiCheatSettings,
  shouldMonitorScreenshot,
  shouldMonitorTabSwitch
} from './antiCheatSettings';
import { ANTI_CHEAT_SETTINGS_MIGRATION_SQL } from '../data/antiCheatSettingsMigration';

describe('antiCheatSettings', () => {
  it('retourne les paramètres activés par défaut si la ligne DB est absente', () => {
    assert.deepEqual(normalizeAntiCheatSettings(undefined), DEFAULT_ANTI_CHEAT_SETTINGS);
    assert.deepEqual(normalizeAntiCheatSettings(null), DEFAULT_ANTI_CHEAT_SETTINGS);
    assert.deepEqual(normalizeAntiCheatSettings([]), DEFAULT_ANTI_CHEAT_SETTINGS);
  });

  it('normalise les colonnes PostgreSQL snake_case et préserve explicitement false', () => {
    const normalized = normalizeAntiCheatSettings({
      anti_cheat_screenshot_enabled: false,
      anti_cheat_tab_switch_enabled: false,
      updated_at: '2026-11-28T10:00:00.000Z'
    });
    assert.deepEqual(normalized, {
      screenshotProtectionEnabled: false,
      tabSwitchProtectionEnabled: false,
      updatedAt: '2026-11-28T10:00:00.000Z'
    });
    assert.equal(shouldMonitorScreenshot(normalized), false);
    assert.equal(shouldMonitorTabSwitch(normalized), false);
  });

  it('respecte la combinaison réglage global et réglage par examen écrit', () => {
    assert.equal(
      shouldMonitorTabSwitch(
        { screenshotProtectionEnabled: true, tabSwitchProtectionEnabled: false },
        true
      ),
      false
    );
    assert.equal(
      shouldMonitorTabSwitch(
        { screenshotProtectionEnabled: true, tabSwitchProtectionEnabled: true },
        false
      ),
      false
    );
    assert.equal(
      shouldMonitorTabSwitch(
        { screenshotProtectionEnabled: true, tabSwitchProtectionEnabled: true },
        true
      ),
      true
    );
  });

  it('détecte les raccourcis clavier de capture d’écran et d’impression sans faux positifs', () => {
    assert.equal(detectScreenshotShortcut({ key: 'PrintScreen' }), 'PrintScreen');
    assert.equal(
      detectScreenshotShortcut({ code: 'PrintScreen' }),
      'PrintScreen'
    );
    assert.equal(
      detectScreenshotShortcut({ key: '4', code: 'Digit4', metaKey: true, shiftKey: true }),
      'Cmd+Shift+Capture'
    );
    assert.equal(
      detectScreenshotShortcut({ key: 's', code: 'KeyS', ctrlKey: true, shiftKey: true }),
      'Shortcut+Shift+S'
    );
    assert.equal(
      detectScreenshotShortcut({ key: 'p', code: 'KeyP', ctrlKey: true }),
      'Print'
    );
    assert.equal(detectScreenshotShortcut({ key: 'a', code: 'KeyA' }), null);
    assert.equal(detectScreenshotShortcut({ key: 's', code: 'KeyS', ctrlKey: true }), null);
  });

  it('adapte le bandeau d’évaluation aux protections activées ou désactivées', () => {
    const bothOff = getAssessmentIntegrityBanner({
      mode: 'official_quiz',
      settings: { screenshotProtectionEnabled: false, tabSwitchProtectionEnabled: false }
    });
    assert.match(bothOff.bannerLabel, /Session officielle/);

    const screenshotOnly = getAssessmentIntegrityBanner({
      mode: 'official_quiz',
      settings: { screenshotProtectionEnabled: true, tabSwitchProtectionEnabled: false }
    });
    assert.match(screenshotOnly.bannerLabel, /Capture d’écran strictement interdite/);

    const examBothOn = getAssessmentIntegrityBanner({
      mode: 'written_exam',
      settings: { screenshotProtectionEnabled: true, tabSwitchProtectionEnabled: true }
    });
    assert.match(examBothOn.bannerLabel, /changement d’onglet & capture surveillés/);

    const practice = getAssessmentIntegrityBanner({
      mode: 'practice_quiz',
      settings: { screenshotProtectionEnabled: true, tabSwitchProtectionEnabled: true }
    });
    assert.match(practice.bannerLabel, /MODE ENTRAÎNEMENT/);
  });

  it('garde la migration SQL anti-triche synchronisée avec le module TypeScript et sans privilèges anon excessifs', () => {
    const sqlPath = path.resolve(process.cwd(), 'supabase/migrations/20261128000000_anti_cheat_settings.sql');
    const diskSql = fs.readFileSync(sqlPath, 'utf8');
    assert.equal(diskSql, ANTI_CHEAT_SETTINGS_MIGRATION_SQL);
    assert.match(diskSql, /REVOKE ALL ON FUNCTION public\.save_anti_cheat_settings\(BOOLEAN, BOOLEAN\) FROM PUBLIC, anon;/);
    assert.match(diskSql, /GRANT EXECUTE ON FUNCTION public\.save_anti_cheat_settings\(BOOLEAN, BOOLEAN\) TO authenticated;/);
    assert.match(diskSql, /ainapercky@gmail\.com/);
  });
});
