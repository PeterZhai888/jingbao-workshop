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
check('管理员 系统配置 GET 返回 200 + config + aiProvidersConfigured',
  cfgGet.status === 200 && cfgGet.json?.success && cfgGet.json?.config && cfgGet.json?.aiProvidersConfigured,
  `configKeys=${Object.keys(cfgGet.json?.config || {}).join(',')} providers=${Object.keys(cfgGet.json?.aiProvidersConfigured || {}).join(',')}`);

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

// ======== ③ 用户：AI 生成 扣次递增 ========
console.log('\n======== ③ AI 生成 扣次递增 (期望 dailyUsed 0→1→4) ========\n');

const sb1 = await http('POST', '/api/ai/storyboard', {
  token: userToken,
  body: { text: '周末在咖啡馆晒太阳看书的日常，背景音乐轻松治愈' },
});
check('storyboard 第1次 返回 200 + 5 shots + id',
  sb1.status === 200 && Array.isArray(sb1.json?.shots) && sb1.json.shots.length >= 3 && sb1.json?.id,
  `id=${sb1.json?.id} shots=${sb1.json?.shots?.length}`);
const histId1 = sb1.json.id;

const u1 = await http('GET', '/api/card/usage', { token: userToken });
check('storyboard 后 dailyUsed=1', u1.status === 200 && u1.json?.dailyUsed === 1,
  `dailyUsed=${u1.json?.dailyUsed}`);

const tt1 = await http('POST', '/api/ai/titles', { token: userToken, body: { text: '独居女生周末vlog', topic: '生活日常' } });
check('titles 第1次 返回 200 + 10 titles', tt1.status === 200 && Array.isArray(tt1.json?.titles) && tt1.json.titles.length >= 8,
  `titles=${tt1.json?.titles?.length}`);
const tt2 = await http('POST', '/api/ai/titles', { token: userToken, body: { text: '美食探店 成都火锅', topic: '美食' } });
check('titles 第2次 返回 200', tt2.status === 200, `titles=${tt2.json?.titles?.length}`);
const sb2 = await http('POST', '/api/ai/storyboard', { token: userToken, body: { text: '下班回家煮一碗面的治愈时刻' } });
check('storyboard 第2次 返回 200', sb2.status === 200, `shots=${sb2.json?.shots?.length}`);

const u4 = await http('GET', '/api/card/usage', { token: userToken });
check('3 次 AI 生成后 dailyUsed=4 (累计 sb1+tt1+tt2+sb2)', u4.status === 200 && u4.json?.dailyUsed === 4,
  `dailyUsed=${u4.json?.dailyUsed} (期望 4)`);

const hist = await http('GET', '/api/history', { token: userToken });
check('/api/history 返回刚生成的记录 (>=4条)',
  hist.status === 200 && Array.isArray(hist.json?.items) && hist.json.items.length >= 4,
  `status=${hist.status} records=${hist.json?.items?.length || 'undefined'} body=${hist.text.slice(0,100)}`);

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
// 注意：前面已调 storyboard/titles 多次，这里再调几个直到第 6 次触发
let rateHit = false;
for (let i = 0; i < 10; i++) {
  const r = await http('POST', '/api/ai/storyboard', { token: userToken, body: { text: `限流测试内容 ${i}` } });
  if (r.status === 429) { rateHit = true; break; }
  if (r.status !== 200) break; // dailyUsed 超了时停
}
check('同一卡密 1 分钟内 >5 次 触发 429 请求过于频繁', rateHit, '循环10次寻找429');

// ======== ⑥ 日满：daily_limit=2 时 第三次返回 429 ========
console.log('\n======== ⑥ DAILY_LIMIT 满后 429 ========\n');
// 重置：先把测试卡密 usage_logs 今日记录清掉 (或更新 daily_limit = 2，再测第 3 次触发)
const resetDaily = spawnSync('node', ['-e', `
  const Database = require('better-sqlite3');
  const path = require('path');
  const db = new Database(path.resolve(process.cwd(), './data/ai-video-tool.db'));
  // 1) 先把 SP-TEST12345678 的 daily_limit 改为 2
  db.prepare("UPDATE cards SET daily_limit = 2 WHERE code = 'SP-TEST12345678'").run();
  // 2) 把今日的 usage_logs 中 success=1 的 AI 记录全部标为 0，这样计数就清零
  const today = new Date(Date.now() + 8*3600*1000).toISOString().slice(0,10);
  const upd = db.prepare("UPDATE usage_logs SET success = 0 WHERE card_id = (SELECT id FROM cards WHERE code='SP-TEST12345678') AND success=1 AND action IN ('storyboard','titles') AND substr(created_at,1,10) = ?").run(today);
  const c = db.prepare("SELECT daily_limit FROM cards WHERE code='SP-TEST12345678'").get();
  console.log('UPDATED success=0 rows:', upd.changes, 'daily_limit now:', c.daily_limit, 'todayKey:', today);
  // 3) 另外 清空近60秒日志，避免和⑤限流叠加
  db.prepare("DELETE FROM usage_logs WHERE card_id = (SELECT id FROM cards WHERE code='SP-TEST12345678') AND created_at >= datetime('now','-60 seconds')").run();
`], { cwd: '/workspace', encoding: 'utf8' });
console.log(resetDaily.stdout);

// 额外验证：先查 dailyUsed 应该为 0
const usageBeforeLim = await http('GET', '/api/card/usage', { token: userToken });
console.log('  [日满前置] usage:', usageBeforeLim.status, usageBeforeLim.text.slice(0, 100));

const lim1 = await http('POST', '/api/ai/storyboard', { token: userToken, body: { text: '日满测试1 周末散步' } });
check('日满测试1: 第1次 AI 生成返回 200 (剩余 2 次)', lim1.status === 200, `status=${lim1.status} body=${lim1.text.slice(0,60)}`);
const lim2 = await http('POST', '/api/ai/titles', { token: userToken, body: { topic: '日满测试2 独居日常' } });
check('日满测试2: 第2次 AI 生成返回 200 (剩余 1 次)', lim2.status === 200, `status=${lim2.status} body=${lim2.text.slice(0,60)}`);
const uAfter2 = await http('GET', '/api/card/usage', { token: userToken });
console.log('  [日满2次后] usage:', uAfter2.status, uAfter2.text.slice(0, 80));
const lim3 = await http('POST', '/api/ai/storyboard', { token: userToken, body: { text: '日满测试3 应当被拦 今日次数已满' } });
check('日满测试3: 第3次 返回 429 今日次数已用完', lim3.status === 429 && /次数|DAILY_LIMIT/.test(lim3.json?.error || lim3.text || ''),
  `status=${lim3.status} body=${lim3.text.slice(0, 80)}`);

// ======== 结果汇总 ========
console.log('\n======== E2E 测试汇总 =========\n');
console.log(`通过: ${pass.length}/${step}`);
console.log(`失败: ${fail.length}/${step}`);
if (fail.length) console.log('  FAIL: ' + fail.join(' | '));
console.log('\n');
process.exit(fail.length ? 1 : 0);
