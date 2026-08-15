ALTER TABLE public.cleaning_logs
  DROP CONSTRAINT IF EXISTS cleaning_logs_completed_at_not_future;

CREATE OR REPLACE FUNCTION public.validate_cleaning_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.completed_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'completed_at cannot be in the future';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_cleaning_log_trigger
BEFORE INSERT ON public.cleaning_logs
FOR EACH ROW EXECUTE FUNCTION public.validate_cleaning_log();