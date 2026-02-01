import { Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";

type ProofStatus = "pending" | "approved" | "rejected" | "submitted";

interface ProofItem {
  id: string;
  type: string;
  amount: string;
  status: ProofStatus;
  timestamp: string;
}

const mockProofs: ProofItem[] = [];

const statusConfig: Record<
  ProofStatus,
  { icon: typeof Clock; color: string; label: string }
> = {
  pending: { icon: Clock, color: "text-warning", label: "Pending" },
  approved: { icon: CheckCircle, color: "text-success", label: "Approved" },
  rejected: { icon: XCircle, color: "text-error", label: "Rejected" },
  submitted: { icon: AlertCircle, color: "text-primary", label: "Submitted" },
};

export default function Activity() {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Activity</h2>
        <div className="flex gap-2">
          <button className="text-xs px-3 py-1.5 bg-primary text-white rounded-button">
            All
          </button>
          <button className="text-xs px-3 py-1.5 bg-surface text-text-secondary rounded-button hover:text-text-primary transition-colors">
            Pending
          </button>
        </div>
      </div>

      {mockProofs.length === 0 ? (
        <div className="bg-surface rounded-card p-8 text-center space-y-3">
          <Clock className="w-10 h-10 text-text-tertiary mx-auto" />
          <div>
            <h3 className="font-medium">No Activity Yet</h3>
            <p className="text-sm text-text-secondary mt-1">
              Your L2 transaction proofs will appear here
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {mockProofs.map((proof) => {
            const { icon: StatusIcon, color, label } = statusConfig[proof.status];
            return (
              <div
                key={proof.id}
                className="bg-surface rounded-card p-4 flex items-center gap-3"
              >
                <div className={`p-2 rounded-full bg-background ${color}`}>
                  <StatusIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{proof.type}</span>
                    <span className="text-sm">{proof.amount}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-xs ${color}`}>{label}</span>
                    <span className="text-xs text-text-tertiary">
                      {proof.timestamp}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-surface rounded-card p-4">
        <h3 className="text-sm font-medium mb-3">Proof Summary</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 bg-background rounded-button">
            <div className="text-lg font-semibold">0</div>
            <div className="text-xs text-text-secondary">Pending</div>
          </div>
          <div className="text-center p-3 bg-background rounded-button">
            <div className="text-lg font-semibold text-success">0</div>
            <div className="text-xs text-text-secondary">Approved</div>
          </div>
        </div>
      </div>
    </div>
  );
}
