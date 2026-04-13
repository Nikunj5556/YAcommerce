import { Link } from "wouter";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

export default function EmptyState({ icon: Icon, title, description, actionLabel, actionHref }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-6">
        <Icon size={36} className="text-amber-500" />
      </div>
      <h3 data-testid="text-empty-title" className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
      <p data-testid="text-empty-description" className="text-gray-500 max-w-sm mb-6">{description}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          data-testid="link-empty-action"
          className="inline-flex items-center px-6 py-3 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 transition-colors"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
