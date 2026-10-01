#!/usr/bin/env bash
# Installs the weekly server report (every Friday 8:00 AM Manila time) as a systemd timer.
#   sudo bash ~/seatko/deploy/install-disk-report.sh you@gmail.com
# Then put the Gmail app password in /etc/seatko-disk-report.env (see disk-report.py).
set -euo pipefail

TO="${1:?usage: install-disk-report.sh recipient@example.com}"
DIR="$(cd "$(dirname "$0")" && pwd)"
ENV=/etc/seatko-disk-report.env

if [ ! -f "$ENV" ]; then
  install -m 600 /dev/null "$ENV"
  cat > "$ENV" <<EOF
REPORT_TO=$TO
SMTP_USER=$TO
SMTP_PASSWORD=
WARN_PERCENT=80
EOF
fi

cat > /etc/systemd/system/seatko-disk-report.service <<EOF
[Unit]
Description=Weekly EC2 disk space email
Wants=network-online.target
After=network-online.target docker.service

[Service]
Type=oneshot
EnvironmentFile=$ENV
ExecStart=/usr/bin/python3 $DIR/disk-report.py
EOF

cat > /etc/systemd/system/seatko-disk-report.timer <<EOF
[Unit]
Description=Weekly EC2 disk space email (Fridays 8:00 AM Manila)

[Timer]
OnCalendar=Fri *-*-* 08:00:00 Asia/Manila
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now seatko-disk-report.timer
systemctl list-timers seatko-disk-report.timer --no-pager
