import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  // #region agent log
  fetch('http://127.0.0.1:7743/ingest/fbcc6644-f5ef-42d5-8361-4b0eb31d88ad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0657f2'},body:JSON.stringify({sessionId:'0657f2',hypothesisId:'A',location:'index.ts:listen',message:'API server listening',data:{port},timestamp:Date.now(),runId:'pre-fix'})}).catch(()=>{});
  // #endregion
});
