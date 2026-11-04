// src/pages/homepage.jsx
// Public landing page for MarketMind AI
// Implements the design specifications: dark charcoal background, gold & emerald accents, responsive layout.

import React from "react";
import { Link } from "react-router-dom";
// Lucide icons – ensure the package is installed in the project.
import { CheckCircle, ArrowRight, BarChart2, Users, Moon, Sun } from "lucide-react";

// Simple SVG chart placeholder (green & gold theme)
const StockChart = () => (
  <svg
    viewBox="0 0 200 100"
    className="w-full h-auto"
    preserveAspectRatio="none"
    aria-label="stock chart illustration"
  >
    {/* Gradient background */}
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#083018" />{/* emerald deep */}
        <stop offset="100%" stopColor="#001" />{/* black */}
      </linearGradient>
      <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#ffd700" />{/* gold */}
        <stop offset="100%" stopColor="#00ff00" />{/* bright green */}
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bgGrad)" rx="8" />
    {/* Simple line chart */}
    <polyline
      points="0,80 30,60 60,70 90,40 120,55 150,30 180,45"
      fill="none"
      stroke="url(#lineGrad)"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Navbar = () => (
  <header className="fixed top-0 left-0 w-full bg-black/80 backdrop-blur-sm z-30 shadow-md">
    <nav className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3">
      <div className="flex items-center space-x-2 text-white">
        {/* Replace with actual logo component if available */}
        <span className="text-2xl font-bold text-gold-400">MarketMind AI</span>
      </div>
      <ul className="hidden md:flex space-x-6 text-gray-300">
        <li><a href="#" className="hover:text-gold-400 transition-colors">Home</a></li>
        <li><a href="#about" className="hover:text-gold-400 transition-colors">About</a></li>
        <li><a href="#features" className="hover:text-gold-400 transition-colors">Features</a></li>
        <li><a href="#how-it-works" className="hover:text-gold-400 transition-colors">How It Works</a></li>
        <li><a href="#markets" className="hover:text-gold-400 transition-colors">Markets</a></li>
        <li><a href="#pricing" className="hover:text-gold-400 transition-colors">Pricing</a></li>
      </ul>
      <div className="flex space-x-3">
        <Link
          to="/login"
          className="px-4 py-2 rounded border border-gold-400 text-gold-400 hover:bg-gold-400 hover:text-black transition"
        >
          Login
        </Link>
        <Link
          to="/register"
          className="px-4 py-2 rounded bg-gold-400 text-black hover:bg-gold-500 transition"
        >
          Register
        </Link>
      </div>
      {/* Mobile menu toggle – simplistic for now */}
      <div className="md:hidden">
        {/* TODO: implement mobile drawer if needed */}
      </div>
    </nav>
  </header>
);

