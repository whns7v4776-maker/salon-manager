#!/usr/bin/env python3
"""Riscrive cancelOwnerAppointmentForSalon e updateBookingRequestStatusForSalon in AppContext.tsx"""
import sys

filepath = 'src/context/AppContext.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# ─── Blocco da sostituire: dal matchesDeletedAppointment
#     fino alla fine di updateBookingRequestStatusForSalon (fine del catch finale)
# Usiamo marker unici

OLD_CANCEL_START = "      const matchesDeletedAppointment = (item: Appuntamento) => {"

# Fine di cancelOwnerAppointmentForSalon prima di updateBookingRequestStatusForSalon
OLD_CANCEL_END_MARKER = "  const updateBookingRequestStatusForSalon = async ({"

start_idx = content.find(OLD_CANCEL_START)
end_idx = content.find(OLD_CANCEL_END_MARKER)

if start_idx == -1:
    print("ERROR: OLD_CANCEL_START not found", file=sys.stderr)
    sys.exit(1)
if end_idx == -1:
    print("ERROR: OLD_CANCEL_END_MARKER not found", file=sys.stderr)
    sys.exit(1)

# Tutto il codice vecchio da sostituire (dalla matchesDeletedAppointment 
# fino alla fine del try/catch di updateBookingRequestStatusForSalon)
# Troviamo la fine di updateBookingRequestStatusForSalon
# Cerchiamo il pattern "return { ok: true };" seguito da 
# "    } catch (error) {" e "      return { ok: false"
# poi la chiusura "  };"

# Troviamo la fine effettiva di updateBookingRequestStatusForSalon
# cercando il secondo "return { ok: false, error: 'Non sono riuscito a salvare" 
SAVE_ERR_MARKER = "return { ok: false, error: 'Non sono riuscito a salvare lo stato della richiesta.' };"
save_err_idx = content.find(SAVE_ERR_MARKER, end_idx)
if save_err_idx == -1:
    print("ERROR: save error marker not found after updateBookingRequestStatusForSalon", file=sys.stderr)
    sys.exit(1)

# Avanziamo alla fine di quella riga + 3 righe (closing braces)
pos = save_err_idx + len(SAVE_ERR_MARKER)
# skip "    }\n  };\n"
pos = content.find('\n', pos) + 1  # end of error line
pos = content.find('\n', pos) + 1  # "    }"
pos = content.find('\n', pos) + 1  # "  };"

old_block = content[start_idx:pos]

print(f"Found block from char {start_idx} to {pos} ({len(old_block)} chars)")
print("Block starts with:", repr(old_block[:80]))
print("Block ends with:", repr(old_block[-80:]))

