// 敏感配置加密存储（AES-256-GCM）
// 主密钥来自环境变量 CONFIG_ENCRYPTION_KEY（64 位 hex = 32 字节）：
//   openssl rand -hex 32
// 未配置或格式非法时自动降级为明文存储（保持向后兼容），生产建议配置。

import crypto from 'node:crypto';

const ENC_PREFIX = 'enc:v1:';

function masterKey(): Buffer | null {
  const raw = process.env.CONFIG_ENCRYPTION_KEY;
  if (!raw || !/^[0-9a-fA-F]{64}$/.test(raw)) return null;
  return Buffer.from(raw, 'hex');
}

/** 加密功能是否可用（主密钥已正确配置） */
export function isEncryptionEnabled(): boolean {
  return masterKey() !== null;
}

/**
 * 加密明文（返回 enc:v1:iv:tag:ciphertext 的 base64 组合）
 * 未配置主密钥时原样返回明文（降级），调用方需通过 isEncryptionEnabled 提示状态
 */
export function encryptSecret(plain: string): string {
  const key = masterKey();
  if (!key) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

/**
 * 解密存储值：
 * - 非 enc: 前缀 → 视为历史明文数据，原样返回（向后兼容）
 * - enc: 前缀但主密钥缺失/不匹配 → 返回空串（视为未配置该密钥，避免异常中断服务）
 */
export function decryptSecret(value: string): string {
  if (!value || !value.startsWith(ENC_PREFIX)) return value;
  const key = masterKey();
  if (!key) return '';
  try {
    const parts = value.slice(ENC_PREFIX.length).split(':');
    if (parts.length !== 3) return '';
    const [ivB64, tagB64, dataB64] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // GCM 校验失败（密钥错误或数据被篡改）
    return '';
  }
}
