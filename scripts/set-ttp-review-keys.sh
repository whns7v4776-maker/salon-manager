#!/usr/bin/env bash
# Asks for the Stripe TEST keys used by `cash-stripe-ttp-review` (Apple Tap to Pay review videos)
# and stores them as Supabase secrets. Keys are read without echo and never written to disk.
set -euo pipefail
cd "$(dirname "$0")/.."

read -r -s -p "Incolla la chiave segreta di test (inizia con sk_test_) e premi Invio: " secret_key; echo
secret_key="$(printf '%s' "$secret_key" | tr -d '[:space:]')"
if [[ "$secret_key" != sk_test_* ]]; then
  echo "Questa non è una chiave di test (deve iniziare con sk_test_). Niente è stato salvato."; exit 1
fi

read -r -p "Incolla il client ID di test (inizia con ca_) e premi Invio: " client_id
client_id="$(printf '%s' "$client_id" | tr -d '[:space:]')"
if [[ "$client_id" != ca_* ]]; then
  echo "Questo non è un client ID (deve iniziare con ca_). Niente è stato salvato."; exit 1
fi

npx supabase secrets set \
  "TTP_REVIEW_CASH_STRIPE_SECRET_KEY=$secret_key" \
  "TTP_REVIEW_CASH_STRIPE_CONNECT_CLIENT_ID=$client_id" >/dev/null
unset secret_key client_id
echo "Fatto: chiavi di test salvate su Supabase."
