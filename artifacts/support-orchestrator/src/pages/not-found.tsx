export default function NotFound() {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-background text-sm">
      <div className="space-y-3 text-center">
        <div className="text-5xl font-semibold text-primary mb-1">404</div>
        <div className="text-lg font-semibold text-foreground">Page not found</div>
        <div className="text-muted-foreground">The page you're looking for doesn't exist or may have moved.</div>
        <div className="pt-4">
          <a href="/" className="text-primary font-medium hover:underline underline-offset-4">Back to home</a>
        </div>
      </div>
    </div>
  );
}
