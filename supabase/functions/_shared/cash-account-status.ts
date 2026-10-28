// Keep readiness identical to the checks used when a customer starts checkout.
export async function cashAccountStatus(admin: any, stripe: any, workspaceId: string, account: any, live: boolean) {
  if (!account) return { configured: true, connected: false, live };
  const remote = await stripe.accounts.retrieve(account.account_id);
  const refunds = await admin.from('cash_stripe_payments').select('id,movement_id,status,refunded_cents')
    .eq('workspace_id', workspaceId).eq('account_id', account.account_id)
    .gt('refunded_cents', 0).limit(1);
  if (refunds.error) throw new Error('database');
  return {
    configured: true, connected: true,
    ready: remote.charges_enabled === true && remote.payouts_enabled === true,
    live: account.livemode,
    // Older installed clients use this list only to display the refund warning.
    payments: refunds.data ?? [],
  };
}
