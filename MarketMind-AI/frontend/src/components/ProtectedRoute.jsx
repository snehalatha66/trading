import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function ProtectedRoute({ children }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-gray-950 text-gray-300"
        role="status"
      >
        Restoring your session…
      </main>
    );
  }

  return session ? children : <Navigate to="/login" replace />;
}

export default ProtectedRoute;
