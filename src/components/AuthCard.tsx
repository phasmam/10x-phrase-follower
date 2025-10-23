import React, { useState } from "react";
import { Button } from "./ui/button";

interface AuthCardProps {}

export default function AuthCard({}: AuthCardProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Always try development mode first - check if DEV_JWT endpoint is available
      const response = await fetch("/api/dev/jwt", {
        headers: { "Accept": "application/json" },
      });
      
      if (response.ok) {
        // DEV_JWT endpoint is available - we're in development mode
        const data = await response.json();
        
        // Store token in localStorage with expiry
        const expiry = Date.now() + (data.expires_in * 1000);
        localStorage.setItem("dev_jwt_token", data.token);
        localStorage.setItem("dev_user_id", data.user_id);
        localStorage.setItem("dev_jwt_expiry", expiry.toString());
        
        // Redirect to notebooks
        window.location.href = "/notebooks";
      } else {
        // DEV_JWT endpoint not available - we're in production mode
        throw new Error("Production authentication not yet implemented");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">Sign In</h1>
        <p className="text-muted-foreground mt-2">
          Enter your credentials to access your notebooks
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              placeholder="Enter your email"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              placeholder="Enter your password"
            />
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        {import.meta.env.NODE_ENV === "development" && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              Development mode: Any credentials will work
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
