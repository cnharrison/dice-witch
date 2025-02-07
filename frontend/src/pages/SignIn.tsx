import { SignIn } from "@clerk/clerk-react";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CustomSignIn() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <Card className="shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Welcome to Dice Witch</CardTitle>
        </CardHeader>
        <CardContent>
          <SignIn
            appearance={{
              elements: {
                rootBox: "",
                card: "shadow-none border-0 bg-transparent m-0 p-0 w-full",
                header: "hidden",
                headerTitle: "hidden",
                headerSubtitle: "hidden",
                dividerLine: "hidden",
                dividerText: "hidden",
                footer: "hidden",
                formButtonPrimary: "hidden",
                socialButtonsBlockButton:
                  "bg-[#5865F2] text-white hover:bg-[#4752C4] transition-colors rounded-md px-4 py-2 flex items-center justify-center",
                socialButtonsProviderIcon: "w-5 h-5 mr-2",
                socialButtonsContainer: "w-full",
              },
              layout: {
                socialButtonsPlacement: "bottom",
                showOptionalFields: false,
              },
            }}
            routing="path"
            path="/sign-in"
            afterSignInUrl="/"
            signUpUrl="/sign-up"
          />
        </CardContent>
      </Card>
    </div>
  );
}