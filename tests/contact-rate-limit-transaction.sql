-- Run in a test transaction. ALL effects roll back, including quotas and
-- test messages. Run with a SQL role authorized to execute the RPC.
BEGIN;
DO $$
DECLARE
  em text:=md5('contact-regression-email-' || txid_current()::text)
    || md5('email-extra-' || txid_current()::text);
  ip text:=md5('contact-regression-ip-' || txid_current()::text)
    || md5('ip-extra-' || txid_current()::text);
  reason text;
BEGIN
  PERFORM public.submit_p2lrn_contact('Test Person','test@example.invalid',
    'Contact test','Legitimate test message','/contacto/',em,ip);
  PERFORM public.submit_p2lrn_contact('Test Person','test@example.invalid',
    'Contact test','Legitimate test message','/contacto/',em,ip);
  BEGIN
    PERFORM public.submit_p2lrn_contact('Test Person','test@example.invalid',
      'Contact test','Legitimate test message','/contacto/',em,ip);
    RAISE EXCEPTION 'ERROR: third email submission was accepted';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS reason=MESSAGE_TEXT;
    IF reason <> 'p2lrn_contact_rate_limited' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.submit_p2lrn_contact('X','test@example.invalid',
      'Contact test','Legitimate test message','/contacto/',em,ip);
    RAISE EXCEPTION 'ERROR: invalid fields were accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;
ROLLBACK;

-- Required independent multi-connection E2E gate (not simulated by this file):
-- Fire 4 concurrent submissions with the SAME normalized email and IP
-- through the deployed Edge Function against a disposable test database.
-- Exactly 2 may succeed, others must return 429; repeat with varied IP
-- headers, new email addresses and an absent/forged Origin.
-- Never run a flood against the real public contact endpoint.
