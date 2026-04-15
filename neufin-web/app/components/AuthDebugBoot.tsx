"use client";

import { useEffect } from "react";
import { debugAuth } from "@/lib/auth-debug";

export default function AuthDebugBoot() {
  useEffect(() => {
    debugAuth("layout.tsx:mount");
  }, []);

  return null;
}
