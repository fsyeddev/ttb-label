import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp is a native Node module — mark it external so Next.js doesn't try
  // to bundle it for the Edge runtime. The API route runs on Node (serverless),
  // so the native binary resolves correctly on Vercel at runtime.
  serverExternalPackages: ['sharp'],
};

export default nextConfig;
