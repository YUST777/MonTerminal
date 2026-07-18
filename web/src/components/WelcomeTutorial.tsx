import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { loadPersisted, savePersisted } from "../lib/persist.ts";

const WELCOME_TUTORIAL_KEY = "welcome-tutorial-v1-seen";

const STEPS = [
  {
    video: "/welcome/1_spot.webm",
    eyebrow: "Live markets",
    title: "Find and trade Monad tokens",
    description:
      "Open verified Monad ERC-20 markets with live prices, liquidity, charts, and pool depth read from real APIs and onchain data.",
  },
  {
    video: "/welcome/2_limit.webm",
    eyebrow: "Onchain automation",
    title: "Set limit orders that work while you sleep",
    description:
      "Create limit buys, limit sells, stop-losses, and take-profit ladders. Your tokens stay in your wallet until a valid trigger is executed.",
  },
  {
    video: "/welcome/3_swap.webm",
    eyebrow: "Swap · Bridge",
    title: "Move into Monad from one screen",
    description:
      "Compare live routes, review fees and expected output, then swap on Monad or bridge assets from supported chains using real quotes.",
  },
  {
    video: "/welcome/4_pnl.webm",
    eyebrow: "Portfolio",
    title: "Follow balances and PnL",
    description:
      "See wallet balances, current values, performance history, and open orders together—then export a clean portfolio card when you want to share it.",
  },
] as const;

export function WelcomeTutorial() {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (loadPersisted<boolean>(WELCOME_TUTORIAL_KEY)) return;
    const timer = window.setTimeout(() => setOpen(true), 350);
    return () => window.clearTimeout(timer);
  }, []);

  const finish = () => {
    savePersisted(WELCOME_TUTORIAL_KEY, true);
    setOpen(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) finish();
  };

  const step = STEPS[stepIndex];
  const lastStep = stepIndex === STEPS.length - 1;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-overlay-in fixed inset-0 z-[80] bg-black/80 backdrop-blur-[3px]" />
        <Dialog.Content
          onPointerDownOutside={(event) => event.preventDefault()}
          className="animate-sheet-in fixed left-1/2 top-1/2 z-[90] flex w-[min(736px,calc(100vw-1rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-[#17181f] shadow-[0_30px_100px_rgba(0,0,0,0.72)] outline-none"
        >
          <div className="relative aspect-video shrink-0 overflow-hidden border-b border-line bg-black sm:aspect-auto sm:h-[min(414px,58dvh)]">
            <video
              key={step.video}
              className="size-full object-cover"
              src={step.video}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label={`${step.title} tutorial preview`}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#17181f] to-transparent" />
            <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/65 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80 backdrop-blur sm:left-4 sm:top-4 sm:text-[11px]">
              {step.eyebrow}
            </div>
            <button
              type="button"
              onClick={finish}
              aria-label="Skip welcome tutorial"
              className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full border border-white/10 bg-black/65 text-white/70 backdrop-blur transition-colors hover:bg-black/85 hover:text-white sm:right-4 sm:top-4"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="shrink-0 px-4 pb-4 pt-1 sm:px-6 sm:pb-5 sm:pt-1">
            <div className="mx-auto max-w-2xl text-center">
              <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-brand sm:text-[10px]">
                Welcome to MonTerminal · {stepIndex + 1}/{STEPS.length}
              </div>
              <Dialog.Title className="mt-1.5 text-lg font-bold tracking-tight text-fg sm:text-[28px]">
                {step.title}
              </Dialog.Title>
              <Dialog.Description className="mx-auto mt-1.5 max-w-xl text-[11px] leading-4 text-muted sm:text-[13px] sm:leading-5">
                {step.description}
              </Dialog.Description>
            </div>

            <div className="mt-3 flex items-center justify-center gap-1.5 sm:mt-4">
              {STEPS.map((tutorialStep, index) => (
                <button
                  key={tutorialStep.video}
                  type="button"
                  onClick={() => setStepIndex(index)}
                  aria-label={`Open tutorial step ${index + 1}: ${tutorialStep.title}`}
                  aria-current={index === stepIndex ? "step" : undefined}
                  className={`h-2 rounded-full transition-all ${
                    index === stepIndex
                      ? "w-7 bg-brand"
                      : index < stepIndex
                        ? "w-2 bg-brand/45 hover:bg-brand/65"
                        : "w-2 bg-muted/35 hover:bg-muted/60"
                  }`}
                />
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 sm:mt-4">
              <button
                type="button"
                onClick={finish}
                className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-muted transition-colors hover:text-fg sm:px-3 sm:text-[12px]"
              >
                Skip tour
              </button>

              <div className="flex items-center gap-2">
                {stepIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => setStepIndex((current) => current - 1)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-raised px-3.5 text-[11px] font-semibold text-fg transition-colors hover:bg-overlay sm:text-[12px]"
                  >
                    <ArrowLeft className="size-3.5" /> Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (lastStep ? finish() : setStepIndex((current) => current + 1))}
                  className="monad-gradient inline-flex h-9 min-w-24 items-center justify-center gap-1.5 rounded-lg px-4 text-[11px] font-bold text-white shadow-[0_8px_24px_rgba(102,86,214,0.28)] transition-[filter,transform] hover:brightness-110 active:scale-[0.98] sm:min-w-28 sm:text-[12px]"
                >
                  {lastStep ? (
                    <>
                      Start exploring <Check className="size-4" />
                    </>
                  ) : (
                    <>
                      Next <ArrowRight className="size-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
