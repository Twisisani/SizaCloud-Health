#!/bin/bash
# SizaCloud EC2 Auto Scaling Launch Template User Data Script (Amazon Linux 2023)
set -e

dnf update -y
dnf install -y python3-pip python3-devel postgresql-devel git cronie

# Create least-privilege system user
useradd -r -s /sbin/nologin sizacloud_user || true

mkdir -p /opt/sizacloud
cd /opt/sizacloud

# Copy or clone production repository
git clone https://github.com/your-username/sizacloud.git .
pip3 install --no-cache-dir -r backend/requirements.txt

chown -R sizacloud_user:sizacloud_user /opt/sizacloud
chmod -R 750 /opt/sizacloud

cat <<EOF > /etc/systemd/system/sizacloud.service
[Unit]
Description=Gunicorn server for SizaCloud Queue Management API
After=network.target

[Service]
User=sizacloud_user
Group=sizacloud_user
WorkingDirectory=/opt/sizacloud/backend
Environment="AWS_DEFAULT_REGION=af-south-1"
ExecStart=/usr/local/bin/gunicorn --workers 3 --bind 0.0.0.0:8000 app:app
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now sizacloud.service