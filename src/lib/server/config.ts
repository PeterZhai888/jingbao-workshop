// 配置读取：统一从环境变量获取，缺失时给合理默认
import 'dotenv/config';

export const CONFIG = {
  // JWT 密钥（生产必须从环境变量注入强随机字符串）
  JWT_SECRET: process.env.JWT_SECRET || 'ai-video-tool-dev-secret-change-me-please',
  JWT_EXPIRES_HOURS: 24,

  // SQLite 数据库路径（相对项目根）
  DB_PATH: process.env.DB_PATH || './data/ai-video-tool.db',

  // 默认卡密有效期（天）
  CARD_VALID_DAYS: parseInt(process.env.CARD_VALID_DAYS || '30', 10),

  // 默认每日生成次数上限
  DAILY_LIMIT: parseInt(process.env.DAILY_LIMIT || '20', 10),

  // 同一卡密每分钟请求上限（防刷）
  CARD_PER_MINUTE_LIMIT: parseInt(process.env.CARD_PER_MINUTE_LIMIT || '5', 10),

  // 管理员默认账号（仅首次初始化时创建，生产请修改！）
  DEFAULT_ADMIN_USERNAME: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
  DEFAULT_ADMIN_PASSWORD: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123456',

  // 时区偏移（小时），中国 UTC+8
  TZ_OFFSET_HOURS: parseInt(process.env.TZ_OFFSET_HOURS || '8', 10),
};
