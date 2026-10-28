import { reconcilePackage, publicPackagePayment } from "./package-payment.ts";
function assert(value: unknown, message: string) {
  if (!value) throw Error(message);
}
function mock(order: any) {
  const calls: any[] = [];
  const admin = {
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      single: async () => ({ data: order }),
      update(values: any) {
        calls.push(values);
        return this;
      },
      then(resolve: any) {
        return Promise.resolve({ data: order }).then(resolve);
      },
    }),
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      return { data: order.id };
    },
  };
  return { admin, calls };
}
const order = {
  id: "o",
  account_id: "acct",
  livemode: false,
  provider_session_id: "cs",
  amount_cents: 4500,
  currency: "eur",
};
const session = {
  id: "cs",
  metadata: { salonpro_package_order: "o" },
  livemode: false,
  payment_status: "paid",
  amount_total: 4500,
  currency: "eur",
  payment_intent: "pi",
};
Deno.test(
  "Only verified matching paid sessions reach atomic settlement",
  async () => {
    const { admin, calls } = mock(order);
    await reconcilePackage({ admin, session, account: "acct", live: false });
    assert(
      calls.length === 1 && calls[0].name === "settle_service_package_order",
      "Missing atomic settlement",
    );
    for (const patch of [
      { amount_total: 4400 },
      { currency: "usd" },
      { id: "other" },
      { livemode: true },
    ]) {
      const bad = mock(order);
      let rejected = false;
      try {
        await reconcilePackage({
          admin: bad.admin,
          session: { ...session, ...patch },
          account: "acct",
          live: false,
        });
      } catch {
        rejected = true;
      }
      assert(rejected && !bad.calls.length, "Mismatch mutated the ledger");
    }
    const unpaid = mock(order);
    await reconcilePackage({
      admin: unpaid.admin,
      session: { ...session, payment_status: "unpaid", status: "open" },
      account: "acct",
      live: false,
    });
    assert(!unpaid.calls.length, "Unpaid session activated package");
  },
);
Deno.test(
  "Customer identity must be verified before reading catalog",
  async () => {
    let reads = 0;
    const admin = {
      rpc: async () => ({ data: null }),
      from: () => {
        reads++;
        throw Error("Unexpected read");
      },
    };
    let rejected = false;
    try {
      await publicPackagePayment({
        admin,
        body: { operation: "catalog" },
        live: false,
        enabled: true,
        allowed: () => true,
      });
    } catch {
      rejected = true;
    }
    assert(rejected && reads === 0, "Unverified catalog access");
  },
);

Deno.test('cancel closes an unpaid checkout on its connected account', async () => {
  const {closeUnpaidPackageCheckout}=await import('./package-payment.ts');
  const calls:any[]=[];
  const result=await closeUnpaidPackageCheckout({checkout:{sessions:{expire:async(id:any,opts:any)=>{calls.push([id,opts]);return {status:'expired',payment_status:'unpaid'};}}}},{id:'cs',status:'open',payment_status:'unpaid'},'acct');
  assert(result.status==='expired' && calls[0][1].stripeAccount==='acct','unpaid link was not expired');
});
Deno.test('a payment winning the cancellation race is preserved', async () => {
  const {closeUnpaidPackageCheckout}=await import('./package-payment.ts');
  const paid={id:'cs',status:'complete',payment_status:'paid'};
  const stripe={checkout:{sessions:{expire:async()=>{throw Error('completed');},retrieve:async()=>paid}}};
  assert(await closeUnpaidPackageCheckout(stripe,{id:'cs',status:'open',payment_status:'unpaid'},'acct')===paid,'paid session was lost');
});
Deno.test('a failed provider cancellation does not pretend success', async () => {
  const {closeUnpaidPackageCheckout}=await import('./package-payment.ts');
  const open={id:'cs',status:'open',payment_status:'unpaid'};
  let failed=false;
  try {await closeUnpaidPackageCheckout({checkout:{sessions:{expire:async()=>{throw Error('network');},retrieve:async()=>open}}},open,'acct');}catch{failed=true;}
  assert(failed,'open checkout was silently cancelled');
});
