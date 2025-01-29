import React from 'react';
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router } from "react-router-dom";
import { ClerkProvider } from '@clerk/clerk-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from "@/components/theme-provider"
import './index.css'
import App from './App'

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const queryClient = new QueryClient();

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
