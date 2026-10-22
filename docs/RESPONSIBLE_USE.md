# Responsible use

Sentinel captures a webcam photo and a screenshot when a device is marked
stolen. That is powerful, and in the wrong hands it is indistinguishable from
spyware. Please use it only as intended.

## Rules this project expects you to follow

1. **Own the device.** Install Sentinel only on hardware you own, or that you
   are explicitly authorized by the owner to manage.
2. **Capture only when genuinely lost.** Evidence capture is gated behind the
   `stolen` state that *you* set from the server. Do not wire capture to run
   during normal use, and do not use Sentinel to watch another person who uses
   the machine with your permission.
3. **Know your local law.** Recording images of a person, even one who has
   stolen your property, is regulated differently across jurisdictions. Covert
   recording can be a crime even when the subject is a thief. When you recover a
   device, prefer handing location and evidence to the police rather than acting
   on it yourself.
4. **Protect the evidence.** Webcam photos and screenshots can contain other
   people and sensitive information. Keep your server private, use a strong
   `SENTINEL_ADMIN_TOKEN`, and delete evidence you no longer need.

## Why there is no keylogger

A keylogger records everything typed — including the legitimate owner's
passwords and messages — and is never required to locate or recover a device.
It is the defining component of stalkerware, so Sentinel does not include one
and the project will not accept one.

## Why persistence is not a rootkit

Sentinel installs as a normal, visible OS service (systemd / launchd / Task
Scheduler). It does not hide from the OS and does not attempt to survive a disk
wipe or firmware reflash. A determined thief who reinstalls the OS can remove
it. Surviving that legitimately requires firmware/MDM anti-theft features
provided by the hardware vendor, which are outside this project.
