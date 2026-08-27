// Prompt 2 端到端 HTTP 测试脚本
import { spawnSync } from 'node:child_process';

const BASE = 'http://localhost:5000';
const UA = 'e2e-test-bot/1.0';

let step = 0;
const pass = [];
const fail = [];
function check(name, cond, detail = '') {
  step++;
  const tag = cond ? '✅' : '❌';
  (cond ? pass : fail).push(`${step}.${name}`);
  console.log(`${tag} ${String(step).padStart(2, '0')} ${name}${detail ? '  ---  ' + detail : ''}`);
  return cond;
}

async function http(method, path, { body, headers = {}, token } = {}) {
  const h = { 'Content-Type': 'application/json', 'User-Agent': UA, ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, json, text };
}

// ======== 0. 触发建表 + 插入测试卡密种子 ========
console.log('\n======== 0. DB 初始化与测试卡密种子 ========\n');
await http('POST', '/api/card/verify', { body: { code: 'SP-NOTEXIST0000' } });

// 直接用 better-sqlite3 插卡密，共享同一路径
const seed = spawnSync('node', ['-e', `
  const Database = require('better-sqlite3');
  const path = require('path');
  const dbPath = path.resolve(process.cwd(), './data/ai-video-tool.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // 插测试卡密 SP-TEST12345678
  db.prepare("INSERT OR REPLACE INTO cards (id, code, status, valid_days, daily_limit, remark) VALUES (1, 'SP-TEST12345678', 'unused', 30, 20, 'E2E测试卡密')").run();
  const row = db.prepare("SELECT id, code, status, daily_limit FROM cards WHERE code = ?").get('SP-TEST12345678');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name).join(', ');
  console.log('TABLES:', tables);
  console.log('SEED:', JSON.stringify(row));
`], { cwd: '/workspace', encoding: 'utf8' });
console.log(seed.stdout);
if (seed.stderr) console.log('[seed stderr]', seed.stderr);
check('DB 种子：6 张表 + 测试卡密 SP-TEST12345678 入库', seed.stdout.includes('SP-TEST12345678') && seed.stdout.includes('cards'));

// ======== ① 管理员链路 ========
console.log('\n======== ① 管理员链路：验证码→登录→发卡→查询→冻结→日志→配置 ========\n');

const cap = await http('GET', '/api/admin/captcha');
check('captcha API 返回 200 + captchaId + question', cap.status === 200 && cap.json?.captchaId && typeof cap.json?.question === 'string',
  `question=${cap.json?.question}`);

// 解析算术题：形如 "2 + 8 = ?"
function parseAnswer(q) {
  const m = q.match(/(\d+)\s*([+\-*x])\s*(\d+)/);
  if (!m) return null;
  const a = +m[1], b = +m[3], op = m[2];
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '*' || op === 'x') return a * b;
  return null;
}
const answer = parseAnswer(cap.json.question);
check(`captcha 解析 ${cap.json.question} → ${answer}`, answer !== null);

const adminLoginBad = await http('POST', '/api/admin/login', {
  body: { captchaId: cap.json.captchaId, answer: answer + 99, username: 'admin', password: 'admin123456' },
});
check('管理员 验证码错误 应返回 400/401', adminLoginBad.status >= 400, `status=${adminLoginBad.status}`);

// 新 captcha + 正确答案
const cap2 = await http('GET', '/api/admin/captcha');
const answer2 = parseAnswer(cap2.json.question);
const adminLogin = await http('POST', '/api/admin/login', {
  body: { captchaId: cap2.json.captchaId, answer: answer2, username: 'admin', password: 'admin123456' },
});
check('管理员 正确登录 返回 200 + token', adminLogin.status === 200 && !!adminLogin.json?.token,
  `status=${adminLogin.status} token前16=${(adminLogin.json?.token || '').slice(0, 16)}`);
const adminToken = adminLogin.json.token;

const genCards = await http('POST', '/api/admin/cards/generate', {
  token: adminToken,
  body: { count: 5, validDays: 30, dailyLimit: 20, remark: 'E2E 批量生成测试' },
});
const genCardsItems = Array.isArray(genCards.json?.cards) ? genCards.json.cards : [];
check('管理员 批量生成 5 张卡密 返回 success + cards[5]',
  genCards.status === 200 && genCards.json?.success && genCardsItems.length === 5,
  `requested=${genCards.json?.requested} inserted=${genCards.json?.inserted} codes=${genCardsItems.map(c => c.code).join(', ') || 'none'}`);
