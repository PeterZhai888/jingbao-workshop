'use client';

import { useEffect, useState } from 'react';
import { useCardAuth } from '@/lib/card-auth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';

export type FeedbackType = 'bug' | 'feature' | 'question' | 'other';

/** 错误入口自动附带的失败上下文（工具名/模型/错误信息等），随反馈一起提交，便于排查 */
export type FeedbackContext = {
  tool?: string;
  model?: string;
  error?: string;
  [key: string]: unknown;
};

const TYPE_OPTIONS: Array<{ value: FeedbackType; label: string; hint: string }> = [
  { value: 'bug', label: '问题反馈', hint: '功能异常、生成失败等' },
  { value: 'feature', label: '功能建议', hint: '想要的新功能或改进' },
  { value: 'question', label: '使用咨询', hint: '不知道怎么用' },
  { value: 'other', label: '其他', hint: '随便聊聊' },
];

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 入口预设的反馈类型（如错误提示入口默认 bug） */
  presetType?: FeedbackType;
  /** 错误入口自动附带的上下文 */
  presetContext?: FeedbackContext;
}

export function FeedbackDialog({ open, onOpenChange, presetType, presetContext }: FeedbackDialogProps) {
  const { session } = useCardAuth();
  const [type, setType] = useState<FeedbackType>(presetType || 'bug');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 每次打开时重置并应用入口预设
  useEffect(() => {
    if (open) {
      setType(presetType || 'bug');
      setContent('');
      setContact('');
    }
  }, [open, presetType]);

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (trimmed.length < 5) {
      toast.error('反馈内容至少 5 个字');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({ type, content: trimmed, contact: contact.trim() || undefined, context: presetContext }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || '提交失败，请稍后再试');
        return;
      }
      toast.success('反馈已提交，感谢你的意见！');
      onOpenChange(false);
    } catch {
      toast.error('网络错误，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>意见反馈</DialogTitle>
          <DialogDescription>遇到问题或有好想法都欢迎告诉我们</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* 类型选择 */}
          <div className="grid grid-cols-4 gap-1.5">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                title={opt.hint}
                onClick={() => setType(opt.value)}
                className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                  type === opt.value
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-white text-muted-foreground hover:border-primary/40 hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 自动附带的错误上下文提示 */}
          {presetContext && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              将自动附带本次操作信息（{[presetContext.tool, presetContext.model].filter(Boolean).join(' · ')}），方便我们排查问题
            </div>
          )}

          {/* 反馈内容 */}
          <div className="space-y-2">
            <Textarea
              placeholder={type === 'bug' ? '遇到了什么问题？最好描述一下操作步骤和报错提示…' : '说说你的想法或需求…'}
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, 500))}
              className="min-h-[100px] resize-y text-sm"
              autoFocus
            />
            <div className="text-right text-xs text-muted-foreground">
              <span className={content.length > 480 ? 'text-destructive font-medium' : ''}>{content.length}/500</span>
            </div>
          </div>

          {/* 联系方式（可选） */}
          <div className="space-y-1.5">
            <Input
              placeholder="联系方式（选填，方便我们回访，如微信/QQ/邮箱）"
              value={contact}
              maxLength={100}
              onChange={(e) => setContact(e.target.value)}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            提交反馈
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
