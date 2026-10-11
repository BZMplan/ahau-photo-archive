import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { SubmissionForm } from "@/components/submit/submission-form";
export const metadata: Metadata = { title: "参与投稿" };
export default function SubmitPage() {
  return (
    <div className="py-12 sm:py-16">
      <Badge variant="outline">匿名投稿</Badge>
      <h1 className="mt-5 text-3xl font-medium tracking-tight">投稿校园影像</h1>
      <p className="text-muted-foreground mt-4 text-sm leading-7">
        欢迎分享你镜头中的校园。无论是四季风景、建筑细节，还是值得纪念的校园瞬间，都可以成为校园影像档案的一部分。
      </p>
      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_300px]">
        <section aria-label="投稿表单">
          <SubmissionForm />
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