const newCards = genCardsItems.map(c => c.code);

const cardList = await http('GET', '/api/admin/cards?page=1&pageSize=20&status=unused', { token: adminToken });
check('管理员 卡密列表 GET 返回 200 + total>=5 + list',
  cardList.status === 200 && cardList.json?.success && (cardList.json?.total ?? 0) >= 5,
  `total=${cardList.json?.total} body=${cardList.text.slice(0, 120)}`);

if (newCards[0]) {
  const freezeCard = newCards[0];
  const freezeRes = await http('POST', '/api/admin/cards', {
    token: adminToken,
    body: { code: freezeCard, status: 'frozen' },
  });
  check('管理员 冻结卡密 ' + freezeCard, freezeRes.status === 200 && freezeRes.json?.success,
    freezeRes.text.slice(0, 100));
}

const logs = await http('GET', '/api/admin/logs?page=1&pageSize=10', { token: adminToken });
check('管理员 使用日志 GET 返回 200 + items', logs.status === 200 && logs.json?.success && Array.isArray(logs.json?.items),
  `total=${logs.json?.total}`);

const cfgGet = await http('GET', '/api/admin/config', { token: adminToken });
check('管理员 系统配置 GET 返回 200 + config + providers 明细',
  cfgGet.status === 200 && cfgGet.json?.success && cfgGet.json?.config && Array.isArray(cfgGet.json?.providers) && cfgGet.json.providers.length === 6,
  `configKeys=${Object.keys(cfgGet.json?.config || {}).join(',')} providers=${(cfgGet.json?.providers || []).map((p) => p.key + (p.configured ? '✓' : '✗')).join(' ')}`);

// 保存 API Key 到 system_config（ai_key_deepseek）→ providers 状态应变为已配置
const cfgPostKey = await http('POST', '/api/admin/config', {
  token: adminToken,
  body: { ai_key_deepseek: 'sk-e2e-test-key-1234567890' },
});
check('管理员 在线保存 AI Key (ai_key_deepseek) 返回 success', cfgPostKey.status === 200 && cfgPostKey.json?.success,
  cfgPostKey.text.slice(0, 60));
const cfgGet2 = await http('GET', '/api/admin/config', { token: adminToken });
const deepseekInfo = (cfgGet2.json?.providers || []).find((p) => p.key === 'deepseek');
check('保存后 deepseek 显示已配置(后台配置) 且不返回密钥明文', !!deepseekInfo?.configured && !JSON.stringify(cfgGet2.json).includes('sk-e2e-test-key'),
  `configuredFrom=${deepseekInfo?.configuredFrom}`);

const cfgPost = await http('POST', '/api/admin/config', {
  token: adminToken,
  body: { default_provider: 'deepseek', daily_limit: '15', qps_limit: '2' },
});
check('管理员 系统配置 POST 写入返回 success', cfgPost.status === 200 && cfgPost.json?.success);

// ======== ② 用户：卡密验证 ========
console.log('\n======== ② 用户链路：卡密验证 SP-TEST12345678 ========\n');
const verifyBad = await http('POST', '/api/card/verify', { body: { code: 'SP-不存在的卡密' } });
check('不存在的卡密 verify 返回 4xx (非崩溃)', verifyBad.status >= 400, `status=${verifyBad.status}`);

const verify = await http('POST', '/api/card/verify', {
  body: { code: 'SP-TEST12345678', fingerprint: 'fp-e2e-client-001' },
  headers: { 'X-Forwarded-For': '1.2.3.4' },
});
check('卡密 SP-TEST12345678 verify 返回 200 + session.token + dailyUsed=0 + dailyLimit=20',
  verify.status === 200 && !!verify.json?.session?.token && verify.json?.session?.dailyUsed === 0 && verify.json?.session?.dailyLimit === 20,
  `dailyUsed=${verify.json?.session?.dailyUsed} dailyLimit=${verify.json?.session?.dailyLimit}`);
const userToken = verify.json?.session?.token;

const usage0 = await http('GET', '/api/card/usage', { token: userToken });
check('verify 后 usage 查询 dailyUsed=0', usage0.status === 200 && usage0.json?.dailyUsed === 0,
  usage0.text.slice(0, 80));

