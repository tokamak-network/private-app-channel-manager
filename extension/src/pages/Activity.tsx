import { useState } from 'react';
import { Clock, CheckCircle, XCircle, RefreshCw, AlertCircle } from "lucide-react";
import { useProofs } from "../hooks/useProofs";
import { useSettings } from "../hooks/useSettings";

type FilterType = "all" | "pending" | "approved" | "rejected";

export default function Activity() {
  const { proofs, isLoading, error, refetch } = useProofs();
  const { settings } = useSettings();
  const [filter, setFilter] = useState<FilterType>("all");

  const statusConfig = {
    pending: { icon: Clock, color: "text-warning", label: "Pending" },
    approved: { icon: CheckCircle, color: "text-success", label: "Approved" },
    rejected: { icon: XCircle, color: "text-error", label: "Rejected" },
  };

  const filteredProofs = proofs.filter((proof) => 
    filter === "all" ? true : proof.status === filter
  );

  const stats = {
    total: proofs.length,
    pending: proofs.filter(p => p.status === 'pending').length,
    approved: proofs.filter(p => p.status === 'approved').length,
    rejected: proofs.filter(p => p.status === 'rejected').length,
  };

  const formatDate = (timestamp: string | number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!settings.leaderServerUrl || !settings.channelId) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full text-center space-y-3">
        <AlertCircle className="w-10 h-10 text-text-secondary" />
        <div>
          <h3 className="font-medium">Configuration Required</h3>
          <p className="text-sm text-text-secondary mt-1">
            Please configure Leader Server URL and Channel ID in Settings to view activity.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Activity</h2>
        <button 
          onClick={() => refetch()}
          disabled={isLoading}
          className="p-1.5 hover:bg-surface rounded-full transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 text-text-secondary ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-button transition-colors capitalize ${
              filter === f 
                ? 'bg-primary text-white' 
                : 'bg-surface text-text-secondary hover:text-text-primary'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 -mx-2 px-2">
        {isLoading && proofs.length === 0 ? (
          <div className="space-y-3">
             {[1, 2, 3].map((i) => (
               <div key={i} className="bg-surface rounded-card p-4 animate-pulse h-20" />
             ))}
          </div>
        ) : error ? (
          <div className="text-center py-8 space-y-3">
            <div className="text-error mb-2"><AlertCircle className="w-8 h-8 mx-auto" /></div>
            <p className="text-sm text-text-secondary">{error}</p>
            <button 
              onClick={() => refetch()}
              className="text-xs text-primary hover:underline"
            >
              Try Again
            </button>
          </div>
        ) : filteredProofs.length === 0 ? (
          <div className="bg-surface rounded-card p-8 text-center space-y-3 mt-4">
            <Clock className="w-10 h-10 text-text-tertiary mx-auto" />
            <div>
              <h3 className="font-medium">No Activity</h3>
              <p className="text-sm text-text-secondary mt-1">
                {filter === 'all' 
                  ? 'Your proofs will appear here' 
                  : `No ${filter} proofs found`}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2 pb-4">
            {filteredProofs.map((proof) => {
              const { icon: StatusIcon, color, label } = statusConfig[proof.status];
              return (
                <div
                  key={proof.key}
                  className="bg-surface rounded-card p-4 flex items-center gap-3"
                >
                  <div className={`p-2 rounded-full bg-background ${color}`}>
                    <StatusIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-text-primary">
                        Proof #{proof.sequenceNumber}-{proof.subNumber}
                      </span>
                      <span className={`text-xs font-medium ${color} px-2 py-0.5 rounded-full bg-background`}>
                        {label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-text-tertiary font-mono truncate max-w-[120px]" title={proof.proofId}>
                        {proof.proofId.substring(0, 10)}...
                      </span>
                      <span className="text-xs text-text-tertiary">
                        {formatDate(proof.submittedAt)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="bg-surface rounded-card p-4 shrink-0 mt-auto">
        <h3 className="text-xs font-medium text-text-secondary mb-3 uppercase tracking-wider">Proof Summary</h3>
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-2 bg-background rounded-button">
            <div className="text-lg font-semibold text-text-primary">{stats.total}</div>
            <div className="text-[10px] text-text-secondary uppercase">Total</div>
          </div>
          <div className="text-center p-2 bg-background rounded-button">
            <div className="text-lg font-semibold text-warning">{stats.pending}</div>
            <div className="text-[10px] text-text-secondary uppercase">Pending</div>
          </div>
          <div className="text-center p-2 bg-background rounded-button">
            <div className="text-lg font-semibold text-success">{stats.approved}</div>
            <div className="text-[10px] text-text-secondary uppercase">Approved</div>
          </div>
          <div className="text-center p-2 bg-background rounded-button">
            <div className="text-lg font-semibold text-error">{stats.rejected}</div>
            <div className="text-[10px] text-text-secondary uppercase">Rejected</div>
          </div>
        </div>
      </div>
    </div>
  );
}
