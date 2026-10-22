"""Show a lock-screen style message to whoever is using the device.

Best-effort and cross-platform. Falls back to a native dialog box so the person
holding the laptop sees the owner's message (e.g. a contact number for return).
This is a notice, not an OS lock — it does not try to seize control of the
machine.
"""

from __future__ import annotations

import platform
import subprocess
import sys


def show(message: str) -> bool:
    if not message:
        return False
    system = platform.system()
    try:
        if system == "Darwin":
            # AppleScript dialog.
            script = (
                'display dialog {msg} with title "Sentinel" '
                "buttons {{\"OK\"}} default button 1 with icon caution"
            ).format(msg=_as_applescript_string(message))
            subprocess.run(["osascript", "-e", script], timeout=30, check=False)
            return True
        if system == "Windows":
            import ctypes  # type: ignore

            # MB_OK | MB_ICONWARNING | MB_SYSTEMMODAL
            ctypes.windll.user32.MessageBoxW(0, message, "Sentinel", 0x30 | 0x1000)
            return True
        # Linux / other: try common dialog tools, then fall back to stderr.
        for tool in (
            ["zenity", "--warning", f"--text={message}", "--title=Sentinel"],
            ["kdialog", "--sorry", message, "--title", "Sentinel"],
            ["notify-send", "Sentinel", message],
        ):
            try:
                subprocess.run(tool, timeout=30, check=False)
                return True
            except FileNotFoundError:
                continue
        print(f"[Sentinel] {message}", file=sys.stderr)
        return True
    except Exception:
        return False


def _as_applescript_string(text: str) -> str:
    escaped = text.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'
