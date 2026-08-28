// 配置读取：统一从环境变量获取，缺失时给合理默认
import 'dotenv/config';

// 开发默认密钥（仅本地调试用；生产模式下使用它会被拒绝启动）
const DEV_FALLBACK_JWT_SECRET = 'ai-video-tool-dev-secret-change-me-please';

const isProduction = process.env.NODE_ENV === 'production';

const jwtSecretFromEnv = process.env.JWT_SECRET;
if (isProduction && (!jwtSecretFromEnv || jwtSecretFromEnv === DEV_FALLBACK_JWT_SECRET)) {
  // 伪造 JWT 可直接绕过管理后台登录，生产环境绝不允许默认密钥
  console.error('[FATAL] 生产环境必须通过环境变量 JWT_SECRET 注入强随机密钥（如 openssl rand -hex 32 生成），禁止使用默认值');
  process.exit(1);
}

export const isUsingFallbackJwtSecret = !process.env.JWT_SECRET;

// 生产持久化守卫：容器/PaaS 文件系统多为临时层，未通过 DB_PATH 指向持久卷时数据会随重启丢失
if (isProduction && !process.env.DB_PATH) {
  console.warn(
    '[WARN] 生产环境未设置 DB_PATH，SQLite 数据将写入容器本地路径（重启/重新部署会丢失）。' +
    '请在托管平台挂载持久卷，并将 DB_PATH 指向卷内路径（如 /data/ai-video-tool.db）',
  );
}

export const CONFIG = {
  // JWT 密钥（生产必须从环境变量注入强随机字符串，否则拒绝启动）
  JWT_SECRET: process.env.JWT_SECRET || DEV_FALLBACK_JWT_SECRET,
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