# ─── Nuovo blocco
NEW_BLOCK = '''      const matchesAppointment = (item: Appuntamento) => {
        const sameId = appointmentId && item.id === appointmentId;
        const sameComposite =
          normalizeIdentityText(item.data ?? getTodayDateString()) === normalizeIdentityText(appointmentDate) &&
          normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(appointmentTime) &&
          normalizeIdentityText(item.cliente) === normalizeIdentityText(customerName) &&
          normalizeIdentityText(item.servizio) === normalizeIdentityText(serviceName);
        return !!(sameId || sameComposite);
      };

      const shouldPersistRealAppointment = isUuid(appointmentId);
      const { error: cancelError } = shouldPersistRealAppointment
        ? await supabase.rpc('cancel_owner_appointment', {
            p_appointment_id: appointmentId,
            p_appointment_date: appointmentDate,
            p_appointment_time: appointmentTime,
            p_customer_name: customerName,
            p_service_name: serviceName,
          })
        : { error: null };
      const cancelErrorText = [cancelError?.message, cancelError?.details, cancelError?.hint, cancelError?.code]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const isLegacySnapshotOnlyAppointment =
        !shouldPersistRealAppointment ||
        /appointment_not_found|auth_required|workspace_access_denied|jwt|permission|failed to fetch|network|timeout|fetch/i.test(
          cancelErrorText
        );

      if (cancelError && !isLegacySnapshotOnlyAppointment) {
        console.log('Errore annullamento appointment reale owner:', cancelError);
        return { ok: false, error: 'Non sono riuscito ad annullare l\u2019appuntamento.' };
      }

      markRecentlyDeletedAppointment({
        date: appointmentDate,
        time: appointmentTime,
        customerName,
        serviceName,
      });

      const nextAppointments = normalizeAppuntamenti(
        resolved.appuntamenti.filter((item) => !matchesAppointment(item))
      );

      const linkedRequest = resolved.richiestePrenotazione.find(
        (item) =>
          (item.stato === 'Accettata' || item.stato === 'In attesa') &&
          normalizeIdentityText(item.data) === normalizeIdentityText(appointmentDate) &&
          normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(appointmentTime) &&
          normalizeIdentityText(item.servizio) === normalizeIdentityText(serviceName) &&
          normalizeIdentityText(`${item.nome} ${item.cognome}`) === normalizeIdentityText(customerName)
      );

      const nextRequests = linkedRequest
        ? normalizeRichiestePrenotazione(
            resolved.richiestePrenotazione.map((item) =>
              item.id === linkedRequest.id
                ? {
                    ...item,
                    stato: 'Annullata',
                    viewedByCliente: false,
                    viewedBySalon: true,
                    cancellationSource: 'salone',
                  }
                : item
            )
          )
        : normalizeRichiestePrenotazione(resolved.richiestePrenotazione);

      const customerNameLower = customerName.trim().toLowerCase();
      const linkedPhone = linkedRequest?.telefono?.trim() ?? '';
      const nextClienti = normalizeClienti(
        resolved.clienti.map((item) => {
          const sameName = item.nome.trim().toLowerCase() === customerNameLower;
          const samePhone = linkedPhone && item.telefono.trim() === linkedPhone;
          if (!sameName && !samePhone) return item;
          return {
            ...item,
            annullamentiCount: (item.annullamentiCount ?? 0) + 1,
            viewedBySalon: false,
          };
        })
      );

      let workspaceId: string | null = resolved.workspace.id;
      try {
        workspaceId = await enqueuePortalPublish({
          workspace: resolved.workspace,
          clienti: nextClienti as unknown as Array<Record<string, unknown>>,
          appuntamenti: nextAppointments as unknown as Array<Record<string, unknown>>,
          servizi: resolved.servizi as unknown as Array<Record<string, unknown>>,
          operatori: resolved.operatori as unknown as Array<Record<string, unknown>>,
          richiestePrenotazione: nextRequests as unknown as Array<Record<string, unknown>>,
          availabilitySettings: resolved.availabilitySettings,
        });
      } catch (publishError) {
        console.log('Pubblicazione snapshot annullamento owner non riuscita, continuo in modalita ottimistica:', publishError);
      }

      if (isCurrentSalonWorkspace) {
        setAppuntamenti(filterRecentlyDeletedAppointments(nextAppointments));
        setRichiestePrenotazione(nextRequests);
        setClienti(nextClienti);
        if (workspaceId && workspaceId !== salonWorkspace.id) {
          setSalonWorkspace((current) => ({ ...current, id: workspaceId }));
        }
      }

      if (linkedRequest) {
        const linkedCustomerName = `${linkedRequest.nome} ${linkedRequest.cognome}`.trim();
        void queueWorkspacePushNotification({
          workspaceId: workspaceId ?? resolved.workspace.id,
          eventType: 'booking_request_status_changed',
          title: 'Prenotazione annullata dal salone',
          body: `${linkedRequest.servizio} il ${linkedRequest.data} alle ${linkedRequest.ora}`,
          audience: 'public',
          payload: {
            type: 'booking_request_status_changed',
            bookingRequestId: linkedRequest.id,
            status: 'cancelled',
            appointmentDate: linkedRequest.data,
            appointmentTime: linkedRequest.ora,
            customerName: linkedCustomerName,
            serviceName: linkedRequest.servizio,
            source: 'owner',
          },
        });
        void flushQueuedPushNotifications();
      }

      return { ok: true };
    } catch (error) {
      console.log('Errore annullamento appuntamento owner:', error);
      return { ok: false, error: 'Non sono riuscito ad annullare l\u2019appuntamento.' };
    }
  };

  const updateBookingRequestStatusForSalon = async ({
    salonCode,
    requestId,
    status,
    ignoreConflicts = false,
  }: {
    salonCode: string;
    requestId: string;
    status: 'Accettata' | 'Rifiutata' | 'Annullata';
    ignoreConflicts?: boolean;
  }) => {
    const normalizedCode = normalizeSalonCode(salonCode);
    const isCurrentSalonWorkspace =
      normalizedCode === normalizeSalonCode(salonWorkspace.salonCode);

    try {
      const resolved = await resolveSalonByCode(normalizedCode);
      if (!resolved) {
        return { ok: false, error: 'Salone non trovato.' };
      }

      const requestToUpdate = resolved.richiestePrenotazione.find((item) => item.id === requestId);
      if (!requestToUpdate) {
        return { ok: false, error: 'Richiesta non trovata.' };
      }

      const requestCustomerName = `${requestToUpdate.nome} ${requestToUpdate.cognome}`.trim();
      const requestCustomerNameLower = requestCustomerName.toLowerCase();
      const requestedDurationMinutes =
        typeof requestToUpdate.durataMinuti === 'number'
          ? requestToUpdate.durataMinuti
          : getServiceDuration(requestToUpdate.servizio, resolved.servizi);
      const useOperatorSchedulingForRequest =
        resolved.operatori.length > 0 &&
        !!requestToUpdate.operatoreId &&
        doesServiceUseOperators(requestToUpdate.servizio, resolved.servizi) &&
        getEligibleOperatorsForService({
          serviceName: requestToUpdate.servizio,
          services: resolved.servizi,
          operators: resolved.operatori,
          appointmentDate: requestToUpdate.data,
          settings: resolved.availabilitySettings,
        }).length > 0;

      if (status === 'Accettata' && !ignoreConflicts) {
        const conflictingAppointment = resolved.appuntamenti.find((item) => {
          const itemDate = item.data ?? getTodayDateString();

          if (itemDate !== requestToUpdate.data) return false;

          const isSameMaterializedRequest =
            normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(requestToUpdate.ora) &&
            item.servizio.trim().toLowerCase() === requestToUpdate.servizio.trim().toLowerCase() &&
            item.cliente.trim().toLowerCase() === requestCustomerNameLower;

          if (isSameMaterializedRequest) {
            return false;
          }

          return doesTimeRangeConflictWithAppointment({
            startTime: requestToUpdate.ora,
            durationMinutes: requestedDurationMinutes,
            appointment: item,
            services: resolved.servizi,
            settings: resolved.availabilitySettings,
          });
        });

        if (conflictingAppointment) {
          return {
            ok: false,
            error: `Questa richiesta si accavalla con ${conflictingAppointment.cliente} alle ${conflictingAppointment.ora}.`,
          };
        }
      }

      const dbStatus =
        status === 'Accettata'
          ? 'accepted'
          : status === 'Rifiutata'
            ? 'rejected'
            : 'cancelled';
      const shouldPersistRealStatus = isUuid(requestId);
      const { data: sessionResult } = await supabase.auth.getSession();
      const hasRealtimeOwnerSession = !!sessionResult.session?.user?.id;
      const { data: updateData, error: updateError } = shouldPersistRealStatus
        ? hasRealtimeOwnerSession
          ? await supabase.rpc('update_owner_booking_request_status', {
              p_request_id: requestId,
              p_status: dbStatus,
            })
          : await supabase.rpc('update_owner_booking_request_status_by_email', {
              p_owner_email: resolved.workspace.ownerEmail || salonAccountEmail,
              p_salon_code: normalizedCode,
              p_request_id: requestId,
              p_status: dbStatus,
            })
        : { data: null, error: null };
      const updateErrorText = [updateError?.message, updateError?.details, updateError?.hint]
        .filter(Boolean)
        .join(' ');
      const isLegacySnapshotOnlyRequest =
        !shouldPersistRealStatus ||
        /booking_request_not_found/i.test(updateErrorText);

      if (updateError && !isLegacySnapshotOnlyRequest) {
        console.log('Errore aggiornamento booking_request reale:', updateError);
        return { ok: false, error: 'Non sono riuscito ad aggiornare lo stato della richiesta.' };
      }

      if (status === 'Annullata') {
        markRecentlyDeletedAppointment({
          date: requestToUpdate.data,
          time: requestToUpdate.ora,
          customerName: requestCustomerName,
          serviceName: requestToUpdate.servizio,
        });
      }

      const updatePayload =
        updateData && typeof updateData === 'object' && !Array.isArray(updateData)
          ? (updateData as Record<string, unknown>)
          : Array.isArray(updateData) && updateData[0] && typeof updateData[0] === 'object'
            ? (updateData[0] as Record<string, unknown>)
            : null;
      const persistedCustomerId =
        typeof updatePayload?.customerId === 'string' && updatePayload.customerId.trim()
          ? updatePayload.customerId
          : null;
      const persistedAppointmentId =
        typeof updatePayload?.appointmentId === 'string' && updatePayload.appointmentId.trim()
          ? updatePayload.appointmentId
          : null;

      const nextRequests = normalizeRichiestePrenotazione(
        resolved.richiestePrenotazione.map((item) =>
          item.id === requestId
            ? {
                ...item,
                stato: status,
                viewedByCliente: false,
                viewedBySalon: true,
                cancellationSource:
                  status === 'Annullata'
                    ? 'salone'
                    : status === 'Rifiutata'
                      ? undefined
                      : item.cancellationSource,
              }
            : item
        )
      );

      const nextCustomers =
        status === 'Accettata'
          ? normalizeClienti(
              (() => {
                const nomeCompleto = `${requestToUpdate.nome} ${requestToUpdate.cognome}`.trim();
                const clienteEsistente = resolved.clienti.find(
                  (item) =>
                    item.telefono.trim() === requestToUpdate.telefono.trim() ||
                    item.nome.trim().toLowerCase() === nomeCompleto.toLowerCase()
                );

                if (clienteEsistente) {
                  return resolved.clienti.map((item) =>
                    item.id === clienteEsistente.id
                      ? {
                          ...item,
                          id: persistedCustomerId ?? item.id,
                          nome: nomeCompleto,
                          telefono: requestToUpdate.telefono,
                          email: requestToUpdate.email || item.email,
                          instagram: requestToUpdate.instagram || item.instagram,
                          nota: requestToUpdate.note?.trim() || item.nota,
                        }
                      : item
                  );
                }

                return [
                  {
                    id: persistedCustomerId ?? `cliente-${Date.now()}`,
                    nome: nomeCompleto,
                    telefono: requestToUpdate.telefono,
                    email: requestToUpdate.email,
                    instagram: requestToUpdate.instagram ?? '',
                    nota: requestToUpdate.note ?? '',
                  },
                  ...resolved.clienti,
                ];
              })()
            )
          : resolved.clienti;

      const nextAppointments =
        status === 'Accettata'
          ? normalizeAppuntamenti(
              resolved.appuntamenti.some((item) => {
                const itemDate = normalizeIdentityText(item.data ?? getTodayDateString());
                return (
                  itemDate === normalizeIdentityText(requestToUpdate.data) &&
                  normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(requestToUpdate.ora) &&
                  normalizeIdentityText(item.servizio) === normalizeIdentityText(requestToUpdate.servizio) &&
                  normalizeIdentityText(item.cliente) === requestCustomerNameLower
                );
              })
                ? resolved.appuntamenti
                : [
                    {
                      id: persistedAppointmentId ?? `app-${Date.now()}`,
                      data: requestToUpdate.data,
                      ora: requestToUpdate.ora,
                      cliente: requestCustomerName,
                      servizio: requestToUpdate.servizio,
                      prezzo: requestToUpdate.prezzo,
                      durataMinuti: requestToUpdate.durataMinuti,
                      operatoreId: requestToUpdate.operatoreId,
                      operatoreNome: requestToUpdate.operatoreNome,
                      incassato: false,
                      completato: false,
                    },
                    ...resolved.appuntamenti,
                  ]
            )
          : status === 'Annullata'
            ? normalizeAppuntamenti(
                resolved.appuntamenti.filter((item) => {
                  const itemDate = normalizeIdentityText(item.data ?? getTodayDateString());

                  return !(
                    itemDate === normalizeIdentityText(requestToUpdate.data) &&
                    normalizeTimeIdentity(item.ora) === normalizeTimeIdentity(requestToUpdate.ora) &&
                    normalizeIdentityText(item.servizio) ===
                      normalizeIdentityText(requestToUpdate.servizio) &&
                    normalizeIdentityText(item.cliente) === requestCustomerNameLower
                  );
                })
              )
          : resolved.appuntamenti;

      let workspaceId: string | null = resolved.workspace.id;

      try {
        workspaceId = await enqueuePortalPublish({
          workspace: resolved.workspace,
          clienti: nextCustomers as unknown as Array<Record<string, unknown>>,
          appuntamenti: nextAppointments as unknown as Array<Record<string, unknown>>,
          servizi: resolved.servizi as unknown as Array<Record<string, unknown>>,
          operatori: resolved.operatori as unknown as Array<Record<string, unknown>>,
          richiestePrenotazione: nextRequests as unknown as Array<Record<string, unknown>>,
          availabilitySettings: resolved.availabilitySettings,
        });
      } catch (publishError) {
        console.log('Pubblicazione snapshot update booking_request non riuscita, continuo in modalita ottimistica:', publishError);
      }

      if (isCurrentSalonWorkspace) {
        setRichiestePrenotazione(nextRequests);
        if (status === 'Accettata' || status === 'Annullata') {
          setClienti(nextCustomers);
          setAppuntamenti(filterRecentlyDeletedAppointments(nextAppointments));
        }
        if (workspaceId && workspaceId !== salonWorkspace.id) {
          setSalonWorkspace((current) => ({ ...current, id: workspaceId }));
        }
      }

      void (status === 'Annullata' || status === 'Rifiutata'
        ? queueWorkspacePushNotification({
            workspaceId: workspaceId ?? resolved.workspace.id,
            eventType: 'booking_request_status_changed',
            title: 'Aggiornamento prenotazione',
            body: `Stato richiesta: ${dbStatus}`,
            audience: 'public',
            payload: {
              type: 'booking_request_status_changed',
              bookingRequestId: requestId,
              status: dbStatus,
              appointmentDate: requestToUpdate.data,
              appointmentTime: requestToUpdate.ora,
              customerName: requestCustomerName,
              serviceName: requestToUpdate.servizio,
            },
          })
        : flushQueuedPushNotifications());

      return { ok: true };
    } catch (error) {
      console.log('Errore persistenza stato richiesta:', error);
      return { ok: false, error: 'Non sono riuscito a salvare lo stato della richiesta.' };
    }
  };
'''

new_content = content[:start_idx] + NEW_BLOCK + content[pos:]

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"Done! File rewritten. New length: {len(new_content)} chars")
