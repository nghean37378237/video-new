export type StoryPhotoStageId =
  | 'early-life'
  | 'breakthrough'
  | 'peak-cinema'
  | 'personal-behind-scenes'
  | 'later-years'
  | 'legacy-portrait';

export interface StorySceneSummaryInput {
  id: string;
  order?: number;
  title?: string;
  sceneType?: string;
  narrationText?: string;
  archivalKeywords?: string;
  visualPrompt?: string;
}

export interface SceneStageAnalysis {
  sceneId: string;
  stage: StoryPhotoStageId;
  stageLabelVi: string;
  stageShortVi: string;
  targetYear: number | null;
  allowContextualMultiPerson: boolean;
  extractedHints: string[];
  querySuggestions: string[];
}

export interface StageSearchQueryPlan {
  query: string;
  stage: StoryPhotoStageId;
  stageLabelVi: string;
  allowMultiSubject: boolean;
  targetYear: number | null;
  priority: number;
}

export interface VerifiedStagePhotoCandidate {
  title: string;
  dataUrl: string;
  sourceUrl: string;
  width: number;
  height: number;
  year: number | null;
  stage?: StoryPhotoStageId;
  stageLabel?: string;
  photoCategory?: 'film-still' | 'activity-scene' | 'portrait';
  photoCategoryLabel?: string;
}

export const STORY_STAGE_META: Record<
  StoryPhotoStageId,
  {
    labelVi: string;
    shortVi: string;
    defaultQueryModifiers: string[];
    allowMultiSubject: boolean;
    chronologicalOrder: number;
  }
> = {
  'early-life': {
    labelVi: 'Tuổi Trẻ & Đời Thực',
    shortVi: 'Tuổi trẻ',
    defaultQueryModifiers: [
      'young candid archival photo',
      'early life real photo',
      'early movie scene still',
      'young on set photo',
    ],
    allowMultiSubject: true,
    chronologicalOrder: 1,
  },
  breakthrough: {
    labelVi: 'Khởi Nghiệp & Bước Ngoặt',
    shortVi: 'Bước ngoặt',
    defaultQueryModifiers: [
      'early movie scene still',
      'breakthrough film still',
      'on set filming candid',
      'early career candid photo',
    ],
    allowMultiSubject: true,
    chronologicalOrder: 2,
  },
  'peak-cinema': {
    labelVi: 'Đỉnh Cao Điện Ảnh & Cảnh Phim',
    shortVi: 'Cảnh phim',
    defaultQueryModifiers: [
      'movie scene still',
      'film still actor scene',
      'cinema still screenshot',
      'classic movie scene',
    ],
    allowMultiSubject: true,
    chronologicalOrder: 3,
  },
  'personal-behind-scenes': {
    labelVi: 'Đời Thực, Hoạt Động & Hậu Trường',
    shortVi: 'Ảnh thực tế',
    defaultQueryModifiers: [
      'behind the scenes on set candid',
      'interview candid real life photo',
      'off screen candid photo',
      'premiere event candid',
    ],
    allowMultiSubject: true,
    chronologicalOrder: 4,
  },
  'later-years': {
    labelVi: 'Những Năm Sau Này (Thực Tế)',
    shortVi: 'Sau này',
    defaultQueryModifiers: [
      'later years candid photo',
      'interview event real photo',
      'later movie scene still',
      'premiere candid photo',
    ],
    allowMultiSubject: true,
    chronologicalOrder: 5,
  },
  'legacy-portrait': {
    labelVi: 'Khoảnh Khắc Điện Ảnh & Đời Thực',
    shortVi: 'Thực tế & Phim',
    defaultQueryModifiers: [
      'movie scene still',
      'behind the scenes candid photo',
      'archival real life photograph',
    ],
    allowMultiSubject: true,
    chronologicalOrder: 6,
  },
};

export function extractYearFromStoryText(text: string): number | null {
  const matches = text.match(/\b(19[0-9]\d|20[0-2]\d)\b/g);
  if (!matches || matches.length === 0) return null;
  for (const raw of matches) {
    const yr = Number(raw);
    if (yr >= 1910 && yr <= 2026) return yr;
  }
  return null;
}

export function extractDecadeFromStoryText(text: string): string | null {
  const decadeMatch = text.match(/\b((?:19[2-9]|20[0-2])0s)\b/i);
  if (decadeMatch) return decadeMatch[1];
  const yr = extractYearFromStoryText(text);
  if (yr) return `${Math.floor(yr / 10) * 10}s`;
  return null;
}

