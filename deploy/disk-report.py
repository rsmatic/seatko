#!/usr/bin/env python3
"""Weekly server health email: disk space, memory and Docker usage on the EC2 host.

Runs from the seatko-disk-report systemd timer (see install-disk-report.sh). Settings come from
/etc/seatko-disk-report.env:
  REPORT_TO      where to send the report
  SMTP_USER      Gmail address that sends it
  SMTP_PASSWORD  a Gmail *app password* (myaccount.google.com/apppasswords), not the normal password
  WARN_PERCENT   optional, disk usage that makes the subject say WARNING (default 80)

Run by hand with:  sudo systemctl start seatko-disk-report
Preview without sending:  sudo DRY_RUN=1 python3 disk-report.py
"""
import os
import shutil
import smtplib
import socket
import subprocess
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

MANILA = timezone(timedelta(hours=8))


def run(cmd):
    try:
        out = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120)
        return (out.stdout or out.stderr).strip() or '(no output)'
    except Exception as e:  # report what we can even if one command fails
        return f'(could not run: {e})'


def gb(n):
    return f'{n / 1024 ** 3:.1f} GB'


def main():
    dry_run = bool(os.environ.get('DRY_RUN'))
    to = os.environ.get('REPORT_TO', '(not set)')
    user = os.environ.get('SMTP_USER', '(not set)')
    password = os.environ.get('SMTP_PASSWORD', '').replace(' ', '')
    if not dry_run and not password:
        raise SystemExit('SMTP_PASSWORD is empty: add a Gmail app password to /etc/seatko-disk-report.env')
    warn = int(os.environ.get('WARN_PERCENT', '80'))

    disk = shutil.disk_usage('/')
    pct = disk.used * 100 / disk.total
    status = 'WARNING' if pct >= warn else 'OK'
    now = datetime.now(MANILA)

    memory = run("free -m | awk 'NR==2 {printf \"%d MB used of %d MB, %d MB available\", $3, $2, $7}'")
    containers = run("docker ps --format '{{.Names}}: {{.Status}}' | sort")
    docker_df = run('docker system df')
    volumes = run("docker system df -v | awk '/VOLUME NAME/{f=1;next} /^$/{f=0} f' | sort -k3 -h | tail -8")
    biggest = run('du -xh --max-depth=2 / 2>/dev/null | sort -h | tail -12')

    advice = ''
    if pct >= warn:
        advice = (
            '\nDisk is getting full. Safe ways to free space:\n'
            '  sudo docker builder prune -f      # old build cache (usually the biggest win)\n'
            '  sudo docker image prune -f        # unused images\n'
            '  sudo journalctl --vacuum-size=200M\n'
            'Or grow the EBS volume in the AWS console.\n'
        )

    body = f"""EC2 server report for {socket.gethostname()}
{now:%A, %B %d, %Y %I:%M %p} (Manila time)

DISK (/)
  Free:  {gb(disk.free)}
  Used:  {gb(disk.used)} of {gb(disk.total)} ({pct:.0f}%)
  Status: {status} (warning at {warn}%)
{advice}
MEMORY
  {memory}

RUNNING CONTAINERS
{containers}

DOCKER DISK USAGE
{docker_df}

LARGEST DOCKER VOLUMES
{volumes}

LARGEST FOLDERS
{biggest}

--
Sent every Friday by the seatko-disk-report timer.
Stop it with: sudo systemctl disable --now seatko-disk-report.timer
"""

    msg = EmailMessage()
    msg['Subject'] = f'[EC2 {status}] {gb(disk.free)} free ({pct:.0f}% used) · {now:%b %d}'
    msg['From'] = f'EC2 report <{user}>'
    msg['To'] = to
    msg.set_content(body)

    if dry_run:
        print(f'Subject: {msg["Subject"]}\n\n{body}')
        return

    with smtplib.SMTP_SSL(os.environ.get('SMTP_HOST', 'smtp.gmail.com'), int(os.environ.get('SMTP_PORT', '465')), timeout=30) as s:
        s.login(user, password)
        s.send_message(msg)
    print(f'Sent report to {to}: {msg["Subject"]}')


if __name__ == '__main__':
    main()
