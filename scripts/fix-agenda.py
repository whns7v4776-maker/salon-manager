#!/usr/bin/env python3
"""Riscrive eliminaAppuntamentoFuturo in agenda.tsx e pulisce il finalizeWeekDrag dai tombstone"""
import sys

filepath = 'app/(tabs)/agenda.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

OLD_ELIM_START = "  const eliminaAppuntamentoFuturo = (item: AppuntamentoItem) => {"
OLD_ELIM_END = "  const renderAppuntamentoCard = (item: AppuntamentoItem, compact = false) => {"

start_idx = content.find(OLD_ELIM_START)
end_idx = content.find(OLD_ELIM_END)

if start_idx == -1:
    print("ERROR: eliminaAppuntamentoFuturo start not found", file=sys.stderr)
    sys.exit(1)
if end_idx == -1:
    print("ERROR: renderAppuntamentoCard not found", file=sys.stderr)
    sys.exit(1)

print(f"Found eliminaAppuntamentoFuturo block: chars {start_idx}..{end_idx}")
print("OLD block (last 200 chars):", repr(content[end_idx-200:end_idx]))

NEW_ELIM = """  const eliminaAppuntamentoFuturo = (item: AppuntamentoItem) => {
    const appointmentDate = item.data ?? todayDate;

    if (!isAppointmentInFuture(item, todayDate)) {
      hapticAlert(
        tApp(appLanguage, 'agenda_delete_unavailable_title'),
        tApp(appLanguage, 'agenda_delete_unavailable_body')
      );
      return;
    }

    hapticAlert(
      tApp(appLanguage, 'agenda_delete_title'),
      `Vuoi eliminare l\u2019appuntamento di ${item.cliente} del ${formatDateCompact(
        appointmentDate
      )} alle ${item.ora}?\\n\\nLo slot torner\u00e0 disponibile in agenda.`,
      [
        { text: tApp(appLanguage, 'common_cancel'), style: 'cancel' },
        {
          text: tApp(appLanguage, 'agenda_delete_confirm'),
          style: 'destructive',
          onPress: () => {
            const pendingRequestId = item.id.startsWith('pending-')
              ? item.id.replace(/^pending-/, '')
              : null;

            // Rimozione ottimistica immediata
            setAppuntamenti((current) =>
              current.filter((appointment) => {
                const sameId = appointment.id === item.id;
                const sameComposite =
                  (appointment.data ?? todayDate) === appointmentDate &&
                  normalizeTimeIdentity(appointment.ora) === normalizeTimeIdentity(item.ora) &&
                  appointment.servizio.trim().toLowerCase() === item.servizio.trim().toLowerCase() &&
                  appointment.cliente.trim().toLowerCase() === item.cliente.trim().toLowerCase();
                return !(sameId || sameComposite);
              })
            );

            void (async () => {
              const result = pendingRequestId
                ? await updateBookingRequestStatusForSalon({
                    salonCode: salonWorkspace.salonCode,
                    requestId: pendingRequestId,
                    status: 'Annullata',
                  })
                : await cancelOwnerAppointmentForSalon({
                    salonCode: salonWorkspace.salonCode,
                    appointmentId: item.id,
                    appointmentDate,
                    appointmentTime: item.ora,
                    customerName: item.cliente,
                    serviceName: item.servizio,
                  });

              if (result?.ok) {
                haptic.success().catch(() => null);
                return;
              }

              const errorText = (result?.error ?? '').toLowerCase();
              if (
                /not found|non trovato|appointment_not_found|booking_request_not_found/.test(
                  errorText
                )
              ) {
                haptic.success().catch(() => null);
                return;
              }

              hapticAlert(
                'Eliminazione non riuscita',
                result?.error ??
                  (pendingRequestId
                    ? 'Non sono riuscito ad annullare la richiesta.'
                    : 'Non sono riuscito ad annullare l\u2019appuntamento.')
              );
            })();
          },
        },
      ]
    );
  };

"""

new_content = content[:start_idx] + NEW_ELIM + content[end_idx:]

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"Done! eliminaAppuntamentoFuturo rewritten. File length: {len(new_content)} chars")
