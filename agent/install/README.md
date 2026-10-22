# Running the agent at boot

Persistence here is an ordinary, **visible** OS service. It survives reboots so
the agent keeps checking in after the laptop is powered on or restarted. It does
**not** hide from the OS and will not survive a full disk wipe / OS reinstall —
that is by design (see `docs/RESPONSIBLE_USE.md`).

Assumptions below: the repo is at `/opt/sentinel`, a virtualenv is at
`/opt/sentinel/agent/.venv`, and `config.json` is filled in. Adjust paths.

## Linux (systemd, runs for a logged-in user so it can reach the camera/screen)

Copy `sentinel-agent.service` to `~/.config/systemd/user/`, then:

```bash
systemctl --user daemon-reload
systemctl --user enable --now sentinel-agent
loginctl enable-linger "$USER"   # keep the user service running across logins
```

Capture needs a graphical session (for the screenshot) and camera permissions.

## macOS (launchd)

Edit paths in `com.sentinel.agent.plist`, then:

```bash
cp com.sentinel.agent.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.sentinel.agent.plist
```

macOS will prompt once to grant Camera and Screen Recording permission to the
Python binary; approve it in System Settings → Privacy & Security.

## Windows (Task Scheduler)

Run in an elevated PowerShell (adjust paths):

```powershell
$py  = "C:\opt\sentinel\agent\.venv\Scripts\pythonw.exe"
$arg = "C:\opt\sentinel\agent\sentinel_agent.py"
$action  = New-ScheduledTaskAction -Execute $py -Argument $arg -WorkingDirectory "C:\opt\sentinel\agent"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "SentinelAgent" -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited
```
