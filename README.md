# Sentinel — Laptop Anti-Theft & Recovery

Sentinel is a self-hosted anti-theft and recovery system for a laptop **you
own**. You run a small server; a lightweight agent runs on your laptop and
checks in with the server. From the server you can flag the laptop as
**stolen**. While it is flagged stolen, the agent reports its location more
often and captures recovery evidence (a webcam photo and a screenshot) and
uploads it to your server, so you can identify who has the device and where it
is.

It is built to help you **recover a lost or stolen laptop**, the same way
established tools such as [Prey](https://github.com/prey/prey-node-client) work.

## What it does

- **Mark as stolen / recovered** — you control the device's state from the server.
- **Location reporting** — the agent reports approximate location (IP geolocation)
  on every boot and on a schedule. Reporting speeds up while stolen.
- **Recovery evidence while stolen** — when (and only when) the device is marked
  stolen, the agent captures a webcam photo and a screenshot and uploads them.
- **Lock message** — push a full-screen message (e.g. "This laptop is stolen —
  contact …") to show on the device.
- **Auto-start persistence** — install the agent as a service so it survives
  reboots (systemd / launchd / Windows Task Scheduler). See `agent/install/`.

## What it deliberately does **not** do

Sentinel is a recovery tool, not surveillance software. By design it does not:

- **Keylog.** It never records keystrokes. A keylogger captures passwords and
  private messages of whoever types and is not needed to recover a device.
- **Covertly watch normal use.** The camera and screen are only captured while
  the device is in the **stolen** state that you set — not continuously during
  ordinary use.
- **Hide from the operating system / survive a disk wipe via a firmware
  rootkit.** Persistence is an ordinary, inspectable OS service. A thief who
  fully wipes and reinstalls the OS, or reflashes firmware, can remove it;
  surviving that requires legitimate hardware-vendor / MDM enrollment, which is
  out of scope here.

## Responsible use

Only install Sentinel on devices **you own or are authorized to manage**.
Recording someone covertly can be illegal depending on where you live, and the
"stolen" trigger exists so capture only happens when you have genuinely lost
control of the device. Don't use this to monitor another person. See
[`docs/RESPONSIBLE_USE.md`](docs/RESPONSIBLE_USE.md).

## Quick start

### Server

```bash
cd server
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export SENTINEL_ADMIN_TOKEN="pick-a-long-random-secret"
uvicorn app:app --host 0.0.0.0 --port 8000
```

Enroll a device (returns a `device_token` for the agent):

```bash
curl -s -X POST http://localhost:8000/api/devices \
  -H "Authorization: Bearer $SENTINEL_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-laptop"}'
```

### Agent (on the laptop)

```bash
cd agent
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp config.example.json config.json   # then edit server_url + device_token
python sentinel_agent.py --once       # one check-in, to verify it works
python sentinel_agent.py              # run continuously
```

### Mark the laptop stolen / recovered

```bash
# stolen (optionally push a lock message)
curl -s -X POST http://localhost:8000/api/devices/<id>/stolen \
  -H "Authorization: Bearer $SENTINEL_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"This laptop is stolen. Call +1-555-0100 for a reward."}'

# recovered
curl -s -X POST http://localhost:8000/api/devices/<id>/recovered \
  -H "Authorization: Bearer $SENTINEL_ADMIN_TOKEN"

# see latest check-ins, location and evidence
curl -s http://localhost:8000/api/devices/<id> \
  -H "Authorization: Bearer $SENTINEL_ADMIN_TOKEN"
```

To run the agent automatically at boot, see [`agent/install/README.md`](agent/install/README.md).

## Layout

```
server/   FastAPI control server (device state, check-ins, evidence store)
agent/    Cross-platform Python agent (check-in, location, capture)
docs/     Responsible-use notes
```