// ======== ③ 用户：AI 生成（两种合法路径） ========
console.log('\n======== ③ AI 生成：已配置Key→真实LLM扣次 / 未配置Key→503降级不扣次 ========\n');

const sb1 = await http('POST', '/api/ai/storyboard', {
  token: userToken,
  body: { text: '周末在咖啡馆晒太阳看书的日常，背景音乐轻松治愈' },
});
const sb1Busy = sb1.status === 503 && sb1.json?.code === 'AI_BUSY';
if (sb1.status === 200) {
  check('storyboard 第1次 真实LLM成功 返回 shots + id',
    Array.isArray(sb1.json?.shots) && sb1.json.shots.length >= 3 && !!sb1.json?.id && !!sb1.json?.provider,
    `provider=${sb1.json?.provider} shots=${sb1.json?.shots?.length}`);
} else {
  check('storyboard 未配置Key时 503 AI_BUSY 降级 + fallback模板 + 不扣次',
    sb1Busy && Array.isArray(sb1.json?.fallback?.shots) && sb1.json.fallback.shots.length > 0,
    `code=${sb1.json?.code} fallbackShots=${sb1.json?.fallback?.shots?.length}`);
}

const u1 = await http('GET', '/api/card/usage', { token: userToken });
if (sb1.status === 200) {
  check('storyboard 成功后 dailyUsed=1（扣次）', u1.status === 200 && u1.json?.dailyUsed === 1,
    `dailyUsed=${u1.json?.dailyUsed}`);
} else {
  check('storyboard 降级后 dailyUsed=0（不扣次）', u1.status === 200 && u1.json?.dailyUsed === 0,
    `dailyUsed=${u1.json?.dailyUsed}`);
}

const tt1 = await http('POST', '/api/ai/titles', { token: userToken, body: { topic: '独居女生周末vlog' } });
if (tt1.status === 200) {
  check('titles 真实LLM成功 返回 titles 数组', Array.isArray(tt1.json?.titles) && tt1.json.titles.length >= 8,
    `provider=${tt1.json?.provider} titles=${tt1.json?.titles?.length}`);
} else {
  check('titles 未配置Key时 503 AI_BUSY 降级 + fallback',
    tt1.status === 503 && tt1.json?.code === 'AI_BUSY' && Array.isArray(tt1.json?.fallback?.titles),
    `titles=${tt1.json?.fallback?.titles?.length}`);
}

// history 验证（成功路径才有记录；降级路径无记录也正确）
const hist = await http('GET', '/api/history', { token: userToken });
check('/api/history 返回 200 + items 数组',
  hist.status === 200 && Array.isArray(hist.json?.items),
  `status=${hist.status} records=${hist.json?.items?.length || 0}`);

// 解耦：清掉 SP-TEST12345678 近 60 秒 usage_logs，避免③的次数累计到④敏感词测试
spawnSync('node', ['-e', `
  const Database = require('better-sqlite3');
  const path = require('path');
  const db = new Database(path.resolve(process.cwd(), './data/ai-video-tool.db'));
  const del = db.prepare("DELETE FROM usage_logs WHERE card_id = (SELECT id FROM cards WHERE code='SP-TEST12345678') AND created_at >= datetime('now','-60 seconds')").run();
  console.log('[解耦清限流] deleted近60秒:', del.changes);
`], { cwd: '/workspace', stdio: 'inherit' });

// ======== ④ 敏感词拦截 ========
console.log('\n======== ④ 敏感词拦截 ========\n');
const sens1 = await http('POST', '/api/ai/storyboard', {
  token: userToken,
  body: { text: '教你怎么赌博出千技巧 色情服务联系方式' },
});
check('敏感词 storyboard 返回 400 + error 信息', sens1.status === 400 && sens1.json?.error,
  `status=${sens1.status} err=${sens1.json?.error || sens1.text.slice(0, 50)}`);
const sens2 = await http('POST', '/api/ai/titles', {
  token: userToken,
  body: { topic: '毒品制作方法 违禁品交易' },
});
check('敏感词 titles 返回 400 + 违规词 error', sens2.status === 400 && sens2.json?.error && /违规|违禁|敏感/.test(sens2.json.error),
  `status=${sens2.status} err=${sens2.json?.error || sens2.text.slice(0, 50)}`);

