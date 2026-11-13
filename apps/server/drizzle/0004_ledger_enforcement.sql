REVOKE UPDATE, DELETE, TRUNCATE ON accounts, ledger_transactions, ledger_entries FROM northbook_app;
--> statement-breakpoint
CREATE FUNCTION reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Ledger rows are append-only; post a reversal instead.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER accounts_immutable BEFORE UPDATE OR DELETE ON accounts
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER ledger_transactions_immutable BEFORE UPDATE OR DELETE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
--> statement-breakpoint
CREATE FUNCTION require_open_ledger_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_xid numeric;
BEGIN
  SELECT posting_xid INTO owner_xid FROM ledger_transactions WHERE id = NEW.transaction_id;
  IF owner_xid IS DISTINCT FROM pg_current_xact_id()::text::numeric THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Cannot append entries to a committed ledger transaction.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_open_transaction BEFORE INSERT ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION require_open_ledger_transaction();
--> statement-breakpoint
CREATE FUNCTION check_ledger_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE posting_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'ledger_transactions' THEN posting_id := NEW.id;
  ELSE posting_id := NEW.transaction_id;
  END IF;
  IF (SELECT count(*) FROM ledger_entries WHERE transaction_id = posting_id) < 2 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Ledger transaction must contain at least two entries.';
  END IF;
  IF EXISTS (
    SELECT currency FROM ledger_entries WHERE transaction_id = posting_id
    GROUP BY currency
    HAVING sum(CASE direction WHEN 'debit' THEN amount ELSE -amount END) <> 0
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Ledger transaction is not balanced per currency.';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_transaction_balanced AFTER INSERT ON ledger_transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_ledger_balance();
CREATE CONSTRAINT TRIGGER ledger_entry_balanced AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_ledger_balance();
