import { requestCashAccess } from "./cash-passkey";
import { supabase } from "./supabase";

/** Reauthenticate the current owner on the server without changing the app session. */
export async function verifyCashOwnerPassword(
  password: string,
  expectedEmail: string,
) {
  const current = await supabase.auth.getUser();
  const user = current.data.user;
  if (
    current.error ||
    !user?.email ||
    user.email.toLowerCase() !== expectedEmail.trim().toLowerCase()
  )
    throw new Error(
      "Accedi con l’account del titolare per usare questo sblocco.",
    );
  if (!password) throw new Error("Inserisci la password del titolare.");
  const result = await requestCashAccess({
    action: "verify-password",
    password,
  });
  if (result.verified !== true)
    throw new Error("Verifica del titolare non riuscita.");
}
