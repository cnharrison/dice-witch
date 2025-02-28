import { SignIn, useSignIn } from "@clerk/clerk-react";
import React from "react";
export default function CustomSignIn() {
  const { signIn, isLoaded } = useSignIn();

  const handleSignInWithDiscord = async () => {
    if (!isLoaded) return;
    await signIn.authenticateWithRedirect({
      strategy: "oauth_discord",
      redirectUrl: "/sso-callback",
      redirectUrlComplete: "/"
    });
  };

  return (
    <div className="flex flex-col h-screen items-center pt-16 bg-black">
      <div className="relative w-full max-w-md mb-16 overflow-visible">
        <div className="aspect-square overflow-hidden rounded-full">
          <img
            src="/images/dice-witch-banner.webp"
            alt="Dice Witch"
            className="w-full h-full object-cover"
            style={{
              filter: 'grayscale(100%)',
              mixBlendMode: 'normal'
            }}
          />
        </div>

        <div className="absolute inset-0 flex items-center justify-center z-[9999]">
          <div className="font-['UnifrakturMaguntia'] text-[#ff00ff] text-[14rem] font-bold tracking-wide whitespace-nowrap [text-shadow:4px_4px_8px_rgba(0,0,0,0.95)]">
            Dice Witch
          </div>
        </div>
      </div>

      <button
        onClick={handleSignInWithDiscord}
        className="bg-[#5865F2] hover:bg-[#4752C4] text-white px-6 py-3 rounded-md flex items-center justify-center text-lg font-medium w-80 transition-colors"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          className="mr-3"
        >
          <path d="M19.54 0c1.356 0 2.46 1.104 2.46 2.472v21.528l-2.58-2.28-1.452-1.344-1.536-1.428.636 2.22h-13.608c-1.356 0-2.46-1.104-2.46-2.472v-16.224c0-1.368 1.104-2.472 2.46-2.472h16.08zm-4.632 15.672c2.652-.084 3.672-1.824 3.672-1.824 0-3.864-1.728-6.996-1.728-6.996-1.728-1.296-3.372-1.26-3.372-1.26l-.168.192c2.04.624 2.988 1.524 2.988 1.524-1.248-.684-2.472-1.02-3.612-1.152-.864-.096-1.692-.072-2.424.024l-.204.024c-.42.036-1.44.192-2.724.756-.444.204-.708.348-.708.348s.996-.948 3.156-1.572l-.12-.144s-1.644-.036-3.372 1.26c0 0-1.728 3.132-1.728 6.996 0 0 1.008 1.74 3.66 1.824 0 0 .444-.54.804-.996-1.524-.456-2.1-1.416-2.1-1.416l.336.204.048.036.047.027.014.006.047.027c.3.168.6.3.876.408.492.192 1.08.384 1.764.516.9.168 1.956.228 3.108.012.564-.096 1.14-.264 1.74-.516.42-.156.888-.384 1.38-.708 0 0-.6.984-2.172 1.428.36.456.792.972.792.972zm-5.58-5.604c-.684 0-1.224.6-1.224 1.332 0 .732.552 1.332 1.224 1.332.684 0 1.224-.6 1.224-1.332.012-.732-.54-1.332-1.224-1.332zm4.38 0c-.684 0-1.224.6-1.224 1.332 0 .732.552 1.332 1.224 1.332.684 0 1.224-.6 1.224-1.332 0-.732-.54-1.332-1.224-1.332z" />
        </svg>
        Continue with Discord
      </button>

      <div className="hidden">
        <SignIn
          routing="path"
          path="/sign-in"
          afterSignInUrl="/"
          signUpUrl="/sign-up"
        />
      </div>
    </div>
  );
}