# Phoning home to `kubuntux`

The agent reports to a Sentinel server you run on your `kubuntux` box.

## 1. Run the server on kubuntux

```bash
# on kubuntux
git clone <this repo> && cd tadpod
export SENTINEL_ADMIN_TOKEN="$(openssl rand -base64 36)"   # save this somewhere safe
docker compose -f docker-compose.kubuntux.yml up -d
curl -s http://localhost:8000/healthz      # -> {"ok":true}
```

Enrol the laptop and copy the returned `device_token`:

```bash
curl -s -X POST http://localhost:8000/api/devices \
  -H "Authorization: Bearer $SENTINEL_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-laptop"}'
```

## 2. Point the laptop's agent at kubuntux

Copy `agent/config.kubuntux.json` to `agent/config.json`, paste the
`device_token`, then run the agent (and install it as a service — see
`agent/install/README.md`).

## 3. Make kubuntux reachable from anywhere  ← important

On your home network, `http://kubuntux:8000` resolves fine. But a **stolen
laptop is usually on someone else's network**, where the name `kubuntux` and
your LAN IP mean nothing. For the agent to actually phone home from out in the
world, kubuntux must be reachable over the internet. Pick one:

- **Mesh VPN (recommended, easiest, no open ports):** install something like
  Tailscale on both kubuntux and the laptop. Then set `server_url` to the
  laptop-reachable name, e.g. `http://kubuntux.tail-scale-net.ts.net:8000`, and
  the agent reaches home from any network. Because the tunnel is already
  encrypted you can leave `verify_tls` as `false`.

- **Port-forward + dynamic DNS:** forward TCP 8000 on your router to kubuntux,
  get a DDNS name (e.g. `kubuntux.ddns.net`), and set
  `server_url` to that. In this case **put it behind HTTPS** (a reverse proxy
  such as Caddy or nginx with a Let's Encrypt cert) and set `verify_tls` to
  `true` — you're exposing it to the public internet, so the admin token and
  evidence must travel encrypted.

`verify_tls: false` in `config.kubuntux.json` is only appropriate for plain
HTTP over a trusted LAN or an already-encrypted VPN tunnel. Never send the
device token or evidence over plain HTTP across the open internet.

## 4. If it's taken

```bash
# mark stolen (and show a message on the screen)
curl -s -X POST http://localhost:8000/api/devices/<id>/stolen \
  -H "Authorization: Bearer $SENTINEL_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"This laptop is stolen. Call +64-21-000-0000."}'

# watch location + evidence come in
curl -s http://localhost:8000/api/devices/<id> \
  -H "Authorization: Bearer $SENTINEL_ADMIN_TOKEN" | python3 -m json.tool
```

Hand the location and any webcam evidence to the police rather than confronting
the holder yourself.

## SIM card in the laptop (recommended)

Putting a SIM in the laptop's WWAN modem is the most reliable setup:

- **Always-on connectivity.** The laptop has its own internet whenever it's
  powered on, so it phones home to kubuntux even if the holder never joins a
  Wi-Fi network. (It still needs kubuntux to be internet-reachable — see step 3;
  a mesh VPN like Tailscale over the cellular link works well.)
- **Real location.** The agent reads location straight from the modem via
  ModemManager — a GNSS/GPS fix when the modem has one, otherwise cell-tower
  identity (MCC/MNC/LAC/CID) — and prefers it over coarse IP geolocation.

Enable the modem's GPS once (Linux, ModemManager):

```bash
mmcli -L                       # find the modem index, e.g. 0
mmcli -m 0 --location-enable-gps-raw --location-enable-gps-nmea
mmcli -m 0 --location-get      # confirm you get a fix
```

After that the agent picks it up automatically — a check-in from a located
device shows `"accuracy": "gnss"` with real lat/long, or `"accuracy":
"cell-tower"` with the serving cell in `extra`. No modem? It silently falls
back to IP geolocation, so the same agent runs everywhere.
