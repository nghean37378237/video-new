import type { AspectRatioOption, StoryScene, VaultItem } from '../types';
import {
  buildFullFrameImagePrompt,
  buildFullFrameVideoPrompt,
  getAspectRatioSpec,
  KLING_NEGATIVE_PROMPT,
} from './fullFrameHelper';
import {
  classifySceneStoryStage,
  cleanCharacterNameForSearch,
} from './storyStagePhotoPlanner';

export type UnclearSceneReasonCode =
  | 'missing-media'
  | 'unverified-photo'
  | 'video-needs-footage'
  | 'low-res-or-blurry'
  | 'aspect-mismatch'
  | 'duplicate-media'
  | 'manual-flagged';

export interface UnclearSceneReason {
  code: UnclearSceneReasonCode;
  labelVi: string;
  detailVi: string;
}

export interface UnclearSceneAuditItem {
  sceneId: string;
  order: number;
  isVisualScene: boolean;
  isUnclear: boolean;
  needsCrispImageUpgrade: boolean;
  isCrispHdReady: boolean;
  isManuallyFlagged: boolean;
  severityScore: number;
  reasons: UnclearSceneReason[];
  primaryReasonVi: string;
  currentWidth: number | null;
  currentHeight: number | null;
  stageLabelVi: string;
  targetYear: number | null;
}

function getTargetAspectValue(ratio: AspectRatioOption): number {
  if (ratio === '9:16') return 9 / 16;
  if (ratio === '16:9') return 16 / 9;
  return 3 / 4;
}

function normalizeMediaKeyForDupCheck(url?: string): string {
  if (!url) return '';
  if (url.startsWith('data:')) return url.slice(0, 140);
  return url.split('#')[0].trim().toLowerCase();
}