export function cleanCharacterNameForSearch(rawTopic: string): string {
  return String(rawTopic || '')
    .replace(/[—–|].*$/, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\b(tiểu sử|huyền thoại|cuộc đời|phim|tribute|biography|documentary|story)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const NON_PERSON_ENTITY_BAN_REGEX =
  /\b(uss|hms|radar|destroyer|battleship|submarine|frigate|cruiser|aircraft|airport|station|county|township|highway|bridge|freeway|rifle|gun|firearm|chassis|rail|handguard|receiver|stock|barrel|scope|optic|mount|trigger|ammo|cartridge|knife|blade|tool|wrench|socket|clamp|adapter|gear|device|machine|appliance|hardware|manufacturing|mfg)\b/i;

const MILITARY_SERVICE_RECORD_BAN_REGEX =
  /\b(private|corporal|sergeant|lieutenant|captain|major|colonel|battalion|regiment|infantry|wwi|ww1|australian\s+war\s+memorial|service\s+number|enlisted)\b/i;

const SPAM_OR_NON_CHARACTER_PHOTO_REGEX =
  /\b(net\s*worth|height,\s*weight|weight,\s*height|religion,\s*net|wiki\s*bio|age,\s*bio|bio,\s*wiki|married,\s*wife,\s*net|movie\s+mistakes|mistakes\s+that\s+made|greatest\s+[a-z\s]{0,24}actors|top\s+\d+|best\s+\d+|\d+\s+greatest|\d+\s+best|\d+\s+famous|\d+\s+most\s+|ranked\b|list\s+of\s+|things\s+you\s+didn'?t\s+know|fineartamerica|pixels\.com|saatchiart|artfinder|liveauctioneers|invaluable\.com|artnet\.com|mutualart|art\s+for\s+sale|oil\s+on\s+(board|canvas|panel)|o\/b\b|canvas\s+print|framed\s+print|art\s+print|poster\s+print|wall\s+art|scene\s+painting|painting\s+by|watercolor\s+painting|acrylic\s+painting|auction\s+lot|history\s+museum|heritage\s+museum|wax\s+museum|museum\s+exhibit|display\s+case|memorial\s+plaque)\b|\bprints?\s*$/i;

export function matchesCharacterPhotoIdentity(
  rawText: string,
  characterName: string,
  options: { allowMilitaryContext?: boolean } = {}
): boolean {
  const cleanName = cleanCharacterNameForSearch(characterName);
  const tokens = cleanName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  if (tokens.length === 0) return true;

  const normalized = String(rawText || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_/.,:|()[\]-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return false;
  if (NON_PERSON_ENTITY_BAN_REGEX.test(normalized)) return false;

  if (
    !options.allowMilitaryContext &&
    MILITARY_SERVICE_RECORD_BAN_REGEX.test(normalized)
  ) {
    return false;
  }

  if (tokens.length === 1) {
    return new RegExp(`\\b${escapeRegExp(tokens[0])}\\b`, 'i').test(normalized);
  }

  const firstToken = tokens[0];
  const lastToken = tokens[tokens.length - 1];

  // Strict whole-word boundary check so "will" does NOT accidentally match "william" (e.g. "Private William Eric Sampson")
  const hasFirst = new RegExp(`\\b${escapeRegExp(firstToken)}\\b`, 'i').test(normalized);
  const hasLast = new RegExp(`\\b${escapeRegExp(lastToken)}\\b`, 'i').test(normalized);

  if (!hasFirst || !hasLast) return false;

  // Reject distinct middle-named person when an unrelated middle name sits right between first & last (e.g. "John Wayne Gacy" or "Will Eric Sampson")
  if (tokens.length === 2) {
    const betweenMatch = normalized.match(
      new RegExp(`\\b${escapeRegExp(firstToken)}\\s+([a-z]{3,16})\\s+${escapeRegExp(lastToken)}\\b`, 'i')
    );
    if (betweenMatch) {
      const middleWord = betweenMatch[1];
      const harmlessBridgeWords = new Set(['jr', 'sr', 'the', 'and', 'with', 'as', 'in', 'at', 'of', 'on']);
      if (!harmlessBridgeWords.has(middleWord)) {
        return false;
      }
    }
  }

  return true;
}

const DRAWING_OR_ILLUSTRATION_REGEX =
  /\b(drawing|drawings|drawn|sketch|sketches|sketched|illustration|illustrations|illustrated|illustrator|caricature|caricatures|cartoon|cartoons|comic|comics|manga|anime|chibi|fan[\s_-]?art|digital[\s_-]?art|digital[\s_-]?painting|concept[\s_-]?art|vector[\s_-]?art|vector|clip[\s_-]?art|clipart|line[\s_-]?art|pop[\s_-]?art|wpap|stencil|mural|graffiti|artwork|art[\s_-]?print|canvas[\s_-]?print|framed[\s_-]?print|poster[\s_-]?print|wall[\s_-]?art|fine[\s_-]?art|oil[\s_-]?painting|oil[\s_-]?on[\s_-]?(canvas|board|panel)|acrylic[\s_-]?painting|watercolor|watercolour|gouache|pastel[\s_-]?drawing|charcoal[\s_-]?drawing|pencil[\s_-]?drawing|graphite[\s_-]?drawing|colored[\s_-]?pencil|ink[\s_-]?drawing|pen[\s_-]?and[\s_-]?ink|portrait[\s_-]?painting|portrait[\s_-]?drawing|portrait[\s_-]?sketch|painted[\s_-]?portrait|painting[\s_-]?of|painting[\s_-]?by|drawn[\s_-]?by|illustrated[\s_-]?by|etched|etching|engraving|woodcut|linocut|lithograph|3d[\s_-]?render|cgi[\s_-]?render|ai[\s_-]?art|ai[\s_-]?generated|midjourney|stable[\s_-]?diffusion|dall[\s_-]?e|deviantart|artstation|pixiv|behance|dribbble|fineartamerica|saatchiart|displate|society6|redbubble|inprnt|artpal|artfinder|mutualart|wax[\s_-]?figure|waxwork|statue|sculpture|bust[\s_-]?of|figurine|action[\s_-]?figure|postage[\s_-]?stamp|stamps?\d*|collectible[\s_-]?coin|commemorative[\s_-]?coin|category:paintings|category:drawings|category:illustrations|category:caricatures|category:artworks|category:stamps)\b/i;

const VIETNAMESE_DRAWING_OR_ILLUSTRATION_REGEX =
  /(?:^|[^\p{L}])(tranh[\s_-]?vẽ|ảnh[\s_-]?vẽ|vẽ[\s_-]?chì|vẽ[\s_-]?tay|minh[\s_-]?họa|hoạt[\s_-]?hình|ký[\s_-]?họa|tem[\s_-]?thư)(?=$|[^\p{L}])/iu;

const REAL_SCENE_OR_CANDID_SIGNAL_REGEX =
  /\b(movie|film|still|scene|scenes|cinema|screencap|screen[\s_-]?cap|screenshot|starring|on[\s_-]?set|behind[\s_-]?the[\s_-]?scenes|filming|candid|interview|premiere|award|oscar|ceremony|festival|rodeo|horseback|cowboy|concert|rehearsal|training|sparring|martial[\s_-]?arts|action|fighting|backstage|off[\s_-]?screen|live|event|press[\s_-]?conference|talk[\s_-]?show|directing|set[\s_-]?photo)\b/i;

const POSED_PORTRAIT_OR_HEADSHOT_REGEX =
  /\b(head[\s_-]?shot|headshots|head[\s_-]?and[\s_-]?shoulders|studio[\s_-]?portrait|still[\s_-]?portrait|portrait[\s_-]?still|actor[\s_-]?portrait|film[\s_-]?portrait|movie[\s_-]?portrait|formal[\s_-]?portrait|glamour[\s_-]?portrait|glamour[\s_-]?still|publicity[\s_-]?portrait|publicity[\s_-]?photo(?:graph)?|publicity[\s_-]?still|promotional[\s_-]?portrait|promotional[\s_-]?photo(?:graph)?|promo[\s_-]?portrait|promo[\s_-]?photo(?:graph)?|studio[\s_-]?photo(?:graph)?|official[\s_-]?portrait|press[\s_-]?portrait|classic[\s_-]?portrait|vintage[\s_-]?portrait|solo[\s_-]?portrait|portrait[\s_-]?photo(?:graph)?|portrait[\s_-]?of|self[\s_-]?portrait|mugshot|passport[\s_-]?photo|profile[\s_-]?picture|avatar|category:portraits)\b/i;

const VIETNAMESE_POSED_PORTRAIT_REGEX =
  /(?:^|[^\p{L}])(chân[\s_-]?dung|ảnh[\s_-]?chân[\s_-]?dung)(?=$|[^\p{L}])/iu;

const BARE_PORTRAIT_WORD_REGEX = /\bportraits?\b/i;

function normalizeMediaMetadataForRegex(title: string, imageUrl = '', pageUrl = ''): string {
  // Replace underscores and URL punctuation with spaces so JS \b word boundaries work on Wikimedia filenames like John_Wayne_-_still_portrait.jpg
  return `${title || ''} ${imageUrl || ''} ${pageUrl || ''}`
    .replace(/[_/\\|+~]+/g, ' ')
    .replace(/%20|%28|%29|%2C|%27/gi, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Strictly detects drawings, paintings, sketches, illustrations, cartoons, AI art,
 * sculptures, postage stamps, and art marketplace prints so only real-world photographs and film stills pass.
 */
export function isDrawingOrIllustrationPhoto(
  title: string,
  imageUrl = '',
  pageUrl = ''
): boolean {
  const rawCombined = `${title || ''} ${imageUrl || ''} ${pageUrl || ''}`;
  const normalized = normalizeMediaMetadataForRegex(title, imageUrl, pageUrl);
  return (
    DRAWING_OR_ILLUSTRATION_REGEX.test(rawCombined) ||
    DRAWING_OR_ILLUSTRATION_REGEX.test(normalized) ||
    VIETNAMESE_DRAWING_OR_ILLUSTRATION_REGEX.test(normalized)
  );
}

/**
 * Detects posed studio portraits / headshots while preserving real movie stills
 * and real-life candid / on-set / activity photographs.
 */
export function isPosedPortraitOrHeadshotPhoto(
  title: string,
  imageUrl = '',
  pageUrl = ''
): boolean {
  const rawCombined = `${title || ''} ${imageUrl || ''} ${pageUrl || ''}`;
  const normalized = normalizeMediaMetadataForRegex(title, imageUrl, pageUrl);
  if (
    POSED_PORTRAIT_OR_HEADSHOT_REGEX.test(rawCombined) ||
    POSED_PORTRAIT_OR_HEADSHOT_REGEX.test(normalized) ||
    VIETNAMESE_POSED_PORTRAIT_REGEX.test(normalized)
  ) {
    return true;
  }
  if (BARE_PORTRAIT_WORD_REGEX.test(normalized) && !REAL_SCENE_OR_CANDID_SIGNAL_REGEX.test(normalized)) {
    return true;
  }
  return false;
}

const GENERIC_OR_NON_FACE_PHOTO_REGEX =
  /\b(before[\s_-]?and[\s_-]?after|then[\s_-]?and[\s_-]?now|then[\s_-]?vs[\s_-]?now|side[\s_-]?by[\s_-]?side|split[\s_-]?screen|splitscreen|collage|montage|diptych|triptych|comparison|compared|transformation|plastic[\s_-]?surgery|unrecognizable|how\s+[a-z\s]{1,24}changed|through[\s_-]?the[\s_-]?years|over[\s_-]?the[\s_-]?years|years[\s_-]?later|lookalike|impersonator|wax[\s_-]?figure|tribute[\s_-]?band|cosplay|back[\s_-]?view|from[\s_-]?behind|rear[\s_-]?view|back[\s_-]?of[\s_-]?head|silhouette|shadow[\s_-]?only|wide[\s_-]?shot|long[\s_-]?shot|full[\s_-]?stage|stage[\s_-]?wide|concert[\s_-]?crowd|packed[\s_-]?arena|audience[\s_-]?view|crowd[\s_-]?shot|guitar[\s_-]?closeup|microphone[\s_-]?stand|hands[\s_-]?only|outfit[\s_-]?detail|dress[\s_-]?detail|red[\s_-]?carpet[\s_-]?group|group[\s_-]?photo|ensemble[\s_-]?cast|full[\s_-]?cast|band[\s_-]?members|with[\s_-]?fans|fan[\s_-]?selfie)\b/i;

export function isGenericOrNonFacePhoto(
  title: string,
  imageUrl = '',
  pageUrl = ''
): boolean {
  const combined = `${title || ''} ${imageUrl || ''} ${pageUrl || ''}`;
  return GENERIC_OR_NON_FACE_PHOTO_REGEX.test(combined);
}

export function isSpamOrNonCharacterPhoto(
  title: string,
  imageUrl = '',
  pageUrl = ''
): boolean {
  const combined = `${title || ''} ${imageUrl || ''} ${pageUrl || ''}`;
  return (
    SPAM_OR_NON_CHARACTER_PHOTO_REGEX.test(combined) ||
    GENERIC_OR_NON_FACE_PHOTO_REGEX.test(combined) ||
    isDrawingOrIllustrationPhoto(title, imageUrl, pageUrl)
  );
}

export function extractHistoricalPhotoYear(
  title: string,
  fallbackMetadata = ''
): number | null {
  const scan = (raw: string): number | null => {
    if (!raw) return null;
    // 1. Strip birth–death lifespan spans like "(September 27, 1933 – June 3, 1987)" or "1933–1987"
    let cleaned = raw
      .replace(
        /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},?\s*(?:18|19|20)\d{2}\s*[–—-]\s*(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},?\s*(?:18|19|20)\d{2}\b/gi,
        ' '
      )
      .replace(/\b(?:18|19|20)\d{2}\s*[–—-]\s*(?:18|19|20)\d{2}\b/g, ' ')
      .replace(/\b(?:born|died|b\.|d\.)\s*(?:in\s+)?(?:18|19|20)\d{2}\b/gi, ' ');

    // 2. Ignore URL path upload/publish dates if any URL crept into text
    cleaned = cleaned.replace(/https?:\/\/\S+/gi, ' ');

    // 3. Ignore recent article publish years (2020-2026) when the title is a bio/tribute/editorial article
    const looksLikeModernArticle =
      /\b(bio|biography|tribute|remembering|facts|legacy|story|imdb|wiki|alchetron|find\s+a\s+grave|famous|greatest|best|updated)\b/i.test(
        cleaned
      );

    const matches = cleaned.match(/\b(19[1-9]\d|20[0-2]\d)\b/g);
    if (!matches) return null;

    for (const rawYr of matches) {
      const yr = Number(rawYr);
      if (yr < 1910 || yr > 2026) continue;
      if (looksLikeModernArticle && yr >= 2020) continue;
      return yr;
    }
    return null;
  };

  return scan(title) ?? scan(fallbackMetadata);
}

function extractNotableSceneKeywords(
  scene: StorySceneSummaryInput,
  characterName: string
): string[] {
  const charTokens = new Set(
    characterName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/\s+/)
      .filter((t) => t.length >= 2)
  );

  const hints: string[] = [];

  // 1. Quoted film or work titles in narration or title (e.g., "One Flew Over the Cuckoo's Nest")
  const combinedRaw = `${scene.title || ''} ${scene.narrationText || ''}`;
  const quotedMatches = combinedRaw.match(/["“']([A-Za-z0-9][A-Za-z0-9\s'’:&-]{3,42})["”']/g) || [];
  for (const m of quotedMatches) {
    const cleaned = m.replace(/^["“']|["”']$/g, '').trim();
    if (cleaned.length >= 4 && !hints.includes(cleaned)) {
      hints.push(cleaned);
    }
  }

  // 2. Clean archivalKeywords (stripped of generic filler)
  if (scene.archivalKeywords) {
    const cleanedKw = scene.archivalKeywords
      .replace(/\b(hd|4k|scene|clip|clips|video|shorts|youtube|tiktok|photo|photograph|portrait|closeup|close-up|solo|single)\b/gi, ' ')
      .replace(/[^\p{L}\p{N}\s']/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanedKw.length >= 3) {
      const words = cleanedKw
        .split(' ')
        .filter((w) => w.length >= 2 && !charTokens.has(w.toLowerCase()));
      if (words.length > 0) {
        hints.push(words.slice(0, 5).join(' '));
      }
    }
  }

  // 3. Domain-specific visual motifs from English narration (anchored to real-life candid photos & film stills — never drawings or posed studio portraits)
  const motifPatterns: Array<{ regex: RegExp; hint: string }> = [
    { regex: /\b(rodeo|cowboy|bronco|ranch|horseback|western)\b/i, hint: 'cowboy rodeo candid photo' },
    { regex: /\b(paint|painter|paintbrush|canvas|artist|art)\b/i, hint: 'behind the scenes candid photo' },
    { regex: /\b(oscar|academy\s+award|golden\s+globe|award|ceremony)\b/i, hint: 'award ceremony candid photo' },
    { regex: /\b(soldier|army|navy|war|military|marine|veteran)\b/i, hint: 'military uniform archival photo' },
    { regex: /\b(martial\s+arts|kung\s+fu|karate|boxing|ring|fight)\b/i, hint: 'martial arts movie scene still' },
    { regex: /\b(guitar|singer|concert|stage|music|band|microphone)\b/i, hint: 'live performance candid photo' },
    { regex: /\b(director|directing|camera|behind\s+the\s+scenes|on\s+set|filming)\b/i, hint: 'behind the scenes on set' },
    { regex: /\b(family|wife|husband|wedding|married|son|daughter|children)\b/i, hint: 'real life candid photo' },
    { regex: /\b(activist|founder|registry|community|speech|speaking|advocate)\b/i, hint: 'interview speaking candid photo' },
    { regex: /\b(childhood|born|baby|boy|girl|school|teen|grew\s+up|youth)\b/i, hint: 'young candid archival photo' },
  ];

  const narrationLower = `${scene.title || ''} ${scene.narrationText || ''}`;
  for (const mp of motifPatterns) {
    if (mp.regex.test(narrationLower) && !hints.includes(mp.hint)) {
      hints.push(mp.hint);
    }
  }

  return hints.slice(0, 4);
}

export function classifySceneStoryStage(
  scene: StorySceneSummaryInput,
  index: number,
  totalScenes: number,
  characterName = ''
): SceneStageAnalysis {
  const combined = `${scene.title || ''} ${scene.narrationText || ''} ${scene.archivalKeywords || ''} ${scene.visualPrompt || ''}`;
  const targetYear = extractYearFromStoryText(combined);
  const ratio = totalScenes > 1 ? index / (totalScenes - 1) : 0.5;
  const extractedHints = extractNotableSceneKeywords(scene, characterName);

  let stage: StoryPhotoStageId;

  if (
    /\b(born|birth|childhood|baby|grew\s+up|young\s+man|young\s+woman|teen|youth|hometown|tuổi\s*thơ|xuất\s*thân|chào\s*đời|niên\s*thiếu|thanh\s*niên|trẻ)\b/i.test(
      combined
    )
  ) {
    stage = 'early-life';
  } else if (
    /\b(passed\s+away|died|death|final\s+years|later\s+years|last\s+role|transplant|elder|aging|sự\s*ra\s*đi|qua\s*đời|những\s*năm\s*cuối|tuổi\s*già|về\s*già)\b/i.test(
      combined
    )
  ) {
    stage = 'later-years';
  } else if (
    /\b(legacy|footprints|remember|legend|tribute|inspiration|di\s*sản|huyền\s*thoại|tưởng\s*nhớ|kết\s*thúc)\b/i.test(
      combined
    ) &&
    ratio >= 0.7
  ) {
    stage = 'legacy-portrait';
  } else if (
    /\b(oscar|academy\s+award|theater|film|movie|starring|beside|co-star|face\s+to\s+face|ending|role|cuckoo|wales|hollywood|premiere|điện\s*ảnh|giải\s*oscar|vai\s*diễn|rạp\s*phim|kiệt\s*tác|sánh\s*vai)\b/i.test(
      combined
    )
  ) {
    stage = 'peak-cinema';
  } else if (
    /\b(off\s+screen|painter|paintbrush|artist|family|wife|husband|married|activist|registry|behind\s+the\s+scenes|interview|candid|đời\s*thực|ngoài\s*đời|hậu\s*trường|họa\s*sĩ|gia\s*đình|thế\s*hệ)\b/i.test(
      combined
    )
  ) {
    stage = 'personal-behind-scenes';
  } else if (
    /\b(rodeo|first\s+love|audition|search\s+for|breakthrough|debut|discovered|started|bước\s*ngoặt|khởi\s*đầu|tìm\s*kiếm|đam\s*mê\s*đầu\s*đời)\b/i.test(
      combined
    )
  ) {
    stage = 'breakthrough';
  } else {
    // Fallback by chronological story position
    if (ratio <= 0.2) stage = 'early-life';
    else if (ratio <= 0.4) stage = 'breakthrough';
    else if (ratio <= 0.68) stage = 'peak-cinema';
    else if (ratio <= 0.85) stage = 'personal-behind-scenes';
    else stage = 'legacy-portrait';
  }

  const meta = STORY_STAGE_META[stage];
  // Strictly solo clear-face by default; only allow 2-person contextual scenes when the script explicitly mentions a co-star/spouse/family
  const allowContextualMultiPerson =
    /\b(beside\s+[A-Z][a-z]+|with\s+[A-Z][a-z]+|co-star|couple|wedding|married|husband|wife|family)\b/.test(
      `${scene.title || ''} ${scene.narrationText || ''}`
    );

  const cleanChar = cleanCharacterNameForSearch(characterName);
  const querySuggestions: string[] = [];

  if (cleanChar) {
    if (extractedHints.length > 0) {
      const leadHint = extractedHints[0];
      const hasSceneOrCandidTerm = /\b(still|scene|movie|film|candid|set|photo|interview|premiere|rodeo)\b/i.test(leadHint);
      const enrichedHint = hasSceneOrCandidTerm
        ? leadHint
        : stage === 'peak-cinema'
        ? `${leadHint} movie still`
        : `${leadHint} candid photo`;
      const withYear = targetYear && !enrichedHint.includes(String(targetYear))
        ? `${cleanChar} ${enrichedHint} ${targetYear}`
        : `${cleanChar} ${enrichedHint}`;
      querySuggestions.push(withYear.replace(/\s+/g, ' ').trim());
    }
    if (targetYear) {
      querySuggestions.push(
        stage === 'peak-cinema'
          ? `${cleanChar} ${targetYear} movie still`
          : `${cleanChar} ${targetYear} candid photo`
      );
    }
    querySuggestions.push(`${cleanChar} ${meta.defaultQueryModifiers[0]}`);
  }

  return {
    sceneId: scene.id,
    stage,
    stageLabelVi: meta.labelVi,
    stageShortVi: meta.shortVi,
    targetYear,
    allowContextualMultiPerson,
    extractedHints,
    querySuggestions: Array.from(new Set(querySuggestions)).slice(0, 3),
  };
}

export function buildRichStagePhotoQueries(
  rawCharacterName: string,
  scenes: StorySceneSummaryInput[] = [],
  options: {
    storyMode?: string;
    secondaryPerson?: string;
    maxQueries?: number;
  } = {}
): StageSearchQueryPlan[] {
  const cleanChar = cleanCharacterNameForSearch(rawCharacterName);
  if (!cleanChar) return [];

  const maxQueries = Math.max(6, Math.min(14, options.maxQueries ?? 10));
  const plans: StageSearchQueryPlan[] = [];
  const seenNormalized = new Set<string>();

  const addPlan = (plan: StageSearchQueryPlan) => {
    const key = plan.query
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!key || seenNormalized.has(key)) return;
    seenNormalized.add(key);
    plans.push(plan);
  };

  const visualScenes = scenes.filter(
    (s) => s && s.sceneType !== 'quote' && s.sceneType !== 'outro'
  );

  // 1. Always lead with real movie stills & authentic real-life candid archival photography (NEVER posed studio portraits or drawings)
  addPlan({
    query: `${cleanChar} movie scene still`,
    stage: 'peak-cinema',
    stageLabelVi: STORY_STAGE_META['peak-cinema'].labelVi,
    allowMultiSubject: true,
    targetYear: null,
    priority: 10,
  });

  if (options.secondaryPerson) {
    addPlan({
      query: `${cleanChar} ${options.secondaryPerson} candid photo`,
      stage: 'personal-behind-scenes',
      stageLabelVi: STORY_STAGE_META['personal-behind-scenes'].labelVi,
      allowMultiSubject: true,
      targetYear: null,
      priority: 9,
    });
  }

  // 2. Extract targeted storyline-stage queries directly from the user's scenes
  const stageCounts: Partial<Record<StoryPhotoStageId, number>> = {};
  const analyses = visualScenes.map((sc, idx) =>
    classifySceneStoryStage(sc, idx, visualScenes.length, cleanChar)
  );

  for (const analysis of analyses) {
    const countForStage = stageCounts[analysis.stage] || 0;
    if (countForStage >= 2) continue;

    const primarySuggestion = analysis.querySuggestions[0];
    if (primarySuggestion) {
      addPlan({
        query: primarySuggestion,
        stage: analysis.stage,
        stageLabelVi: analysis.stageLabelVi,
        allowMultiSubject: true,
        targetYear: analysis.targetYear,
        priority: analysis.extractedHints.length > 0 ? 9 : 7,
      });
      stageCounts[analysis.stage] = countForStage + 1;
    }
  }

  // 3. Ensure every core documentary life stage is covered by REAL FILM STILLS and REAL-LIFE CANDID PHOTOS!
  const coreStageFallbacks: StageSearchQueryPlan[] = [
    {
      query: `${cleanChar} behind the scenes on set candid`,
      stage: 'personal-behind-scenes',
      stageLabelVi: STORY_STAGE_META['personal-behind-scenes'].labelVi,
      allowMultiSubject: true,
      targetYear: null,
      priority: 9,
    },
    {
      query: `${cleanChar} film scene screenshot`,
      stage: 'peak-cinema',
      stageLabelVi: STORY_STAGE_META['peak-cinema'].labelVi,
      allowMultiSubject: true,
      targetYear: null,
      priority: 8,
    },
    {
      query: `${cleanChar} young candid archival photo`,
      stage: 'early-life',
      stageLabelVi: STORY_STAGE_META['early-life'].labelVi,
      allowMultiSubject: true,
      targetYear: null,
      priority: 8,
    },
    {
      query: `${cleanChar} interview candid real life photo`,
      stage: 'personal-behind-scenes',
      stageLabelVi: STORY_STAGE_META['personal-behind-scenes'].labelVi,
      allowMultiSubject: true,
      targetYear: null,
      priority: 7,
    },
    {
      query: `${cleanChar} early movie scene still`,
      stage: 'breakthrough',
      stageLabelVi: STORY_STAGE_META.breakthrough.labelVi,
      allowMultiSubject: true,
      targetYear: null,
      priority: 7,
    },
    {
      query: `${cleanChar} later years candid event photo`,
      stage: 'later-years',
      stageLabelVi: STORY_STAGE_META['later-years'].labelVi,
      allowMultiSubject: true,
      targetYear: null,
      priority: 6,
    },
  ];

  for (const fallback of coreStageFallbacks) {
    if (plans.length >= maxQueries) break;
    addPlan(fallback);
  }

  return plans.sort((a, b) => b.priority - a.priority).slice(0, maxQueries);
}

const SEMANTIC_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'this', 'that', 'their', 'his', 'her',
  'was', 'were', 'are', 'has', 'had', 'have', 'not', 'but', 'one', 'two', 'all',
  'photo', 'photograph', 'portrait', 'image', 'picture', 'jpg', 'jpeg', 'png', 'https', 'http', 'www', 'com',
]);

function tokenizeForOverlap(text: string, excludedTokens?: Set<string>): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 3 &&
        !SEMANTIC_STOPWORDS.has(w) &&
        !(excludedTokens && excludedTokens.has(w))
    );
}

export function inferPhotoStageFromMetadata(
  photo: Pick<VerifiedStagePhotoCandidate, 'title' | 'sourceUrl' | 'year' | 'stage'>,
  minPoolYear: number | null,
  maxPoolYear: number | null
): StoryPhotoStageId {
  if (photo.stage) return photo.stage;
  const text = `${photo.title || ''} ${photo.sourceUrl || ''}`;

  if (/\b(young|youth|child|kid|early|teen|boy|girl|high\s*school)\b/i.test(text)) {
    return 'early-life';
  }
  if (/\b(rodeo|debut|breakthrough|early\s*career|premiere|award|oscar)\b/i.test(text)) {
    return 'breakthrough';
  }
  if (/\b(still|scene|movie|film|cinema|set|character|role|actor|starring)\b/i.test(text)) {
    return 'peak-cinema';
  }
  if (/\b(candid|behind|interview|family|artist|painter|event|festival|press)\b/i.test(text)) {
    return 'personal-behind-scenes';
  }
  if (/\b(later|elder|final|tribute|memorial|veteran|senior)\b/i.test(text)) {
    return 'later-years';
  }

  if (photo.year && minPoolYear && maxPoolYear && maxPoolYear - minPoolYear >= 10) {
    const rel = (photo.year - minPoolYear) / (maxPoolYear - minPoolYear);
    if (rel <= 0.25) return 'early-life';
    if (rel <= 0.5) return 'breakthrough';
    if (rel <= 0.78) return 'peak-cinema';
    return 'later-years';
  }

  return 'legacy-portrait';
}

export interface ScenePhotoAssignmentResult {
  assignedBySceneId: Record<string, VerifiedStagePhotoCandidate>;
  referenceBySceneId: Record<string, VerifiedStagePhotoCandidate>;
  annotatedPool: VerifiedStagePhotoCandidate[];
}

export function rankAndAssignStagePhotosToScenes(
  scenes: StorySceneSummaryInput[],
  rawPool: VerifiedStagePhotoCandidate[],
  characterName = '',
  alreadyAssignedSceneIds: Set<string> = new Set()
): ScenePhotoAssignmentResult {
  // 1. Deduplicate pool by dataUrl / sourceUrl
  const uniquePool: VerifiedStagePhotoCandidate[] = [];
  const seenKeys = new Set<string>();
  for (const item of rawPool) {
    if (!item || !item.dataUrl) continue;
    const key = item.sourceUrl || item.dataUrl.slice(0, 120);
    if (seenKeys.has(key) || seenKeys.has(item.dataUrl.slice(0, 120))) continue;
    seenKeys.add(key);
    seenKeys.add(item.dataUrl.slice(0, 120));
    uniquePool.push({ ...item });
  }

  const years = uniquePool
    .map((p) => p.year)
    .filter((y): y is number => typeof y === 'number' && y >= 1910 && y <= 2026);
  const minYear = years.length > 0 ? Math.min(...years) : null;
  const maxYear = years.length > 0 ? Math.max(...years) : null;

  const annotatedPool = uniquePool.map((p) => {
    const inferredStage = inferPhotoStageFromMetadata(p, minYear, maxYear);
    return {
      ...p,
      stage: inferredStage,
      stageLabel: p.stageLabel || STORY_STAGE_META[inferredStage].labelVi,
    };
  });

  // Sort annotated pool smoothly by chronological order (year asc, then stage chronologicalOrder)
  annotatedPool.sort((a, b) => {
    const orderA = STORY_STAGE_META[a.stage || 'legacy-portrait'].chronologicalOrder;
    const orderB = STORY_STAGE_META[b.stage || 'legacy-portrait'].chronologicalOrder;
    if (a.year && b.year && a.year !== b.year) return a.year - b.year;
    if (orderA !== orderB) return orderA - orderB;
    return 0;
  });

  const visualScenes = scenes.filter(
    (sc) => sc && sc.sceneType !== 'quote' && sc.sceneType !== 'outro'
  );
  const analyses = visualScenes.map((sc, idx) =>
    classifySceneStoryStage(sc, idx, visualScenes.length, characterName)
  );
  const analysisById = new Map<string, SceneStageAnalysis>(
    analyses.map((a) => [a.sceneId, a])
  );
  const charExcludedTokens = new Set(tokenizeForOverlap(cleanCharacterNameForSearch(characterName)));

  const scorePhotoForScene = (
    photo: VerifiedStagePhotoCandidate,
    scene: StorySceneSummaryInput,
    sceneIdx: number,
    totalCount: number
  ): number => {
    const analysis = analysisById.get(scene.id);
    if (!analysis) return 0;

    let score = 0;
    const photoStage = photo.stage || 'legacy-portrait';

    // Exact narrative stage match
    if (photoStage === analysis.stage) {
      score += 18;
    } else {
      const stageDist = Math.abs(
        STORY_STAGE_META[photoStage].chronologicalOrder -
          STORY_STAGE_META[analysis.stage].chronologicalOrder
      );
      score += Math.max(0, 8 - stageDist * 3);
    }

    // Exact or near-year match
    if (analysis.targetYear && photo.year) {
      const diff = Math.abs(photo.year - analysis.targetYear);
      if (diff === 0) score += 30;
      else if (diff === 1) score += 20;
      else if (diff <= 4) score += 14;
      else if (diff <= 10) score += 6;
      else score -= Math.min(12, Math.floor(diff / 5));
    } else if (photo.year && minYear !== null && maxYear !== null && maxYear > minYear) {
      // Smooth chronological alignment across the documentary arc
      const sceneProgress = totalCount > 1 ? sceneIdx / (totalCount - 1) : 0.5;
      const photoProgress = (photo.year - minYear) / (maxYear - minYear);
      const progressDiff = Math.abs(sceneProgress - photoProgress);
      score += Math.round((1 - progressDiff) * 14);
    }

    // Semantic keyword overlap between scene hints/keywords and photo title (excluding character name & stopwords)
    const sceneTokens = new Set(
      tokenizeForOverlap(
        `${analysis.extractedHints.join(' ')} ${scene.archivalKeywords || ''} ${scene.title || ''}`,
        charExcludedTokens
      )
    );
    const photoTokens = new Set(
      tokenizeForOverlap(`${photo.title} ${photo.sourceUrl}`, charExcludedTokens)
    );
    let overlapHits = 0;
    for (const pt of photoTokens) {
      if (sceneTokens.has(pt)) overlapHits++;
    }
    score += Math.min(30, overlapHits * 8);

    // Favor authentic real-life candid & movie still framing (classic 4:3, 3:2, square, or vertical) while avoiding ultra-wide 2:1 banners
    const aspect = (photo.width || 720) / Math.max(1, photo.height || 960);
    if (aspect >= 0.62 && aspect <= 1.56) score += 14;
    else if (aspect > 1.56 && aspect <= 1.65) score += 4;
    else if (aspect > 1.65) score -= 24;

    const metaText = `${photo.title || ''} ${photo.sourceUrl || ''}`;
    if (REAL_SCENE_OR_CANDID_SIGNAL_REGEX.test(metaText)) {
      score += 14;
    }
    if (isPosedPortraitOrHeadshotPhoto(photo.title, photo.sourceUrl)) {
      score -= 32;
    }
    if (isDrawingOrIllustrationPhoto(photo.title, photo.sourceUrl)) {
      score -= 60;
    }
    if (/\b(crowd|audience|wide[\s_-]?shot|silhouette|behind|rear)\b/i.test(metaText)) {
      score -= 16;
    }
    if (isGenericOrNonFacePhoto(photo.title, photo.sourceUrl)) {
      score -= 40;
    }

    return score;
  };

  const assignedBySceneId: Record<string, VerifiedStagePhotoCandidate> = {};
  const referenceBySceneId: Record<string, VerifiedStagePhotoCandidate> = {};
  const usedPhotoDataUrls = new Set<string>();

  const imageScenes = visualScenes.filter(
    (sc) => !alreadyAssignedSceneIds.has(sc.id) && sc.sceneType === 'image'
  );
  const videoScenesWithoutMedia = visualScenes.filter(
    (sc) => !alreadyAssignedSceneIds.has(sc.id) && sc.sceneType !== 'image'
  );

  // Prioritize 'image' scenes first so every static photo scene gets its best unique stage photo
  const primaryImageTargets =
    imageScenes.length > 0 ? imageScenes : visualScenes.filter((sc) => !alreadyAssignedSceneIds.has(sc.id));

  const pickBestForScene = (
    sc: StorySceneSummaryInput,
    sceneIdx: number,
    allowReuseFallback: boolean
  ): VerifiedStagePhotoCandidate | null => {
    const unused = annotatedPool.filter((p) => !usedPhotoDataUrls.has(p.dataUrl));
    const candidates = unused.length > 0 ? unused : allowReuseFallback ? annotatedPool : [];
    if (candidates.length === 0) return null;

    let best = candidates[0];
    let bestScore = -Infinity;
    for (const cand of candidates) {
      const s = scorePhotoForScene(cand, sc, sceneIdx, visualScenes.length);
      if (s > bestScore) {
        bestScore = s;
        best = cand;
      }
    }
    return best;
  };

  for (const sc of primaryImageTargets) {
    const sceneIdx = visualScenes.findIndex((v) => v.id === sc.id);
    const best = pickBestForScene(sc, sceneIdx, true);
    if (best) {
      usedPhotoDataUrls.add(best.dataUrl);
      assignedBySceneId[sc.id] = best;
      referenceBySceneId[sc.id] = best;
    }
  }

  // Assign distinct stage-matched reference photos to remaining 'video' scenes (so every video scene has a unique stage-relevant Ảnh Gốc!)
  for (const sc of videoScenesWithoutMedia) {
    if (referenceBySceneId[sc.id]) continue;
    const sceneIdx = visualScenes.findIndex((v) => v.id === sc.id);
    const best = pickBestForScene(sc, sceneIdx, true);
    if (best) {
      usedPhotoDataUrls.add(best.dataUrl);
      referenceBySceneId[sc.id] = best;
    }
  }

  return {
    assignedBySceneId,
    referenceBySceneId,
    annotatedPool,
  };
}
