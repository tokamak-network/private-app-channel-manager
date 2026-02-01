import { useState } from "react";
import { ArrowRight } from "lucide-react";

export default function Send() {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">Send L2 Transaction</h2>

      <div className="space-y-3">
        <div className="bg-surface rounded-card p-4 space-y-2">
          <label className="text-sm text-text-secondary">Recipient Address</label>
          <input
            type="text"
            placeholder="0x..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
          />
        </div>

        <div className="bg-surface rounded-card p-4 space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm text-text-secondary">Amount</label>
            <span className="text-xs text-text-tertiary">Balance: 0.00 TON</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 bg-background border border-border rounded-button px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
            />
            <button className="px-3 py-2 bg-background border border-border rounded-button text-sm text-text-secondary hover:text-text-primary transition-colors">
              MAX
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-button">
              TON
            </span>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-card p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Network Fee</span>
          <span className="text-success">Free (L2)</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Estimated Time</span>
          <span>Instant</span>
        </div>
      </div>

      <button
        disabled={!recipient || !amount}
        className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover disabled:bg-surface disabled:text-text-tertiary text-white py-3 rounded-card font-medium transition-colors"
      >
        Sign Transaction
        <ArrowRight className="w-4 h-4" />
      </button>

      <p className="text-xs text-text-tertiary text-center">
        Transaction will be signed with your L2 key and submitted to the channel
      </p>
    </div>
  );
}
