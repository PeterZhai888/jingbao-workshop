import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin, withRenewHeader } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { autoExpire } from '@/lib/server/card-service';
import { todayStartKey, tzModifier } from '@/lib/server/card-utils';

interface TrendPoint {
  day: string;
  count: number;
  cost: number;
}

interface TierSlice {
  cost: number;
  count: number;
}

interface RemarkStat {
  remark: string;
  total: number;
  unused: number;
  active: number;
  frozen: number;
  revoked: number;
  expired: number;
}

// GET 运营统计：今日生成量、7天趋势、档位消耗占比、卡密渠道/批次（按备注）分组
export async function GET(request: NextRequest) {
  const auth = authenticateAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
  }
  autoExpire();

  // ---- 通用条件：成功的 AI 生成记录 ----
  const genWhere = `success = 1 AND action IN ('titles', 'storyboard')`;

  // ---- 今日生成量（次数 + 加权消耗）----
  const todayKey = todayStartKey();
  const todayRows = db
    .prepare(`SELECT detail FROM usage_logs WHERE ${genWhere} AND strftime('%Y-%m-%d', created_at, ?) = ?`)
    .all(tzModifier(), todayKey) as Array<{ detail: string | null }>;
  let todayCost = 0;
  for (const r of todayRows) {
    let cost = 1;
    if (r.detail) {
      try {
        const d = JSON.parse(r.detail) as { cost?: number };
        if (typeof d.cost === 'number' && d.cost > 0) cost = d.cost;
      } catch { /* 非 JSON detail 按 1 次 */ }
    }
    todayCost += cost;
  }

  // ---- 近 7 天趋势（含今日，缺数据补 0）----
  const dayKeys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    dayKeys.push(todayStartKey(new Date(Date.now() - i * 24 * 3600 * 1000)));
  }
  const placeholders = dayKeys.map(() => '?').join(',');
  const trendRows = db
    .prepare(`SELECT detail, strftime('%Y-%m-%d', created_at, ?) AS day FROM usage_logs WHERE ${genWhere} AND strftime('%Y-%m-%d', created_at, ?) IN (${placeholders})`)
    .all(tzModifier(), tzModifier(), ...dayKeys) as Array<{ detail: string | null; day: string }>;
  const trendMap = new Map<string, TrendPoint>(dayKeys.map((d) => [d, { day: d, count: 0, cost: 0 }]));
  for (const r of trendRows) {
    let cost = 1;
    if (r.detail) {
      try {
        const d = JSON.parse(r.detail) as { cost?: number };
        if (typeof d.cost === 'number' && d.cost > 0) cost = d.cost;
      } catch { /* 非 JSON detail 按 1 次 */ }
    }
    const point = trendMap.get(r.day);
    if (point) {
      point.count += 1;
      point.cost += cost;
    }
  }
  const trend7d = dayKeys.map((d) => trendMap.get(d)!);

  // ---- 档位消耗占比（近 7 天，按单次消耗次数分桶）----
  const tierCounter = new Map<number, number>();
  for (const r of trendRows) {
    let cost = 1;
    if (r.detail) {
      try {
        const d = JSON.parse(r.detail) as { cost?: number };
        if (typeof d.cost === 'number' && d.cost > 0) cost = d.cost;
      } catch { /* 非 JSON detail 按 1 次 */ }
    }
    tierCounter.set(cost, (tierCounter.get(cost) || 0) + 1);
  }
  const tierRatio: TierSlice[] = Array.from(tierCounter.entries())
    .map(([cost, count]) => ({ cost, count }))
    .sort((a, b) => a.cost - b.cost);

  // ---- 卡密渠道/批次统计（按备注分组；无备注的归为“未填写”）----
  const remarkRows = db
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(remark), ''), '未填写') AS remark,
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'unused' THEN 1 ELSE 0 END) AS unused,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
              SUM(CASE WHEN status = 'frozen' THEN 1 ELSE 0 END) AS frozen,
              SUM(CASE WHEN status = 'revoked' THEN 1 ELSE 0 END) AS revoked,
              SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired
       FROM cards
       GROUP BY remark
       ORDER BY total DESC`,
    )
    .all() as Array<Omit<RemarkStat, 'total' | 'unused' | 'active' | 'frozen' | 'revoked' | 'expired'> & Record<string, number | string>>;
  const remarkStats: RemarkStat[] = remarkRows.map((r) => ({
    remark: String(r.remark),
    total: Number(r.total),
    unused: Number(r.unused),
    active: Number(r.active),
    frozen: Number(r.frozen),
    revoked: Number(r.revoked),
    expired: Number(r.expired),
  }));

  // ---- 总量 ----
  const cardsTotal = (db.prepare('SELECT COUNT(*) AS c FROM cards').get() as { c: number }).c;
  const logsTotal = (db.prepare('SELECT COUNT(*) AS c FROM usage_logs').get() as { c: number }).c;
  const activeCards = (
    db.prepare(`SELECT COUNT(*) AS c FROM cards WHERE status = 'active'`).get() as { c: number }
  ).c;

  return withRenewHeader(
    NextResponse.json({
      success: true,
      cardsTotal,
      activeCards,
      logsTotal,
      todayGen: todayRows.length,
      todayCost,
      trend7d,
      tierRatio,
      remarkStats,
    }),
    auth,
  );
}

// 导出类型供前端使用（编译期消除）
export type StatsResponse = {
  cardsTotal: number;
  activeCards: number;
  logsTotal: number;
  todayGen: number;
  todayCost: number;
  trend7d: TrendPoint[];
  tierRatio: TierSlice[];
  remarkStats: RemarkStat[];
};
