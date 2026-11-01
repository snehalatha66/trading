import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ensureUserProfile } from "../services/profiles";
import { supabase } from "../services/supabase";

function AuthPage() {
  const isRegister = useLocation().pathname === "/register";
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isRegister && !loading && session) {
      navigate("/dashboard", { replace: true });
    }
  }, [isRegister, loading, navigate, session]);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email");
    const password = formData.get("password");

    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: formData.get("name"),
            },
          },
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        if (!data.user) {
          setMessage("Registration could not be completed. Supabase did not return a user.");
          return;
        }

        setMessage(
          data.session
            ? "Account created successfully."
            : "Account created. Check your email to confirm your account."
        );
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      if (!data.user) {
        setMessage("Sign-in could not be completed. Supabase did not return a user.");
        return;
      }

      await ensureUserProfile(data.user);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Authentication failed due to an unexpected error."
      );
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-10 text-gray-100 sm:px-6">
      <div className="mx-auto flex min-h-[80vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-gray-900 shadow-2xl shadow-black/30">
        <section className="hidden flex-1 flex-col justify-between bg-gradient-to-br from-emerald-500/20 via-gray-900 to-gray-900 p-12 md:flex">
          <Link to="/" className="text-lg font-semibold tracking-wide">
            MarketMind <span className="text-emerald-400">AI</span>
          </Link>
          <div className="max-w-md">
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">
              Invest with insight
            </p>
            <h1 className="text-4xl font-bold leading-tight">
              Make your next market move with confidence.
            </h1>
            <p className="mt-5 leading-7 text-gray-300">
              Explore Indian market intelligence and practice your strategies
              with paper trading.
            </p>
          </div>
          <p className="text-sm text-gray-500">
            Market information is for educational purposes only.
          </p>
        </section>

        <section className="flex w-full flex-col justify-center px-6 py-10 sm:px-12 md:w-[440px] md:flex-none">
          <Link
            to="/"
            className="mb-10 text-lg font-semibold tracking-wide md:hidden"
          >
            MarketMind <span className="text-emerald-400">AI</span>
          </Link>
          <p className="text-sm font-medium text-emerald-400">
            {isRegister ? "GET STARTED" : "WELCOME BACK"}
          </p>
          <h2 className="mt-2 text-3xl font-bold">
            {isRegister ? "Create your account" : "Sign in to your account"}
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            {isRegister
              ? "Start exploring smarter market insights."
              : "Enter your details to continue."}
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            {isRegister && (
              <div>
                <label
                  htmlFor="full-name"
                  className="mb-2 block text-sm font-medium text-gray-300"
                >
                  Full name
                </label>
                <input
                  id="full-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  className="w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-gray-100 outline-none transition placeholder:text-gray-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="Your name"
                />
              </div>
            )}
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-gray-300"
              >
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-gray-100 outline-none transition placeholder:text-gray-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-gray-300"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                minLength={8}
                required
                className="w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-gray-100 outline-none transition placeholder:text-gray-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                placeholder="At least 8 characters"
              />
            </div>
            {message && (
              <p
                role="alert"
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
              >
                {message}
              </p>
            )}
            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-gray-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-gray-900"
            >
              {isRegister ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-gray-400">
            {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
            <Link
              to={isRegister ? "/login" : "/register"}
              className="font-medium text-emerald-400 hover:text-emerald-300"
            >
              {isRegister ? "Sign in" : "Create one"}
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}

export default AuthPage;
