#!/usr/bin/env python3
"""Riscrive il blocco drag-delete in finalizeWeekDrag rimuovendo i tombstone"""
import sys

filepath = 'app/(tabs)/agenda.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

OLD_START = "                markLocallyDeletedAppointment(sourceAppointment);\n\n                if (pendingRequestId) {"
OLD_END_MARKER = "                  haptic.success().catch(() => null);\n                }).finally(() => {\n                  resetWeekDrag();\n                });\n              },\n              style: 'destructive',"

start_idx = content.find(OLD_START)
end_idx = content.find(OLD_END_MARKER)

if start_idx == -1:
    print("ERROR: OLD_START not found", file=sys.stderr)
    sys.exit(1)
if end_idx == -1:
    print("ERROR: OLD_END_MARKER not found", file=sys.stderr)
    sys.exit(1)

end_full = end_idx + len(OLD_END_MARKER)

print(f"Found drag-delete block: chars {start_idx}..{end_full}")
print("Block starts:", repr(content[start_idx:start_idx+80]))
print("Block ends:", repr(content[end_full-80:end_full]))

NEW_BLOCK = """                // Rimozione ottimistica immediata
                setAppuntamenti((current) =>
                  current.filter((item) => {
                    const sameId = item.id === sourceAppointment.id;
                    const sameComposite =
                      (item.data ?? todayDate) === appointmentDate &&
                      normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(sourceAppointment.ora) &&
                      item.servizio.trim().toLowerCase() === sourceAppointment.servizio.trim().toLowerCase() &&
                      item.cliente.trim().toLowerCase() === sourceAppointment.cliente.trim().toLowerCase();
                    return !(sameId || sameComposite);
                  })
                );

                if (pendingRequestId) {
                  void updateBookingRequestStatusForSalon({
                    salonCode: salonWorkspace.salonCode,
                    requestId: pendingRequestId,
                    status: 'Annullata',
                  }).then((result) => {
                    if (result?.ok) {
                      haptic.success().catch(() => null);
                    }
                  }).finally(() => {
                    resetWeekDrag();
                  });
                  return;
                }

                void cancelOwnerAppointmentForSalon({
                  salonCode: salonWorkspace.salonCode,
                  appointmentId: sourceAppointment.id,
                  appointmentDate,
                  appointmentTime: sourceAppointment.ora,
                  customerName: sourceAppointment.cliente,
                  serviceName: sourceAppointment.servizio,
                }).then((result) => {
                  if (result?.ok) {
                    haptic.success().catch(() => null);
                  }
                }).finally(() => {
                  resetWeekDrag();
                });
              },
              style: 'destructive',"""

new_content = content[:start_idx] + NEW_BLOCK + content[end_full:]

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"Done! Drag-delete block rewritten. File length: {len(new_content)} chars")
