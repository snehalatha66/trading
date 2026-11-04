import React from "react";
import { Link } from "react-router-dom";

export default function PublicFooter() {
  return (
    <footer className="mt-auto border-t border-[#303A32] bg-[#151915] px-6 py-10 text-[#929B93]">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Link to="/" className="text-xl font-bold text-[#20C982]">
            MarketMind AI
          </Link>
          <p className="mt-3 max-w-md text-sm leading-6">
            Market information and AI-generated insights, subject to provider
            coverage, freshness, and availability.
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#F1F3F0]">
            Explore
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link to="/markets" className="transition-colors hover:text-[#20C982]">Markets</Link></li>
            <li><Link to="/features" className="transition-colors hover:text-[#20C982]">Features</Link></li>
            <li><Link to="/about" className="transition-colors hover:text-[#20C982]">About</Link></li>
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#F1F3F0]">
            Account
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link to="/login" className="transition-colors hover:text-[#20C982]">Log in</Link></li>
            <li><Link to="/register" className="transition-colors hover:text-[#20C982]">Get started</Link></li>
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-6xl border-t border-[#303A32] pt-5 text-xs">
        &copy; {new Date().getFullYear()} MarketMind AI. All rights reserved.
      </div>
    </footer>
  );
}
