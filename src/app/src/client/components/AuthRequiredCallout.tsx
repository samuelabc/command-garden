export function AuthRequiredCallout({ message }: { message?: string }) {
  return (
    <div role="alert" className="alert alert-warning">
      <span>{message ?? 'Sign in to the target app in Chrome, then try again.'}</span>
    </div>
  );
}
