
import React from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp,
  ArrowLeft,
  ArrowUpRight,
  Home,
  SearchX,
} from "lucide-react";

export default function NotFoundPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#101310] px-5 py-12 text-[#F1F3F0]">

      {/* Background effects */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-[#20C982]/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-[#D6AD62]/5 blur-[120px]" />

      <section className="relative w-full max-w-xl text-center">

        {/* Logo */}
        <Link to="/" className="mb-14 inline-flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#20C982] text-[#101310]">
            <TrendingUp size={24} strokeWidth={2.5} />
          </div>
          <span className="text-xl font-bold tracking-tight">
            MarketMind <span className="text-[#20C982]">AI</span>
          </span>
        </Link>

        {/* Error visual */}
        <div className="relative mx-auto mb-8 flex h-36 w-36 items-center justify-center rounded-3xl border border-[#303A32] bg-[#1C231E] shadow-2xl shadow-black/30">
          <span className="text-6xl font-extrabold tracking-tighter text-[#20C982]/15">
            404
          </span>
          <div className="absolute flex h-16 w-16 items-center justify-center rounded-2xl border border-[#20C982]/20 bg-[#20C982]/10 text-[#20C982]">
            <SearchX size={32} />
          </div>
        </div>

        {/* Content */}
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#20C982]">
          Error 404
        </p>

        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Lost your way?
        </h1>

        <p className="mx-auto mt-5 max-w-md text-base leading-8 text-[#929B93]">
          Looks like this page has moved beyond our market radar.
          The link may be incorrect, or the page may no longer exist.
        </p>

        {/* Actions */}
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#20C982] px-6 py-3.5 text-sm font-bold text-[#101310] transition duration-200 hover:-translate-y-0.5 hover:bg-[#38D995]"
          >
            <Home size={17} />
            Back to Home
            <ArrowUpRight size={16} />
          </Link>

          <Link
            to="/markets"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#303A32] bg-[#1C231E] px-6 py-3.5 text-sm font-semibold text-[#F1F3F0] transition duration-200 hover:border-[#20C982]/50 hover:bg-[#252D27]"
          >
            <ArrowLeft size={17} />
            Explore Markets
          </Link>
        </div>

        {/* Footer */}
        <div className="mt-16 border-t border-[#303A32] pt-6">
          <p className="text-xs text-[#68736A]">
            © {new Date().getFullYear()} MarketMind AI. All rights reserved.
          </p>
          <p className="mt-2 text-xs text-[#68736A]">
            Intelligent insights. Smarter market decisions.
          </p>
        </div>
      </section>
    </main>
  );
}
