import type { StoryScene, VaultItem } from '../types';
import { cleanCharacterNameForSearch } from './storyStagePhotoPlanner';

const GENERIC_MEDIA_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'photo',
  'photograph',
  'portrait',
  'video',
  'clip',
  'clips',
  'scene',
  'scenes',
  'movie',
  'film',
  'still',
  'actor',
  'actress',
  'star',
  'official',
  'real',
  'archival',
  'vintage',
  'rare',
  'interview',
  'tribute',
  'story',
  'biography',
  'life',
  'legends',
  'cut',
  'anh',
  'that',
  'canh',
  'phim',
  'chan',
  'dung',
  'nhan',
  'vat',
  'giai',
  'doan',
  'goc',
  'youtube',
  'shorts',
  'tiktok',
  'reels',
]);

export const OLD_CHARACTER_STORAGE_KEYS = [
  'legendcut_saved_vault_cuts_v1',
  'legendcut_user_cut_scenes_v1',
  'legendcut_saved_cuts_list_v1',
] as const;

export function normalizeCharacterSearchKey(rawName: string): string {
  const cleaned = cleanCharacterNameForSearch(rawName || '') || (rawName || '');
  return cleaned
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractCharacterMatchTokens(rawName: string): string[] {
  const norm = normalizeCharacterSearchKey(rawName);
  if (!norm) return [];
  return norm
    .split(' ')
    .filter((tok) => tok.length >= 2 && !GENERIC_MEDIA_WORDS.has(tok) && !/^(18|19|20)\d{2}s?$/.test(tok));
}

export function isDifferentCharacterSession(prevChar: string, nextChar: string): boolean {
  const a = normalizeCharacterSearchKey(prevChar);
  const b = normalizeCharacterSearchKey(nextChar);
  if (!b) return false;
  if (!a) return true;
  if (a === b) return false;
  // Treat "Will Sampson" and "Will Sampson — Life Legends" as same character
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    if (shorter >= 5) return false;
  }
  return true;
}

/**
 * Strict check: returns true ONLY when a media item's label/title/characterName
 * actually belongs to the active character (prevents Will Sampson or other old
 * characters from leaking into a new character's vault, photos, or saved cuts).
 */
export function doesMediaLabelMatchCharacter(
  itemLabelOrChar: string,
  activeCharacterName: string
): boolean {
  const tokens = extractCharacterMatchTokens(activeCharacterName);
  if (tokens.length === 0) return false;

  const haystack = normalizeCharacterSearchKey(itemLabelOrChar || '');
  if (!haystack) return false;

  const fullPhrase = tokens.join(' ');
  if (haystack.includes(fullPhrase)) return true;

  if (tokens.length >= 2) {
    // Require ALL core name tokens (first + last name) to avoid "Will Smith" matching "Will Sampson"
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    return haystack.includes(first) && haystack.includes(last);
  }

  return haystack.includes(tokens[0]);
}

/**
 * Removes all previous characters' auto-fetched/cut media from the Vault
 * whenever the user initiates a search for a new character.
 * Optionally preserves explicitly attached custom images for the current run.
 */
export function sanitizeVaultItemsForNewCharacter(
  prevItems: VaultItem[],
  nextCharacterName: string,
  options?: { keepOnlyMatchingCharacter?: boolean; preserveIds?: Set<string> }
): VaultItem[] {
  const keepMatching = options?.keepOnlyMatchingCharacter ?? false;
  const preserveIds = options?.preserveIds;

  return prevItems.filter((item) => {
    if (preserveIds && preserveIds.has(item.id)) return true;
    if (!keepMatching) return false;
    return doesMediaLabelMatchCharacter(
      `${item.name || ''} ${item.createdAt || ''}`,
      nextCharacterName
    );
  });
}

/**
 * Clears old character photos/videos from existing visual scenes when the user
 * switches to searching a brand-new character without regenerating the script first.
 */
export function stripOldCharacterMediaFromScenes(
  scenes: StoryScene[],
  nextCharacterName: string
): StoryScene[] {
  return scenes.map((sc) => {
    if (sc.sceneType === 'quote' || sc.sceneType === 'outro') return sc;
    if (sc.mediaId && sc.mediaId.startsWith('custom-attach-')) return sc;
    const currentLabel = `${sc.realPhotoTitle || ''} ${sc.title || ''}`;
    if (sc.hasRealPhoto && doesMediaLabelMatchCharacter(currentLabel, nextCharacterName)) {
      return sc;
    }
    return {
      ...sc,
      mediaId: undefined,
      mediaUrl: undefined,
      mediaKind: undefined,
      hasRealPhoto: false,
      realPhotoTitle: undefined,
      characterRefPhotoUrl: undefined,
      videoTrimStartSec: undefined,
      videoTrimEndSec: undefined,
    };
  });
}

export function clearOldCharacterLocalStorage(): void {
  if (typeof localStorage === 'undefined') return;
  for (const key of OLD_CHARACTER_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore storage restrictions
    }
  }
}