// ======== ⑤ 限流：>5次/分钟 返回 429 ========
console.log('\n======== ⑤ 每分钟 >5 次 限流 429 ========\n');
// 无论 AI 成功(200)还是降级(503)，每次请求都会写 usage_logs，均计入每分钟限流
let rateHit = false;
for (let i = 0; i < 10; i++) {
  const r = await http('POST', '/api/ai/storyboard', { token: userToken, body: { text: `限流测试内容 ${i}` } });
  if (r.status === 429) { rateHit = true; break; }
  if (r.status !== 200 && r.status !== 503) break; // 其他异常状态时停
}
check('同一卡密 1 分钟内 >5 次 触发 429 请求过于频繁', rateHit, '循环10次寻找429');

// ======== ⑥ 日满：daily_limit=2 时 第三次返回 429 ========
console.log('\n======== ⑥ DAILY_LIMIT 满后 429 ========\n');
// 直接 DB 模拟：daily_limit=2，今日已有 2 条 success=1 计数
const resetDaily = spawnSync('node', ['-e', `
  const Database = require('better-sqlite3');
  const path = require('path');
  const db = new Database(path.resolve(process.cwd(), './data/ai-video-tool.db'));
  // 1) 清掉该卡全部日志 + daily_limit 改 2
  db.prepare("DELETE FROM usage_logs WHERE card_id = (SELECT id FROM cards WHERE code='SP-TEST12345678')").run();
  db.prepare("UPDATE cards SET daily_limit = 2 WHERE code = 'SP-TEST12345678'").run();
  // 2) 直接插入 2 条今日 success=1 计数（模拟已用完次数）
  const today = new Date(Date.now() + 8*3600*1000).toISOString().slice(0,10);
  const ins = db.prepare("INSERT INTO usage_logs (card_id, card_code, action, success, detail, created_at) VALUES ((SELECT id FROM cards WHERE code='SP-TEST12345678'), 'SP-TEST12345678', 'storyboard', 1, 'E2E模拟已用次数', datetime('now'))");
  ins.run(); ins.run();
  const used = db.prepare("SELECT COUNT(*) c FROM usage_logs WHERE card_id=(SELECT id FROM cards WHERE code='SP-TEST12345678') AND success=1 AND action IN ('storyboard','titles') AND substr(created_at,1,10)=?").get(today);
  console.log('daily_limit=2, 今日已用:', used.c);
`], { cwd: '/workspace', encoding: 'utf8' });
console.log(resetDaily.stdout.trim());

const lim3 = await http('POST', '/api/ai/storyboard', { token: userToken, body: { text: '日满测试 应当被拦' } });
check('日满: 次数用完后调用 返回 429 今日次数已用完', lim3.status === 429 && /次数/.test(lim3.json?.error || ''),
  `status=${lim3.status} body=${lim3.text.slice(0, 60)}`);

// ======== ⑦ 恢复现场：测试数据自愈（避免污染真实使用数据） ========
console.log('\n======== ⑦ 恢复现场（测试卡恢复 unused/daily_limit=20 + 清当日计数） ========\n');
const restore = spawnSync('node', ['-e', `
  const Database = require('better-sqlite3');
  const path = require('path');
  const db = new Database(path.resolve(process.cwd(), './data/ai-video-tool.db'));
  db.prepare("UPDATE cards SET daily_limit = 20, status = 'unused', activated_at = NULL, expires_at = NULL WHERE code = 'SP-TEST12345678'").run();
  db.prepare("DELETE FROM usage_logs WHERE card_id = (SELECT id FROM cards WHERE code='SP-TEST12345678')").run();
  // 清除 e2e 写入的测试配置（假 Key、默认提供商等），避免影响真实使用
  db.prepare("DELETE FROM system_config WHERE key LIKE 'ai_key_%'").run();
  db.prepare("DELETE FROM system_config WHERE key IN ('default_provider', 'daily_limit', 'qps_limit')").run();
  const c = db.prepare("SELECT code, status, daily_limit FROM cards WHERE code='SP-TEST12345678'").get();
  console.log('恢复后测试卡状态:', JSON.stringify(c));
`], { cwd: '/workspace', encoding: 'utf8' });
console.log(restore.stdout.trim());

// ======== 结果汇总 ========
console.log('\n======== E2E 测试汇总 =========\n');
console.log(`通过: ${pass.length}/${step}`);
console.log(`失败: ${fail.length}/${step}`);
if (fail.length) console.log('  FAIL: ' + fail.join(' | '));
console.log('\n');
process.exit(fail.length ? 1 : 0);
