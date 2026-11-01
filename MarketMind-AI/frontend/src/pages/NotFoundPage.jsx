import React from "react";
import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-950 px-4 text-gray-100">
      <section className="max-w-lg text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-emerald-400">
          404
        </p>
        <h1 className="mt-2 text-3xl font-bold">Page not found</h1>
        <p className="mt-3 text-gray-400">
          That page doesn’t exist or may have moved.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-gray-950 transition hover:bg-emerald-400"
        >
          Return home
        </Link>
      </section>
    </main>
  );
}
