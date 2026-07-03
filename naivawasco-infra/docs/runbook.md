# NAIVAWASCO Operations Runbook

## Daily Checks

```bash
cd /opt/naivawasco/prod
docker compose -p naivawasco-prod ps
docker compose -p naivawasco-prod logs --tail=100 backend
docker compose -p naivawasco-prod logs --tail=100 cloudflared
ls -lh /var/backups/naivawasco/prod | tail
df -h
```

## Start or Restart Production

```bash
cd /opt/naivawasco/prod
docker compose -p naivawasco-prod up -d
docker compose -p naivawasco-prod ps
```

## View Logs

```bash
cd /opt/naivawasco/prod
docker compose -p naivawasco-prod logs -f backend
docker compose -p naivawasco-prod logs -f frontend
docker compose -p naivawasco-prod logs -f db
docker compose -p naivawasco-prod logs -f cloudflared
```

## Create Backup

```bash
/opt/naivawasco/infra/scripts/backup_postgres.sh /opt/naivawasco/prod naivawasco-prod /var/backups/naivawasco/prod
```

Recommended cron:

```cron
15 23 * * * /opt/naivawasco/infra/scripts/backup_postgres.sh /opt/naivawasco/prod naivawasco-prod /var/backups/naivawasco/prod >> /var/log/naivawasco-backup.log 2>&1
```

## Restore Backup

Restore into staging first unless this is a confirmed production recovery.

```bash
/opt/naivawasco/infra/scripts/restore_postgres.sh /opt/naivawasco/staging naivawasco-staging /var/backups/naivawasco/prod/latest.dump.gz
```

## Django Commands

```bash
cd /opt/naivawasco/prod
docker compose -p naivawasco-prod exec backend python manage.py check
docker compose -p naivawasco-prod exec backend python manage.py createsuperuser
docker compose -p naivawasco-prod exec backend python manage.py migrate
```

## Rollback

1. Edit `/opt/naivawasco/prod/.env`.
2. Set previous image tags:

```env
BACKEND_IMAGE=ghcr.io/YOUR_ORG/naivawasco-backend:<previous-tag>
FRONTEND_IMAGE=ghcr.io/YOUR_ORG/naivawasco-frontend:<previous-tag>
```

3. Redeploy:

```bash
/opt/naivawasco/infra/scripts/deploy.sh /opt/naivawasco/prod naivawasco-prod
```

Do not roll back database migrations blindly. Test restore/rollback in staging first.

## Cloudflare Tunnel Troubleshooting

```bash
cd /opt/naivawasco/prod
docker compose -p naivawasco-prod logs --tail=200 cloudflared
docker compose -p naivawasco-prod restart cloudflared
```

Confirm public access:

```bash
curl -I https://app.your-domain.com
curl -I https://app.your-domain.com/admin/
```

