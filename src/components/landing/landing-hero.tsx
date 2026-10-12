import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

export function LandingHero() {
  return (
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-index" aria-hidden="true">
        <span>CAMPUS / MEMORY / PHOTOGRAPHY</span>
        <span>合肥 · 安徽</span>
      </div>
      <div className="landing-content">
        <p className="landing-school">安徽农业大学影像档案馆</p>
        <h1 id="landing-title" className="landing-title">
          <span className="landing-acronym">AHAU</span>
          <span>Photo Archive</span>
        </h1>
        <div className="landing-intro">
          <p className="text-muted-foreground text-sm leading-8">
            <span className="text-foreground">记录校园的四季与时光。</span>
            <br />
            用影像留存安徽农业大学的风景、建筑、生活与记忆。
          </p>
          <div className="landing-actions">
            <Link href="/archive" prefetch={false} className="landing-primary">
              浏览影像档案{" "}
              <ArrowRight
                aria-hidden="true"
                className="size-5"
                strokeWidth={1.5}
              />
            </Link>
            <Link href="/submit" prefetch={false} className="landing-secondary">
              分享校园影像{" "}
              <ArrowUpRight
                aria-hidden="true"
                className="size-4"
                strokeWidth={1.5}
              />
            </Link>
          </div>
        </div>
      </div>
      <div className="landing-colophon">
        <p>Anhui Agricultural University</p>
        <span aria-hidden="true">一座校园，一份共同的记忆。</span>
      </div>
    </section>
  );
}