const Hero = () => (
  <section
    id="hero"
    className="pt-24 md:pt-32 bg-black text-white min-h-screen flex flex-col md:flex-row items-center justify-center gap-8 px-4"
  >
    <div className="flex-1 max-w-xl space-y-6">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gold-400 leading-tight">
        Trade Smarter. Invest Better.
      </h1>
      <p className="text-lg text-gray-300">
        MarketMind AI gives you crystal‑clear market insights, AI‑driven stock analysis, and powerful portfolio tools for the Indian stock market.
      </p>
      <div className="flex space-x-4">
        <Link
          to="/register"
          className="px-6 py-3 bg-gold-400 text-black rounded hover:bg-gold-500 transition"
        >
          Get Started Free
        </Link>
        <button
          onClick={() => document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' })}
          className="px-6 py-3 border border-gold-400 text-gold-400 rounded hover:bg-gold-400 hover:text-black transition"
        >
          Explore Features
        </button>
      </div>
    </div>
    <div className="flex-1 max-w-md">
      <StockChart />
    </div>
  </section>
);

const About = () => (
  <section id="about" className="py-20 bg-gray-900 text-gray-200">
    <div className="max-w-4xl mx-auto px-4">
      <h2 className="text-3xl font-semibold text-gold-400 mb-6">About MarketMind AI</h2>
      <p className="text-lg leading-relaxed">
        MarketMind AI is a premium platform built for Indian investors. By combining real‑time market data with cutting‑edge AI models, we help you discover opportunities, assess risk, and build paper portfolios that mirror your investment strategy.
      </p>
    </div>
  </section>
);

const FeatureCard = ({ icon: Icon, title, description }) => (
  <div className="bg-gray-800 rounded-lg p-6 hover:shadow-xl transition-shadow flex flex-col items-start space-y-3">
    <Icon className="h-8 w-8 text-gold-400" />
    <h3 className="text-xl font-medium text-gold-400">{title}</h3>
    <p className="text-gray-300 text-sm">{description}</p>
  </div>
);

const Features = () => (
  <section id="features" className="py-20 bg-black text-white">
    <div className="max-w-6xl mx-auto px-4">
      <h2 className="text-3xl font-semibold text-gold-400 mb-10 text-center">Features</h2>
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        <FeatureCard
          icon={BarChart2}
          title="AI Market Insights"
          description="AI‑driven daily market commentary and sector analysis for Indian equities."
        />
        <FeatureCard
          icon={BarChart2}
          title="Real‑Time Market Data"
          description="Live price feeds and depth data for NSE/BSE stocks (view‑only on public site)."
        />
        <FeatureCard
          icon={CheckCircle}
          title="Smart Stock Screener"
          description="Filter stocks by fundamentals, technicals, and AI‑predicted momentum."
        />
        <FeatureCard
          icon={Users}
          title="Portfolio Tracking"
          description="Create a paper portfolio, track performance and receive AI suggestions."
        />
        <FeatureCard
          icon={CheckCircle}
          title="Watchlist"
          description="Save favorite tickers and get instant alerts on price moves."
        />
        <FeatureCard
          icon={CheckCircle}
          title="Risk Analysis"
          description="AI‑based risk scoring and diversification recommendations."
        />
      </div>
    </div>
  </section>
);

const HowItWorks = () => (
  <section id="how-it-works" className="py-20 bg-gray-900 text-gray-200">
    <div className="max-w-4xl mx-auto px-4">
      <h2 className="text-3xl font-semibold text-gold-400 mb-10 text-center">How It Works</h2>
      <div className="grid md:grid-cols-3 gap-8">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="bg-gold-400 text-black rounded-full p-4">
            <span className="text-2xl font-bold">1</span>
          </div>
          <h3 className="text-xl font-medium text-gold-400">Create your account</h3>
          <p className="text-sm">Sign up for free and get instant access to AI insights.</p>
        </div>
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="bg-gold-400 text-black rounded-full p-4">
            <span className="text-2xl font-bold">2</span>
          </div>
          <h3 className="text-xl font-medium text-gold-400">Explore market data</h3>
          <p className="text-sm">Browse live indices, sector trends and AI‑generated reports.</p>
        </div>
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="bg-gold-400 text-black rounded-full p-4">
            <span className="text-2xl font-bold">3</span>
          </div>
          <h3 className="text-xl font-medium text-gold-400">Track & manage portfolio</h3>
          <p className="text-sm">Build a paper portfolio, monitor performance and get actionable tips.</p>
        </div>
      </div>
    </div>
  </section>
);

const Footer = () => (
  <footer className="bg-gray-800 text-gray-300 py-10">
    <div className="max-w-6xl mx-auto px-4 grid md:grid-cols-4 gap-8">
      <div>
        <h3 className="text-xl font-bold text-gold-400 mb-3">MarketMind AI</h3>
        <p className="text-sm">Premium AI‑powered market insights for Indian investors.</p>
      </div>
      <div>
        <h4 className="font-semibold text-gray-200 mb-2">Explore</h4>
        <ul className="space-y-1">
          <li><a href="#about" className="hover:text-gold-400">About</a></li>
          <li><a href="#features" className="hover:text-gold-400">Features</a></li>
          <li><a href="#contact" className="hover:text-gold-400">Contact</a></li>
        </ul>
      </div>
      <div>
        <h4 className="font-semibold text-gray-200 mb-2">Legal</h4>
        <ul className="space-y-1">
          <li><a href="/privacy" className="hover:text-gold-400">Privacy Policy</a></li>
          <li><a href="/terms" className="hover:text-gold-400">Terms of Service</a></li>
          <li><a href="/help" className="hover:text-gold-400">Help Center</a></li>
        </ul>
      </div>
      <div>
        <h4 className="font-semibold text-gray-200 mb-2">Follow Us</h4>
        <div className="flex space-x-4">
          {/* Replace # with real URLs */}
          <a href="#" className="text-gray-400 hover:text-gold-400"><svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M22.46 6c-.77.35-1.6.58-2.46.69a4.27 4.27 0 0 0 1.88-2.36 8.53 8.53 0 0 1-2.71 1.03 4.24 4.24 0 0 0-7.23 3.86A12.03 12.03 0 0 1 3.16 4.7a4.23 4.23 0 0 0 1.31 5.66 4.2 4.2 0 0 1-1.92-.53v.05c0 2.09 1.49 3.84 3.46 4.23a4.24 4.24 0 0 1-1.91.07c.54 1.68 2.1 2.9 3.95 2.94A8.5 8.5 0 0 1 2 19.54a12.07 12.07 0 0 0 6.55 1.92c7.86 0 12.16-6.51 12.16-12.16 0-.19-.01-.37-.02-.56A8.68 8.68 0 0 0 24 5.56a8.44 8.44 0 0 1-2.54.7z"/></svg></a>
          <a href="#" className="text-gray-400 hover:text-gold-400"><svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.04c-5.5 0-9.96 4.46-9.96 9.96 0 4.42 2.87 8.18 6.86 9.5-.1-.81-.2-2.05.04-2.94.22-.78 1.44-4.95 1.44-4.95s-.36-.73-.36-1.81c0-1.69 1-2.95 2.24-2.95 1.06 0 1.57.79 1.57 1.74 0 1.06-.68 2.64-1.03 4.11-.29 1.23.62 2.23 1.84 2.23 2.21 0 3.91-2.33 3.91-5.69 0-2.97-2.13-5.06-5.16-5.06-3.51 0-5.57 2.64-5.57 5.38 0 1.07.41 2.22.92 2.84a.36.36 0 0 1 .08.34c-.09.38-.29 1.23-.32 1.41-.05.22-.16.27-.37.16-1.38-.65-2.24-2.68-2.24-4.31 0-3.51 2.55-6.73 7.34-6.73 3.85 0 6.85 2.74 6.85 6.4 0 3.81-2.4 6.87-5.73 6.87-1.12 0-2.18-.58-2.54-1.26l-.69 2.62c-.25.97-.94 2.19-1.4 2.94 1.06.33 2.18.51 3.34.51 5.5 0 9.96-4.46 9.96-9.96 0-5.5-4.46-9.96-9.96-9.96z"/></svg></a>
        </div>
      </div>
    </div>
    <div className="mt-8 text-center text-sm text-gray-500">
      © {new Date().getFullYear()} MarketMind AI. All rights reserved.
    </div>
  </footer>
);

const HomePage = () => (
  <div className="font-sans text-base" style={{ scrollBehavior: "smooth" }}>
    <Navbar />
    <main className="pt-16">
      <Hero />
      <About />
      <Features />
      <HowItWorks />
    </main>
    <Footer />
  </div>
);

export default HomePage;
