import React from "react";
import {
  Activity,
  BarChart2,
  Bell,
  Bookmark,
  Brain,
  GraduationCap,
  Newspaper,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import PublicFooter from "../components/PublicFooter";
import PublicNavbar from "../components/PublicNavbar";

const offerings = [
  {
    title: "Live Market Data",
    description: "Explore provider-supplied market observations. Availability and freshness depend on the configured feed.",
    icon: Activity,
  },
  {
    title: "Stock Screener",
    description: "A workspace for discovering stocks; available screening data depends on provider coverage and access.",
    icon: BarChart2,
  },
  {
    title: "My Watchlist",
    description: "Organize and revisit stocks saved to your account.",
    icon: Bookmark,
  },
  {
    title: "Portfolio Tracking",
    description: "Review saved portfolios, holdings, and market values when provider snapshots are available.",
    icon: Wallet,
  },
  {
    title: "Paper Trading",
    description: "Explore simulated trading workflows without placing orders in the live market.",
    icon: TrendingUp,
  },
  {
    title: "Price Alerts",
    description: "A dedicated feature area for following price levels and market changes.",
    icon: Bell,
  },
  {
    title: "Market News",
    description: "Read filtered market headlines with publisher links and timestamps.",
    icon: Newspaper,
  },
  {
    title: "AI-Powered Stock Insights",
    description: "Review AI-generated explanations based on available provider data—not guaranteed predictions.",
    icon: Brain,
  },
];

function SectionHeading({ id, eyebrow, title, description }) {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#D6AD62]">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-2xl font-bold tracking-tight text-[#F1F3F0] sm:text-3xl">{title}</h2>
      {description && <p className="mt-3 leading-7 text-[#929B93]">{description}</p>}
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#101310] text-[#F1F3F0]">
      <PublicNavbar />
      <main>
        <section className="relative overflow-hidden border-b border-[#303A32] bg-[#151915] px-6 py-16 sm:py-20 lg:px-12">
          <div className="pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full bg-[#20C982]/10 blur-3xl" />
          <div className="relative mx-auto max-w-6xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#20C982]/25 bg-[#20C982]/10 px-3 py-1 text-sm text-[#20C982]">
              <Sparkles size={16} aria-hidden="true" />
              Market information, made clearer
            </p>
            <h1 className="mt-6 max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              About <span className="text-[#20C982]">MarketMind AI</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#B8C0B9]">
              MarketMind AI is an AI-powered stock market platform designed to help people explore market information,
              track stocks, and understand market trends—with clear context about the data behind each insight.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/register"
                className="rounded-md bg-[#20C982] px-5 py-3 font-semibold text-[#101310] transition hover:bg-[#1A9E70]"
              >
                Get started
              </Link>
              <Link
                to="/features"
                className="rounded-md border border-[#455148] px-5 py-3 font-semibold text-[#F1F3F0] transition hover:border-[#20C982]"
              >
                Explore the platform
              </Link>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-6xl space-y-16 px-6 py-16 lg:px-12">
          <section aria-labelledby="about-platform">
            <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-center">
              <div>
                <SectionHeading
                  id="about-platform"
                  eyebrow="01 · About MarketMind AI"
                  title="A clearer way to explore the market"
                  description="MarketMind AI brings market observations, saved watchlists, portfolio information, news, and AI-generated analysis into one platform. Its purpose is to make the available information easier to navigate—not to promise outcomes or replace independent research."
                />
              </div>
              <div className="rounded-2xl border border-[#303A32] bg-[#151915] p-6 sm:p-8">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Explore", Activity],
                    ["Track", Bookmark],
                    ["Understand", Brain],
                    ["Learn", GraduationCap],
                  ].map(([label, Icon]) => (
                    <div key={label} className="rounded-xl border border-[#303A32] bg-[#1C231E] p-4">
                      <Icon size={20} className="text-[#20C982]" aria-hidden="true" />
                      <p className="mt-3 text-sm font-medium text-[#F1F3F0]">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="our-mission">
            <SectionHeading
              id="our-mission"
              eyebrow="Our mission"
              title="Make market information easier to use"
              description="Our goal is to make stock-market information easier to access, understand, and analyze. We bring data and tools together, explain where information comes from, and make uncertainty visible when provider coverage is limited."
            />
            <div className="mt-6 flex items-start gap-4 rounded-xl border border-[#D6AD62]/20 bg-[#D6AD62]/[0.06] p-5 sm:p-6">
              <Target className="mt-1 shrink-0 text-[#D6AD62]" size={22} aria-hidden="true" />
              <p className="leading-7 text-[#B8C0B9]">
                Useful market analysis starts with knowing what the data says—and what it does not say.
              </p>
            </div>
          </section>

          <section aria-labelledby="what-we-offer">
            <SectionHeading
              id="what-we-offer"
              eyebrow="What we offer"
              title="Tools for your market workflow"
              description="MarketMind AI brings together these feature areas. Specific data and feature availability depend on current provider access and application configuration."
            />
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {offerings.map(({ title, description, icon: Icon }) => (
                <article
                  key={title}
                  className="rounded-xl border border-[#303A32] bg-[#151915] p-5 transition hover:-translate-y-0.5 hover:border-[#20C982]/50"
                >
                  <div className="inline-flex rounded-lg bg-[#20C982]/10 p-2.5 text-[#20C982]">
                    <Icon size={21} aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 font-semibold text-[#F1F3F0]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#929B93]">{description}</p>
                </article>
              ))}
            </div>
          </section>

        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
