// src/components/Navbar.jsx
import React from "react";
import { Search, Bell, User } from "lucide-react";

export default function Navbar({ onSearch }) {
  return (
    <header className="bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 py-2">
      <div className="flex items-center space-x-2">
        <button className="p-1 hover:bg-gray-800 rounded">
          <Search className="w-5 h-5 text-gray-400"/>
        </button>
        <input
          type="text"
          placeholder="Search symbols, companies..."
          className="bg-gray-800 text-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          onChange={(e) => onSearch && onSearch(e.target.value)}
        />
      </div>
      <div className="flex items-center space-x-4">
        <button className="p-1 hover:bg-gray-800 rounded">
          <Bell className="w-5 h-5 text-gray-400"/>
        </button>
        <button className="flex items-center space-x-2 p-1 hover:bg-gray-800 rounded">
          <User className="w-5 h-5 text-gray-400"/>
          <span className="text-sm text-gray-300">Profile</span>
        </button>
      </div>
    </header>
  );
}
