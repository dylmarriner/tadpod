"""Recovery-evidence capture.

Captures a single webcam photo and/or a single screenshot. Used **only** when
the server reports the device is stolen. Both functions return ``bytes`` on
success or ``None`` if capture is unavailable (no camera, missing optional
dependency, headless session) — the agent treats that as a skipped capture, not
an error.

There is deliberately no video streaming and no continuous capture: a stolen
device takes an occasional still for identification, nothing more.
"""

from __future__ import annotations

from typing import Optional


def webcam_photo() -> Optional[bytes]:
    """Grab one frame from the default camera, return JPEG bytes."""
    try:
        import cv2  # type: ignore
    except Exception:
        return None

    cam = None
    try:
        cam = cv2.VideoCapture(0)
        if not cam or not cam.isOpened():
            return None
        # Discard a few frames so auto-exposure settles before the shot.
        frame = None
        for _ in range(5):
            ok, frame = cam.read()
            if not ok:
                frame = None
        if frame is None:
            return None
        ok, buf = cv2.imencode(".jpg", frame)
        if not ok:
            return None
        return buf.tobytes()
    except Exception:
        return None
    finally:
        try:
            if cam is not None:
                cam.release()
        except Exception:
            pass


def screenshot() -> Optional[bytes]:
    """Capture the primary monitor, return PNG bytes."""
    try:
        import mss  # type: ignore
        import mss.tools  # type: ignore
    except Exception:
        return None

    try:
        with mss.mss() as sct:
            monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
            shot = sct.grab(monitor)
            png = mss.tools.to_png(shot.rgb, shot.size)
            return png
    except Exception:
        return None
