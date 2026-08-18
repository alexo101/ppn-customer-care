export default function NotFound() {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-background font-mono text-sm">
      <div className="space-y-4 text-center">
        <div className="text-4xl text-destructive mb-2">404</div>
        <div className="text-foreground">TARGET_NOT_FOUND</div>
        <div className="text-muted-foreground">The requested route does not exist.</div>
        <div className="pt-4">
          <a href="/" className="text-primary hover:underline underline-offset-4">RETURN_TO_BASE</a>
        </div>
      </div>
    </div>
  );
}
