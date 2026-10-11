import type { Metadata } from "next";
import { Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
export const metadata: Metadata = { title: "参与投稿" };
export default function SubmitPage() {
  return (
    <div className="py-12 sm:py-16">
      <Badge variant="outline">投稿即将开放</Badge>
      <h1 className="mt-5 text-3xl font-medium tracking-tight">
        分享你眼中的校园
      </h1>
      <p className="text-muted-foreground mt-4 text-sm leading-7">
        无需注册，每一份校园记忆都值得被留存。
      </p>
      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_300px]">
        <section aria-label="投稿表单预览">
          <p
            id="submission-preview"
            className="bg-muted/40 mb-6 rounded-md border p-4 text-sm leading-6"
          >
            当前仅展示表单结构，暂不支持选择文件或提交。此页面不会保存任何信息。
          </p>
          <fieldset
            disabled
            aria-describedby="submission-preview"
            className="space-y-6"
          >
            <legend className="sr-only">投稿表单预览（尚未开放）</legend>
            <div className="text-muted-foreground flex min-h-44 flex-col items-center justify-center gap-3 rounded-lg border border-dashed">
              <Upload
                className="size-6"
                strokeWidth={1.25}
                aria-hidden="true"
              />
              <span className="text-sm">照片上传区 · 尚未开放</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">照片标题</Label>
              <Input id="title" placeholder="例如：秋日的校园小径" />
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="taken-at">拍摄日期（选填）</Label>
                <Input id="taken-at" type="date" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">校园地点（选填）</Label>
                <Input id="location" placeholder="建筑、道路或园区名称" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">影像说明（选填）</Label>
              <Textarea id="description" placeholder="记录照片背后的故事" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">标签（选填）</Label>
              <Input id="tags" placeholder="例如：建筑、秋天、校园生活" />
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="attribution">公开署名（选填）</Label>
                <Input id="attribution" placeholder="留空则为匿名投稿" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact">联系方式（选填，不公开）</Label>
                <Input id="contact" placeholder="供管理员联系使用" />
              </div>
            </div>
            <Button disabled type="button">
              提交照片 · 尚未开放
            </Button>
          </fieldset>
        </section>
        <aside className="space-y-8 text-sm">
          <div>
            <h2 className="font-medium">一起建立校园记忆</h2>
            <p className="text-muted-foreground mt-3 leading-7">
              校园建筑、自然风景、四季变化、日常生活与历史影像，都是我们希望收藏的内容。
            </p>
          </div>
          <div>
            <h2 className="font-medium">投稿须知</h2>
            <ul className="text-muted-foreground mt-3 space-y-3 leading-7">
              <li>请提供你有权分享的照片，并尊重画面中人物的隐私。</li>
              <li>照片经管理员审核后才会公开展示。</li>
              <li>原图用于档案留存，默认不公开；联系方式仅用于必要沟通。</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
