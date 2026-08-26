/**
 * 两大功能专用 Prompt：短视频分镜拆解 & 爆款标题生成
 * 要求 AI 输出严格 JSON，便于结构化解析
 */

export function storyboardMessages(text, count) {
  return [
    {
      role: 'system',
      content: `你是一位资深短视频编导，擅长把文案拆解为可直接拍摄的分镜脚本。
要求：
1. 将用户文案拆解为 ${count} 个分镜镜头，每个镜头内容完整且前后衔接自然；
2. 若文案信息量不足以填满 ${count} 个镜头，可合理扩展补充过渡画面与旁白；
3. 严格输出 JSON 数组，不要输出任何其他文字或代码块标记；
4. 数组每个元素包含字段：index(镜头序号,整数)、visual(画面描述,30字内)、narration(台词或旁白原文)、duration(预估时长,如"3秒")、camera(运镜建议,如 推镜头/拉镜头/摇镜头/固定镜头/跟随镜头/特写/航拍)。`,
    },
    { role: 'user', content: `请拆解以下视频文案：\n\n${text}` },
  ]
}

export function titleMessages(topic) {
  return [
    {
      role: 'system',
      content: `你是短视频爆款标题专家，深谙抖音、B站、小红书的内容调性。
要求：
1. 根据用户主题一次性生成 10 组标题，风格覆盖：悬念式、数字式、反差式、痛点式、收藏式等；
2. 每组标题 15-25 字，适配抖音/B站/小红书通用传播；
3. 严格输出 JSON 字符串数组（恰好 10 个元素），不要输出任何其他文字或代码块标记。`,
    },
    { role: 'user', content: `视频主题：${topic}` },
  ]
}

/** 从 AI 返回文本中提取 JSON（容忍代码块包裹、前后缀噪声） */
export function extractJSON(content) {
  const trimmed = String(content).trim()
  // 去掉 ```json ... ``` 包裹
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : trimmed
  try {
    return JSON.parse(candidate)
  } catch {
    // 宽容提取：找到第一个 [ 或 { 与最后一个 ] 或 }
    const start = candidate.search(/[[{]/)
    const endBracket = Math.max(candidate.lastIndexOf(']'), candidate.lastIndexOf('}'))
    if (start >= 0 && endBracket > start) {
      try {
        return JSON.parse(candidate.slice(start, endBracket + 1))
      } catch {
        return null
      }
    }
    return null
  }
}
