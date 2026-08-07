import * as React from 'react';
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router } from "react-router";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from './lib/AuthProvider';
import { customFetch } from './lib/api';
import './index.css'
import App from './App'


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60,
      retry: 1,
      refetchOnWindowFocus: false,
      queryFn: async ({ queryKey }) => {
        const [url] = Array.isArray(queryKey) ? queryKey : [queryKey];
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

const root = createRoot(document.getElementById('root')!);

root.render(
  <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <App />
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);