export function auditScenesForUnclearMedia(
  scenes: StoryScene[],
  vaultItems: VaultItem[],
  aspectRatio: AspectRatioOption = '3:4',
  rawCharacterName = ''
): Record<string, UnclearSceneAuditItem> {
  const cleanChar = cleanCharacterNameForSearch(rawCharacterName);
  const targetRatio = getTargetAspectValue(aspectRatio);
  const spec = getAspectRatioSpec(aspectRatio);

  const visualScenes = scenes.filter(
    (s) => s.sceneType === 'video' || s.sceneType === 'image'
  );

  // Count how many visual scenes share the same image/video URL
  const mediaUsageCount = new Map<string, number>();
  for (const sc of visualScenes) {
    const item = vaultItems.find((v) => v.id === sc.mediaId);
    const url = item?.url || sc.mediaUrl || '';
    const key = normalizeMediaKeyForDupCheck(url);
    if (!key) continue;
    mediaUsageCount.set(key, (mediaUsageCount.get(key) || 0) + 1);
  }

  const vaultById = new Map<string, VaultItem>(vaultItems.map((v) => [v.id, v]));
  const result: Record<string, UnclearSceneAuditItem> = {};

  for (let idx = 0; idx < scenes.length; idx++) {
    const sc = scenes[idx];
    const isVisualScene = sc.sceneType === 'video' || sc.sceneType === 'image';
    const visualIdx = visualScenes.findIndex((v) => v.id === sc.id);
    const stageInfo = classifySceneStoryStage(
      {
        id: sc.id,
        order: sc.order || idx + 1,
        title: sc.title,
        sceneType: sc.sceneType,
        narrationText: sc.narrationText,
        archivalKeywords: sc.archivalKeywords,
        visualPrompt: sc.visualPrompt,
      },
      visualIdx >= 0 ? visualIdx : idx,
      Math.max(1, visualScenes.length),
      cleanChar
    );

    if (!isVisualScene) {
      result[sc.id] = {
        sceneId: sc.id,
        order: sc.order || idx + 1,
        isVisualScene: false,
        isUnclear: false,
        needsCrispImageUpgrade: false,
        isCrispHdReady: false,
        isManuallyFlagged: false,
        severityScore: 0,
        reasons: [],
        primaryReasonVi: '',
        currentWidth: null,
        currentHeight: null,
        stageLabelVi: stageInfo.stageLabelVi,
        targetYear: stageInfo.targetYear,
      };
      continue;
    }

    const vaultItem = sc.mediaId ? vaultById.get(sc.mediaId) : undefined;
    const effectiveUrl = vaultItem?.url || sc.mediaUrl || '';
    const effectiveKind = vaultItem?.type || sc.mediaKind;
    const hasRealVideoFile = Boolean(effectiveUrl) && effectiveKind === 'video';
    const width = vaultItem?.width ?? (sc.isCrispHd ? spec.width : null);
    const height = vaultItem?.height ?? (sc.isCrispHd ? spec.height : null);
    const isCrispHdReady = Boolean(sc.isCrispHd);
    const isManuallyFlagged = sc.unclearFlagOverride === true;

    const reasons: UnclearSceneReason[] = [];
    let severityScore = 0;

    if (!effectiveUrl) {
      reasons.push({
        code: 'missing-media',
        labelVi: 'Chưa có ảnh/video',
        detailVi: 'Cảnh đang trống — cần tạo Ảnh Nét HD & dùng Prompt vẽ Video.',
      });
      severityScore += 100;
    }

    if (sc.hasRealPhoto === false) {
      reasons.push({
        code: 'unverified-photo',
        labelVi: 'Thiếu ảnh thật chuẩn',
        detailVi: 'Chưa có tư liệu gốc rõ ràng trên mạng — nên dùng Ảnh Nét + Prompt vẽ.',
      });
      severityScore += 90;
    }

    if (sc.sceneType === 'video' && !hasRealVideoFile) {
      reasons.push({
        code: 'video-needs-footage',
        labelVi: 'Chưa có Video thật',
        detailVi: effectiveUrl
          ? 'Đang tạm gắn ảnh tĩnh cho đoạn Video — cần Ảnh Nét HD + Prompt để vẽ Video chuyển động.'
          : 'Đoạn Video chưa có file MP4 — cần Ảnh Nét HD + Prompt để vẽ Video.',
      });
      severityScore += 80;
    }

    const dupKey = normalizeMediaKeyForDupCheck(effectiveUrl);
    if (dupKey && (mediaUsageCount.get(dupKey) || 0) >= 2) {
      reasons.push({
        code: 'duplicate-media',
        labelVi: 'Trùng ảnh/video',
        detailVi: 'Đang dùng chung tư liệu với cảnh khác — nên làm nét hoặc vẽ cảnh riêng.',
      });
      severityScore += 65;
    }

    // Check sharpness / resolution & framing aspect ratio on non-video or unenhanced scenes
    let needsCrispImageUpgrade = false;
    if (!isCrispHdReady && !hasRealVideoFile) {
      const minExpectedW = Math.min(900, Math.round(spec.width * 0.82));
      const minExpectedH = Math.min(1000, Math.round(spec.height * 0.72));

      if (!width || !height || width < minExpectedW || height < minExpectedH) {
        const dimNote = width && height ? `${width}×${height}px` : 'ảnh nguồn web chưa rõ kích thước HD';
        reasons.push({
          code: 'low-res-or-blurry',
          labelVi: 'Ảnh chưa nét HD',
          detailVi: `Nguồn hiện tại (${dimNote}) dễ mờ khi phóng Full Khung ${spec.width}×${spec.height}px — bấm Làm Nét HD để nâng cấp.`,
        });
        severityScore += 55;
        needsCrispImageUpgrade = true;
      }

      if (width && height) {
        const currentRatio = width / Math.max(1, height);
        if (Math.abs(currentRatio - targetRatio) > 0.35) {
          reasons.push({
            code: 'aspect-mismatch',
            labelVi: 'Lệch khung hình',
            detailVi: `Tỷ lệ ảnh gốc (${width}×${height}) lệch mạnh so với khung ${spec.ratio} — cần căn lại khung nét giữ nguyên mặt.`,
          });
          severityScore += 45;
          needsCrispImageUpgrade = true;
        }
      }
    }

    if (isManuallyFlagged) {
      reasons.push({
        code: 'manual-flagged',
        labelVi: 'Đã đánh dấu cần vẽ lại',
        detailVi: 'Bạn đã chọn cảnh này để lấy Ảnh Nét HD & Prompt vẽ Video.',
      });
      severityScore += 75;
      if (!isCrispHdReady) {
        needsCrispImageUpgrade = true;
      }
    }

    // Respect manual dismissal (unclearFlagOverride === false) unless user clears it
    const isUnclear =
      sc.unclearFlagOverride === false ? false : reasons.length > 0;

    result[sc.id] = {
      sceneId: sc.id,
      order: sc.order || idx + 1,
      isVisualScene: true,
      isUnclear,
      needsCrispImageUpgrade: isUnclear && needsCrispImageUpgrade,
      isCrispHdReady,
      isManuallyFlagged,
      severityScore,
      reasons,
      primaryReasonVi: reasons[0]?.labelVi || (isCrispHdReady ? 'Ảnh Nét HD sẵn sàng' : 'Rõ nét'),
      currentWidth: width,
      currentHeight: height,
      stageLabelVi: stageInfo.stageLabelVi,
      targetYear: stageInfo.targetYear,
    };
  }

  return result;
}

export interface UnclearSceneVideoPromptPack {
  sceneId: string;
  order: number;
  stageLabelVi: string;
  crispImagePrompt: string;
  videoDrawPrompt: string;
  negativePrompt: string;
  combinedCopyBlock: string;
}

