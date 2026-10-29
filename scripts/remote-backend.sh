#!/usr/bin/env bash
set -euo pipefail

# Executes commands inside the EC2 Docker backend via AWS Systems Manager
INSTANCE_ID="${FERAS_EC2_INSTANCE_ID:-i-09cefd9363606a4dc}"

if [ $# -eq 0 ]; then
  echo "Usage: ./scripts/remote-backend.sh <node command>"
  echo "Example: ./scripts/remote-backend.sh node backend/src/create-match.js --id gp-002 --title 'Round 2' --lock-at '2026-10-27T19:00:00Z'"
  exit 1
fi

COMMAND="$*"

PARAMS_JSON=$(python3 -c '
import json, sys
cmd = sys.argv[1]
shell_cmd = f"cd /opt/feras && docker compose --env-file .env.aws -f docker-compose.yml -f docker-compose.aws.yml exec -T api {cmd}"
print(json.dumps({"commands": [shell_cmd]}))
' "$COMMAND")

CMD_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters "$PARAMS_JSON" \
  --query "Command.CommandId" \
  --output text)

echo "Sent command $CMD_ID to $INSTANCE_ID. Waiting for execution..."

while true; do
  STATUS=$(aws ssm get-command-invocation \
    --command-id "$CMD_ID" \
    --instance-id "$INSTANCE_ID" \
    --query "Status" \
    --output text 2>/dev/null || echo "Pending")

  if [ "$STATUS" = "Success" ]; then
    aws ssm get-command-invocation \
      --command-id "$CMD_ID" \
      --instance-id "$INSTANCE_ID" \
      --query "StandardOutputContent" \
      --output text
    exit 0
  elif [ "$STATUS" = "Failed" ] || [ "$STATUS" = "Cancelled" ] || [ "$STATUS" = "TimedOut" ]; then
    echo "Command failed with status: $STATUS"
    aws ssm get-command-invocation \
      --command-id "$CMD_ID" \
      --instance-id "$INSTANCE_ID" \
      --query "StandardErrorContent" \
      --output text
    exit 1
  fi
  sleep 2
done
