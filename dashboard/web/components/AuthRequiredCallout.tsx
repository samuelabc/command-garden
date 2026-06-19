import { ShieldAlert } from 'lucide-react';

export function AuthRequiredCallout({ message }: { message?: string }) {
  return (
    <div role="alert" className="alert alert-warning">
      <ShieldAlert className="h-5 w-5" />
      <div>
        <h3 className="font-bold">Sign-in required</h3>
        <div className="text-sm">
          opencli needs your logged-in browser. Open Chrome, sign in to the Mercedes app, then retry.
          {message ? <div className="opacity-70 mt-1">{message}</div> : null}
        </div>
      </div>
    </div>
  );
}
