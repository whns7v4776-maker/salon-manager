const checked = (r: any) => {
  if (r.error) throw new Error(r.error.message || "Verifica non riuscita");
  return r.data;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function reconcilePackage({ admin, session, account, live }: any) {
  const id = session.metadata?.salonpro_package_order;
  if (!id) return;
  const order = checked(
    await admin
      .from("service_package_orders")
      .select("*")
      .eq("id", id)
      .single(),
  );
  if (
    order.account_id !== account ||
    order.livemode !== live ||
    session.livemode !== live ||
    order.provider_session_id !== session.id
  )
    throw Error("Pagamento pacchetto non corrispondente");
  if (order.status === "refunded") return;
  if (session.payment_status === "paid") {
    if (
      session.amount_total !== Number(order.amount_cents) ||
      session.currency !== order.currency
    )
      throw Error("Importo pacchetto non corrispondente");
    checked(
      await admin.rpc("settle_service_package_order", {
        p_order: id,
        p_session: session.id,
        p_account: account,
        p_live: live,
        p_amount: session.amount_total,
        p_currency: session.currency,
        p_intent:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent?.id ?? null),
      }),
    );
  } else if (session.status === "expired")
    checked(
      await admin
        .from("service_package_orders")
        .update({ status: "expired" })
        .eq("id", id)
        .eq("status", "pending"),
    );
}
export async function publicPackagePayment({
  admin,
  stripe,
  body,
  live,
  enabled,
  allowed,
  base,
}: any) {
  if (!["catalog", "checkout", "check", "cancel"].includes(body.operation))
    throw Error("Operazione non valida");
  if (
    String(body.salonCode ?? "").length > 150 ||
    String(body.email ?? "").length > 254 ||
    String(body.phone ?? "").length > 40
  )
    throw Error("Cliente non valido");
  const context = checked(
    await admin.rpc("verified_booking_payment_context", {
      p_salon_code: String(body.salonCode ?? ""),
      p_email: String(body.email ?? ""),
      p_phone: String(body.phone ?? ""),
      p_token: String(body.paymentToken ?? ""),
    }),
  );
  if (!context) throw Error("Verifica la password per accedere ai pacchetti");
  const workspace = context.workspaceId,
    customer = context.customerId;
  const settings = checked(
    await admin
      .from("salon_benefit_settings")
      .select("packages_enabled")
      .eq("workspace_id", workspace)
      .maybeSingle(),
  );
  const account = checked(
    await admin
      .from("cash_stripe_accounts")
      .select("account_id")
      .eq("workspace_id", workspace)
      .eq("livemode", live)
      .maybeSingle(),
  );
  let purchasable = !!(enabled && stripe && account && allowed(workspace));
  if (purchasable) {
    const remote = await stripe.accounts.retrieve(account.account_id);
    purchasable = !!(remote.charges_enabled && remote.payouts_enabled);
  }
  if (body.operation === "catalog")
    return {
      purchasable,
      items: settings?.packages_enabled
        ? checked(
            await admin
              .from("service_package_catalog")
              .select(
                "id,name,entitlements,uses,months,price_cents,product_discount,revision",
              )
              .eq("workspace_id", workspace)
              .eq("archived", false)
              .eq("online_visible", true)
              .gte("price_cents", 50)
              .order("name"),
          )
        : [],
    };
  if (!uuid.test(body.orderId ?? "")) throw Error("Ordine non valido");
  let order;
  if (body.operation === "checkout") {
    if (!purchasable)
      throw Error(
        "Acquisto online non ancora attivo per questo salone. Contatta il salone.",
      );
    if (
      !uuid.test(body.catalogId ?? "") ||
      !Number.isSafeInteger(body.revision)
    )
      throw Error("Pacchetto non valido");
    order = checked(
      await admin.rpc("prepare_service_package_order", {
        p_order: body.orderId,
        p_workspace: workspace,
        p_customer: customer,
        p_catalog: body.catalogId,
        p_revision: body.revision,
      }),
    );
  } else
    order = checked(
      await admin
        .from("service_package_orders")
        .select("*")
        .eq("id", body.orderId)
        .eq("workspace_id", workspace)
        .eq("customer_id", customer)
        .single(),
    );
  if (order.status === "refunded") return { status: "refunded" };
  if (order.package_id) return { status: "paid" };
  if (order.status !== "pending") return { status: order.status };
  // A retry must always use the same account, mode, amount, and frozen terms.
  if (body.operation === "check" && !order.account_id)
    return { status: "pending" };
  if (!order.account_id) {
    checked(
      await admin
        .from("service_package_orders")
        .update({ account_id: account.account_id, livemode: live })
        .eq("id", order.id)
        .is("account_id", null),
    );
    order = checked(
      await admin
        .from("service_package_orders")
        .select("*")
        .eq("id", order.id)
        .single(),
    );
  }
  if (order.livemode !== live || !stripe)
    throw Error("Pagamento da verificare con il salone");
  let session = order.provider_session_id
    ? await stripe.checkout.sessions.retrieve(order.provider_session_id, {
        stripeAccount: order.account_id,
      })
    : null;
  if (!session && ["checkout", "cancel"].includes(body.operation)) {
    if (Date.now() - Date.parse(order.created_at) > 20 * 3600000)
      throw Error("Pagamento da verificare con il salone prima di riprovare");
    session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: order.currency,
              unit_amount: Number(order.amount_cents),
              product_data: { name: order.terms.name },
            },
            quantity: 1,
          },
        ],
        metadata: { salonpro_package_order: order.id },
        payment_intent_data: { metadata: { salonpro_package_order: order.id } },
        success_url: `${base}?action=booking-return`,
        cancel_url: `${base}?action=booking-return`,
      },
      {
        stripeAccount: order.account_id,
        idempotencyKey: `salonpro-package-${order.id}`,
      },
    );
    checked(
      await admin
        .from("service_package_orders")
        .update({ provider_session_id: session.id })
        .eq("id", order.id)
        .is("provider_session_id", null),
    );
    order = checked(
      await admin
        .from("service_package_orders")
        .select("*")
        .eq("id", order.id)
        .single(),
    );
  }
  if (session && body.operation === "cancel") {
    session = await closeUnpaidPackageCheckout(stripe, session, order.account_id);
  }
  if (session)
    await reconcilePackage({ admin, session, account: order.account_id, live });
  return {
    status:
      session?.payment_status === "paid"
        ? "paid"
        : (body.operation === "cancel" && session?.status === "expired" ? "cancelled" : (session?.status ?? "pending")),
    url:
      body.operation === "checkout" && session?.status === "open"
        ? session.url
        : null,
  };
}

// Expire the provider link before removing a local purchase attempt. A payment
// that wins the race is reconciled as paid, never presented as cancelled.
export async function closeUnpaidPackageCheckout(stripe: any, session: any, account: string) {
  if (session.status !== "open" || session.payment_status === "paid") return session;
  try {
    return await stripe.checkout.sessions.expire(session.id, { stripeAccount: account });
  } catch (error) {
    const current = await stripe.checkout.sessions.retrieve(session.id, { stripeAccount: account });
    if (current.status === "open" && current.payment_status !== "paid") throw error;
    return current;
  }
}
