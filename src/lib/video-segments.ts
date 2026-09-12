// AI视频生成段：按"镜头时长累加 ≤ 目标视频模型单次生成上限"自动连续分段。
// 纯前端确定性计算——不调用 AI、不改 JSON 契约、不增加 Token；历史分镜数据只要 duration 可解析即可参与分段。
import type { StoryboardShot } from '@/lib/types';

/**
 * 目标视频生成工具（用户粘贴分镜的对象）配置：单次生成的最大时长（秒）。
 * 与文本生成侧的大模型（豆包/DeepSeek 等）无关；新增或调整视频模型只改这里，不写死进 Prompt。
 */
export interface VideoGenModel {
  id: string;
  label: string;
  /** 单次生成的最大时长（秒） */
  maxDuration: number;
}

export const VIDEO_GEN_MODELS: VideoGenModel[] = [
  { id: 'seedance-2.0', label: 'Seedance 2.0 系列', maxDuration: 15 },
  { id: 'seedance-2.5', label: 'Seedance 2.5', maxDuration: 30 },
];

export const DEFAULT_VIDEO_MODEL_ID = 'seedance-2.0';

export function getVideoModel(id: string): VideoGenModel {
  return VIDEO_GEN_MODELS.find((m) => m.id === id) ?? VIDEO_GEN_MODELS[0];
}

/**
 * 解析镜头时长（如"4秒"、"4 秒"、"4s"）：取首个数字，失败返回 null。
 * 时长未知的镜头在分段中独立成段，避免污染相邻段的时长计算。
 */
export function parseDurationSeconds(duration: string): number | null {
  if (!duration) return null;
  const m = duration.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** AI视频生成段：一组可放进目标视频模型单次生成内的连续镜头 */
export interface VideoSegment {
  /** 段序号（从 1 开始） */
  index: number;
  /** 段内镜头（保持原始顺序） */
  shots: StoryboardShot[];
  /** 段预计总时长（秒）；含时长未知镜头时为 null */
  totalSeconds: number | null;
  /** 段内存在时长无法解析的镜头（提示用户该段建议单独生成） */
  hasUnknown: boolean;
  /** 段总时长超过模型上限（仅出现在单镜头即超限的极端情况，提示拆分画面描述） */
  exceeds: boolean;
}

/**
 * 自动连续分段：按镜头原始顺序累加 duration，装得下就并入当前段，
 * 装不下（当前段 + 下一镜头 > maxDuration）就开启新段。
 * - 时长未知的镜头独立成段（不与前后合并）
 * - 单镜头时长超过 maxDuration 时仍独立成段并标记 exceeds，由 UI 提示
 */
export function buildVideoSegments(shots: StoryboardShot[], maxDuration: number): VideoSegment[] {
  const segments: VideoSegment[] = [];
  let current: StoryboardShot[] = [];
  let currentTotal = 0;

  const flush = () => {
    if (current.length === 0) return;
    segments.push({ index: 0, shots: current, totalSeconds: currentTotal, hasUnknown: false, exceeds: false });
    current = [];
    currentTotal = 0;
  };

  for (const shot of shots) {
    const sec = parseDurationSeconds(shot.duration);
    if (sec === null) {
      // 时长未知：先结算当前段，再让该镜头独立成段
      flush();
      segments.push({ index: 0, shots: [shot], totalSeconds: null, hasUnknown: true, exceeds: false });
      continue;
    }
    if (current.length > 0 && currentTotal + sec > maxDuration) {
      flush();
    }
    current.push(shot);
    currentTotal += sec;
  }
  flush();

  return segments.map((seg, i) => ({
    ...seg,
    index: i + 1,
    exceeds: seg.totalSeconds !== null && seg.totalSeconds > maxDuration,
  }));
}

/** 单镜头的纯文本格式（与工具页/历史页的复制格式保持一致，全站唯一定义） */
export function shotToText(shot: StoryboardShot): string {
  const typeLabel = shot.shotType === 'real' ? '[真人实拍] ' : shot.shotType === 'ai' ? '[AI画面] ' : '';
  return `【镜头${shot.shotNumber}】${typeLabel}时长：${shot.duration} | 运镜：${shot.cameraMove}\n画面：${shot.sceneDescription}\n台词：${shot.dialogue || '（无）'}`;
}

/** 生成段复制文本：段内全部镜头按统一格式拼接，可直接粘贴到视频模型 */
export function segmentToText(segment: VideoSegment): string {
  return segment.shots.map(shotToText).join('\n\n');
}
