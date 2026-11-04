
import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, ArrowUpRight, Activity, BrainCircuit, ChartNoAxesCombined,
  ShieldCheck, Search, Wallet, TrendingUp, Menu
} from "lucide-react";

const features = [
  {
    icon: BrainCircuit,
    title: "AI-Powered Insights",
    description: "Understand market movements with intelligent analysis and AI-generated insights."
  },
  {
    icon: Activity,
    title: "Market Intelligence",
    description: "Explore market trends, stock movements and important market information."
  },
  {
    icon: Search,
    title: "Smart Stock Screener",
    description: "Discover stocks using powerful filters and market indicators."
  },
  {
    icon: Wallet,
    title: "Portfolio Tracking",
    description: "Monitor your investments and understand your portfolio performance."
  },
  {
    icon: ShieldCheck,
    title: "Risk Management",
    description: "Make more informed decisions with risk analysis and useful indicators."
  },
  {
    icon: ChartNoAxesCombined,
    title: "Advanced Analytics",
    description: "Explore market charts, price trends and technical analysis."
  }
];

function HomePage() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#080B0A] text-white">
      {/* NAVBAR */}
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#080B0A]/90 backdrop-blur-xl">
        <nav className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#F2C76D] to-[#A87827] text-[#10130D]">
              <TrendingUp size={24} strokeWidth={2.7} />
            </div>
            <div>
              <p className="text-xl font-extrabold tracking-tight">
                MarketMind <span className="text-[#E7B94F]">AI</span>
              </p>
              <p className="text-[8px] tracking-[.22em] text-[#8D958B]">
                TRADE SMARTER. INVEST BETTER.
              </p>
            </div>
          </Link>

          <div className="hidden items-center gap-9 md:flex">
            <a href="#home" className="text-sm text-[#E7B94F]">Home</a>
            <a href="#about" className="text-sm text-gray-400 transition hover:text-white">About</a>
            <a href="#features" className="text-sm text-gray-400 transition hover:text-white">Features</a>
            <a href="#how-it-works" className="text-sm text-gray-400 transition hover:text-white">How It Works</a>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-lg border border-[#B78D3D]/60 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#B78D3D]/10"
            >
              Login
            </Link>
            <Link
              to="/register"
              className="rounded-lg bg-gradient-to-r from-[#F1C96F] to-[#C89437] px-4 py-2.5 text-sm font-bold text-[#17140D] shadow-lg shadow-[#D6A947]/10 transition hover:brightness-110"
            >
              Register <ArrowUpRight className="ml-1 inline" size={15} />
            </Link>
          </div>
        </nav>
      </header>

      {/* HERO */}
      <section id="home" className="relative">
        <div className="pointer-events-none absolute -left-40 top-10 h-96 w-96 rounded-full bg-[#B58B35]/10 blur-[130px]" />
        <div className="pointer-events-none absolute right-0 top-40 h-96 w-96 rounded-full bg-emerald-500/[0.08] blur-[130px]" />

        <div className="relative mx-auto grid max-w-[1440px] items-center gap-14 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:px-12 lg:py-28">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-2 text-xs font-semibold text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Intelligent Market Analysis
            </div>

            <h1 className="max-w-[650px] text-5xl font-extrabold leading-[1.12] tracking-tight sm:text-6xl xl:text-[72px]">
              Trade Smarter.
              <span className="mt-2 block bg-gradient-to-r from-[#F6D27E] via-[#D9A83F] to-[#A87525] bg-clip-text text-transparent">
                Invest Better.
              </span>
            </h1>

            <p className="mt-7 max-w-[540px] text-base leading-8 text-[#A1AAA1] sm:text-lg">
              Discover a smarter way to understand financial markets.
              MarketMind AI brings market intelligence, advanced analytics
              and AI-powered insights together in one platform.
            </p>

            <div className="mt-9 flex flex-wrap gap-4">
              <Link
                to="/register"
                className="group flex items-center gap-3 rounded-lg bg-gradient-to-r from-[#F0C66B] to-[#C18D34] px-7 py-4 text-sm font-bold text-[#17140D] shadow-xl shadow-[#D6A947]/10 transition hover:-translate-y-1 hover:brightness-110"
              >
                Get Started Free
                <ArrowRight size={18} className="transition group-hover:translate-x-1" />
              </Link>
              <a
                href="#features"
                className="flex items-center gap-3 rounded-lg border border-white/15 px-7 py-4 text-sm font-semibold text-white transition hover:border-[#D6A947]/60 hover:bg-white/[0.04]"
              >
                Explore Features <ArrowUpRight size={17} />
              </a>
            </div>

            <div className="mt-12 flex flex-wrap gap-x-8 gap-y-4">
              <div className="flex items-center gap-2 text-sm text-[#C2CAC1]">
                <ChartNoAxesCombined className="text-[#D6AD62]" size={20} />
                Market Analytics
              </div>
              <div className="flex items-center gap-2 text-sm text-[#C2CAC1]">
                <BrainCircuit className="text-[#D6AD62]" size={20} />
                AI Insights
              </div>
              <div className="flex items-center gap-2 text-sm text-[#C2CAC1]">
                <ShieldCheck className="text-[#D6AD62]" size={20} />
                Paper Trading
              </div>
            </div>
          </div>

          {/* DECORATIVE TRADING VISUAL */}
          <div className="relative mx-auto w-full max-w-[650px]">
            <div className="absolute -inset-5 rounded-[35px] bg-gradient-to-br from-[#D6AD62]/10 via-transparent to-emerald-500/10 blur-2xl" />

            <div className="relative rotate-[-1deg] rounded-2xl border border-[#78602F]/50 bg-gradient-to-br from-[#151B16] to-[#0B100D] p-4 shadow-2xl shadow-black/50 sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#8D998E]">MARKET OVERVIEW</p>
                  <h3 className="mt-1 text-lg font-bold">NIFTY 50</h3>
                </div>
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold text-emerald-400">
                  MARKET DATA
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {["NIFTY 50", "SENSEX", "BANK NIFTY"].map((name) => (
                  <div key={name} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                    <p className="text-[9px] text-[#89948A]">{name}</p>
                    <p className="mt-2 text-sm font-bold text-white">Market data</p>
                    <p className="mt-1 text-[9px] text-[#D6AD62]">Explore market</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#D6AD62]/20 bg-[#D6AD62]/[0.06] p-4">
                <div className="rounded-lg bg-[#D6AD62]/15 p-2 text-[#E8C36F]">
                  <BrainCircuit size={22} />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#E8C36F]">AI Market Intelligence</p>
                  <p className="mt-1 text-[10px] text-[#A4AEA5]">Explore intelligent market analysis and insights.</p>
                </div>
                <ArrowUpRight className="ml-auto text-[#D6AD62]" size={18} />
              </div>
            </div>

            <div className="absolute -bottom-7 -right-3 hidden rounded-xl border border-emerald-500/20 bg-[#111A14] p-4 shadow-2xl sm:block">
              <div className="flex items-center gap-2 text-emerald-400">
                <Activity size={16} />
                <span className="text-xs font-bold">Smarter Decisions</span>
              </div>
              <p className="mt-1 text-[10px] text-[#929B93]">Powered by market intelligence</p>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="border-y border-white/[0.06] bg-[#0D120E]">
        <div className="mx-auto grid max-w-[1440px] gap-8 px-5 py-20 sm:px-8 md:grid-cols-2 lg:px-12">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.25em] text-[#D6AD62]">About MarketMind AI</p>
            <h2 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">
              Understand the market.
              <span className="block text-[#D6AD62]">Think beyond the numbers.</span>
            </h2>
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-sm leading-8 text-[#A1AAA1] sm:text-base">
              MarketMind AI is designed to bring market information and
              intelligent analysis into a single experience. Explore stocks,
              study market trends, understand portfolio performance and
              practice strategies through paper trading.
            </p>
            <a href="#features" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#E6C47F]">
              Discover our features <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="mx-auto max-w-[1440px] px-5 py-24 sm:px-8 lg:px-12">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[.25em] text-[#D6AD62]">What we offer</p>
          <h2 className="mt-4 text-3xl font-bold sm:text-4xl">
            Everything you need to explore markets
          </h2>
          <p className="mt-4 text-sm leading-7 text-[#929B93]">
            Powerful tools and intelligent features designed to support your market research and trading journey.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }, index) => (
            <div
              key={title}
              className="group rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#171D18] to-[#0D120F] p-7 transition duration-300 hover:-translate-y-1 hover:border-[#D6AD62]/40 hover:shadow-xl hover:shadow-[#D6AD62]/[0.05]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#D6AD62]/20 bg-[#D6AD62]/[0.08] text-[#D6AD62] transition group-hover:bg-[#D6AD62] group-hover:text-[#11150F]">
                <Icon size={23} />
              </div>
              <h3 className="mt-6 text-lg font-bold">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-[#929B93]">{description}</p>
              <div className="mt-6 flex items-center gap-2 text-xs font-bold text-[#D6AD62] opacity-0 transition group-hover:opacity-100">
                Explore <ArrowRight size={14} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="border-y border-white/[0.06] bg-[#0D120E]">
        <div className="mx-auto max-w-[1440px] px-5 py-20 sm:px-8 lg:px-12">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[.25em] text-[#D6AD62]">Get started</p>
            <h2 className="mt-4 text-3xl font-bold sm:text-4xl">Your market journey starts here</h2>
          </div>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              ["01", "Create Your Account", "Register to access your personal MarketMind AI workspace."],
              ["02", "Explore Market Tools", "Discover market data, stock analysis and AI-powered insights."],
              ["03", "Practice & Learn", "Build your strategy and practice with paper trading tools."]
            ].map(([number, title, description]) => (
              <div key={number} className="relative rounded-2xl border border-white/[0.07] bg-[#141A15] p-7">
                <span className="text-4xl font-black text-[#D6AD62]/30">{number}</span>
                <h3 className="mt-5 text-lg font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-[#929B93]">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 py-20 sm:px-8">
        <div className="relative mx-auto max-w-[1320px] overflow-hidden rounded-3xl border border-[#D6AD62]/25 bg-gradient-to-r from-[#211B10] via-[#172019] to-[#101B15] px-7 py-16 text-center sm:px-12">
          <div className="absolute -left-20 -top-24 h-64 w-64 rounded-full bg-[#D6AD62]/10 blur-[90px]" />
          <div className="absolute -right-20 -bottom-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-[90px]" />
          <div className="relative">
            <p className="text-xs font-bold uppercase tracking-[.25em] text-[#E6C47F]">Start your journey</p>
            <h2 className="mt-4 text-3xl font-extrabold sm:text-5xl">
              Make your next move a smarter one.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[#A5ADA5]">
              Join MarketMind AI and explore a smarter approach to market intelligence.
            </p>
            <Link to="/register" className="mt-8 inline-flex items-center gap-3 rounded-lg bg-gradient-to-r from-[#F0C66B] to-[#C18D34] px-8 py-4 text-sm font-bold text-[#17140D] transition hover:-translate-y-1 hover:brightness-110">
              Create Your Account <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/[0.08] bg-[#070A08]">
        <div className="mx-auto grid max-w-[1440px] gap-12 px-5 py-14 sm:px-8 md:grid-cols-2 lg:grid-cols-4 lg:px-12">
          <div className="lg:col-span-2">
            <Link to="/" className="inline-flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#F2C76D] to-[#A87827] text-[#10130D]">
                <TrendingUp size={23} />
              </div>
              <span className="text-xl font-extrabold">MarketMind <span className="text-[#D6AD62]">AI</span></span>
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-7 text-[#89938A]">
              Smarter market intelligence, AI-powered insights and tools to help you explore financial markets.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-bold">Quick Links</h3>
            <div className="mt-5 space-y-3 text-sm text-[#89938A]">
              <a href="#home" className="block hover:text-[#D6AD62]">Home</a>
              <a href="#about" className="block hover:text-[#D6AD62]">About Us</a>
              <a href="#features" className="block hover:text-[#D6AD62]">Features</a>
              <a href="#how-it-works" className="block hover:text-[#D6AD62]">How It Works</a>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold">Account</h3>
            <div className="mt-5 space-y-3 text-sm text-[#89938A]">
              <Link to="/login" className="block hover:text-[#D6AD62]">Login</Link>
              <Link to="/register" className="block hover:text-[#D6AD62]">Register</Link>
              <a href="mailto:support@marketmind.ai" className="block hover:text-[#D6AD62]">Contact Support</a>
            </div>
          </div>
        </div>

        <div className="border-t border-white/[0.07]">
          <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-3 px-5 py-6 text-center text-xs text-[#748075] sm:px-8 md:flex-row lg:px-12">
            <p>© {new Date().getFullYear()} MarketMind AI. All rights reserved.</p>
            <p>Market information is for educational purposes. Trading involves risk.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default HomePage;
