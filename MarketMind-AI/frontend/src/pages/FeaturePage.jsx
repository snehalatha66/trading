import React from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";

export default function FeaturePage({ title }) {
  return (
    <Layout>
      <section className="mx-auto max-w-3xl rounded-2xl border border-gray-800 bg-gray-900 p-8 shadow-lg">
        <p className="text-sm font-medium uppercase tracking-wider text-emerald-400">
          MarketMind AI
        </p>
        <h1 className="mt-2 text-3xl font-bold text-gray-100">{title}</h1>
        <p className="mt-4 leading-7 text-gray-400">
          This section is being built. In the meantime, you can explore the
          dashboard and its demo market data.
        </p>
        <Link
          to="/dashboard"
          className="mt-6 inline-flex rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-gray-950 transition hover:bg-emerald-400"
        >
          Go to dashboard
        </Link>
      </section>
    </Layout>
  );
}