export function buildUnclearSceneVideoPromptPack(options: {
  scene: StoryScene;
  index: number;
  totalScenes: number;
  characterName: string;
  aspectRatio: AspectRatioOption;
  audit?: UnclearSceneAuditItem;
}): UnclearSceneVideoPromptPack {
  const { scene, index, totalScenes, characterName, aspectRatio, audit } = options;
  const spec = getAspectRatioSpec(aspectRatio);
  const cleanChar = cleanCharacterNameForSearch(characterName) || scene.title;
  const stageLabelVi = audit?.stageLabelVi || 'Cảnh kể chuyện tài liệu';
  const yearSuffix = audit?.targetYear ? ` (${audit.targetYear})` : '';

  const baseImgPrompt = buildFullFrameImagePrompt(
    scene.imagePrompt ||
      `${cleanChar}, ${scene.title}, ${stageLabelVi}${yearSuffix}, ultra-sharp 8K archival documentary photograph, crystal-clear facial details, natural skin texture, dramatic film lighting`,
    aspectRatio,
    `${cleanChar} - ${scene.title}`
  );

  const crispImagePrompt = /ultra-sharp|crystal-clear/i.test(baseImgPrompt)
    ? baseImgPrompt
    : `Ultra-sharp high-definition restored documentary photograph, crisp focus on face and eyes, zero motion blur, rich fine film grain detail. ${baseImgPrompt}`;

  const videoDrawPrompt = buildFullFrameVideoPrompt(
    scene.videoMotionPrompt,
    crispImagePrompt,
    aspectRatio,
    scene.narrationText
  );

  const reasonSummary =
    audit && audit.reasons.length > 0
      ? audit.reasons.map((r) => r.labelVi).join(' · ')
      : 'Cần ảnh nét & vẽ video';

  const orderTag = `#${String(scene.order || index + 1).padStart(2, '0')}/${String(
    totalScenes
  ).padStart(2, '0')}`;

  const combinedCopyBlock = [
    `================================================================`,
    `CẢNH ${orderTag} — ${scene.title} (${Math.ceil(scene.durationSec || 6)}s)`,
    `🎯 Giai đoạn cốt truyện: ${stageLabelVi}${yearSuffix}`,
    `⚠️ Lý do cần xử lý: ${reasonSummary}`,
    `📐 Khung hình chuẩn nét: ${spec.ratio} (${spec.width}×${spec.height}px)`,
    `🗣️ Lời bình: "${scene.narrationText}"`,
    scene.translationText ? `🇻🇳 Dịch nghĩa: "${scene.translationText}"` : null,
    ``,
    `[1. PROMPT VẼ / NÂNG CẤP ẢNH NÉT HD (${spec.width}×${spec.height}px)]`,
    crispImagePrompt,
    ``,
    `[2. PROMPT VẼ VIDEO TỪ ẢNH NÉT (KLING AI / GROK / RUNWAY / HAILUO - I2V)]`,
    videoDrawPrompt,
    ``,
    `[3. NEGATIVE PROMPT (Dán vào ô Negative để chống mờ & giữ mặt)]`,
    KLING_NEGATIVE_PROMPT,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  return {
    sceneId: scene.id,
    order: scene.order || index + 1,
    stageLabelVi,
    crispImagePrompt,
    videoDrawPrompt,
    negativePrompt: KLING_NEGATIVE_PROMPT,
    combinedCopyBlock,
  };
}

export function buildBatchUnclearPromptsDocument(
  unclearScenes: StoryScene[],
  allScenes: StoryScene[],
  auditsById: Record<string, UnclearSceneAuditItem>,
  characterName: string,
  aspectRatio: AspectRatioOption = '3:4'
): string {
  const spec = getAspectRatioSpec(aspectRatio);
  const cleanChar = cleanCharacterNameForSearch(characterName) || 'Nhân vật';

  const header = [
    `BỘ ẢNH NÉT HD (${spec.width}×${spec.height}px) & PROMPT VẼ VIDEO CHO CÁC CẢNH KHÔNG RÕ RÀNG`,
    `Nhân vật / Chủ đề: ${cleanChar}`,
    `Tổng số cảnh cần vẽ / làm nét: ${unclearScenes.length} / ${allScenes.length} cảnh`,
    `Hướng dẫn nhanh: Tải Ảnh Nét HD (${spec.ratio}) của từng cảnh từ LegendCut Studio -> Đưa vào mục Image-to-Video (Kling AI / Grok / Runway / Hailuo) -> Dán Prompt mục [2] + Negative Prompt mục [3] bên dưới.`,
    ``,
  ].join('\n');

  const blocks = unclearScenes.map((sc) => {
    const idx = allScenes.findIndex((s) => s.id === sc.id);
    return buildUnclearSceneVideoPromptPack({
      scene: sc,
      index: idx >= 0 ? idx : 0,
      totalScenes: allScenes.length,
      characterName: cleanChar,
      aspectRatio,
      audit: auditsById[sc.id],
    }).combinedCopyBlock;
  });

  return `${header}\n${blocks.join('\n\n')}\n`;
}
