# Query live data endpoint contract

The Query live data section sends a server-side `GET` request to the configured
HTTPS endpoint. The URL must contain `{clientName}` exactly once. The
placeholder is replaced with the URL-encoded name supplied in the chat.

## Request

The orchestrator sends:

- `Authorization: Bearer <value of the configured LIVE_QUERY_ Replit secret>`
- `X-Orchestrator-Caller-Id: <verified workspace user ID>`
- `X-Orchestrator-Agent-Id: <agent ID>`
- `Accept: application/json`

Only signed-in workspace users can make a live client lookup. Anonymous widget
sessions do not receive client records. The endpoint must independently enforce
the caller's access; the agent token alone is not authorization to view every
client.

## Response

Return HTTP 200 with `Content-Type: application/json` and this shape:

```json
{
  "authorized": true,
  "authorizedForUserId": "the exact X-Orchestrator-Caller-Id value",
  "clients": [
    {
      "authorized": true,
      "name": "Ana García",
      "facts": {
        "callStatus": "completed"
      }
    }
  ]
}
```

For no matching client, return an empty `clients` array. Return only records
authorized for the caller. A record is ignored unless its `authorized` value is
`true`. The orchestrator checks that `authorizedForUserId` matches the verified
caller ID and selects only the field keys configured in the agent settings.
Use `facts` for top-level string, number, or boolean values. Do not return
nested objects, secrets, access tokens, or unrelated records.

Only fields configured in **Fields the assistant may use in replies** are passed
to the answer model as client facts. If a name matches more than one authorized
client, the assistant will not choose one automatically; it asks for a more
specific name.

## Limits and safety

The server rejects non-HTTPS, local/private-address, and redirected requests.
Requests time out after 4.5 seconds and responses are limited to 64 KiB.
Endpoint response values are treated as untrusted data, restricted to the
configured field allowlist, and are not included in orchestration prompt logs.
