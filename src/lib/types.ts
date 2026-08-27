// 通用类型定义

export interface CardInfo {
  code: string;
  validDays: number;
  dailyLimit: number;
  activatedAt: string | null;
  expiresAt: string | null;
  status: 'active' | 'frozen' | 'revoked' | 'expired' | 'unused';
}

export interface AuthSession {
  token: string;
  cardCode: string;
  expiresAt: string;
  issuedAt: string;
  dailyUsed: number;
  dailyLimit: number;
  cardExpiresAt: string;
}

export interface StoryboardShot {
  shotNumber: number;
  sceneDescription: string;
  dialogue: string;
  duration: string;
  cameraMove: string;
}

export interface StoryboardResult {
  id: string;
  type: 'storyboard';
  title: string;
  createdAt: string;
  inputText: string;
  shots: StoryboardShot[];
}

export interface TitleResult {
  id: string;
  type: 'titles';
  title: string;
  createdAt: string;
  inputText: string;
  titles: string[];
}

export type HistoryItem = StoryboardResult | TitleResult;

export type AIModelProvider =
  | 'qwen'         // 通义千问
  | 'zhipu'        // 智谱AI
  | 'deepseek'     // Deepseek
  | 'hunyuan'      // 混元（腾讯）
  | 'doubao'       // 豆包（字节）
  | 'siliconflow'; // 硅基流动

export interface SystemConfig {
  defaultProvider: AIModelProvider;
  dailyLimit: number;
}
