# Test Stripe → CourseSprout (ambiente test)

- Checkout Stripe: modalità test; Customer persistente; bonifico disattivato.
- Event destination: checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed; formato Snapshot.
- Endpoint: `/api/stripe-webhook`.
- Segreto di firma in Vercel: `STRIPE_TEST_WEBHOOK_SECRET`, ambiente Production, valore mai in repository.
- Checkout key: `STRIPE_TEST_SECRET_KEY`.
- STATO: webhook firma verificata ma fulfillment **non attivo**; per eventi di acquisto pagato risponde 503 per impedire conferme false. Non inviare eventi di test Stripe finché non è configurata l'automazione.
- Prossimo: scegliere interfaccia server-to-server autorizzata CourseSprout, predisporre archivio durable di idempotenza e invio accesso, verificare test end-to-end. Non attivare produzione prima di questi passaggi.
