DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'northbook_app') THEN
    CREATE ROLE northbook_app;
  END IF;
  EXECUTE format(
    'ALTER ROLE northbook_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
    current_setting('northbook.app_password')
  );
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC, northbook_app', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO northbook_app', current_database());
END
$$;
--> statement-breakpoint
REVOKE ALL ON SCHEMA public FROM PUBLIC, northbook_app;
GRANT USAGE ON SCHEMA public TO northbook_app;
--> statement-breakpoint
REVOKE ALL ON SCHEMA drizzle FROM PUBLIC, northbook_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO northbook_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO northbook_app;
