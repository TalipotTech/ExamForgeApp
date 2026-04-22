"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const RAZORPAY_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
};

type RazorpayInstance = { open: () => void };
type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${RAZORPAY_SCRIPT_URL}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(!!window.Razorpay));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve(!!window.Razorpay);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function MarketplaceCheckoutButton({
  listingId,
  listingTitle,
  priceInr,
  buyerName,
  buyerEmail,
  onSuccess,
}: {
  listingId: string;
  listingTitle: string;
  priceInr: number;
  buyerName?: string;
  buyerEmail?: string;
  onSuccess?: () => void;
}): React.ReactElement {
  const [scriptReady, setScriptReady] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    void loadRazorpayScript().then(setScriptReady);
  }, []);

  const createOrderMutation = trpc.marketplace.createPurchaseOrder.useMutation();
  const verifyMutation = trpc.marketplace.verifyPurchase.useMutation();

  async function handleBuy(): Promise<void> {
    if (!window.Razorpay) {
      toast.error("Checkout script failed to load — refresh the page and try again.");
      return;
    }
    setWorking(true);
    try {
      const order = await createOrderMutation.mutateAsync({ listingId });
      const razorpay = new window.Razorpay({
        key: order.razorpayKeyId,
        amount: order.amountInr,
        currency: order.currency,
        name: "ExamForge Marketplace",
        description: listingTitle,
        order_id: order.razorpayOrderId,
        prefill: { name: buyerName, email: buyerEmail },
        theme: { color: "#0f172a" },
        modal: {
          ondismiss: () => {
            setWorking(false);
            toast.info("Checkout cancelled");
          },
        },
        handler: async (response) => {
          try {
            const result = await verifyMutation.mutateAsync({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            if (result.success) {
              toast.success("Purchase complete! Find it under My Purchases.");
              onSuccess?.();
            } else {
              toast.error(`Purchase verification failed: ${result.reason}`);
            }
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Verification failed");
          } finally {
            setWorking(false);
          }
        },
      });
      razorpay.open();
    } catch (err) {
      setWorking(false);
      toast.error(err instanceof Error ? err.message : "Could not create order");
    }
  }

  return (
    <Button
      size="lg"
      className="w-full sm:w-auto"
      disabled={!scriptReady || working}
      onClick={handleBuy}
    >
      {working ? (
        <>
          <Loader2 className="mr-2 size-4 animate-spin" />
          Processing…
        </>
      ) : (
        <>
          <ShoppingCart className="mr-2 size-4" />
          Buy for ₹{(priceInr / 100).toLocaleString("en-IN")}
        </>
      )}
    </Button>
  );
}
