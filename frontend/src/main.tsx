import * as React from 'react';
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router } from "react-router-dom";
import { ClerkProvider } from '@clerk/clerk-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from "@/components/theme-provider"
import './index.css'
import App from './App'

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const API_BASE = import.meta.env.VITE_API_BASE || 'https://api.dicewit.ch';
export const customFetch = async (url: string, options: RequestInit = {}) => {
  const isApiUrl = url.startsWith('/api');
  const fullUrl = isApiUrl ? `${API_BASE}${url}` : url;
  return fetch(fullUrl, {
    ...options,
    credentials: 'include'
  });
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60,
      retry: 1,
      refetchOnWindowFocus: false,
      queryFn: async ({ queryKey }) => {
        const [url, params] = Array.isArray(queryKey) ? queryKey : [queryKey, {}];
        if (typeof url !== 'string') return null;

        const response = await customFetch(url);
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        return response.json();
      },
    },
  },
});

if (!clerkPubKey) {
  throw new Error("Missing Clerk Publishable Key");
}

const root = createRoot(document.getElementById('root')!);

root.render(
  <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <QueryClientProvider client={queryClient}>
      <ClerkProvider publishableKey={clerkPubKey}>
        <Router>
          <App />
        </Router>
      </ClerkProvider>
    </QueryClientProvider>
  </ThemeProvider>
);
