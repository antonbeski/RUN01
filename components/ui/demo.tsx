"use client";

import LoadingScreen from "@/components/ui/8bit-loading-screen";

export default function Default() {
  return (
    <div className="flex w-full min-h-screen items-center justify-center bg-background p-8 retro">
      <LoadingScreen
        className="min-w-[300px] md:min-w-[400px]"
        autoProgress
        autoProgressDuration={8000}
      />
    </div>
  );
}
