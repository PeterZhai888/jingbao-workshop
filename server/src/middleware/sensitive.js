import { getSetting, log } from '../db.js'

/** 敏感词库：settings 表 sensitive_words，换行分隔 */

export function getSensitiveWords() {
  const raw = getSetting('sensitive_words', '')
  return raw
    .split(/\r?\n/)
    .map((w) => w.trim())
    .filter(Boolean)
}

function containsSensitive(text, words) {
  const lower = String(text).toLowerCase()
  return words.find((w) => lower.includes(w.toLowerCase()))
}

/**
 * 输入侧过滤：命中黑名单直接拒绝并记录日志。
 * 返回 { ok: true } 或 { ok: false, word, message }
 */
export function checkInput(text, req) {
  const words = getSensitiveWords()
  if (!words.length) return { ok: true }
  const hit = containsSensitive(text, words)
  if (hit) {
    log(req.card ?? null, 'sensitive_input_blocked', `命中敏感词：${hit}`, req)
    return { ok: false, word: hit, message: '输入内容包含违规词汇，请修改后重试' }
  }
  return { ok: true }
}

/** 输出侧拦截：AI 返回内容命中违规词时拦截 */
export function checkOutput(text, req) {
  const words = getSensitiveWords()
  if (!words.length) return { ok: true }
  const hit = containsSensitive(text, words)
  if (hit) {
    log(req.card ?? null, 'sensitive_output_blocked', `AI 输出命中敏感词：${hit}`, req)
    return { ok: false, word: hit, message: '生成内容未通过合规校验，请调整输入后重试' }
  }
  return { ok: true }
}
